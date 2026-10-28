-- Deja org como lo dejó 01a_org_alta.sql: org_lector conserva lo del spec 12.
DROP FUNCTION org.tenant_detalle(uuid);
DROP FUNCTION org.tenants_listar(varchar, varchar, varchar, int, int);
DROP POLICY historial_consola ON org.tenant_estado_historial;
DROP POLICY sucursal_consola ON org.sucursal;
DROP POLICY empresa_consola ON org.empresa;
REVOKE ALL ON org.empresa, org.sucursal, org.tenant_estado_historial FROM org_lector;
