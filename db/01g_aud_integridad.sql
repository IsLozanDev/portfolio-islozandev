-- 01g · Consulta e integridad de la auditoría TR-AUD (spec 20b). PostgreSQL 16. Reversible: rollback/01g_aud_integridad.sql.
-- Índices de consulta (TR-RNF-002), historial de verificaciones de la cadena (TR-RN-028, TR-RNF-112) y la
-- única lectura entre tenants (ids de tenants con eventos), con el patrón de sync_lector.
-- SQL crudo (regla 11): el recorrido de la cadena por TypeORM sería una consulta por fila.

-- ---------------------------------------------------------------------
-- 1. Consulta (TR-RNF-002).
-- ---------------------------------------------------------------------
CREATE INDEX evento_auditoria_sucursal_fecha_ix ON aud.evento_auditoria (tenant_id, sucursal_id, ocurrido_en DESC);
CREATE INDEX evento_auditoria_accion_fecha_ix   ON aud.evento_auditoria (tenant_id, accion, ocurrido_en DESC);
CREATE INDEX evento_auditoria_entidad_ix        ON aud.evento_auditoria (tenant_id, entidad_tipo, entidad_id);

-- ---------------------------------------------------------------------
-- 2. Historial de verificaciones. Una fila por corrida y tenant; solo inserción. La última OK es el punto
--    de partida de la siguiente corrida incremental.
-- ---------------------------------------------------------------------
CREATE TABLE aud.verificacion_integridad (
  id            uuid        PRIMARY KEY,
  tenant_id     uuid        NOT NULL,
  modo          varchar(12) NOT NULL CHECK (modo IN ('INCREMENTAL', 'COMPLETA')),
  -- Último número ya verificado al empezar.
  desde_numero  bigint      NOT NULL CHECK (desde_numero >= 0),
  hasta_numero  bigint      NOT NULL CHECK (hasta_numero >= desde_numero),
  -- Hash de hasta_numero (64 ceros si no hay filas).
  ultimo_hash   char(64)    NOT NULL,
  filas         bigint      NOT NULL CHECK (filas >= 0),
  estado        varchar(6)  NOT NULL CHECK (estado IN ('OK', 'ROTA')),
  numero_roto   bigint      NULL,
  motivo        varchar(12) NULL CHECK (motivo IN ('HASH', 'ENLACE', 'HUECO', 'TRUNCADA')),
  iniciada_en   timestamptz NOT NULL,
  terminada_en  timestamptz NOT NULL,
  CONSTRAINT ck_verificacion_rota CHECK ((estado = 'ROTA') = (motivo IS NOT NULL))
);

CREATE INDEX verificacion_tenant_fecha_ix ON aud.verificacion_integridad (tenant_id, terminada_en DESC);

CREATE TRIGGER verificacion_integridad_solo_insercion
  BEFORE UPDATE OR DELETE OR TRUNCATE ON aud.verificacion_integridad
  FOR EACH STATEMENT EXECUTE FUNCTION aud.solo_insercion();

ALTER TABLE aud.verificacion_integridad ENABLE ROW LEVEL SECURITY;
ALTER TABLE aud.verificacion_integridad FORCE ROW LEVEL SECURITY;

CREATE POLICY verificacion_integridad_select ON aud.verificacion_integridad FOR SELECT
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

CREATE POLICY verificacion_integridad_insert ON aud.verificacion_integridad FOR INSERT
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

-- ---------------------------------------------------------------------
-- 3. Verificación de la cadena del tenant del contexto. SECURITY INVOKER: la RLS del tenant aplica; el filtro
--    explícito por app.tenant_id además usa el índice único (tenant_id, numero).
--    Se detiene en la primera falla. Con HUECO, numero_roto es el número que falta.
-- ---------------------------------------------------------------------
CREATE FUNCTION aud.verificar_cadena(
  p_desde_numero  bigint,
  p_hash_anterior char(64),
  p_limite        integer,
  OUT ultimo_numero bigint,
  OUT ultimo_hash   char(64),
  OUT filas         bigint,
  OUT numero_roto   bigint,
  OUT motivo        varchar(12))
LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path = '' AS $$
DECLARE
  limite_maximo CONSTANT integer := 50000;
  tenant_actual uuid := NULLIF(current_setting('app.tenant_id', true), '')::uuid;
  fila          aud.evento_auditoria;
