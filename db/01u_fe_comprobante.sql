-- 01u · Facturación electrónica TR-FE: emisión de boleta y factura (spec 51).
-- PostgreSQL 16. Reversible: rollback/01u_fe_comprobante.sql.
-- El comprobante nace en PENDIENTE_ENVIO con su número de SEQ; el envío al PSE y el CDR son del spec 52.

-- ---------------------------------------------------------------------
-- 1. Comprobante, líneas y cuotas. Los montos se guardan ya redondeados (TR-RN-021). huella_solicitud distingue
--    «misma clave, mismo contenido» (reintento) de «misma clave, otro contenido» (409).
--    Las FK compuestas con tenant_id no cruzan tenants (org.empresa y org.sucursal tienen UNIQUE (tenant_id, id)).
-- ---------------------------------------------------------------------
CREATE TABLE fe.comprobante (
  id                       uuid PRIMARY KEY,
  tenant_id                uuid NOT NULL,
  empresa_id               uuid NOT NULL,
  sucursal_id              uuid NOT NULL,
  emisor_id                uuid NOT NULL REFERENCES fe.emisor (id),
  tipo                     char(2)      NOT NULL CHECK (tipo IN ('01','03')),
  serie                    char(4)      NOT NULL,
  numero                   bigint       NOT NULL CHECK (numero BETWEEN 1 AND 99999999),
  fecha_emision            date         NOT NULL,
  moneda                   char(3)      NOT NULL CHECK (moneda IN ('PEN','USD')),
  forma_pago               varchar(7)   NOT NULL CHECK (forma_pago IN ('CONTADO','CREDITO')),
  adquirente_tipo_doc      varchar(10)  NOT NULL,
  adquirente_numero        varchar(15)  NOT NULL,
  adquirente_nombre        varchar(200) NOT NULL,
  adquirente_correo        varchar(254),
  adquirente_persona_id    uuid,
  regimen_igv              varchar(24)  NOT NULL CHECK (regimen_igv IN ('GENERAL','REDUCIDO_RESTAURANTES')),
  tasa_igv                 numeric(5,4) NOT NULL CHECK (tasa_igv >= 0 AND tasa_igv < 1),
  total_gravado            numeric(14,2) NOT NULL,
  total_exonerado          numeric(14,2) NOT NULL,
  total_inafecto           numeric(14,2) NOT NULL,
  igv                      numeric(14,2) NOT NULL,
  total                    numeric(14,2) NOT NULL CHECK (total >= 0),
  modo_envio               varchar(10)  NOT NULL DEFAULT 'INDIVIDUAL' CHECK (modo_envio IN ('INDIVIDUAL','RESUMEN')),
  estado                   varchar(26)  NOT NULL CHECK (estado IN
                             ('PENDIENTE_ENVIO','ENVIADO','ACEPTADO','ACEPTADO_CON_OBSERVACIONES','RECHAZADO','ANULADO')),
  advertencias             jsonb        NOT NULL DEFAULT '[]',
  origen_producto          varchar(10),
  origen_id                varchar(100),
  clave_idempotencia       uuid         NOT NULL,
  huella_solicitud         varchar(64)  NOT NULL CHECK (huella_solicitud ~ '^[0-9a-f]{64}$'),
  version                  integer      NOT NULL DEFAULT 1 CHECK (version >= 1),
  creado_por               uuid,
  creado_en                timestamptz  NOT NULL DEFAULT now(),
  modificado_en            timestamptz,
  CONSTRAINT uq_comprobante_numero UNIQUE (tenant_id, empresa_id, tipo, serie, numero),
  CONSTRAINT uq_comprobante_idempotencia UNIQUE (tenant_id, clave_idempotencia),
  CONSTRAINT ck_comprobante_serie CHECK ((tipo = '01' AND serie ~ '^F[A-Z0-9]{3}$') OR (tipo = '03' AND serie ~ '^B[A-Z0-9]{3}$')),
  CONSTRAINT fk_comprobante_empresa FOREIGN KEY (tenant_id, empresa_id) REFERENCES org.empresa (tenant_id, id),
  CONSTRAINT fk_comprobante_sucursal FOREIGN KEY (tenant_id, sucursal_id) REFERENCES org.sucursal (tenant_id, id)
);

