-- 01g · Auditoría inmutable TR-AUD (spec 20a). PostgreSQL 16. Reversible sin filas: rollback/01g_aud.sql.
-- Solo inserción y hash SHA-256 encadenado por tenant (TR-RN-028). El hash lo calcula la base en un
-- trigger: cualquier vía de inserción queda encadenada. Conservación mínima 5 años, sin purga.

CREATE SCHEMA aud;

CREATE TABLE aud.evento_auditoria (
  id                 uuid         PRIMARY KEY,
  tenant_id          uuid         NOT NULL,
  numero             bigint       NOT NULL,
  tipo               varchar(16)  NOT NULL CHECK (tipo IN ('OPERACION', 'ACCESO_SENSIBLE')),
  origen             varchar(8)   NOT NULL CHECK (origen IN ('DIRECTO', 'EVENTO')),
  event_id           uuid         NULL,
  accion             varchar(80)  NOT NULL CHECK (accion ~ '^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*){1,3}$'),
  entidad_tipo       varchar(40)  NOT NULL,
  -- Texto: los productos identifican entidades con códigos («V-000981»), no siempre uuid.
  entidad_id         varchar(80)  NOT NULL,
  usuario_id         uuid         NULL,
  sucursal_id        uuid         NULL,
  antes              jsonb        NULL,
  despues            jsonb        NULL,
  motivo             varchar(500) NULL,
  persona_titular_id uuid         NULL,
  finalidad          varchar(20)  NULL CHECK (finalidad IN ('ATENCION', 'AUDITORIA_MEDICA', 'SOPORTE', 'OTRO')),
  ticket             varchar(40)  NULL,
  ip                 inet         NULL,
  trace_id           varchar(32)  NULL,
  ocurrido_en        timestamptz  NOT NULL,
  registrado_en      timestamptz  NOT NULL DEFAULT now(),
  -- numero, hash_anterior y hash los pone aud.encadenar(); lo que traiga el INSERT se ignora.
  hash_anterior      char(64)     NOT NULL,
  hash               char(64)     NOT NULL,
  CONSTRAINT ux_evento_auditoria_numero UNIQUE (tenant_id, numero),
  CONSTRAINT ux_evento_auditoria_evento UNIQUE (event_id),
  CONSTRAINT ck_evento_auditoria_origen CHECK ((origen = 'EVENTO') = (event_id IS NOT NULL)),
  CONSTRAINT ck_evento_auditoria_sensible CHECK (
    tipo = 'OPERACION'
    OR (usuario_id IS NOT NULL AND persona_titular_id IS NOT NULL AND finalidad IS NOT NULL
        AND entidad_tipo IN ('HISTORIA_CLINICA', 'NOTA_SESION', 'EXPEDIENTE', 'DATOS_PORTABLES'))),
  CONSTRAINT ck_evento_auditoria_soporte CHECK (finalidad IS DISTINCT FROM 'SOPORTE' OR ticket IS NOT NULL)
);

CREATE INDEX evento_auditoria_tenant_fecha_ix ON aud.evento_auditoria (tenant_id, ocurrido_en DESC);

-- ---------------------------------------------------------------------
-- 1. Hash. jsonb ordena las claves, así que el texto es determinista; ocurrido_en va en microsegundos
--    desde epoch para no depender de TimeZone. El verificador del 20b reutiliza aud.calcular_hash.
-- ---------------------------------------------------------------------
CREATE FUNCTION aud.contenido_canonico(e aud.evento_auditoria)
RETURNS text
LANGUAGE sql IMMUTABLE SET search_path = '' AS $$
  SELECT jsonb_build_object(
    'id', e.id,
    'tenant_id', e.tenant_id,
    'numero', e.numero,
    'tipo', e.tipo,
    'origen', e.origen,
    'event_id', e.event_id,
    'accion', e.accion,
    'entidad_tipo', e.entidad_tipo,
    'entidad_id', e.entidad_id,
    'usuario_id', e.usuario_id,
    'sucursal_id', e.sucursal_id,
    'antes', e.antes,
    'despues', e.despues,
    'motivo', e.motivo,
    'persona_titular_id', e.persona_titular_id,
    'finalidad', e.finalidad,
    'ticket', e.ticket,
    'ip', e.ip::text,
    'trace_id', e.trace_id,
    'ocurrido_en', (extract(epoch FROM e.ocurrido_en) * 1000000)::bigint
  )::text;
$$;

