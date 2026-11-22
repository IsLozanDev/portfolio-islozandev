-- 01l · Personas TR-PER: consentimientos por finalidad con textos versionados (spec 37). PostgreSQL 16.
-- Reversible: rollback/01l_per_consentimientos.sql, que se niega si hay consentimientos (TR-RNF-016).
-- Textos de solo inserción por tenant; decisiones de solo inserción salvo la marca de revocación.

-- ---------------------------------------------------------------------
-- 1. Textos por finalidad. Un texto publicado no cambia: una corrección es una versión nueva.
--    El vigente de una finalidad es el de mayor publicado_en del tenant.
-- ---------------------------------------------------------------------
CREATE TABLE per.texto_finalidad (
  id             uuid PRIMARY KEY,
  tenant_id      uuid NOT NULL,
  finalidad      varchar(24) NOT NULL CHECK (finalidad IN
                   ('PRESTACION','PROMOCIONES','COMPARTIR_PRODUCTOS','DATOS_SALUD','IDENTIDAD_PORTABLE')),
  version        varchar(20) NOT NULL CHECK (version ~ '^[A-Za-z0-9._-]{1,20}$'),
  texto          text NOT NULL CHECK (char_length(texto) BETWEEN 20 AND 10000),
  publicado_por  uuid NOT NULL,
  publicado_en   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_texto_finalidad_version UNIQUE (tenant_id, finalidad, version)
);
CREATE INDEX ix_texto_finalidad_vigente ON per.texto_finalidad (tenant_id, finalidad, publicado_en DESC);

-- ---------------------------------------------------------------------
-- 2. Decisiones. evidencia_archivo_id sin llave foránea a arc: PER la valida por ArchivoPort (TR-RNF-119).
-- ---------------------------------------------------------------------
CREATE TABLE per.consentimiento (
  id                    uuid PRIMARY KEY,
  tenant_id             uuid NOT NULL,
  persona_id            uuid NOT NULL REFERENCES per.persona(id),
  finalidad             varchar(24) NOT NULL CHECK (finalidad IN
                          ('PRESTACION','PROMOCIONES','COMPARTIR_PRODUCTOS','DATOS_SALUD','IDENTIDAD_PORTABLE')),
  decision              varchar(8)  NOT NULL CHECK (decision IN ('ACEPTA','RECHAZA')),
  version_texto         varchar(20) NOT NULL,
  canal                 varchar(10) NOT NULL CHECK (canal IN ('PRESENCIAL','WEB','WHATSAPP','KIOSCO')),
  accion_expresa        boolean NOT NULL CHECK (accion_expresa),
  evidencia_archivo_id  uuid,
  registrado_por        uuid NOT NULL,
  registrado_en         timestamptz NOT NULL DEFAULT now(),
  revocado_en           timestamptz,
  revocado_por          uuid,
  canal_revocacion      varchar(10) CHECK (canal_revocacion IN ('PRESENCIAL','WEB','WHATSAPP','KIOSCO')),
  CONSTRAINT fk_consentimiento_texto FOREIGN KEY (tenant_id, finalidad, version_texto)
    REFERENCES per.texto_finalidad (tenant_id, finalidad, version),
  CONSTRAINT ck_consentimiento_revocacion CHECK (
    (revocado_en IS NULL) = (revocado_por IS NULL) AND (revocado_en IS NULL) = (canal_revocacion IS NULL)),
  CONSTRAINT ck_consentimiento_revoca_acepta CHECK (revocado_en IS NULL OR decision = 'ACEPTA')
);
CREATE INDEX ix_consentimiento_persona ON per.consentimiento (persona_id, finalidad, registrado_en DESC);
-- Segunda barrera de «un solo ACEPTA vigente por persona y finalidad»; la primera es el dominio.
CREATE UNIQUE INDEX ux_consentimiento_aceptado_vigente ON per.consentimiento (persona_id, finalidad)
  WHERE decision = 'ACEPTA' AND revocado_en IS NULL;

-- ---------------------------------------------------------------------
-- 3. Solo revocación: el historial es prueba legal y solo admite marcar la revocación una vez.
-- ---------------------------------------------------------------------
CREATE FUNCTION per.consentimiento_solo_revocacion() RETURNS trigger
LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF OLD.revocado_en IS NOT NULL THEN
    RAISE EXCEPTION 'El consentimiento % ya está revocado', OLD.id USING ERRCODE = 'check_violation';
  END IF;
  IF (NEW.id, NEW.tenant_id, NEW.persona_id, NEW.finalidad, NEW.decision, NEW.version_texto, NEW.canal,
      NEW.accion_expresa, NEW.evidencia_archivo_id, NEW.registrado_por, NEW.registrado_en)
     IS DISTINCT FROM
     (OLD.id, OLD.tenant_id, OLD.persona_id, OLD.finalidad, OLD.decision, OLD.version_texto, OLD.canal,
      OLD.accion_expresa, OLD.evidencia_archivo_id, OLD.registrado_por, OLD.registrado_en) THEN
    RAISE EXCEPTION 'Un consentimiento solo admite marcar su revocación' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END
$$;

CREATE TRIGGER consentimiento_solo_revocacion BEFORE UPDATE ON per.consentimiento
  FOR EACH ROW EXECUTE FUNCTION per.consentimiento_solo_revocacion();

-- ---------------------------------------------------------------------
-- 4. RLS. Sin DELETE en ninguna de las dos; sin UPDATE en los textos.
-- ---------------------------------------------------------------------
ALTER TABLE per.texto_finalidad ENABLE ROW LEVEL SECURITY;
ALTER TABLE per.texto_finalidad FORCE ROW LEVEL SECURITY;
ALTER TABLE per.consentimiento ENABLE ROW LEVEL SECURITY;
ALTER TABLE per.consentimiento FORCE ROW LEVEL SECURITY;

CREATE POLICY texto_finalidad_select ON per.texto_finalidad FOR SELECT
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
CREATE POLICY texto_finalidad_insert ON per.texto_finalidad FOR INSERT
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

CREATE POLICY consentimiento_select ON per.consentimiento FOR SELECT
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
CREATE POLICY consentimiento_insert ON per.consentimiento FOR INSERT
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
CREATE POLICY consentimiento_update ON per.consentimiento FOR UPDATE
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

-- ---------------------------------------------------------------------
-- 5. Privilegios. El rol de la aplicación es el que corre la migración (en dev, postgres).
-- ---------------------------------------------------------------------
REVOKE ALL ON per.texto_finalidad, per.consentimiento FROM PUBLIC;
REVOKE ALL ON FUNCTION per.consentimiento_solo_revocacion() FROM PUBLIC;

DO $$
BEGIN
  EXECUTE format('GRANT SELECT, INSERT ON per.texto_finalidad TO %I', current_user);
  EXECUTE format('REVOKE UPDATE, DELETE, TRUNCATE ON per.texto_finalidad FROM %I', current_user);
  EXECUTE format('GRANT SELECT, INSERT, UPDATE ON per.consentimiento TO %I', current_user);
  EXECUTE format('REVOKE DELETE, TRUNCATE ON per.consentimiento FROM %I', current_user);
END
$$;

-- Los esquemas de plataforma no se exponen por la Data API (regla 8). En PostgreSQL plano
-- (CI) los roles de Supabase no existen.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon')
     AND EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON per.texto_finalidad, per.consentimiento FROM anon, authenticated;
    REVOKE ALL ON FUNCTION per.consentimiento_solo_revocacion() FROM anon, authenticated;
  END IF;
END
$$;
