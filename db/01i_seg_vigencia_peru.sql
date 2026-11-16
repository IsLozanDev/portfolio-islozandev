-- 01i · Vigencias en fecha de Perú. PostgreSQL 16. Reversible: rollback/01i_seg_vigencia_peru.sql.
-- La aplicación guarda vigente_desde/vigente_hasta como fecha de America/Lima (fechaLocal), pero las funciones
-- comparaban con current_date de la sesión, que en Supabase y en CI es UTC. Entre las 19:00 y las 24:00 de Perú
-- una asignación que vence hoy (el acceso de soporte de horas) ya contaba como vencida.

ALTER FUNCTION seg.asignaciones_aplicables(uuid, uuid, uuid, uuid) SET timezone = 'America/Lima';
ALTER FUNCTION seg.sucursales_accesibles(uuid, uuid) SET timezone = 'America/Lima';
ALTER FUNCTION seg.permisos_efectivos(uuid, uuid, uuid, uuid) SET timezone = 'America/Lima';
