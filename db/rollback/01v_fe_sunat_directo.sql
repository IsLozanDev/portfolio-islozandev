-- Deja PROVEEDOR_FE como lo dejó 01u. Se niega si hay emisores con proveedor SUNAT: quedarían apuntando a un ítem
-- que ya no existe. FORCE ROW LEVEL SECURITY se quita para contar los de todos los tenants y se repone antes de seguir.
ALTER TABLE fe.emisor NO FORCE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM fe.emisor WHERE proveedor = 'SUNAT') THEN
    RAISE EXCEPTION 'Hay emisores con proveedor SUNAT: cámbialos de proveedor antes de revertir 01v_fe_sunat_directo'
      USING ERRCODE = 'object_in_use';
  END IF;
END
$$;
ALTER TABLE fe.emisor FORCE ROW LEVEL SECURITY;

DELETE FROM cat.catalogo_item WHERE id = 'ca700000-0000-0000-0020-000000000003';