BEGIN
  IF p_limite IS NULL OR p_limite NOT BETWEEN 1 AND limite_maximo THEN
    RAISE EXCEPTION 'el límite debe estar entre 1 y %', limite_maximo USING ERRCODE = 'invalid_parameter_value';
  END IF;

  ultimo_numero := p_desde_numero;
  ultimo_hash := p_hash_anterior;
  filas := 0;

  FOR fila IN
    SELECT e.* FROM aud.evento_auditoria e
     WHERE e.tenant_id = tenant_actual AND e.numero > p_desde_numero
     ORDER BY e.numero
     LIMIT p_limite
  LOOP
    IF fila.numero <> ultimo_numero + 1 THEN
      numero_roto := ultimo_numero + 1;
      motivo := 'HUECO';
      RETURN;
    END IF;
    IF fila.hash_anterior <> ultimo_hash THEN
      numero_roto := fila.numero;
      motivo := 'ENLACE';
      RETURN;
    END IF;
    IF aud.calcular_hash(fila, ultimo_hash) <> fila.hash THEN
      numero_roto := fila.numero;
      motivo := 'HASH';
      RETURN;
    END IF;
    ultimo_numero := fila.numero;
    ultimo_hash := fila.hash;
    filas := filas + 1;
  END LOOP;
END;
$$;

CREATE FUNCTION aud.maximo_numero()
RETURNS bigint
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = '' AS $$
  SELECT coalesce(max(e.numero), 0)
    FROM aud.evento_auditoria e
   WHERE e.tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid;
$$;

-- ---------------------------------------------------------------------
-- 4. Lectura entre tenants. Rol sin login, dueño de la función: su política ve todas las filas sin dar
--    BYPASSRLS a nadie. Solo devuelve ids.
-- ---------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'aud_lector') THEN
    CREATE ROLE aud_lector NOLOGIN;
  END IF;
  -- PostgreSQL 16: ALTER ... OWNER TO exige poder hacer SET ROLE al dueño nuevo.
  EXECUTE format('GRANT aud_lector TO %I', current_user);
END
$$;

-- CREATE: lo exige ALTER FUNCTION ... OWNER TO sobre funciones del esquema.
GRANT USAGE, CREATE ON SCHEMA aud TO aud_lector;
GRANT SELECT ON aud.evento_auditoria TO aud_lector;

CREATE POLICY evento_auditoria_lector ON aud.evento_auditoria FOR SELECT TO aud_lector USING (true);

CREATE FUNCTION aud.tenants_con_eventos()
RETURNS SETOF uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT DISTINCT e.tenant_id FROM aud.evento_auditoria e;
$$;

ALTER FUNCTION aud.tenants_con_eventos() OWNER TO aud_lector;

-- ---------------------------------------------------------------------
-- 5. Privilegios. El rol de la aplicación es el que corre la migración (en dev, postgres).
-- ---------------------------------------------------------------------
REVOKE ALL ON aud.verificacion_integridad FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION aud.verificar_cadena(bigint, char, integer) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION aud.maximo_numero() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION aud.tenants_con_eventos() FROM PUBLIC;

DO $$
BEGIN
  EXECUTE format('GRANT SELECT, INSERT ON aud.verificacion_integridad TO %I', current_user);
  EXECUTE format('REVOKE UPDATE, DELETE, TRUNCATE ON aud.verificacion_integridad FROM %I', current_user);
  EXECUTE format('GRANT EXECUTE ON FUNCTION aud.verificar_cadena(bigint, char, integer) TO %I', current_user);
  EXECUTE format('GRANT EXECUTE ON FUNCTION aud.maximo_numero() TO %I', current_user);
  EXECUTE format('GRANT EXECUTE ON FUNCTION aud.tenants_con_eventos() TO %I', current_user);
END
$$;

-- Los esquemas de plataforma no se exponen por la Data API (regla 8). En Supabase lo que se crea nace
-- concedido a anon y authenticated; en PostgreSQL plano (CI) esos roles no existen.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon')
     AND EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON ALL TABLES IN SCHEMA aud FROM anon, authenticated;
    REVOKE ALL ON ALL FUNCTIONS IN SCHEMA aud FROM anon, authenticated;
  END IF;
END
$$;
