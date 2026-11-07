-- Deja seg como lo dejó 01b_seg_soporte.sql. La bitácora no admite DELETE: con eventos LOGIN_FALLIDO o
-- EXPORTACION el CHECK anterior no se puede volver a poner, así que se corta antes de tocar nada.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM seg.evento_seguridad WHERE tipo IN ('LOGIN_FALLIDO', 'EXPORTACION')) THEN
    RAISE EXCEPTION 'No se puede revertir 01b_seg_tipos_ingreso: hay eventos LOGIN_FALLIDO o EXPORTACION y la bitácora no admite DELETE'
      USING ERRCODE = 'object_in_use';
  END IF;
END
$$;

DROP FUNCTION seg.registrar_evento_ingreso(varchar, uuid, uuid, jsonb, inet);
DROP FUNCTION seg.usuario_para_ingreso(text);

DROP POLICY evento_seguridad_ingreso ON seg.evento_seguridad;
REVOKE USAGE ON SEQUENCE seg.evento_seguridad_id_seq FROM org_lector;
REVOKE INSERT ON seg.evento_seguridad FROM org_lector;
DROP POLICY membresia_ingreso ON seg.membresia;
REVOKE SELECT ON seg.usuario, seg.membresia FROM org_lector;

ALTER TABLE seg.evento_seguridad DROP CONSTRAINT ck_evento_seguridad_tipo;
ALTER TABLE seg.evento_seguridad
  ADD CONSTRAINT ck_evento_seguridad_tipo CHECK (tipo IN
    ('LOGIN', 'ACCESO_DENEGADO', 'ASIGNACION_OTORGADA', 'ASIGNACION_REVOCADA', 'ACCESO_SOPORTE'));
