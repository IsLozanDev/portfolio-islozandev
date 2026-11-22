-- 01n · Bóveda de secretos TR-SEC (spec 41). PostgreSQL 16. Reversible: rollback/01n_sec.sql.
-- Cifrado por sobre: cada secreto va cifrado con AES-256-GCM bajo la clave de datos de su tenant, y esa clave
-- va envuelta por una clave maestra versionada que solo vive en el entorno de apps/api y apps/worker.
-- Aquí nunca hay texto plano (TR-RNF-113).

CREATE SCHEMA sec;

-- ---------------------------------------------------------------------
-- 1. Clave de datos por tenant, envuelta. Nace en el primer secreto del tenant.
--    clave_cifrada: 32 bytes de clave + 16 de etiqueta GCM.
-- ---------------------------------------------------------------------
CREATE TABLE sec.clave_tenant (
  tenant_id               uuid PRIMARY KEY,
  clave_cifrada           bytea    NOT NULL CHECK (octet_length(clave_cifrada) = 48),
  iv                      bytea    NOT NULL CHECK (octet_length(iv) = 12),
  version_clave_maestra   smallint NOT NULL CHECK (version_clave_maestra >= 1),
  creado_en               timestamptz NOT NULL DEFAULT now(),
  reenvuelta_en           timestamptz
);
CREATE INDEX ix_clave_tenant_version ON sec.clave_tenant (version_clave_maestra);

-- ---------------------------------------------------------------------
-- 2. Secreto cifrado: de 1 B a 64 KiB más los 16 de la etiqueta GCM. version sube en cada rotación y es
--    el bloqueo optimista.
-- ---------------------------------------------------------------------
CREATE TABLE sec.secreto (
  id           uuid PRIMARY KEY,
  tenant_id    uuid NOT NULL REFERENCES sec.clave_tenant(tenant_id),
  tipo         varchar(60) NOT NULL CHECK (tipo ~ '^[a-z][a-z0-9_]*\.[a-z][a-z0-9_]*$'),
  cifrado      bytea NOT NULL CHECK (octet_length(cifrado) BETWEEN 17 AND 65552),
  iv           bytea NOT NULL CHECK (octet_length(iv) = 12),
  version      integer NOT NULL DEFAULT 1 CHECK (version >= 1),
  creado_por   uuid NOT NULL,
  creado_en    timestamptz NOT NULL DEFAULT now(),
  rotado_por   uuid,
  rotado_en    timestamptz
);
CREATE INDEX ix_secreto_tenant ON sec.secreto (tenant_id);

-- ---------------------------------------------------------------------
-- 3. RLS. app.tenant_id queda en '' tras el primer SET LOCAL de la conexión: NULLIF evita el error de cast.
--    La clave de un tenant no se borra: sin DELETE.
-- ---------------------------------------------------------------------
ALTER TABLE sec.clave_tenant ENABLE ROW LEVEL SECURITY;
ALTER TABLE sec.clave_tenant FORCE ROW LEVEL SECURITY;
ALTER TABLE sec.secreto      ENABLE ROW LEVEL SECURITY;
ALTER TABLE sec.secreto      FORCE ROW LEVEL SECURITY;

CREATE POLICY clave_tenant_select ON sec.clave_tenant FOR SELECT
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
CREATE POLICY clave_tenant_insert ON sec.clave_tenant FOR INSERT
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
CREATE POLICY clave_tenant_update ON sec.clave_tenant FOR UPDATE
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

CREATE POLICY secreto_select ON sec.secreto FOR SELECT
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
CREATE POLICY secreto_insert ON sec.secreto FOR INSERT
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
CREATE POLICY secreto_update ON sec.secreto FOR UPDATE
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
CREATE POLICY secreto_delete ON sec.secreto FOR DELETE
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

-- ---------------------------------------------------------------------
-- 4. Lectura entre tenants para la re-envoltura al rotar la clave maestra. Dueño org_lector (spec 12): sin
--    login ni BYPASSRLS, con una política de lectura propia. Solo ids; la escritura va con la RLS de cada tenant.
-- ---------------------------------------------------------------------
DO $$
BEGIN
  EXECUTE format('GRANT org_lector TO %I', current_user);
END
$$;
-- CREATE: lo exige ALTER FUNCTION ... OWNER TO sobre funciones del esquema.
GRANT USAGE, CREATE ON SCHEMA sec TO org_lector;
GRANT SELECT ON sec.clave_tenant TO org_lector;
CREATE POLICY clave_tenant_lector ON sec.clave_tenant FOR SELECT TO org_lector USING (true);

CREATE FUNCTION sec.tenants_por_reenvolver(p_version_activa smallint, p_limite integer)
RETURNS TABLE (tenant_id uuid)
LANGUAGE sql STABLE STRICT SECURITY DEFINER SET search_path = '' AS $$
  SELECT c.tenant_id
    FROM sec.clave_tenant c
   WHERE c.version_clave_maestra <> p_version_activa
   ORDER BY c.tenant_id
   LIMIT p_limite;
$$;

ALTER FUNCTION sec.tenants_por_reenvolver(smallint, integer) OWNER TO org_lector;
REVOKE EXECUTE ON FUNCTION sec.tenants_por_reenvolver(smallint, integer) FROM PUBLIC;

-- ---------------------------------------------------------------------
-- 5. Privilegios. El rol de la aplicación es el que corre la migración (en dev, postgres: el mismo
--    de la api y del worker).
-- ---------------------------------------------------------------------
REVOKE ALL ON SCHEMA sec FROM PUBLIC;
REVOKE ALL ON ALL TABLES IN SCHEMA sec FROM PUBLIC;

DO $$
BEGIN
  EXECUTE format('GRANT USAGE ON SCHEMA sec TO %I', current_user);
  EXECUTE format('GRANT SELECT, INSERT, UPDATE ON sec.clave_tenant TO %I', current_user);
  EXECUTE format('REVOKE DELETE, TRUNCATE ON sec.clave_tenant FROM %I', current_user);
  EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON sec.secreto TO %I', current_user);
  EXECUTE format('REVOKE TRUNCATE ON sec.secreto FROM %I', current_user);
  EXECUTE format('GRANT EXECUTE ON FUNCTION sec.tenants_por_reenvolver(smallint, integer) TO %I', current_user);
END
$$;

-- Los esquemas de plataforma no se exponen por la Data API (regla 8). En PostgreSQL plano
-- (CI) los roles de Supabase no existen.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon')
     AND EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON SCHEMA sec FROM anon, authenticated;
    REVOKE ALL ON ALL TABLES IN SCHEMA sec FROM anon, authenticated;
    REVOKE ALL ON FUNCTION sec.tenants_por_reenvolver(smallint, integer) FROM anon, authenticated;
  END IF;
END
$$;
