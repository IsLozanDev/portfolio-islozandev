-- Deja fe y los catálogos como los dejó 01t. Se niega si hay comprobantes: son documentos tributarios emitidos.
-- FORCE ROW LEVEL SECURITY se quita para contar los de todos los tenants y se repone antes de seguir.
ALTER TABLE fe.comprobante NO FORCE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM fe.comprobante) THEN
    RAISE EXCEPTION 'Hay comprobantes electrónicos emitidos: no se puede revertir 01u_fe_comprobante'
      USING ERRCODE = 'object_in_use';
  END IF;
END
$$;
ALTER TABLE fe.comprobante FORCE ROW LEVEL SECURITY;

DROP TABLE fe.comprobante_cuota;
DROP TABLE fe.comprobante_linea;
DROP TABLE fe.comprobante;
DROP FUNCTION fe.proteger_comprobante();

UPDATE cat.catalogo_item item
   SET atributos = item.atributos - 'grupo' - 'oneroso'
  FROM cat.catalogo catalogo
 WHERE catalogo.id = item.catalogo_id AND catalogo.codigo = 'AFECTACION_IGV' AND item.tenant_id IS NULL;

DELETE FROM cat.catalogo_item WHERE catalogo_id = 'ca700000-0000-0000-0000-000000000021';
DELETE FROM cat.catalogo WHERE id = 'ca700000-0000-0000-0000-000000000021';
