-- 01l · Personas TR-PER: contactos y direcciones (spec 32). PostgreSQL 16. Reversible: rollback/01l_per_contactos.sql.
-- Direcciones con ubigeo, contacto sin repetir por persona y borrado físico de contactos y direcciones.

-- ---------------------------------------------------------------------
-- 1. Direcciones. ubigeo sin llave foránea a cat: PER lo valida por CatalogoPort (TR-RNF-119).
--    distrito, provincia y departamento se copian del catálogo al guardar: la lectura no depende de él.
-- ---------------------------------------------------------------------
CREATE TABLE per.direccion (
  id            uuid PRIMARY KEY,
  persona_id    uuid NOT NULL REFERENCES per.persona(id),
  tenant_id     uuid NOT NULL,
  direccion     varchar(250) NOT NULL CHECK (char_length(direccion) BETWEEN 5 AND 250),
  referencia    varchar(150),
  ubigeo        varchar(6)   NOT NULL CHECK (ubigeo ~ '^[0-9]{6}$'),
  distrito      varchar(200) NOT NULL,
  provincia     varchar(200) NOT NULL,
  departamento  varchar(200) NOT NULL,
  principal     boolean NOT NULL DEFAULT false,
  creado_en     timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX uq_direccion_principal ON per.direccion (persona_id) WHERE principal;
CREATE INDEX ix_direccion_persona ON per.direccion (persona_id);
CREATE INDEX ix_direccion_tenant_ubigeo ON per.direccion (tenant_id, ubigeo);

-- ---------------------------------------------------------------------
-- 2. Contactos: el mismo tipo y valor no se repite en una persona.
-- ---------------------------------------------------------------------
CREATE UNIQUE INDEX uq_contacto_valor ON per.contacto (persona_id, tipo_contacto, valor);

-- ---------------------------------------------------------------------
-- 3. RLS. Contactos y direcciones sí se borran (Ley 29733); personas y roles siguen sin DELETE.
-- ---------------------------------------------------------------------
ALTER TABLE per.direccion ENABLE ROW LEVEL SECURITY;
ALTER TABLE per.direccion FORCE ROW LEVEL SECURITY;

CREATE POLICY direccion_select ON per.direccion FOR SELECT
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
CREATE POLICY direccion_insert ON per.direccion FOR INSERT
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
CREATE POLICY direccion_update ON per.direccion FOR UPDATE
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
CREATE POLICY direccion_delete ON per.direccion FOR DELETE
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

CREATE POLICY contacto_delete ON per.contacto FOR DELETE
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

-- ---------------------------------------------------------------------
-- 4. Privilegios. El rol de la aplicación es el que corre la migración (en dev, postgres).
-- ---------------------------------------------------------------------
REVOKE ALL ON per.direccion FROM PUBLIC;

DO $$
BEGIN
  EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON per.direccion TO %I', current_user);
  EXECUTE format('REVOKE TRUNCATE ON per.direccion FROM %I', current_user);
  EXECUTE format('GRANT DELETE ON per.contacto TO %I', current_user);
END
$$;

-- Los esquemas de plataforma no se exponen por la Data API (regla 8). En PostgreSQL plano
-- (CI) los roles de Supabase no existen.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon')
     AND EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON per.direccion FROM anon, authenticated;
  END IF;
END
$$;
