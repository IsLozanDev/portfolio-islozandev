-- 01m · Archivos TR-ARC: análisis atascados (spec 34). PostgreSQL 16. Reversible: rollback/01m_arc_analisis.sql.
-- El worker reencola los archivos que llevan demasiado tiempo EN_ANALISIS: su trabajo agotó los reintentos
-- (antivirus o Storage caídos) y nadie volvió a confirmar la carga.

-- actualizado_en marca el paso a EN_ANALISIS (lo mantiene el ORM al guardar el cambio de estado).
CREATE INDEX ix_archivo_en_analisis ON arc.archivo (actualizado_en) WHERE estado = 'EN_ANALISIS';

-- ---------------------------------------------------------------------
-- Lectura entre tenants para el barrido. Dueño org_lector, como arc.cargas_pendientes_vencidas (01m_arc):
-- ya tiene SELECT y su política sobre arc.archivo. Solo ids; el análisis va con la RLS de cada tenant.
-- ---------------------------------------------------------------------
CREATE FUNCTION arc.archivos_en_analisis_atascados(p_antes timestamptz, p_limite integer)
RETURNS TABLE (tenant_id uuid, archivo_id uuid)
LANGUAGE sql STABLE STRICT SECURITY DEFINER SET search_path = '' AS $$
  SELECT a.tenant_id, a.id
    FROM arc.archivo a
   WHERE a.estado = 'EN_ANALISIS' AND a.actualizado_en < p_antes
   ORDER BY a.actualizado_en, a.id
   LIMIT p_limite;
$$;

ALTER FUNCTION arc.archivos_en_analisis_atascados(timestamptz, integer) OWNER TO org_lector;
REVOKE EXECUTE ON FUNCTION arc.archivos_en_analisis_atascados(timestamptz, integer) FROM PUBLIC;

-- El rol de la aplicación es el que corre la migración (el mismo de la api y del worker).
DO $$
BEGIN
  EXECUTE format('GRANT EXECUTE ON FUNCTION arc.archivos_en_analisis_atascados(timestamptz, integer) TO %I', current_user);
END
$$;

-- En PostgreSQL plano (CI) los roles de Supabase no existen.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon')
     AND EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON FUNCTION arc.archivos_en_analisis_atascados(timestamptz, integer) FROM anon, authenticated;
  END IF;
END
$$;