CREATE TABLE fe.comprobante_linea (
  comprobante_id   uuid NOT NULL REFERENCES fe.comprobante (id),
  tenant_id        uuid NOT NULL,
  orden            smallint NOT NULL CHECK (orden >= 1),
  codigo           varchar(30),
  descripcion      varchar(500) NOT NULL,
  unidad           varchar(3)  NOT NULL,
  cantidad         numeric(14,4) NOT NULL CHECK (cantidad > 0),
  valor_unitario   numeric(14,4) NOT NULL CHECK (valor_unitario >= 0),
  afectacion_igv   char(2) NOT NULL,
  valor_venta      numeric(14,2) NOT NULL,
  igv              numeric(14,2) NOT NULL,
  precio_unitario  numeric(14,4) NOT NULL,
  PRIMARY KEY (comprobante_id, orden)
);

CREATE TABLE fe.comprobante_cuota (
  comprobante_id     uuid NOT NULL REFERENCES fe.comprobante (id),
  tenant_id          uuid NOT NULL,
  numero             smallint NOT NULL CHECK (numero >= 1),
  monto              numeric(14,2) NOT NULL CHECK (monto > 0),
  fecha_vencimiento  date NOT NULL,
  PRIMARY KEY (comprobante_id, numero)
);

-- ---------------------------------------------------------------------
-- 2. Inmutabilidad (TR-RN-022). Del comprobante solo cambian estado, version y modificado_en: el 52 suma a
--    COLUMNAS_MUTABLES sus columnas de respuesta. Líneas y cuotas no cambian ni se borran; el comprobante no se borra.
-- ---------------------------------------------------------------------
CREATE FUNCTION fe.proteger_comprobante() RETURNS trigger
LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE
  columnas_mutables CONSTANT text[] := ARRAY['estado', 'version', 'modificado_en'];
BEGIN
  IF TG_OP = 'UPDATE' AND TG_TABLE_NAME = 'comprobante'
     AND (to_jsonb(NEW) - columnas_mutables) = (to_jsonb(OLD) - columnas_mutables) THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'El comprobante electrónico es inmutable: % sobre fe.% no está permitido', TG_OP, TG_TABLE_NAME
    USING ERRCODE = 'restrict_violation';
END
$$;

CREATE TRIGGER tg_proteger_comprobante BEFORE UPDATE OR DELETE ON fe.comprobante
  FOR EACH ROW EXECUTE FUNCTION fe.proteger_comprobante();
CREATE TRIGGER tg_proteger_comprobante_linea BEFORE UPDATE OR DELETE ON fe.comprobante_linea
  FOR EACH ROW EXECUTE FUNCTION fe.proteger_comprobante();
CREATE TRIGGER tg_proteger_comprobante_cuota BEFORE UPDATE OR DELETE ON fe.comprobante_cuota
  FOR EACH ROW EXECUTE FUNCTION fe.proteger_comprobante();

-- ---------------------------------------------------------------------
-- 3. RLS, como 01p: NULLIF evita el error de cast cuando app.tenant_id quedó en ''. Sin DELETE.
-- ---------------------------------------------------------------------
ALTER TABLE fe.comprobante       ENABLE ROW LEVEL SECURITY;
ALTER TABLE fe.comprobante       FORCE ROW LEVEL SECURITY;
ALTER TABLE fe.comprobante_linea ENABLE ROW LEVEL SECURITY;
ALTER TABLE fe.comprobante_linea FORCE ROW LEVEL SECURITY;
ALTER TABLE fe.comprobante_cuota ENABLE ROW LEVEL SECURITY;
ALTER TABLE fe.comprobante_cuota FORCE ROW LEVEL SECURITY;

CREATE POLICY comprobante_select ON fe.comprobante FOR SELECT
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
CREATE POLICY comprobante_insert ON fe.comprobante FOR INSERT
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
CREATE POLICY comprobante_update ON fe.comprobante FOR UPDATE
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

CREATE POLICY comprobante_linea_select ON fe.comprobante_linea FOR SELECT
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
CREATE POLICY comprobante_linea_insert ON fe.comprobante_linea FOR INSERT
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

CREATE POLICY comprobante_cuota_select ON fe.comprobante_cuota FOR SELECT
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
CREATE POLICY comprobante_cuota_insert ON fe.comprobante_cuota FOR INSERT
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

