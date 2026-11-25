-- Deja per como antes de la fusión, solo si nunca se fusionó nadie: quitar las columnas de alias haría
-- visibles como independientes fichas ya fusionadas. Todo en un DO para que el NO FORCE (el dueño ve las
-- filas sin tenant en el contexto) no quede si se corta.
DO $$
BEGIN
  ALTER TABLE per.fusion NO FORCE ROW LEVEL SECURITY;
  ALTER TABLE per.persona NO FORCE ROW LEVEL SECURITY;
  IF EXISTS (SELECT 1 FROM per.fusion) OR EXISTS (SELECT 1 FROM per.persona WHERE fusionada_en_id IS NOT NULL) THEN
    RAISE EXCEPTION 'No se puede revertir 01l_per_fusion: hay personas fusionadas y quedarían como fichas independientes'
      USING ERRCODE = 'object_in_use';
  END IF;
  ALTER TABLE per.persona FORCE ROW LEVEL SECURITY;
END
$$;

DROP TABLE per.par_descartado;
DROP TABLE per.fusion;

DROP INDEX per.ix_persona_fusionada_en;
ALTER TABLE per.persona
  DROP CONSTRAINT ck_persona_fusion_inactiva,
  DROP CONSTRAINT ck_persona_fusion_no_propia,
  DROP CONSTRAINT ck_persona_fusion_completa,
  DROP COLUMN fusionada_en,
  DROP COLUMN fusionada_en_id;
