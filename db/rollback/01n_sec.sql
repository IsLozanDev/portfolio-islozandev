-- Deja la base como la dejó 01m_arc_versiones.sql: el esquema sec no existía. Se niega si hay secretos:
-- borrarlos pierde las credenciales de los tenants sin forma de recuperarlas.
-- FORCE ROW LEVEL SECURITY se quita para contar los de todos los tenants y se repone antes de seguir.
-- El rol org_lector no se borra: es del clúster.
ALTER TABLE sec.secreto NO FORCE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM sec.secreto) THEN
    RAISE EXCEPTION 'Hay secretos guardados en sec.secreto: elimínalos con la bóveda antes de revertir 01n_sec'
      USING ERRCODE = 'object_in_use';
  END IF;
END
$$;
ALTER TABLE sec.secreto FORCE ROW LEVEL SECURITY;

DROP FUNCTION sec.tenants_por_reenvolver(smallint, integer);
DROP TABLE sec.secreto;
DROP TABLE sec.clave_tenant;
DROP SCHEMA sec;
