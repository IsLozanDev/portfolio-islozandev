-- Deja idn como lo dejó 01j_idn.sql (con datos de proveedor). El rol idn_lector no se borra: es del clúster
-- y en CI lo comparten las bases temporales.
DROP FUNCTION idn.cuota_detalle(uuid, char);
DROP FUNCTION idn.cuotas_del_periodo(char, varchar, int, int);
DROP POLICY tenant_cuotas ON org.tenant;
DROP POLICY consulta_log_consola ON idn.consulta_log;
REVOKE ALL ON org.tenant FROM idn_lector;
REVOKE ALL ON SCHEMA org FROM idn_lector;
REVOKE ALL ON idn.consulta_log FROM idn_lector;
REVOKE ALL ON SCHEMA idn FROM idn_lector;
DROP TABLE idn.cuota;

DROP POLICY proveedor_update ON idn.proveedor;
DO $$
BEGIN
  EXECUTE format('REVOKE UPDATE (prioridad, ttl_dias, timeout_ms, activo, version) ON idn.proveedor FROM %I', current_user);
END
$$;
ALTER TABLE idn.proveedor DROP COLUMN version;
