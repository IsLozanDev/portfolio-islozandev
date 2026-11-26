-- 01x · Facturación electrónica TR-FE: envío a SUNAT, CDR y estados finales (spec 52).
-- PostgreSQL 16. Reversible: rollback/01x_fe_envio.sql.
-- El worker registra cada intento en fe.envio y, con una respuesta final, guarda en el comprobante el estado, el
-- código, las observaciones, el hash y los archivos de ARC. Un comprobante en estado final ya no cambia (TR-RN-022).

-- ---------------------------------------------------------------------
-- 1. Respuesta de SUNAT en el comprobante. Los archivos viven en arc.archivo (otro esquema, sin FK: ARC es dueño
--    de su ciclo). observaciones es la lista de textos del CDR, como advertencias.
-- ---------------------------------------------------------------------
ALTER TABLE fe.comprobante
  ADD COLUMN hash                  varchar(100),
  ADD COLUMN xml_archivo_id        uuid,
  ADD COLUMN cdr_archivo_id        uuid,
  ADD COLUMN codigo_respuesta      varchar(10),
  ADD COLUMN descripcion_respuesta varchar(500),
  ADD COLUMN observaciones         jsonb NOT NULL DEFAULT '[]' CHECK (jsonb_typeof(observaciones) = 'array'),
  ADD COLUMN respondido_en         timestamptz;

-- ---------------------------------------------------------------------
-- 2. Un registro por intento de envío (EnvioPse de T-06). intento cuenta los de todo el comprobante, también los
--    reintentos del spec 56. NO_ENVIADO: la configuración impidió llamar al proveedor; codigo lleva el motivo.
-- ---------------------------------------------------------------------
CREATE TABLE fe.envio (
  id              uuid PRIMARY KEY,
  tenant_id       uuid NOT NULL,
  comprobante_id  uuid NOT NULL REFERENCES fe.comprobante (id),
  intento         smallint NOT NULL CHECK (intento >= 1),
  proveedor       varchar(20) NOT NULL,
  resultado       varchar(26) NOT NULL CHECK (resultado IN
                    ('ACEPTADO','ACEPTADO_CON_OBSERVACIONES','RECHAZADO','ERROR_TECNICO','CREDENCIAL_INVALIDA','NO_ENVIADO')),
  codigo          varchar(20),
  descripcion     varchar(500),
  enviado_en      timestamptz NOT NULL,
  duracion_ms     integer CHECK (duracion_ms >= 0),
  CONSTRAINT uq_envio_intento UNIQUE (comprobante_id, intento)
);

-- ---------------------------------------------------------------------
-- 3. Inmutabilidad (TR-RN-022). Del comprobante cambian el estado, la versión, la modificación y la respuesta,
--    y solo mientras no tenga estado final. La baja (spec 55) ajusta esta función para ANULADO.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fe.proteger_comprobante() RETURNS trigger
LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE
  columnas_mutables CONSTANT text[] := ARRAY['estado', 'version', 'modificado_en', 'hash', 'xml_archivo_id', 'cdr_archivo_id',
                                             'codigo_respuesta', 'descripcion_respuesta', 'observaciones', 'respondido_en'];
  estados_finales CONSTANT text[] := ARRAY['ACEPTADO', 'ACEPTADO_CON_OBSERVACIONES', 'RECHAZADO'];
BEGIN
  -- Anidado: la misma función protege líneas y cuotas, que no tienen estado, y plpgsql no corta un AND.
  IF TG_OP = 'UPDATE' AND TG_TABLE_NAME = 'comprobante' THEN
    IF OLD.estado = ANY (estados_finales) THEN
      RAISE EXCEPTION 'El comprobante electrónico en estado % es definitivo y no cambia', OLD.estado
        USING ERRCODE = 'restrict_violation';
    END IF;
    IF (to_jsonb(NEW) - columnas_mutables) = (to_jsonb(OLD) - columnas_mutables) THEN
      RETURN NEW;
    END IF;
  END IF;
  RAISE EXCEPTION 'El comprobante electrónico es inmutable: % sobre fe.% no está permitido', TG_OP, TG_TABLE_NAME
    USING ERRCODE = 'restrict_violation';
END
$$;

-- fe.envio es un registro: no se cambia ni se borra.
CREATE FUNCTION fe.proteger_envio() RETURNS trigger
LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  RAISE EXCEPTION 'El intento de envío es un registro: % sobre fe.envio no está permitido', TG_OP
    USING ERRCODE = 'restrict_violation';
END
$$;

CREATE TRIGGER tg_proteger_envio BEFORE UPDATE OR DELETE ON fe.envio
  FOR EACH ROW EXECUTE FUNCTION fe.proteger_envio();

-- ---------------------------------------------------------------------
-- 4. RLS, como 01u. Sin UPDATE ni DELETE.
-- ---------------------------------------------------------------------
ALTER TABLE fe.envio ENABLE ROW LEVEL SECURITY;
ALTER TABLE fe.envio FORCE ROW LEVEL SECURITY;

CREATE POLICY envio_select ON fe.envio FOR SELECT
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
CREATE POLICY envio_insert ON fe.envio FOR INSERT
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

-- ---------------------------------------------------------------------
-- 5. Privilegios: el rol de la aplicación es el que corre la migración (en dev, postgres).
-- ---------------------------------------------------------------------
REVOKE ALL ON fe.envio FROM PUBLIC;
REVOKE ALL ON FUNCTION fe.proteger_envio() FROM PUBLIC;

DO $$
BEGIN
  EXECUTE format('GRANT SELECT, INSERT ON fe.envio TO %I', current_user);
  EXECUTE format('REVOKE UPDATE, DELETE, TRUNCATE ON fe.envio FROM %I', current_user);
END
$$;

-- Regla 8: no se expone por la Data API. En PostgreSQL plano (CI) los roles de Supabase no existen.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon')
     AND EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON fe.envio FROM anon, authenticated;
    REVOKE ALL ON FUNCTION fe.proteger_envio() FROM anon, authenticated;
  END IF;
END
$$;