CREATE FUNCTION aud.calcular_hash(e aud.evento_auditoria, p_hash_anterior char(64))
RETURNS char(64)
LANGUAGE sql IMMUTABLE SET search_path = '' AS $$
  SELECT encode(sha256(convert_to(p_hash_anterior || aud.contenido_canonico(e), 'UTF8')), 'hex');
$$;

-- ---------------------------------------------------------------------
-- 2. Encadenado. El bloqueo asesor de transacción serializa las inserciones de un tenant: funciona con
--    el pooler en modo transacción y se libera al confirmar o revertir. Con READ COMMITTED, la lectura
--    del último registro va después del bloqueo y ve lo que confirmó quien lo tenía.
-- ---------------------------------------------------------------------
CREATE FUNCTION aud.encadenar() RETURNS trigger
LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE
  -- Clase propia del bloqueo asesor de auditoría, para no chocar con otros bloqueos.
  clase_bloqueo_auditoria CONSTANT integer := 2020;
  hash_inicial            CONSTANT char(64) := repeat('0', 64);
  ultimo_numero bigint;
  ultimo_hash   char(64);
BEGIN
  PERFORM pg_advisory_xact_lock(clase_bloqueo_auditoria, hashtext(NEW.tenant_id::text));
  SELECT a.numero, a.hash INTO ultimo_numero, ultimo_hash
    FROM aud.evento_auditoria a
   WHERE a.tenant_id = NEW.tenant_id
   ORDER BY a.numero DESC
   LIMIT 1;
  NEW.numero := coalesce(ultimo_numero, 0) + 1;
  NEW.hash_anterior := coalesce(ultimo_hash, hash_inicial);
  NEW.hash := aud.calcular_hash(NEW, NEW.hash_anterior);
  RETURN NEW;
END;
$$;

CREATE TRIGGER evento_auditoria_encadenar
  BEFORE INSERT ON aud.evento_auditoria
  FOR EACH ROW EXECUTE FUNCTION aud.encadenar();

-- ---------------------------------------------------------------------
-- 3. Solo inserción (TR-RN-028). El trigger por sentencia alcanza al dueño y a postgres; además se
--    revocan los privilegios y la RLS no tiene políticas de UPDATE ni DELETE.
-- ---------------------------------------------------------------------
CREATE FUNCTION aud.solo_insercion() RETURNS trigger
LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  RAISE EXCEPTION 'aud.evento_auditoria es de solo inserción (TR-RN-028)' USING ERRCODE = 'insufficient_privilege';
END;
$$;

CREATE TRIGGER evento_auditoria_solo_insercion
  BEFORE UPDATE OR DELETE OR TRUNCATE ON aud.evento_auditoria
  FOR EACH STATEMENT EXECUTE FUNCTION aud.solo_insercion();

-- ---------------------------------------------------------------------
-- 4. RLS. app.tenant_id queda en '' tras el primer SET LOCAL de la conexión: NULLIF evita el error de cast.
-- ---------------------------------------------------------------------
ALTER TABLE aud.evento_auditoria ENABLE ROW LEVEL SECURITY;
ALTER TABLE aud.evento_auditoria FORCE ROW LEVEL SECURITY;

CREATE POLICY evento_auditoria_select ON aud.evento_auditoria FOR SELECT
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

CREATE POLICY evento_auditoria_insert ON aud.evento_auditoria FOR INSERT
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

-- ---------------------------------------------------------------------
-- 5. Privilegios. El rol de la aplicación es el que corre la migración (en dev, postgres).
-- ---------------------------------------------------------------------
REVOKE ALL ON SCHEMA aud FROM PUBLIC;
REVOKE ALL ON ALL TABLES IN SCHEMA aud FROM PUBLIC;

DO $$
BEGIN
  EXECUTE format('GRANT USAGE ON SCHEMA aud TO %I', current_user);
  EXECUTE format('GRANT SELECT, INSERT ON aud.evento_auditoria TO %I', current_user);
  EXECUTE format('REVOKE UPDATE, DELETE, TRUNCATE ON aud.evento_auditoria FROM %I', current_user);
END
$$;

-- Los esquemas de plataforma no se exponen por la Data API (regla 8). En PostgreSQL plano
-- (CI) los roles de Supabase no existen.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon')
     AND EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON SCHEMA aud FROM anon, authenticated;
    REVOKE ALL ON ALL TABLES IN SCHEMA aud FROM anon, authenticated;
    REVOKE ALL ON ALL FUNCTIONS IN SCHEMA aud FROM anon, authenticated;
  END IF;
END
$$;
