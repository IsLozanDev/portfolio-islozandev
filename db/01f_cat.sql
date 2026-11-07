-- 01f · Catálogos TR-CAT (spec 19a). PostgreSQL 16. Reversible: rollback/01f_cat.sql.
-- Catálogos globales (solo los escribe el operador, con funciones SECURITY DEFINER de cat_editor),
-- ítems propios del tenant y ajustes de ítems globales en catálogos MIXTO.

CREATE SCHEMA cat;

-- ---------------------------------------------------------------------
-- 1. Rol dueño de las funciones SECURITY DEFINER. Mismo patrón que org_lector: sin login ni BYPASSRLS.
-- ---------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'cat_editor') THEN
    CREATE ROLE cat_editor NOLOGIN;
  END IF;
  -- PostgreSQL 16: ALTER ... OWNER TO exige poder hacer SET ROLE al dueño nuevo.
  EXECUTE format('GRANT cat_editor TO %I', current_user);
END
$$;

-- CREATE: lo exige ALTER FUNCTION ... OWNER TO sobre funciones del esquema.
GRANT USAGE, CREATE ON SCHEMA cat TO cat_editor;

-- ---------------------------------------------------------------------
-- 2. Tablas.
-- ---------------------------------------------------------------------
CREATE TABLE cat.catalogo (
  id                   uuid         PRIMARY KEY,
  codigo               varchar(60)  NOT NULL UNIQUE CHECK (codigo ~ '^[A-Z][A-Z0-9_]{2,59}$'),
  nombre               varchar(150) NOT NULL CHECK (char_length(nombre) BETWEEN 3 AND 150),
  alcance              varchar(6)   NOT NULL CHECK (alcance IN ('GLOBAL', 'MIXTO', 'TENANT')),
  fuente               varchar(150) NULL,
  editable_por_tenant  boolean      NOT NULL,
  -- Versión de contenido global y bloqueo optimista de la definición.
  version              bigint       NOT NULL DEFAULT 1,
  creado_por           uuid         NULL REFERENCES seg.usuario (id),
  creado_en            timestamptz  NOT NULL DEFAULT now(),
  modificado_por       uuid         NULL REFERENCES seg.usuario (id),
  modificado_en        timestamptz  NOT NULL DEFAULT now(),
  CONSTRAINT ck_catalogo_editable CHECK ((alcance = 'GLOBAL') = (NOT editable_por_tenant))
);

CREATE TABLE cat.catalogo_item (
  id               uuid         PRIMARY KEY,
  catalogo_id      uuid         NOT NULL REFERENCES cat.catalogo (id),
  -- NULL: ítem global.
  tenant_id        uuid         NULL REFERENCES org.tenant (id),
  codigo           varchar(40)  NOT NULL CHECK (char_length(codigo) BETWEEN 1 AND 40),
  codigo_externo   varchar(40)  NULL,
  nombre           varchar(200) NOT NULL CHECK (char_length(nombre) BETWEEN 1 AND 200),
  abreviatura      varchar(30)  NULL,
  orden            integer      NOT NULL DEFAULT 0,
  atributos        jsonb        NOT NULL DEFAULT '{}' CHECK (jsonb_typeof(atributos) = 'object'),
  vigente_desde    date         NOT NULL,
  vigente_hasta    date         NULL,
  activo           boolean      NOT NULL DEFAULT true,
  version          bigint       NOT NULL DEFAULT 0,
  creado_por       uuid         NULL REFERENCES seg.usuario (id),
  creado_en        timestamptz  NOT NULL DEFAULT now(),
  modificado_por   uuid         NULL REFERENCES seg.usuario (id),
  modificado_en    timestamptz  NOT NULL DEFAULT now(),
  CONSTRAINT ck_item_vigencia CHECK (vigente_hasta IS NULL OR vigente_hasta >= vigente_desde)
);

-- Código único por catálogo y dueño (TR-RN-013). El mismo código en dos tenants se admite.
CREATE UNIQUE INDEX ux_cat_item ON cat.catalogo_item
  (catalogo_id, COALESCE(tenant_id, '00000000-0000-0000-0000-000000000000'::uuid), codigo);

