-- 01o · Notificaciones TR-NOT, canal CORREO (spec 42). PostgreSQL 16. Reversible: rollback/01o_not.sql.
-- Esquema ntf y no `not`: NOT es palabra reservada de PostgreSQL y obligaría a citarlo en cada consulta.
-- El destino va en claro en ntf.mensaje (lo necesita el proveedor al reintentar) y como hash: los logs,
-- los errores y los eventos solo llevan el hash (TR-RNF-026).

CREATE SCHEMA ntf;

-- ---------------------------------------------------------------------
-- 1. Plantillas versionadas. tenant_id NULL = base de plataforma, que solo crea una migración.
-- ---------------------------------------------------------------------
CREATE TABLE ntf.plantilla (
  id                 uuid PRIMARY KEY,
  tenant_id          uuid,
  codigo             varchar(60) NOT NULL CHECK (codigo ~ '^[A-Z][A-Z0-9_]{1,59}$'),
  canal              varchar(10) NOT NULL CHECK (canal IN ('CORREO','SMS','WHATSAPP','PUSH')),
  idioma             varchar(5)  NOT NULL DEFAULT 'es',
  version            integer     NOT NULL CHECK (version >= 1),
  asunto             varchar(150),
  cuerpo             text        NOT NULL CHECK (char_length(cuerpo) BETWEEN 1 AND 100000),
  -- [{nombre, tipo}]
  variables          jsonb       NOT NULL DEFAULT '[]' CHECK (jsonb_typeof(variables) = 'array'),
  plantilla_base_id  uuid REFERENCES ntf.plantilla(id),
  activa             boolean     NOT NULL DEFAULT true,
  creado_en          timestamptz NOT NULL DEFAULT now(),
  CHECK (canal <> 'CORREO' OR asunto IS NOT NULL)
);
CREATE UNIQUE INDEX uq_plantilla_version
  ON ntf.plantilla (COALESCE(tenant_id, '00000000-0000-0000-0000-000000000000'), codigo, canal, idioma, version);

-- ---------------------------------------------------------------------
-- 2. Mensaje: asunto y cuerpo ya renderizados, para que un reintento envíe lo mismo aunque la plantilla
--    cambie. version es el bloqueo optimista.
-- ---------------------------------------------------------------------
CREATE TABLE ntf.mensaje (
  id                  uuid PRIMARY KEY,
  tenant_id           uuid NOT NULL,
  plantilla_id        uuid NOT NULL REFERENCES ntf.plantilla(id),
  -- Se amplía en el spec 104.
  canal               varchar(10) NOT NULL CHECK (canal = 'CORREO'),
  destino             varchar(254) NOT NULL,
  destino_hash        varchar(80)  NOT NULL,
  persona_id          uuid,
  finalidad           varchar(14)  NOT NULL CHECK (finalidad IN ('TRANSACCIONAL','PROMOCIONAL')),
  asunto              varchar(150) NOT NULL,
  cuerpo              text         NOT NULL,
  clave_idempotencia  uuid         NOT NULL,
  estado              varchar(28)  NOT NULL CHECK (estado IN
                        ('ENCOLADO','ENVIADO','ENTREGADO','LEIDO','FALLIDO','OMITIDO_SIN_CONSENTIMIENTO','DESCARTADO')),
  id_externo          varchar(100),
  motivo_fallo        varchar(300),
  programado_para     timestamptz,
  enviado_en          timestamptz,
  entregado_en        timestamptz,
  version             integer      NOT NULL DEFAULT 1,
  creado_por          uuid,
  creado_en           timestamptz  NOT NULL DEFAULT now(),
  modificado_en       timestamptz,
  CONSTRAINT uq_mensaje_idempotencia UNIQUE (tenant_id, clave_idempotencia)
);
CREATE UNIQUE INDEX uq_mensaje_id_externo ON ntf.mensaje (id_externo) WHERE id_externo IS NOT NULL;
CREATE INDEX ix_mensaje_tenant_estado ON ntf.mensaje (tenant_id, estado);

-- ---------------------------------------------------------------------
-- 3. Intentos de entrega y avisos del proveedor. respuesta_proveedor sin destino ni cuerpo.
-- ---------------------------------------------------------------------
CREATE TABLE ntf.intento_entrega (
  id                   uuid PRIMARY KEY,
  tenant_id            uuid NOT NULL,
  mensaje_id           uuid NOT NULL REFERENCES ntf.mensaje(id),
  numero               smallint NOT NULL CHECK (numero >= 1),
  resultado            varchar(20) NOT NULL CHECK (resultado IN ('ACEPTADO','ERROR_TEMPORAL','ERROR_DEFINITIVO','CALLBACK')),
  respuesta_proveedor  jsonb NOT NULL DEFAULT '{}',
  en                   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ix_intento_mensaje ON ntf.intento_entrega (mensaje_id);

-- ---------------------------------------------------------------------
-- 4. Contactos inválidos del tenant, por hash del destino. motivo: REBOTE_DURO | QUEJA_SPAM.
-- ---------------------------------------------------------------------
CREATE TABLE ntf.contacto_invalido (
  tenant_id     uuid NOT NULL,
  canal         varchar(10) NOT NULL,
  destino_hash  varchar(80) NOT NULL,
  motivo        varchar(40) NOT NULL,
  desde         timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, canal, destino_hash)
);

