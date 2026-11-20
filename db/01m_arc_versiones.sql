-- 01m · Archivos TR-ARC: versiones (spec 35). PostgreSQL 16. Reversible: rollback/01m_arc_versiones.sql.
-- Cada versión lleva su propio estado: el archivo sigue DISPONIBLE mientras una versión nueva se sube y se
-- analiza. arc.archivo.estado sigue siendo el ciclo de la primera carga.

-- ---------------------------------------------------------------------
-- 1. Estado por versión, rellenado desde el estado del archivo (hasta hoy cada archivo tiene solo la versión 1).
--    Con FORCE, un dueño sin BYPASSRLS no vería filas y SET NOT NULL fallaría: se quita y se repone aquí.
-- ---------------------------------------------------------------------
ALTER TABLE arc.version_archivo ADD COLUMN estado varchar(16);

ALTER TABLE arc.version_archivo NO FORCE ROW LEVEL SECURITY;
UPDATE arc.version_archivo v SET estado = a.estado FROM arc.archivo a WHERE a.id = v.archivo_id;
ALTER TABLE arc.version_archivo FORCE ROW LEVEL SECURITY;

-- ck_version_rechazada: solo la versión 1 queda RECHAZADO (el archivo rechazado del spec 33); una versión
-- nueva rechazada se borra. ck_version_analizada: el hash existe solo después de un análisis que la conserva.
ALTER TABLE arc.version_archivo
  ALTER COLUMN estado SET NOT NULL,
  ADD CONSTRAINT ck_version_estado CHECK (estado IN ('PENDIENTE_CARGA','EN_ANALISIS','DISPONIBLE','CUARENTENA','RECHAZADO')),
  ADD CONSTRAINT ck_version_rechazada CHECK (estado <> 'RECHAZADO' OR numero = 1),
  ADD CONSTRAINT ck_version_analizada CHECK ((estado IN ('DISPONIBLE','CUARENTENA')) = (hash_sha256 IS NOT NULL));

-- Segunda barrera de «una sola versión en curso»; la primera es el dominio con el bloqueo optimista del archivo.
CREATE UNIQUE INDEX ux_version_en_curso ON arc.version_archivo (archivo_id)
  WHERE estado IN ('PENDIENTE_CARGA','EN_ANALISIS');
CREATE INDEX ix_version_pendiente ON arc.version_archivo (subido_en) WHERE estado = 'PENDIENTE_CARGA';

-- ---------------------------------------------------------------------
-- 2. Motivo del último intento de versión rechazado. motivo_rechazo sigue siendo el de la primera carga.
-- ---------------------------------------------------------------------
ALTER TABLE arc.archivo
  ADD COLUMN motivo_rechazo_version varchar(20)
    CHECK (motivo_rechazo_version IN ('TIPO_NO_PERMITIDO','TAMANO_NO_COINCIDE','IDENTICA')),
  ADD COLUMN version_coincidente integer CHECK (version_coincidente >= 1),
  ADD CONSTRAINT ck_archivo_rechazo_version CHECK (motivo_rechazo_version IS NULL OR estado = 'DISPONIBLE'),
  ADD CONSTRAINT ck_archivo_version_coincidente
    CHECK ((version_coincidente IS NOT NULL) = (motivo_rechazo_version IS NOT DISTINCT FROM 'IDENTICA'));

-- ---------------------------------------------------------------------
-- 3. Lectura entre tenants de las versiones, para la limpieza diaria y el barrido de análisis atascados.
--    Dueño org_lector, como arc.cargas_pendientes_vencidas (01m_arc). Solo ids; el borrado y el análisis
--    van con la RLS de cada tenant.
-- ---------------------------------------------------------------------
GRANT SELECT ON arc.version_archivo TO org_lector;
CREATE POLICY version_archivo_lector ON arc.version_archivo FOR SELECT TO org_lector USING (true);

