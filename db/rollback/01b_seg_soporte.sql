-- Deja seg como lo dejó 01b_seg_membresias.sql. Los eventos ACCESO_SOPORTE quedan: la bitácora no
-- admite DELETE y el tipo es texto libre sin el CHECK.
DROP FUNCTION seg.accesos_soporte_por_vencer(timestamptz);
DROP FUNCTION seg.accesos_soporte_de_agente(uuid);
DROP TABLE seg.acceso_soporte;
REVOKE CREATE ON SCHEMA seg FROM org_lector;
REVOKE USAGE ON SCHEMA seg FROM org_lector;

DROP INDEX seg.ix_evento_seguridad_usuario;
DROP INDEX seg.ix_evento_seguridad_tipo_fecha;
DROP INDEX seg.ix_evento_seguridad_fecha;
ALTER TABLE seg.evento_seguridad DROP CONSTRAINT ck_evento_seguridad_tipo;
