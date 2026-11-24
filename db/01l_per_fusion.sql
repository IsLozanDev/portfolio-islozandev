-- 01l · Personas TR-PER: duplicados y fusión (spec 39). PostgreSQL 16. Reversible: rollback/01l_per_fusion.sql.
-- La persona absorbida queda inactiva como alias de la conservada; la fusión queda registrada y los pares
-- revisados que no son la misma persona se descartan para no volver a proponerlos.

-- ---------------------------------------------------------------------
-- 1. Alias. Una absorbida apunta a su conservada, siempre inactiva. Los alias se re-apuntan al fusionar,
--    así que la resolución es de un salto.
-- ---------------------------------------------------------------------
ALTER TABLE per.persona
  ADD COLUMN fusionada_en_id uuid REFERENCES per.persona(id),
  ADD COLUMN fusionada_en    timestamptz,
  ADD CONSTRAINT ck_persona_fusion_completa CHECK ((fusionada_en_id IS NULL) = (fusionada_en IS NULL)),
  ADD CONSTRAINT ck_persona_fusion_no_propia CHECK (fusionada_en_id IS NULL OR fusionada_en_id <> id),
  ADD CONSTRAINT ck_persona_fusion_inactiva CHECK (fusionada_en_id IS NULL OR NOT activo);
CREATE INDEX ix_persona_fusionada_en ON per.persona (fusionada_en_id) WHERE fusionada_en_id IS NOT NULL;

-- ---------------------------------------------------------------------
-- 2. Registro histórico de fusiones, de solo inserción. Una persona se absorbe una sola vez.
-- ---------------------------------------------------------------------
CREATE TABLE per.fusion (
  id                     uuid PRIMARY KEY,
  tenant_id              uuid NOT NULL,
  persona_conservada_id  uuid NOT NULL REFERENCES per.persona(id),
  persona_absorbida_id   uuid NOT NULL REFERENCES per.persona(id),
  campos_elegidos        jsonb NOT NULL,
  motivo                 varchar(300) NOT NULL CHECK (char_length(btrim(motivo)) BETWEEN 5 AND 300),
  fusionado_por          uuid NOT NULL,
  fusionado_en           timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_fusion_absorbida UNIQUE (persona_absorbida_id),
  CONSTRAINT ck_fusion_distintas CHECK (persona_conservada_id <> persona_absorbida_id)
);
CREATE INDEX ix_fusion_conservada ON per.fusion (persona_conservada_id);

-- ---------------------------------------------------------------------
-- 3. Pares descartados, guardados en orden (menor, mayor) para que (a, b) y (b, a) sean el mismo.
-- ---------------------------------------------------------------------
CREATE TABLE per.par_descartado (
  tenant_id         uuid NOT NULL,
  persona_menor_id  uuid NOT NULL REFERENCES per.persona(id),
  persona_mayor_id  uuid NOT NULL REFERENCES per.persona(id),
  descartado_por    uuid NOT NULL,
  descartado_en     timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, persona_menor_id, persona_mayor_id),
  CONSTRAINT ck_par_descartado_orden CHECK (persona_menor_id < persona_mayor_id)
);

-- ---------------------------------------------------------------------
-- 4. RLS. Una fusión no se edita ni se borra; un descarte sí se quita.
-- ---------------------------------------------------------------------
ALTER TABLE per.fusion         ENABLE ROW LEVEL SECURITY;
ALTER TABLE per.fusion         FORCE ROW LEVEL SECURITY;
ALTER TABLE per.par_descartado ENABLE ROW LEVEL SECURITY;
ALTER TABLE per.par_descartado FORCE ROW LEVEL SECURITY;

CREATE POLICY fusion_select ON per.fusion FOR SELECT
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
CREATE POLICY fusion_insert ON per.fusion FOR INSERT
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

CREATE POLICY par_descartado_select ON per.par_descartado FOR SELECT
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
CREATE POLICY par_descartado_insert ON per.par_descartado FOR INSERT
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
CREATE POLICY par_descartado_delete ON per.par_descartado FOR DELETE
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

-- ---------------------------------------------------------------------
-- 5. Privilegios. El rol de la aplicación es el que corre la migración (en dev, postgres).
-- ---------------------------------------------------------------------
REVOKE ALL ON per.fusion, per.par_descartado FROM PUBLIC;

DO $$
BEGIN
  EXECUTE format('GRANT SELECT, INSERT ON per.fusion TO %I', current_user);
  EXECUTE format('REVOKE UPDATE, DELETE, TRUNCATE ON per.fusion FROM %I', current_user);
  EXECUTE format('GRANT SELECT, INSERT, DELETE ON per.par_descartado TO %I', current_user);
  EXECUTE format('REVOKE UPDATE, TRUNCATE ON per.par_descartado FROM %I', current_user);
END
$$;

-- Los esquemas de plataforma no se exponen por la Data API (regla 8). En PostgreSQL plano
-- (CI) los roles de Supabase no existen.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon')
     AND EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON per.fusion, per.par_descartado FROM anon, authenticated;
  END IF;
END
$$;
