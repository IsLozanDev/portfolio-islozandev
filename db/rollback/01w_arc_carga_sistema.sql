-- Deja arc como lo dejó 01m_arc_versiones.sql. Se niega si hay archivos SISTEMA: no tienen actor y sus objetos
-- en Storage quedarían sin dueño. FORCE ROW LEVEL SECURITY se quita para contar los de todos los tenants y se
-- repone antes de seguir.
ALTER TABLE arc.archivo NO FORCE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM arc.archivo WHERE origen = 'SISTEMA') THEN
    RAISE EXCEPTION 'Hay archivos SISTEMA: bórralos (y sus objetos en Storage) antes de revertir 01w_arc_carga_sistema'
      USING ERRCODE = 'object_in_use';
  END IF;
END
$$;
ALTER TABLE arc.archivo FORCE ROW LEVEL SECURITY;

ALTER TABLE arc.version_archivo
  ALTER COLUMN subido_por SET NOT NULL;

ALTER TABLE arc.archivo
  DROP CONSTRAINT ck_archivo_actor,
  ALTER COLUMN creado_por SET NOT NULL,
  DROP COLUMN origen;
