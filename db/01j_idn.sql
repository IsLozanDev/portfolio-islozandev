-- 01j · Identidad TR-IDN (spec 28). PostgreSQL 16. Reversible: rollback/01j_idn.sql.
-- Proveedores de consulta, caché global de DNI/RUC con campos mínimos (TR-RN-032) y bitácora de
-- consultas por tenant con el número hasheado (TR-RNF-111).

CREATE SCHEMA idn;

-- ---------------------------------------------------------------------
-- 1. Tablas.
-- ---------------------------------------------------------------------
CREATE TABLE idn.proveedor (
  codigo       varchar(30)  PRIMARY KEY,
  tipos_doc    varchar(3)[] NOT NULL,
  prioridad    smallint     NOT NULL CHECK (prioridad > 0),
  ttl_dias     smallint     NOT NULL CHECK (ttl_dias > 0),
  timeout_ms   integer      NOT NULL DEFAULT 3000 CHECK (timeout_ms BETWEEN 100 AND 10000),
  activo       boolean      NOT NULL DEFAULT true
);

INSERT INTO idn.proveedor VALUES ('DECOLECTA', '{DNI,RUC}', 1, 30, 3000, true);

-- Global, sin tenant: dato público de nivel 1 (OP-04). El CHECK es la segunda barrera de los campos mínimos.
CREATE TABLE idn.cache_documento (
  tipo_doc      varchar(3)  NOT NULL CHECK (tipo_doc IN ('DNI', 'RUC')),
  numero        varchar(11) NOT NULL,
  datos         jsonb       NOT NULL,
  fuente        varchar(30) NOT NULL,
  consultado_en timestamptz NOT NULL,
  expira_en     timestamptz NOT NULL,
  PRIMARY KEY (tipo_doc, numero),
  CONSTRAINT ck_cache_campos CHECK (
    (tipo_doc = 'DNI' AND datos - ARRAY['nombres', 'apellidos'] = '{}'::jsonb)
    OR (tipo_doc = 'RUC' AND datos - ARRAY['razon_social', 'estado', 'condicion', 'direccion_fiscal', 'ubigeo'] = '{}'::jsonb)
  )
);

CREATE TABLE idn.consulta_log (
  id              bigint      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id       uuid        NOT NULL,
  usuario_id      uuid,
  producto_codigo varchar(10),
  tipo_doc        varchar(3)  NOT NULL,
  numero_hash     varchar(71) NOT NULL CHECK (numero_hash ~ '^sha256:[0-9a-f]{64}$'),
  motivo          varchar(30) NOT NULL
                  CHECK (motivo IN ('REGISTRO_CLIENTE', 'EMISION_COMPROBANTE', 'VERIFICACION_IDENTIDAD', 'OTRO')),
  resultado       varchar(30) NOT NULL
                  CHECK (resultado IN ('CACHE', 'PROVEEDOR', 'NO_ENCONTRADO', 'INVALIDO', 'CUOTA_AGOTADA', 'PROVEEDOR_NO_DISPONIBLE')),
  proveedor       varchar(30),
  consultado_en   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX ix_consulta_log_tenant_fecha ON idn.consulta_log (tenant_id, consultado_en DESC);

-- ---------------------------------------------------------------------
-- 2. RLS. app.tenant_id queda en '' tras el primer SET LOCAL de la conexión: NULLIF evita el error de cast.
--    La bitácora no tiene políticas de UPDATE ni DELETE.
-- ---------------------------------------------------------------------
ALTER TABLE idn.proveedor       ENABLE ROW LEVEL SECURITY;
ALTER TABLE idn.proveedor       FORCE ROW LEVEL SECURITY;
ALTER TABLE idn.cache_documento ENABLE ROW LEVEL SECURITY;
ALTER TABLE idn.cache_documento FORCE ROW LEVEL SECURITY;
ALTER TABLE idn.consulta_log    ENABLE ROW LEVEL SECURITY;
ALTER TABLE idn.consulta_log    FORCE ROW LEVEL SECURITY;

CREATE POLICY proveedor_select ON idn.proveedor FOR SELECT USING (true);

CREATE POLICY cache_documento_app ON idn.cache_documento FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY consulta_log_select ON idn.consulta_log FOR SELECT
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

CREATE POLICY consulta_log_insert ON idn.consulta_log FOR INSERT
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

-- ---------------------------------------------------------------------
-- 3. Privilegios. El rol de la aplicación es el que corre la migración (en dev, postgres).
-- ---------------------------------------------------------------------
REVOKE ALL ON SCHEMA idn FROM PUBLIC;
REVOKE ALL ON ALL TABLES IN SCHEMA idn FROM PUBLIC;

DO $$
BEGIN
  EXECUTE format('GRANT USAGE ON SCHEMA idn TO %I', current_user);
  EXECUTE format('GRANT SELECT ON idn.proveedor TO %I', current_user);
  EXECUTE format('REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON idn.proveedor FROM %I', current_user);
  EXECUTE format('GRANT SELECT, INSERT, UPDATE ON idn.cache_documento TO %I', current_user);
  EXECUTE format('REVOKE DELETE, TRUNCATE ON idn.cache_documento FROM %I', current_user);
  EXECUTE format('GRANT SELECT, INSERT ON idn.consulta_log TO %I', current_user);
  EXECUTE format('REVOKE UPDATE, DELETE, TRUNCATE ON idn.consulta_log FROM %I', current_user);
END
$$;

-- Los esquemas de plataforma no se exponen por la Data API (regla 8). En PostgreSQL plano
-- (CI) los roles de Supabase no existen.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon')
     AND EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON SCHEMA idn FROM anon, authenticated;
    REVOKE ALL ON ALL TABLES IN SCHEMA idn FROM anon, authenticated;
    REVOKE ALL ON ALL SEQUENCES IN SCHEMA idn FROM anon, authenticated;
  END IF;
END
$$;
