-- 01a_org_alta · Avisos y lectura de la tarea diaria de vencimientos TR-ORG (spec 12). PostgreSQL 16.
-- Reversible: rollback/01a_org_alta.sql. Ordena después de 01a_org.sql y no referencia seg.

-- ---------------------------------------------------------------------
-- 1. Avisos enviados (TR-CA-021). vigente_hasta en la clave: una renovación vuelve a avisar.
-- ---------------------------------------------------------------------
CREATE TABLE org.aviso_vencimiento (
  id              uuid        PRIMARY KEY,
  tenant_id       uuid        NOT NULL REFERENCES org.tenant (id),
  suscripcion_id  uuid        NOT NULL REFERENCES org.suscripcion (id),
  dias_antes      smallint    NOT NULL CHECK (dias_antes IN (7, 3, 1)),
  vigente_hasta   date        NOT NULL,
  fecha_ejecucion date        NOT NULL,
  registrado_en   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ux_aviso UNIQUE (suscripcion_id, vigente_hasta, dias_antes)
);

-- Sin políticas de UPDATE ni DELETE: el aviso es de solo inserción.
ALTER TABLE org.aviso_vencimiento ENABLE ROW LEVEL SECURITY;
ALTER TABLE org.aviso_vencimiento FORCE ROW LEVEL SECURITY;

CREATE POLICY aviso_vencimiento_select ON org.aviso_vencimiento FOR SELECT
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
CREATE POLICY aviso_vencimiento_insert ON org.aviso_vencimiento FOR INSERT
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

-- ---------------------------------------------------------------------
-- 2. Rol lector. Mismo patrón que sync_lector (spec 11): sin login ni BYPASSRLS.
-- ---------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'org_lector') THEN
    CREATE ROLE org_lector NOLOGIN;
  END IF;
  -- PostgreSQL 16: ALTER ... OWNER TO exige poder hacer SET ROLE al dueño nuevo.
  EXECUTE format('GRANT org_lector TO %I', current_user);
END
$$;

-- CREATE: lo exige ALTER FUNCTION ... OWNER TO sobre funciones del esquema.
GRANT USAGE, CREATE ON SCHEMA org TO org_lector;
GRANT SELECT ON org.suscripcion, org.tenant TO org_lector;

CREATE POLICY suscripcion_vencimientos ON org.suscripcion FOR SELECT TO org_lector USING (true);
CREATE POLICY tenant_vencimientos      ON org.tenant      FOR SELECT TO org_lector USING (true);

-- ---------------------------------------------------------------------
-- 3. Lectura entre tenants. Solo ids y fechas; el resto se lee con la RLS del tenant.
--    STRICT: una fecha NULL no devuelve filas.
-- ---------------------------------------------------------------------
CREATE FUNCTION org.suscripciones_a_revisar(p_fecha date)
RETURNS TABLE (tenant_id uuid, suscripcion_id uuid, estado varchar, vigente_hasta date)
LANGUAGE sql STABLE STRICT SECURITY DEFINER SET search_path = '' AS $$
  SELECT s.tenant_id, s.id, s.estado, s.vigente_hasta
    FROM org.suscripcion s
    JOIN org.tenant t ON t.id = s.tenant_id
   WHERE s.estado IN ('PRUEBA', 'ACTIVA', 'VENCIDA')
     AND s.vigente_hasta IS NOT NULL
     AND s.vigente_hasta <= p_fecha + 7
     AND t.estado IN ('PRUEBA', 'ACTIVO')
   ORDER BY s.tenant_id, s.id;
$$;

ALTER FUNCTION org.suscripciones_a_revisar(date) OWNER TO org_lector;
REVOKE EXECUTE ON FUNCTION org.suscripciones_a_revisar(date) FROM PUBLIC;

-- Solo el rol que corre la migración (en dev, postgres: el mismo del worker).
DO $$
BEGIN
  EXECUTE format('GRANT EXECUTE ON FUNCTION org.suscripciones_a_revisar(date) TO %I', current_user);
END
$$;

-- Los esquemas de plataforma no se exponen por la Data API (regla 8). En PostgreSQL plano
-- (CI) los roles de Supabase no existen.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon')
     AND EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON org.aviso_vencimiento FROM anon, authenticated;
    REVOKE ALL ON FUNCTION org.suscripciones_a_revisar(date) FROM anon, authenticated;
  END IF;
END
$$;