-- Versiones nuevas (numero > 1) que nadie confirmó. La versión 1 pendiente la limpia
-- arc.cargas_pendientes_vencidas junto con su archivo.
CREATE FUNCTION arc.versiones_pendientes_vencidas(p_antes timestamptz, p_limite integer)
RETURNS TABLE (tenant_id uuid, archivo_id uuid, numero integer)
LANGUAGE sql STABLE STRICT SECURITY DEFINER SET search_path = '' AS $$
  SELECT v.tenant_id, v.archivo_id, v.numero
    FROM arc.version_archivo v
   WHERE v.estado = 'PENDIENTE_CARGA' AND v.numero > 1 AND v.subido_en < p_antes
   ORDER BY v.subido_en, v.archivo_id, v.numero
   LIMIT p_limite;
$$;

ALTER FUNCTION arc.versiones_pendientes_vencidas(timestamptz, integer) OWNER TO org_lector;
REVOKE EXECUTE ON FUNCTION arc.versiones_pendientes_vencidas(timestamptz, integer) FROM PUBLIC;

-- El barrido del spec 34 se extiende a las versiones EN_ANALISIS. Cambia el tipo de retorno (gana numero):
-- CREATE OR REPLACE no lo admite, así que se borra y se crea. No va en 01m_arc_analisis.sql porque esa
-- migración corre antes que esta y aún no existe version_archivo.estado.
-- Una versión nueva no tiene marca propia del paso a EN_ANALISIS: cuenta actualizado_en del archivo, que el
-- ORM mueve al guardar la confirmación (solo marcar vigente la vuelve a mover, y eso solo retrasa el barrido).
DROP FUNCTION arc.archivos_en_analisis_atascados(timestamptz, integer);
CREATE FUNCTION arc.archivos_en_analisis_atascados(p_antes timestamptz, p_limite integer)
RETURNS TABLE (tenant_id uuid, archivo_id uuid, numero integer)
LANGUAGE sql STABLE STRICT SECURITY DEFINER SET search_path = '' AS $$
  SELECT atascado.tenant_id, atascado.archivo_id, atascado.numero
    FROM (
      SELECT a.tenant_id, a.id AS archivo_id, 1 AS numero, a.actualizado_en
        FROM arc.archivo a
       WHERE a.estado = 'EN_ANALISIS' AND a.actualizado_en < p_antes
      UNION ALL
      SELECT v.tenant_id, v.archivo_id, v.numero, a.actualizado_en
        FROM arc.version_archivo v
        JOIN arc.archivo a ON a.id = v.archivo_id
       WHERE v.estado = 'EN_ANALISIS' AND v.numero > 1 AND a.actualizado_en < p_antes
    ) atascado
   ORDER BY atascado.actualizado_en, atascado.archivo_id, atascado.numero
   LIMIT p_limite;
$$;

ALTER FUNCTION arc.archivos_en_analisis_atascados(timestamptz, integer) OWNER TO org_lector;
REVOKE EXECUTE ON FUNCTION arc.archivos_en_analisis_atascados(timestamptz, integer) FROM PUBLIC;

-- El rol de la aplicación es el que corre la migración (el mismo de la api y del worker).
DO $$
BEGIN
  EXECUTE format('GRANT EXECUTE ON FUNCTION arc.versiones_pendientes_vencidas(timestamptz, integer) TO %I', current_user);
  EXECUTE format('GRANT EXECUTE ON FUNCTION arc.archivos_en_analisis_atascados(timestamptz, integer) TO %I', current_user);
END
$$;

-- En PostgreSQL plano (CI) los roles de Supabase no existen.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon')
     AND EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON FUNCTION arc.versiones_pendientes_vencidas(timestamptz, integer) FROM anon, authenticated;
    REVOKE ALL ON FUNCTION arc.archivos_en_analisis_atascados(timestamptz, integer) FROM anon, authenticated;
  END IF;
END
$$;
