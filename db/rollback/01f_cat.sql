-- Deja la base como la dejó 01e_sync_relay.sql: el esquema cat no existía.
DROP SCHEMA cat CASCADE;

-- cat_editor es del clúster: si otra base (en CI, las temporales en paralelo) aún tiene objetos suyos, se queda.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'cat_editor') THEN
    DROP ROLE cat_editor;
  END IF;
EXCEPTION WHEN dependent_objects_still_exist THEN
  NULL;
END
$$;
