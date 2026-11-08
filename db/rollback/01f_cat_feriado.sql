-- Deja la base como la dejó 01f_cat.sql: sin feriados.
DROP FUNCTION cat.eliminar_feriado_global(uuid, bigint);
DROP FUNCTION cat.guardar_feriado_global(uuid, bigint, date, varchar, boolean, uuid);
DROP FUNCTION cat.items_administracion(varchar, uuid, date, varchar, varchar, varchar, int, int);
DROP FUNCTION cat.feriado_choca(varchar, uuid, date, boolean, uuid);
DROP FUNCTION cat.fechas_feriado(date, date, uuid);
DROP TABLE cat.feriado;