-- ---------------------------------------------------------------------
-- 5. Semilla: plantilla base PRUEBA_CORREO, antes de la RLS (sin tenant no pasaría la política de escritura).
-- ---------------------------------------------------------------------
INSERT INTO ntf.plantilla (id, tenant_id, codigo, canal, idioma, version, asunto, cuerpo, variables)
VALUES (
  '42000000-0000-0000-0000-000000000001', NULL, 'PRUEBA_CORREO', 'CORREO', 'es', 1,
  'Prueba de correo de {{producto}}',
  '<p>Hola {{nombre}}:</p><p>Este es un correo de prueba de {{producto}}. Si lo recibiste, el envío funciona.</p>',
  '[{"nombre":"nombre","tipo":"texto"},{"nombre":"producto","tipo":"texto"}]'
);

-- ---------------------------------------------------------------------
-- 6. RLS. app.tenant_id queda en '' tras el primer SET LOCAL de la conexión: NULLIF evita el error de cast.
--    La plantilla base se lee desde cualquier tenant; en escritura solo las del tenant. Sin DELETE.
-- ---------------------------------------------------------------------
ALTER TABLE ntf.plantilla         ENABLE ROW LEVEL SECURITY;
ALTER TABLE ntf.plantilla         FORCE ROW LEVEL SECURITY;
ALTER TABLE ntf.mensaje           ENABLE ROW LEVEL SECURITY;
ALTER TABLE ntf.mensaje           FORCE ROW LEVEL SECURITY;
ALTER TABLE ntf.intento_entrega   ENABLE ROW LEVEL SECURITY;
ALTER TABLE ntf.intento_entrega   FORCE ROW LEVEL SECURITY;
ALTER TABLE ntf.contacto_invalido ENABLE ROW LEVEL SECURITY;
ALTER TABLE ntf.contacto_invalido FORCE ROW LEVEL SECURITY;

CREATE POLICY plantilla_select ON ntf.plantilla FOR SELECT
  USING (tenant_id IS NULL OR tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
CREATE POLICY plantilla_insert ON ntf.plantilla FOR INSERT
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
CREATE POLICY plantilla_update ON ntf.plantilla FOR UPDATE
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

CREATE POLICY mensaje_select ON ntf.mensaje FOR SELECT
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
CREATE POLICY mensaje_insert ON ntf.mensaje FOR INSERT
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
CREATE POLICY mensaje_update ON ntf.mensaje FOR UPDATE
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

CREATE POLICY intento_entrega_select ON ntf.intento_entrega FOR SELECT
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
CREATE POLICY intento_entrega_insert ON ntf.intento_entrega FOR INSERT
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

CREATE POLICY contacto_invalido_select ON ntf.contacto_invalido FOR SELECT
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
CREATE POLICY contacto_invalido_insert ON ntf.contacto_invalido FOR INSERT
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

-- ---------------------------------------------------------------------
-- 7. El webhook del proveedor llega sin tenant: esta función ubica el mensaje por el id externo en
--    cualquier tenant y devuelve solo (id, tenant_id); el resto corre con el contexto del tenant y la RLS.
--    Dueño org_lector (spec 12): sin login ni BYPASSRLS, con una política de lectura propia.
-- ---------------------------------------------------------------------
DO $$
BEGIN
  EXECUTE format('GRANT org_lector TO %I', current_user);
END
$$;
-- CREATE: lo exige ALTER FUNCTION ... OWNER TO sobre funciones del esquema.
GRANT USAGE, CREATE ON SCHEMA ntf TO org_lector;
GRANT SELECT ON ntf.mensaje TO org_lector;
CREATE POLICY mensaje_lector ON ntf.mensaje FOR SELECT TO org_lector USING (true);

CREATE FUNCTION ntf.mensaje_por_id_externo(p_id_externo varchar)
RETURNS TABLE (id uuid, tenant_id uuid)
LANGUAGE sql STABLE STRICT SECURITY DEFINER SET search_path = '' AS $$
  SELECT m.id, m.tenant_id
    FROM ntf.mensaje m
   WHERE m.id_externo = p_id_externo;
$$;

ALTER FUNCTION ntf.mensaje_por_id_externo(varchar) OWNER TO org_lector;
REVOKE EXECUTE ON FUNCTION ntf.mensaje_por_id_externo(varchar) FROM PUBLIC;

-- ---------------------------------------------------------------------
-- 8. Privilegios. El rol de la aplicación es el que corre la migración (en dev, postgres: el mismo
--    de la api y del worker). Sin DELETE ni TRUNCATE: queda constancia de cada mensaje.
-- ---------------------------------------------------------------------
REVOKE ALL ON SCHEMA ntf FROM PUBLIC;
REVOKE ALL ON ALL TABLES IN SCHEMA ntf FROM PUBLIC;

DO $$
BEGIN
  EXECUTE format('GRANT USAGE ON SCHEMA ntf TO %I', current_user);
  EXECUTE format('GRANT SELECT, INSERT, UPDATE ON ntf.plantilla, ntf.mensaje TO %I', current_user);
  EXECUTE format('GRANT SELECT, INSERT ON ntf.intento_entrega, ntf.contacto_invalido TO %I', current_user);
  EXECUTE format('REVOKE UPDATE ON ntf.intento_entrega, ntf.contacto_invalido FROM %I', current_user);
  EXECUTE format('REVOKE DELETE, TRUNCATE ON ALL TABLES IN SCHEMA ntf FROM %I', current_user);
  EXECUTE format('GRANT EXECUTE ON FUNCTION ntf.mensaje_por_id_externo(varchar) TO %I', current_user);
END
$$;

-- Los esquemas de plataforma no se exponen por la Data API (regla 8). En PostgreSQL plano
-- (CI) los roles de Supabase no existen.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon')
     AND EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON SCHEMA ntf FROM anon, authenticated;
    REVOKE ALL ON ALL TABLES IN SCHEMA ntf FROM anon, authenticated;
    REVOKE ALL ON FUNCTION ntf.mensaje_por_id_externo(varchar) FROM anon, authenticated;
  END IF;
END
$$;
