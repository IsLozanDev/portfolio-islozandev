-- Deja la base como la dejó 01f_cat.sql.
DROP FUNCTION cat.finalizar_importacion(uuid, uuid);
DROP FUNCTION cat.cerrar_bajas_importacion(uuid);
DROP FUNCTION cat.aplicar_lote_importacion(uuid, varchar, int, int);
DROP FUNCTION cat.iniciar_importacion(uuid);
DROP FUNCTION cat.importacion_en_curso(uuid);
DROP TABLE cat.importacion;

-- Versión del spec 19a: sube la versión global con cada fila.
CREATE OR REPLACE FUNCTION cat.subir_version_global() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  fila record;
BEGIN
  IF TG_OP = 'DELETE' THEN fila := OLD; ELSE fila := NEW; END IF;
  IF fila.tenant_id IS NOT NULL THEN
    RETURN NULL;
  END IF;
  UPDATE cat.catalogo SET version = version + 1 WHERE id = fila.catalogo_id;
  RETURN NULL;
END;
$$;

-- Los catálogos de la semilla con ítems importados se quedan: borrarlos perdería datos oficiales.
DELETE FROM cat.catalogo c
 WHERE c.id IN ('ca700000-0000-0000-0000-000000000005', 'ca700000-0000-0000-0000-000000000006',
                'ca700000-0000-0000-0000-000000000007', 'ca700000-0000-0000-0000-000000000008',
                'ca700000-0000-0000-0000-000000000009')
   AND NOT EXISTS (SELECT 1 FROM cat.catalogo_item i WHERE i.catalogo_id = c.id);
