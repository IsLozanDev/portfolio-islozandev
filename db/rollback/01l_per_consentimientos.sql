-- Deja per sin textos ni consentimientos, solo si no hay consentimientos: son prueba ante la autoridad
-- (TR-RNF-016). Todo en un DO para que el NO FORCE (el dueño ve las filas sin tenant en el contexto) no
-- quede si se corta.
DO $$
BEGIN
  ALTER TABLE per.consentimiento NO FORCE ROW LEVEL SECURITY;
  IF EXISTS (SELECT 1 FROM per.consentimiento) THEN
    RAISE EXCEPTION 'No se puede revertir 01l_per_consentimientos: per.consentimiento tiene filas y el historial de consentimientos no se borra (TR-RNF-016)'
      USING ERRCODE = 'object_in_use';
  END IF;
END
$$;

DROP TRIGGER consentimiento_solo_revocacion ON per.consentimiento;
DROP FUNCTION per.consentimiento_solo_revocacion();
DROP TABLE per.consentimiento;
DROP TABLE per.texto_finalidad;
