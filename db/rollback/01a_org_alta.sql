-- Deja org como lo dejó 01a_org.sql. El rol org_lector no se borra: es del clúster y en CI
-- lo comparten las bases temporales.
DROP FUNCTION org.tenant_por_codigo(varchar);
DROP FUNCTION org.suscripciones_a_revisar(date);
DROP POLICY tenant_vencimientos ON org.tenant;
DROP POLICY suscripcion_vencimientos ON org.suscripcion;
DROP TABLE org.aviso_vencimiento;
REVOKE ALL ON org.suscripcion, org.tenant FROM org_lector;
REVOKE ALL ON SCHEMA org FROM org_lector;