-- Ajustes de un ítem global en un catálogo MIXTO (TR-RF-025).
CREATE TABLE cat.catalogo_item_tenant (
  item_id        uuid         NOT NULL REFERENCES cat.catalogo_item (id),
  tenant_id      uuid         NOT NULL REFERENCES org.tenant (id),
  visible        boolean      NOT NULL DEFAULT true,
  -- NULL: el orden y el nombre del ítem global.
  orden          integer      NULL,
  alias          varchar(200) NULL CHECK (alias IS NULL OR char_length(alias) BETWEEN 1 AND 200),
  version        bigint       NOT NULL DEFAULT 0,
  modificado_por uuid         NOT NULL REFERENCES seg.usuario (id),
  modificado_en  timestamptz  NOT NULL DEFAULT now(),
  PRIMARY KEY (item_id, tenant_id)
);

-- Versión de lo propio de un tenant en un catálogo. La suben los triggers; nadie la escribe a mano.
CREATE TABLE cat.version_tenant (
  catalogo_id  uuid        NOT NULL REFERENCES cat.catalogo (id),
  tenant_id    uuid        NOT NULL REFERENCES org.tenant (id),
  version      bigint      NOT NULL DEFAULT 1,
  cambiado_en  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (catalogo_id, tenant_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE
   ON cat.catalogo, cat.catalogo_item, cat.catalogo_item_tenant, cat.version_tenant TO cat_editor;

-- ---------------------------------------------------------------------
-- 3. Coherencia ítem-catálogo y ajuste-catálogo. Defensa ante escrituras que no pasen por el
--    dominio (importador del 19b). SECURITY INVOKER: la app lee catálogos e ítems globales.
-- ---------------------------------------------------------------------
CREATE FUNCTION cat.validar_item() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE
  alcance_catalogo varchar;
BEGIN
  SELECT c.alcance INTO alcance_catalogo FROM cat.catalogo c WHERE c.id = NEW.catalogo_id;
  IF alcance_catalogo = 'GLOBAL' AND NEW.tenant_id IS NOT NULL THEN
    RAISE EXCEPTION 'Un catálogo global solo admite ítems globales' USING ERRCODE = 'check_violation';
  END IF;
  IF alcance_catalogo = 'TENANT' AND NEW.tenant_id IS NULL THEN
    RAISE EXCEPTION 'Un catálogo del tenant solo admite ítems del tenant' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER catalogo_item_coherencia BEFORE INSERT OR UPDATE ON cat.catalogo_item
  FOR EACH ROW EXECUTE FUNCTION cat.validar_item();

CREATE FUNCTION cat.validar_ajuste() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM cat.catalogo_item i
      JOIN cat.catalogo c ON c.id = i.catalogo_id
     WHERE i.id = NEW.item_id AND i.tenant_id IS NULL AND c.alcance = 'MIXTO'
  ) THEN
    RAISE EXCEPTION 'Solo se ajustan ítems globales de un catálogo mixto' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER catalogo_item_tenant_coherencia BEFORE INSERT OR UPDATE ON cat.catalogo_item_tenant
  FOR EACH ROW EXECUTE FUNCTION cat.validar_ajuste();

-- ---------------------------------------------------------------------
-- 4. Versiones. SECURITY DEFINER (cat_editor): la app no escribe cat.catalogo ni cat.version_tenant.
-- ---------------------------------------------------------------------
CREATE FUNCTION cat.subir_version_global() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  fila record;
BEGIN
  IF TG_OP = 'DELETE' THEN fila := OLD; ELSE fila := NEW; END IF;
  IF fila.tenant_id IS NOT NULL THEN
    RETURN NULL;
  END IF;
  UPDATE cat.catalogo SET version = version + 1 WHERE id = fila.catalogo_id;
  RETURN NULL;
END;
$$;

-- Sirve a catalogo_item (fila con catalogo_id) y a catalogo_item_tenant (fila con item_id).
CREATE FUNCTION cat.subir_version_tenant() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  fila     record;
  catalogo uuid;
BEGIN
  IF TG_OP = 'DELETE' THEN fila := OLD; ELSE fila := NEW; END IF;
  IF fila.tenant_id IS NULL THEN
    RETURN NULL;
  END IF;
  IF TG_TABLE_NAME = 'catalogo_item' THEN
    catalogo := fila.catalogo_id;
  ELSE
    SELECT i.catalogo_id INTO catalogo FROM cat.catalogo_item i WHERE i.id = fila.item_id;
  END IF;
  INSERT INTO cat.version_tenant AS v (catalogo_id, tenant_id) VALUES (catalogo, fila.tenant_id)
  ON CONFLICT (catalogo_id, tenant_id) DO UPDATE SET version = v.version + 1, cambiado_en = now();
  RETURN NULL;
END;
$$;

CREATE TRIGGER catalogo_item_version_global AFTER INSERT OR UPDATE OR DELETE ON cat.catalogo_item
  FOR EACH ROW EXECUTE FUNCTION cat.subir_version_global();
CREATE TRIGGER catalogo_item_version_tenant AFTER INSERT OR UPDATE OR DELETE ON cat.catalogo_item
  FOR EACH ROW EXECUTE FUNCTION cat.subir_version_tenant();
CREATE TRIGGER catalogo_item_tenant_version AFTER INSERT OR UPDATE OR DELETE ON cat.catalogo_item_tenant
  FOR EACH ROW EXECUTE FUNCTION cat.subir_version_tenant();

-- ---------------------------------------------------------------------
-- 5. Aislamiento por tenant (segunda barrera). NULLIF: app.tenant_id queda en '' tras el primer SET LOCAL.
--    Las políticas sin TO valen para la app; las TO cat_editor, para las funciones SECURITY DEFINER.
-- ---------------------------------------------------------------------
ALTER TABLE cat.catalogo             ENABLE ROW LEVEL SECURITY;
ALTER TABLE cat.catalogo             FORCE ROW LEVEL SECURITY;
ALTER TABLE cat.catalogo_item        ENABLE ROW LEVEL SECURITY;
ALTER TABLE cat.catalogo_item        FORCE ROW LEVEL SECURITY;
ALTER TABLE cat.catalogo_item_tenant ENABLE ROW LEVEL SECURITY;
ALTER TABLE cat.catalogo_item_tenant FORCE ROW LEVEL SECURITY;
ALTER TABLE cat.version_tenant       ENABLE ROW LEVEL SECURITY;
ALTER TABLE cat.version_tenant       FORCE ROW LEVEL SECURITY;

CREATE POLICY catalogo_select ON cat.catalogo FOR SELECT USING (true);
CREATE POLICY catalogo_editor ON cat.catalogo FOR ALL TO cat_editor USING (true) WITH CHECK (true);

CREATE POLICY catalogo_item_select ON cat.catalogo_item FOR SELECT
  USING (tenant_id IS NULL OR tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
CREATE POLICY catalogo_item_insert ON cat.catalogo_item FOR INSERT
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
CREATE POLICY catalogo_item_update ON cat.catalogo_item FOR UPDATE
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
CREATE POLICY catalogo_item_delete ON cat.catalogo_item FOR DELETE
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
-- Incluye leer los propios de todos los tenants para la colisión de códigos de un global nuevo.
CREATE POLICY catalogo_item_editor ON cat.catalogo_item FOR ALL TO cat_editor USING (true) WITH CHECK (true);

CREATE POLICY catalogo_item_tenant_app ON cat.catalogo_item_tenant FOR ALL
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
CREATE POLICY catalogo_item_tenant_editor_select ON cat.catalogo_item_tenant FOR SELECT TO cat_editor USING (true);
CREATE POLICY catalogo_item_tenant_editor_delete ON cat.catalogo_item_tenant FOR DELETE TO cat_editor USING (true);

CREATE POLICY version_tenant_select ON cat.version_tenant FOR SELECT
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
CREATE POLICY version_tenant_editor ON cat.version_tenant FOR ALL TO cat_editor USING (true) WITH CHECK (true);

-- ---------------------------------------------------------------------
-- 6. Lectura. SECURITY INVOKER: corre con la RLS del llamador. Si p_tenant no es app.tenant_id,
--    no devuelve filas (primera barrera dentro de la base).
-- ---------------------------------------------------------------------
-- version_tenant es 0 si el tenant no tiene propios ni ajustes en el catálogo.
CREATE FUNCTION cat.versiones(p_codigo varchar, p_tenant uuid)
RETURNS TABLE (catalogo_id uuid, version_global bigint, version_tenant bigint)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = '' AS $$
  SELECT c.id, c.version,
         COALESCE((SELECT v.version FROM cat.version_tenant v WHERE v.catalogo_id = c.id AND v.tenant_id = p_tenant), 0)
    FROM cat.catalogo c
   WHERE c.codigo = p_codigo
     AND p_tenant = NULLIF(current_setting('app.tenant_id', true), '')::uuid;
$$;

-- SQL crudo (regla 11): combina tres tablas con prioridad de ajustes. Estado en este orden:
-- INACTIVO, FUERA_DE_VIGENCIA (vigencia inclusiva en ambos extremos), OCULTO, VISIBLE.
CREATE FUNCTION cat.items(p_codigo varchar, p_tenant uuid, p_fecha date)
RETURNS TABLE (item_id uuid, codigo varchar, codigo_externo varchar, nombre varchar,
               atributos jsonb, orden integer, propio boolean, estado varchar)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = '' AS $$
  SELECT i.id, i.codigo, i.codigo_externo, COALESCE(a.alias, i.nombre)::varchar, i.atributos,
         COALESCE(a.orden, i.orden), i.tenant_id IS NOT NULL,
         (CASE
            WHEN NOT i.activo THEN 'INACTIVO'
            WHEN p_fecha < i.vigente_desde OR p_fecha > i.vigente_hasta THEN 'FUERA_DE_VIGENCIA'
            WHEN a.visible = false THEN 'OCULTO'
            ELSE 'VISIBLE'
          END)::varchar
    FROM cat.catalogo c
    JOIN cat.catalogo_item i ON i.catalogo_id = c.id AND (i.tenant_id IS NULL OR i.tenant_id = p_tenant)
    LEFT JOIN cat.catalogo_item_tenant a ON a.item_id = i.id AND a.tenant_id = p_tenant
   WHERE c.codigo = p_codigo
     AND p_tenant = NULLIF(current_setting('app.tenant_id', true), '')::uuid
   ORDER BY 6, 4, 2;
$$;

-- ---------------------------------------------------------------------
-- 7. Escritura de globales. SECURITY DEFINER (cat_editor): la app comprueba el operador antes de llamarlas.
-- ---------------------------------------------------------------------
-- Devuelve la versión. Un código repetido sale por la restricción UNIQUE (23505).
CREATE FUNCTION cat.crear_catalogo(p_id uuid, p_codigo varchar, p_nombre varchar, p_alcance varchar,
                                   p_fuente varchar, p_editable boolean, p_por uuid)
RETURNS bigint
LANGUAGE sql SECURITY DEFINER SET search_path = '' AS $$
  INSERT INTO cat.catalogo (id, codigo, nombre, alcance, fuente, editable_por_tenant, creado_por, modificado_por)
  VALUES (p_id, p_codigo, p_nombre, p_alcance, p_fuente, p_editable, p_por, p_por)
  RETURNING version;
$$;

-- NULL si el catálogo no existe o la versión no coincide. El alcance no se cambia.
CREATE FUNCTION cat.actualizar_catalogo(p_id uuid, p_version bigint, p_nombre varchar, p_fuente varchar,
                                        p_editable boolean, p_por uuid)
RETURNS bigint
LANGUAGE sql SECURITY DEFINER SET search_path = '' AS $$
  UPDATE cat.catalogo
     SET nombre = p_nombre, fuente = p_fuente, editable_por_tenant = p_editable,
         version = version + 1, modificado_por = p_por, modificado_en = now()
   WHERE id = p_id AND version = p_version
  RETURNING version;
$$;

-- p_version NULL crea; si no, actualiza todo salvo el código. Devuelve la versión del ítem, o NULL si
-- la versión no coincide. Un global nuevo no repite un código propio de ningún tenant (23505, sin decir cuál).
CREATE FUNCTION cat.guardar_item_global(p_id uuid, p_version bigint, p_catalogo uuid, p_codigo varchar,
                                        p_codigo_externo varchar, p_nombre varchar, p_abreviatura varchar,
                                        p_orden int, p_atributos jsonb, p_desde date, p_hasta date,
                                        p_activo boolean, p_por uuid)
RETURNS bigint
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  version_nueva bigint;
BEGIN
  IF p_version IS NOT NULL THEN
    UPDATE cat.catalogo_item
       SET codigo_externo = p_codigo_externo, nombre = p_nombre, abreviatura = p_abreviatura,
           orden = p_orden, atributos = p_atributos, vigente_desde = p_desde, vigente_hasta = p_hasta,
           activo = p_activo, version = version + 1, modificado_por = p_por, modificado_en = now()
     WHERE id = p_id AND catalogo_id = p_catalogo AND tenant_id IS NULL AND version = p_version
    RETURNING version INTO version_nueva;
    RETURN version_nueva;
  END IF;

  IF EXISTS (SELECT 1 FROM cat.catalogo_item i
              WHERE i.catalogo_id = p_catalogo AND i.codigo = p_codigo AND i.tenant_id IS NOT NULL) THEN
    RAISE EXCEPTION 'El código ya existe en el catálogo' USING ERRCODE = 'unique_violation';
  END IF;

  INSERT INTO cat.catalogo_item (id, catalogo_id, tenant_id, codigo, codigo_externo, nombre, abreviatura, orden,
                                 atributos, vigente_desde, vigente_hasta, activo, creado_por, modificado_por)
  VALUES (p_id, p_catalogo, NULL, p_codigo, p_codigo_externo, p_nombre, p_abreviatura, p_orden,
          p_atributos, p_desde, p_hasta, p_activo, p_por, p_por)
  RETURNING version INTO version_nueva;
  RETURN version_nueva;
END;
$$;

-- false si el ítem global no existe o la versión no coincide. Borra antes sus ajustes (sin ON DELETE CASCADE).
CREATE FUNCTION cat.eliminar_item_global(p_id uuid, p_version bigint)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  PERFORM 1 FROM cat.catalogo_item
   WHERE id = p_id AND tenant_id IS NULL AND version = p_version
     FOR UPDATE;
  IF NOT FOUND THEN
    RETURN false;
  END IF;
  DELETE FROM cat.catalogo_item_tenant WHERE item_id = p_id;
  DELETE FROM cat.catalogo_item WHERE id = p_id;
  RETURN true;
END;
$$;

ALTER FUNCTION cat.subir_version_global() OWNER TO cat_editor;
ALTER FUNCTION cat.subir_version_tenant() OWNER TO cat_editor;
ALTER FUNCTION cat.crear_catalogo(uuid, varchar, varchar, varchar, varchar, boolean, uuid) OWNER TO cat_editor;
ALTER FUNCTION cat.actualizar_catalogo(uuid, bigint, varchar, varchar, boolean, uuid) OWNER TO cat_editor;
ALTER FUNCTION cat.guardar_item_global(uuid, bigint, uuid, varchar, varchar, varchar, varchar, int, jsonb, date, date, boolean, uuid)
  OWNER TO cat_editor;
ALTER FUNCTION cat.eliminar_item_global(uuid, bigint) OWNER TO cat_editor;

REVOKE EXECUTE ON FUNCTION cat.subir_version_global() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION cat.subir_version_tenant() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION cat.crear_catalogo(uuid, varchar, varchar, varchar, varchar, boolean, uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION cat.actualizar_catalogo(uuid, bigint, varchar, varchar, boolean, uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION cat.guardar_item_global(uuid, bigint, uuid, varchar, varchar, varchar, varchar, int, jsonb, date, date, boolean, uuid)
  FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION cat.eliminar_item_global(uuid, bigint) FROM PUBLIC;

-- Solo el rol que corre la migración (en dev, postgres: el mismo de la api).
DO $$
BEGIN
  EXECUTE format('GRANT EXECUTE ON FUNCTION cat.crear_catalogo(uuid, varchar, varchar, varchar, varchar, boolean, uuid) TO %I', current_user);
  EXECUTE format('GRANT EXECUTE ON FUNCTION cat.actualizar_catalogo(uuid, bigint, varchar, varchar, boolean, uuid) TO %I', current_user);
  EXECUTE format('GRANT EXECUTE ON FUNCTION cat.guardar_item_global(uuid, bigint, uuid, varchar, varchar, varchar, varchar, int, jsonb, date, date, boolean, uuid) TO %I', current_user);
  EXECUTE format('GRANT EXECUTE ON FUNCTION cat.eliminar_item_global(uuid, bigint) TO %I', current_user);
END
$$;

-- ---------------------------------------------------------------------
-- 8. Semilla. Los triggers suben la versión al insertar ítems; al final cada catálogo queda en 1.
-- ---------------------------------------------------------------------
INSERT INTO cat.catalogo (id, codigo, nombre, alcance, fuente, editable_por_tenant) VALUES
  ('ca700000-0000-0000-0000-000000000001', 'MEDIO_PAGO', 'Medios de pago', 'MIXTO', NULL, true),
  ('ca700000-0000-0000-0000-000000000002', 'TIPO_DOC_IDENTIDAD', 'Tipos de documento de identidad', 'GLOBAL', 'SUNAT catálogo 06', false),
  ('ca700000-0000-0000-0000-000000000003', 'TIPO_COMPROBANTE', 'Tipos de comprobante de pago', 'GLOBAL', 'SUNAT catálogo 01', false),
  ('ca700000-0000-0000-0000-000000000004', 'ESPECIALIDAD', 'Especialidades médicas', 'MIXTO', NULL, true);

INSERT INTO cat.catalogo_item (id, catalogo_id, codigo, codigo_externo, nombre, orden, atributos, vigente_desde) VALUES
  ('ca700000-0000-0000-0001-000000000001', 'ca700000-0000-0000-0000-000000000001', 'EFECTIVO', NULL, 'Efectivo', 1, '{}', '2026-01-01'),
  ('ca700000-0000-0000-0001-000000000002', 'ca700000-0000-0000-0000-000000000001', 'YAPE', NULL, 'Yape', 2, '{}', '2026-01-01'),
  ('ca700000-0000-0000-0001-000000000003', 'ca700000-0000-0000-0000-000000000001', 'PLIN', NULL, 'Plin', 3, '{}', '2026-01-01'),
  ('ca700000-0000-0000-0001-000000000004', 'ca700000-0000-0000-0000-000000000001', 'TARJETA', NULL, 'Tarjeta', 4, '{}', '2026-01-01'),
  ('ca700000-0000-0000-0002-000000000001', 'ca700000-0000-0000-0000-000000000002', 'DNI', '1', 'Documento nacional de identidad', 1,
   '{"longitud": 8, "regex": "^[0-9]{8}$"}', '2026-01-01'),
  ('ca700000-0000-0000-0002-000000000002', 'ca700000-0000-0000-0000-000000000002', 'RUC', '6', 'Registro único de contribuyentes', 2,
   '{"longitud": 11}', '2026-01-01'),
  ('ca700000-0000-0000-0002-000000000003', 'ca700000-0000-0000-0000-000000000002', 'CE', '4', 'Carné de extranjería', 3, '{}', '2026-01-01'),
  ('ca700000-0000-0000-0002-000000000004', 'ca700000-0000-0000-0000-000000000002', 'PASAPORTE', '7', 'Pasaporte', 4, '{}', '2026-01-01'),
  ('ca700000-0000-0000-0003-000000000001', 'ca700000-0000-0000-0000-000000000003', '01', '01', 'Factura', 1, '{}', '2026-01-01'),
  ('ca700000-0000-0000-0003-000000000002', 'ca700000-0000-0000-0000-000000000003', '03', '03', 'Boleta de venta', 2, '{}', '2026-01-01'),
  ('ca700000-0000-0000-0003-000000000003', 'ca700000-0000-0000-0000-000000000003', '07', '07', 'Nota de crédito', 3, '{}', '2026-01-01'),
  ('ca700000-0000-0000-0003-000000000004', 'ca700000-0000-0000-0000-000000000003', '08', '08', 'Nota de débito', 4, '{}', '2026-01-01'),
  ('ca700000-0000-0000-0004-000000000001', 'ca700000-0000-0000-0000-000000000004', 'MED_GEN', NULL, 'Medicina general', 1, '{}', '2026-01-01');

UPDATE cat.catalogo SET version = 1;

-- ---------------------------------------------------------------------
-- 9. Los esquemas de plataforma no se exponen por la Data API (regla 8). En PostgreSQL plano
--    (CI) los roles de Supabase no existen.
-- ---------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon')
     AND EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON SCHEMA cat FROM anon, authenticated;
    REVOKE ALL ON ALL TABLES IN SCHEMA cat FROM anon, authenticated;
    REVOKE ALL ON ALL SEQUENCES IN SCHEMA cat FROM anon, authenticated;
    REVOKE ALL ON ALL FUNCTIONS IN SCHEMA cat FROM anon, authenticated;
  END IF;
END
$$;
