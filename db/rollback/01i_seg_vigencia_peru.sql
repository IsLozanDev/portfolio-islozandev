-- Deja las funciones con la zona de la sesión, como las dejó 01b_seg_membresias.sql.
ALTER FUNCTION seg.asignaciones_aplicables(uuid, uuid, uuid, uuid) RESET timezone;
ALTER FUNCTION seg.sucursales_accesibles(uuid, uuid) RESET timezone;
ALTER FUNCTION seg.permisos_efectivos(uuid, uuid, uuid, uuid) RESET timezone;
