-- Deja seg como lo dejó 01b_seg.sql. Los triggers de org.suscripcion se quitan explícitamente:
-- org no se borra con seg.
DROP FUNCTION seg.versiones_seguridad(uuid);
DROP FUNCTION seg.sucursales_accesibles(uuid, uuid);
DROP FUNCTION seg.menu_usuario(uuid, uuid, uuid, uuid);
DROP FUNCTION seg.permisos_efectivos(uuid, uuid, uuid, uuid);
DROP FUNCTION seg.asignaciones_aplicables(uuid, uuid, uuid, uuid);

DROP TRIGGER suscripcion_version_seguridad ON org.suscripcion;
DROP TRIGGER suscripcion_version_seguridad_alta ON org.suscripcion;
DROP TRIGGER membresia_version_seguridad ON seg.membresia;
DROP TRIGGER asignacion_version_seguridad ON seg.asignacion;
DROP TRIGGER perfil_rol_version_seguridad ON seg.perfil_rol;
DROP TRIGGER rol_permiso_version_seguridad ON seg.rol_permiso;
DROP TRIGGER rol_version_seguridad ON seg.rol;
DROP FUNCTION seg.subir_version_seguridad();

DROP TABLE seg.version_seguridad;
DROP TABLE seg.manifiesto_aplicado;

ALTER TABLE seg.membresia  DROP COLUMN ultima_sucursal_id;
ALTER TABLE seg.permiso    DROP COLUMN obsoleto;
ALTER TABLE seg.opcion     DROP COLUMN obsoleto;
ALTER TABLE seg.modulo     DROP COLUMN obsoleto;
ALTER TABLE seg.asignacion DROP COLUMN version;
ALTER TABLE seg.perfil     DROP COLUMN version;
ALTER TABLE seg.rol        DROP COLUMN obsoleto,
                           DROP COLUMN version;
