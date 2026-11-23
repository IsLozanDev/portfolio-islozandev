-- Deja la base como la dejó 01o: el esquema fe no existía. Se niega si hay emisores con secretos: borrarlos
-- dejaría la credencial y el certificado huérfanos en sec.secreto.
-- FORCE ROW LEVEL SECURITY se quita para contar los de todos los tenants y se repone antes de seguir.
-- El rol org_lector no se borra: es del clúster.
ALTER TABLE fe.emisor NO FORCE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM fe.emisor WHERE secreto_credencial_id IS NOT NULL OR secreto_certificado_id IS NOT NULL) THEN
    RAISE EXCEPTION 'Hay emisores con secretos en la bóveda: elimínalos con la bóveda antes de revertir 01p_fe'
      USING ERRCODE = 'object_in_use';
  END IF;
END
$$;
ALTER TABLE fe.emisor FORCE ROW LEVEL SECURITY;

DROP FUNCTION fe.certificados_con_aviso_pendiente(timestamptz, uuid, integer);
DROP TABLE fe.aviso_certificado;
DROP TABLE fe.emisor;
DROP SCHEMA fe;

DELETE FROM cat.catalogo_item WHERE catalogo_id = 'ca700000-0000-0000-0000-000000000020';
DELETE FROM cat.catalogo WHERE id = 'ca700000-0000-0000-0000-000000000020';
