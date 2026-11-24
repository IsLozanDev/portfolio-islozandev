-- Deja fe.emisor y PROVEEDOR_FE como los dejó 01p_fe. Se niega si hay emisores VERIFICADO o PRODUCCION (el spec 49
-- no sabe tratarlos) o con proveedor NUBEFACT (quedaría apuntando a un ítem que ya no existe).
-- FORCE ROW LEVEL SECURITY se quita para contar los de todos los tenants y se repone antes de seguir.
ALTER TABLE fe.emisor NO FORCE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM fe.emisor WHERE estado IN ('VERIFICADO', 'PRODUCCION') OR proveedor = 'NUBEFACT') THEN
    RAISE EXCEPTION 'Hay emisores verificados, en producción o con NUBEFACT: devuélvelos a CONFIGURADO con SIMULADO antes de revertir 01r_fe_prueba'
      USING ERRCODE = 'object_in_use';
  END IF;
END
$$;
ALTER TABLE fe.emisor FORCE ROW LEVEL SECURITY;

ALTER TABLE fe.emisor
  DROP CONSTRAINT ck_emisor_produccion,
  DROP CONSTRAINT ck_emisor_url_https,
  DROP COLUMN produccion_habilitada_por,
  DROP COLUMN produccion_habilitada_en,
  DROP COLUMN prueba_descripcion,
  DROP COLUMN prueba_codigo,
  DROP COLUMN prueba_resultado_en,
  DROP COLUMN prueba_solicitada_en,
  DROP COLUMN prueba_estado,
  DROP COLUMN pruebas_enviadas,
  DROP COLUMN url_proveedor;

DELETE FROM cat.catalogo_item WHERE id = 'ca700000-0000-0000-0020-000000000002';
UPDATE cat.catalogo_item
   SET atributos = atributos - 'serie_prueba' - 'dominios_permitidos'
 WHERE id = 'ca700000-0000-0000-0020-000000000001';
