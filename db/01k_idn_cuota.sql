-- 01k · Cuota mensual de consultas DNI/RUC por tenant (spec 29). PostgreSQL 16. Reversible: rollback/01k_idn_cuota.sql.
-- Un periodo AAAA-MM (hora de Lima) por tenant; la reserva es un UPDATE condicional. Lectura entre tenants
-- para la consola con funciones SECURITY DEFINER de idn_lector. Proveedores editables con bloqueo optimista.

-- ---------------------------------------------------------------------
-- 1. Tabla de cuota y versión de proveedor.
-- ---------------------------------------------------------------------
CREATE TABLE idn.cuota (
  tenant_id           uuid        NOT NULL,
  periodo             char(7)     NOT NULL CHECK (periodo ~ '^\d{4}-(0[1-9]|1[0-2])$'),
  plan                varchar(10) NOT NULL CHECK (plan IN ('BASICO', 'PRO', 'EMPRESA')),
  incluidas           integer     NOT NULL CHECK (incluidas >= 0),
  consumidas          integer     NOT NULL DEFAULT 0 CHECK (consumidas >= 0),
  avisado_umbral_en   timestamptz,
  avisado_agotada_en  timestamptz,
  creada_en           timestamptz NOT NULL DEFAULT now(),
  version             integer     NOT NULL DEFAULT 1,
  PRIMARY KEY (tenant_id, periodo),
  CONSTRAINT ck_cuota_tope CHECK (consumidas <= incluidas)
);

ALTER TABLE idn.proveedor ADD COLUMN version integer NOT NULL DEFAULT 1;

-- ---------------------------------------------------------------------
-- 2. RLS. Sin política de DELETE: una cuota no se borra.
-- ---------------------------------------------------------------------
ALTER TABLE idn.cuota ENABLE ROW LEVEL SECURITY;
ALTER TABLE idn.cuota FORCE ROW LEVEL SECURITY;

CREATE POLICY cuota_select ON idn.cuota FOR SELECT
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
CREATE POLICY cuota_insert ON idn.cuota FOR INSERT
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
CREATE POLICY cuota_update ON idn.cuota FOR UPDATE
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

CREATE POLICY proveedor_update ON idn.proveedor FOR UPDATE USING (true) WITH CHECK (true);

-- ---------------------------------------------------------------------
-- 3. Privilegios de la aplicación. Del proveedor solo se editan los parámetros, nunca el código ni los tipos.
-- ---------------------------------------------------------------------
DO $$
BEGIN
  EXECUTE format('GRANT SELECT, INSERT, UPDATE ON idn.cuota TO %I', current_user);
  EXECUTE format('REVOKE DELETE, TRUNCATE ON idn.cuota FROM %I', current_user);
  EXECUTE format('GRANT UPDATE (prioridad, ttl_dias, timeout_ms, activo, version) ON idn.proveedor TO %I', current_user);
END
$$;

-- ---------------------------------------------------------------------
-- 4. Rol lector. Mismo patrón que org_lector (spec 12): sin login ni BYPASSRLS.
-- ---------------------------------------------------------------------
DO $$
BEGIN
  -- El rol es de todo el cluster: dos bases que migran a la vez (pruebas en paralelo) chocan al crearlo.
  BEGIN
    CREATE ROLE idn_lector NOLOGIN;
  EXCEPTION WHEN duplicate_object OR unique_violation THEN NULL;
  END;
  -- PostgreSQL 16: ALTER ... OWNER TO exige poder hacer SET ROLE al dueño nuevo.
  EXECUTE format('GRANT idn_lector TO %I', current_user);
END
$$;

-- CREATE: lo exige ALTER FUNCTION ... OWNER TO sobre funciones del esquema.
GRANT USAGE, CREATE ON SCHEMA idn TO idn_lector;
GRANT SELECT ON idn.cuota, idn.consulta_log TO idn_lector;
GRANT USAGE ON SCHEMA org TO idn_lector;
GRANT SELECT ON org.tenant TO idn_lector;

CREATE POLICY cuota_consola        ON idn.cuota        FOR SELECT TO idn_lector USING (true);
CREATE POLICY consulta_log_consola ON idn.consulta_log FOR SELECT TO idn_lector USING (true);
CREATE POLICY tenant_cuotas        ON org.tenant       FOR SELECT TO idn_lector USING (true);

