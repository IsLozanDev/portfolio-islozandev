-- Borra aud solo si está vacío: la auditoría no se borra ni por rollback (TR-RN-028). Todo en un DO para
-- que el NO FORCE (el dueño ve todas las filas sin tenant en el contexto) no quede si se corta.
DO $$
BEGIN
  ALTER TABLE aud.evento_auditoria NO FORCE ROW LEVEL SECURITY;
  IF EXISTS (SELECT 1 FROM aud.evento_auditoria) THEN
    RAISE EXCEPTION 'No se puede revertir 01g_aud: aud.evento_auditoria tiene filas y la auditoría no se borra (TR-RN-028)'
      USING ERRCODE = 'object_in_use';
  END IF;
END
$$;

DROP SCHEMA aud CASCADE;
