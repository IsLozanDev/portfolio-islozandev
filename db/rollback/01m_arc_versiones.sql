-- Deja arc como lo dejaron 01m_arc.sql y 01m_arc_analisis.sql. Se niega si hay versiones con numero > 1:
-- el código del spec 33 solo lee la versión 1 y sus objetos en Storage quedarían huérfanos.
-- FORCE ROW LEVEL SECURITY se quita para contar las de todos los tenants y se repone antes de seguir.
ALTER TABLE arc.version_archivo NO FORCE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM arc.version_archivo WHERE numero > 1) THEN
    RAISE EXCEPTION 'Hay versiones con numero > 1: bórralas (y sus objetos en Storage) antes de revertir 01m_arc_versiones'
      USING ERRCODE = 'object_in_use';
  END IF;
END
$$;
ALTER TABLE arc.version_archivo FORCE ROW LEVEL SECURITY;

-- El barrido vuelve a mirar solo arc.archivo, con la firma del spec 34.
DROP FUNCTION arc.archivos_en_analisis_atascados(timestamptz, integer);
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
DO $$
BEGIN
  EXECUTE format('GRANT EXECUTE ON FUNCTION arc.archivos_en_analisis_atascados(timestamptz, integer) TO %I', current_user);
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon')
     AND EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON FUNCTION arc.archivos_en_analisis_atascados(timestamptz, integer) FROM anon, authenticated;
  END IF;
END
$$;

DROP FUNCTION arc.versiones_pendientes_vencidas(timestamptz, integer);
DROP POLICY version_archivo_lector ON arc.version_archivo;
REVOKE SELECT ON arc.version_archivo FROM org_lector;

ALTER TABLE arc.archivo
  DROP CONSTRAINT ck_archivo_version_coincidente,
  DROP CONSTRAINT ck_archivo_rechazo_version,
  DROP COLUMN version_coincidente,
  DROP COLUMN motivo_rechazo_version;

DROP INDEX arc.ix_version_pendiente;
DROP INDEX arc.ux_version_en_curso;
ALTER TABLE arc.version_archivo
  DROP CONSTRAINT ck_version_analizada,
  DROP CONSTRAINT ck_version_rechazada,
  DROP CONSTRAINT ck_version_estado,
  DROP COLUMN estado;