-- ---------------------------------------------------------------------
-- 5. Cuotas de un periodo, de mayor a menor consumo. Con incluidas 0 la cuota cuenta como agotada.
--    q filtra por nombre o código del tenant; NULL no filtra.
-- ---------------------------------------------------------------------
CREATE FUNCTION idn.cuotas_del_periodo(p_periodo char(7), p_q varchar, p_limite int, p_desplazamiento int)
RETURNS TABLE (tenant_id uuid, tenant_nombre varchar, plan varchar, incluidas integer, consumidas integer,
               avisado_umbral_en timestamptz, avisado_agotada_en timestamptz, version integer, total bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT c.tenant_id, t.nombre, c.plan, c.incluidas, c.consumidas,
         c.avisado_umbral_en, c.avisado_agotada_en, c.version,
         count(*) OVER ()
    FROM idn.cuota c
    JOIN org.tenant t ON t.id = c.tenant_id
   WHERE c.periodo = p_periodo
     AND (p_q IS NULL OR t.codigo ILIKE '%' || p_q || '%' OR t.nombre ILIKE '%' || p_q || '%')
   ORDER BY CASE WHEN c.incluidas = 0 THEN 1 ELSE c.consumidas::numeric / c.incluidas END DESC, t.nombre, c.tenant_id
   LIMIT p_limite OFFSET p_desplazamiento;
$$;

-- ---------------------------------------------------------------------
-- 6. Detalle: la cuota más las consultas del periodo por resultado (todas las claves, en 0 si no hubo).
--    El periodo va de las 00:00 del día 1 en Lima a las 00:00 del día 1 siguiente. Sin fila → ninguna fila.
-- ---------------------------------------------------------------------
CREATE FUNCTION idn.cuota_detalle(p_tenant uuid, p_periodo char(7))
RETURNS TABLE (tenant_id uuid, tenant_nombre varchar, periodo char(7), plan varchar, incluidas integer,
               consumidas integer, avisado_umbral_en timestamptz, avisado_agotada_en timestamptz,
               creada_en timestamptz, version integer, consultas_por_resultado jsonb)
LANGUAGE sql STABLE STRICT SECURITY DEFINER SET search_path = '' AS $$
  WITH limites AS (
    SELECT ((p_periodo || '-01')::timestamp AT TIME ZONE 'America/Lima') AS desde,
           (((p_periodo || '-01')::date + interval '1 month')::timestamp AT TIME ZONE 'America/Lima') AS hasta
  )
  SELECT c.tenant_id, t.nombre, c.periodo, c.plan, c.incluidas, c.consumidas,
         c.avisado_umbral_en, c.avisado_agotada_en, c.creada_en, c.version,
         (SELECT jsonb_object_agg(r.resultado, (SELECT count(*) FROM idn.consulta_log l
                                                 WHERE l.tenant_id = c.tenant_id AND l.resultado = r.resultado
                                                   AND l.consultado_en >= limites.desde
                                                   AND l.consultado_en < limites.hasta))
            FROM unnest(ARRAY['CACHE', 'PROVEEDOR', 'NO_ENCONTRADO', 'INVALIDO', 'CUOTA_AGOTADA',
                              'PROVEEDOR_NO_DISPONIBLE']) AS r(resultado))
    FROM idn.cuota c
    JOIN org.tenant t ON t.id = c.tenant_id
    CROSS JOIN limites
   WHERE c.tenant_id = p_tenant AND c.periodo = p_periodo;
$$;

ALTER FUNCTION idn.cuotas_del_periodo(char, varchar, int, int) OWNER TO idn_lector;
ALTER FUNCTION idn.cuota_detalle(uuid, char) OWNER TO idn_lector;
REVOKE EXECUTE ON FUNCTION idn.cuotas_del_periodo(char, varchar, int, int) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION idn.cuota_detalle(uuid, char) FROM PUBLIC;

-- Solo el rol que corre la migración (en dev, postgres: el mismo de la api).
DO $$
BEGIN
  EXECUTE format('GRANT EXECUTE ON FUNCTION idn.cuotas_del_periodo(char, varchar, int, int) TO %I', current_user);
  EXECUTE format('GRANT EXECUTE ON FUNCTION idn.cuota_detalle(uuid, char) TO %I', current_user);
END
$$;

-- Los esquemas de plataforma no se exponen por la Data API (regla 8). En PostgreSQL plano
-- (CI) los roles de Supabase no existen.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon')
     AND EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON idn.cuota FROM anon, authenticated;
    REVOKE ALL ON FUNCTION idn.cuotas_del_periodo(char, varchar, int, int) FROM anon, authenticated;
    REVOKE ALL ON FUNCTION idn.cuota_detalle(uuid, char) FROM anon, authenticated;
  END IF;
END
$$;