-- ---------------------------------------------------------------------
-- 4. Privilegios: el rol de la aplicación es el que corre la migración (en dev, postgres).
-- ---------------------------------------------------------------------
REVOKE ALL ON fe.comprobante, fe.comprobante_linea, fe.comprobante_cuota FROM PUBLIC;
REVOKE ALL ON FUNCTION fe.proteger_comprobante() FROM PUBLIC;

DO $$
BEGIN
  EXECUTE format('GRANT SELECT, INSERT, UPDATE ON fe.comprobante TO %I', current_user);
  EXECUTE format('GRANT SELECT, INSERT ON fe.comprobante_linea, fe.comprobante_cuota TO %I', current_user);
  EXECUTE format('REVOKE DELETE, TRUNCATE ON fe.comprobante, fe.comprobante_linea, fe.comprobante_cuota FROM %I', current_user);
  EXECUTE format('REVOKE UPDATE ON fe.comprobante_linea, fe.comprobante_cuota FROM %I', current_user);
END
$$;

-- Regla 8: no se expone por la Data API. En PostgreSQL plano (CI) los roles de Supabase no existen.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon')
     AND EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON fe.comprobante, fe.comprobante_linea, fe.comprobante_cuota FROM anon, authenticated;
    REVOKE ALL ON FUNCTION fe.proteger_comprobante() FROM anon, authenticated;
  END IF;
END
$$;

-- ---------------------------------------------------------------------
-- 5. Catálogo GLOBAL TASA_IGV: la tasa (IGV + IPM) que va en el comprobante, por régimen y con vigencia.
--    GENERAL: 18 % desde el 2011-03-01 (16 % IGV + 2 % IPM; desde 2026 15,5 % + 2,5 %, Ley 32387: el total no cambia).
--    REDUCIDO_RESTAURANTES (Ley 31556, prorrogada por la Ley 32219): en 2026 IGV 8 % + IPM 2,5 % (Ley 32387) = 10,5 %.
--    En 2027 pasa a 15 % (12 % + 3 %): se actualiza el ítem antes del 2027-01-01, sin código.
-- ---------------------------------------------------------------------
INSERT INTO cat.catalogo (id, codigo, nombre, alcance, fuente, editable_por_tenant) VALUES
  ('ca700000-0000-0000-0000-000000000021', 'TASA_IGV', 'Tasas de IGV por régimen', 'GLOBAL', 'Ley del IGV; Leyes 31556, 32219 y 32387', false);

INSERT INTO cat.catalogo_item (id, catalogo_id, codigo, nombre, orden, atributos, vigente_desde, vigente_hasta) VALUES
  ('ca700000-0000-0000-0021-000000000001', 'ca700000-0000-0000-0000-000000000021', 'GENERAL', 'Tasa general', 1,
   '{"tasa": "0.18"}', '2011-03-01', NULL),
  ('ca700000-0000-0000-0021-000000000002', 'ca700000-0000-0000-0000-000000000021', 'REDUCIDO_RESTAURANTES',
   'Tasa reducida de restaurantes y hoteles (MYPE)', 2, '{"tasa": "0.105"}', '2026-01-01', '2026-12-31');

UPDATE cat.catalogo SET version = 1 WHERE id = 'ca700000-0000-0000-0000-000000000021';

-- ---------------------------------------------------------------------
-- 6. AFECTACION_IGV (cat. 07): el grupo de cada código y si es operación onerosa. Los ítems llegan con el
--    importador (01f_cat_importacion): aquí solo se suman atributos a los que ya existen, y el importador
--    conserva las claves que su diseño no trae. FE calcula el IGV solo en los gravados onerosos.
-- ---------------------------------------------------------------------
UPDATE cat.catalogo_item item
   SET atributos = item.atributos || jsonb_build_object(
         'grupo', CASE
                    WHEN item.codigo = '17' THEN 'IVAP'
                    WHEN item.codigo LIKE '1_' THEN 'GRAVADO'
                    WHEN item.codigo LIKE '2_' THEN 'EXONERADO'
                    WHEN item.codigo LIKE '3_' THEN 'INAFECTO'
                    ELSE 'EXPORTACION'
                  END,
         'oneroso', item.codigo IN ('10', '17', '20', '30', '40'))
  FROM cat.catalogo catalogo
 WHERE catalogo.id = item.catalogo_id AND catalogo.codigo = 'AFECTACION_IGV' AND item.tenant_id IS NULL;
