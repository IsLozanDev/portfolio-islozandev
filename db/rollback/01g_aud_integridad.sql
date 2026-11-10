-- Deja aud como lo dejó 01g_aud.sql. Borra aud.verificacion_integridad solo si está vacía: es historial de
-- integridad y no se borra ni por rollback (TR-RN-028). El NO FORCE (el dueño ve todas las filas sin tenant
-- en el contexto) va en el mismo DO para que no quede si se corta. El rol aud_lector no se borra: es del
-- clúster y en CI lo comparten las bases temporales.
DO $$
BEGIN
  ALTER TABLE aud.verificacion_integridad NO FORCE ROW LEVEL SECURITY;
  IF EXISTS (SELECT 1 FROM aud.verificacion_integridad) THEN
    RAISE EXCEPTION 'No se puede revertir 01g_aud_integridad: aud.verificacion_integridad tiene filas y el historial de integridad no se borra (TR-RN-028)'
      USING ERRCODE = 'object_in_use';
  END IF;
END
$$;

DROP TABLE aud.verificacion_integridad;
DROP FUNCTION aud.tenants_con_eventos();
DROP FUNCTION aud.maximo_numero();
DROP FUNCTION aud.verificar_cadena(bigint, char, integer);
DROP POLICY evento_auditoria_lector ON aud.evento_auditoria;
REVOKE ALL ON aud.evento_auditoria FROM aud_lector;
REVOKE ALL ON SCHEMA aud FROM aud_lector;
DROP INDEX aud.evento_auditoria_entidad_ix;
DROP INDEX aud.evento_auditoria_accion_fecha_ix;
DROP INDEX aud.evento_auditoria_sucursal_fecha_ix;
