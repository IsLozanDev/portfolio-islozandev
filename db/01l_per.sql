-- 01l · Personas TR-PER (spec 31). PostgreSQL 16. Reversible: rollback/01l_per.sql.
-- Persona maestra del tenant, única por tipo y número de documento, con sus roles por producto y sus contactos.

CREATE SCHEMA per;

-- ---------------------------------------------------------------------
-- 1. Tablas. La persona es del tenant, sin empresa: se comparte entre sus empresas (OP-04 nivel 2).
-- ---------------------------------------------------------------------
CREATE TABLE per.persona (
  id                uuid PRIMARY KEY,
  tenant_id         uuid NOT NULL,
  tipo_persona      varchar(8)  NOT NULL CHECK (tipo_persona IN ('NATURAL','JURIDICA')),
  tipo_documento    varchar(20) NOT NULL CHECK (tipo_documento IN ('DNI','CE','RUC','PASAPORTE')),
  numero_documento  varchar(12) NOT NULL,
  nombres           varchar(100),
  apellido_paterno  varchar(60),
  apellido_materno  varchar(60),
  razon_social      varchar(200),
  activo            boolean NOT NULL DEFAULT true,
  version           integer NOT NULL DEFAULT 1,
  creado_en         timestamptz NOT NULL DEFAULT now(),
  actualizado_en    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_persona_documento UNIQUE (tenant_id, tipo_documento, numero_documento),
  CONSTRAINT ck_persona_natural CHECK (tipo_persona <> 'NATURAL'
    OR (nombres IS NOT NULL AND apellido_paterno IS NOT NULL AND razon_social IS NULL)),
  CONSTRAINT ck_persona_juridica CHECK (tipo_persona <> 'JURIDICA'
    OR (tipo_documento = 'RUC' AND numero_documento LIKE '20%' AND razon_social IS NOT NULL
        AND nombres IS NULL AND apellido_paterno IS NULL AND apellido_materno IS NULL))
);

-- La lista de productos es la de PRODUCTOS de ORG: una prueba de la lib compara ambas.
-- hasta queda nula: ningún caso de uso cierra un rol todavía.
CREATE TABLE per.persona_rol (
  persona_id       uuid NOT NULL REFERENCES per.persona(id),
  tenant_id        uuid NOT NULL,
  producto_codigo  varchar(5)  NOT NULL CHECK (producto_codigo IN ('REST','PSI','COL','LIB','GYM','CLI','DOC','ECO','LEX')),
  rol              varchar(12) NOT NULL CHECK (rol IN ('CLIENTE','PACIENTE','SOCIO','ADMINISTRADO','CONTRAPARTE','PROVEEDOR')),
  desde            date NOT NULL,
  hasta            date,
  PRIMARY KEY (persona_id, producto_codigo, rol)
);
CREATE INDEX ix_persona_rol_tenant_producto ON per.persona_rol (tenant_id, producto_codigo, rol);

CREATE TABLE per.contacto (
  id             uuid PRIMARY KEY,
  persona_id     uuid NOT NULL REFERENCES per.persona(id),
  tenant_id      uuid NOT NULL,
  tipo_contacto  varchar(10) NOT NULL CHECK (tipo_contacto IN ('CELULAR','FIJO','CORREO','WHATSAPP')),
  valor          varchar(254) NOT NULL,
  principal      boolean NOT NULL DEFAULT false,
  creado_en      timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX uq_contacto_principal ON per.contacto (persona_id, tipo_contacto) WHERE principal;

-- ---------------------------------------------------------------------
-- 2. RLS. app.tenant_id queda en '' tras el primer SET LOCAL de la conexión: NULLIF evita el error de cast.
--    Sin política de DELETE: una persona, un rol o un contacto no se borran.
-- ---------------------------------------------------------------------
ALTER TABLE per.persona     ENABLE ROW LEVEL SECURITY;
ALTER TABLE per.persona     FORCE ROW LEVEL SECURITY;
ALTER TABLE per.persona_rol ENABLE ROW LEVEL SECURITY;
ALTER TABLE per.persona_rol FORCE ROW LEVEL SECURITY;
ALTER TABLE per.contacto    ENABLE ROW LEVEL SECURITY;
ALTER TABLE per.contacto    FORCE ROW LEVEL SECURITY;

CREATE POLICY persona_select ON per.persona FOR SELECT
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
CREATE POLICY persona_insert ON per.persona FOR INSERT
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
CREATE POLICY persona_update ON per.persona FOR UPDATE
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

CREATE POLICY persona_rol_select ON per.persona_rol FOR SELECT
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
CREATE POLICY persona_rol_insert ON per.persona_rol FOR INSERT
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
CREATE POLICY persona_rol_update ON per.persona_rol FOR UPDATE
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

CREATE POLICY contacto_select ON per.contacto FOR SELECT
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
CREATE POLICY contacto_insert ON per.contacto FOR INSERT
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
CREATE POLICY contacto_update ON per.contacto FOR UPDATE
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

-- ---------------------------------------------------------------------
-- 3. Privilegios. El rol de la aplicación es el que corre la migración (en dev, postgres).
-- ---------------------------------------------------------------------
REVOKE ALL ON SCHEMA per FROM PUBLIC;
REVOKE ALL ON ALL TABLES IN SCHEMA per FROM PUBLIC;

DO $$
BEGIN
  EXECUTE format('GRANT USAGE ON SCHEMA per TO %I', current_user);
  EXECUTE format('GRANT SELECT, INSERT, UPDATE ON per.persona, per.persona_rol, per.contacto TO %I', current_user);
  EXECUTE format('REVOKE DELETE, TRUNCATE ON per.persona, per.persona_rol, per.contacto FROM %I', current_user);
END
$$;

-- Los esquemas de plataforma no se exponen por la Data API (regla 8). En PostgreSQL plano
-- (CI) los roles de Supabase no existen.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon')
     AND EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON SCHEMA per FROM anon, authenticated;
    REVOKE ALL ON ALL TABLES IN SCHEMA per FROM anon, authenticated;
  END IF;
END
$$;
