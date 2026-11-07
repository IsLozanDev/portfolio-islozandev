-- 01f · Importador de tablas oficiales de TR-CAT (spec 19b). PostgreSQL 16. Reversible: rollback/01f_cat_importacion.sql.
-- Traza de cada importación y funciones SECURITY DEFINER (cat_editor) que la aplican en una sola transacción.

-- ---------------------------------------------------------------------
-- 1. Traza de importaciones. EN_PROCESO no es un estado de la base: vive en Redis mientras la
--    transacción del worker no termina.
-- ---------------------------------------------------------------------
CREATE TABLE cat.importacion (
  id                uuid         PRIMARY KEY,
  -- Tenant operador.
  tenant_id         uuid         NOT NULL REFERENCES org.tenant (id),
  catalogo_id       uuid         NOT NULL REFERENCES cat.catalogo (id),
  version_oficial   varchar(40)  NOT NULL CHECK (char_length(version_oficial) BETWEEN 1 AND 40),
  fecha_vigencia    date         NOT NULL,
  archivo_nombre    varchar(200) NOT NULL,
  archivo_sha256    char(64)     NOT NULL,
  -- cat.catalogo.version al previsualizar.
  version_catalogo  bigint       NOT NULL,
  estado            varchar(14)  NOT NULL CHECK (estado IN
                      ('PREVISUALIZADA', 'RECHAZADA', 'EN_COLA', 'APLICADA', 'FALLIDA', 'OBSOLETA', 'VENCIDA')),
  altas             integer      NOT NULL,
  cambios           integer      NOT NULL,
  bajas             integer      NOT NULL,
  sin_cambios       integer      NOT NULL,
  -- { altas: [...], cambios: [...], bajas: [item_id...] }. NULL al terminar.
  operaciones       jsonb        NULL,
  -- Total real, aunque supere el tope de errores guardados.
  total_errores     integer      NOT NULL DEFAULT 0,
  -- RECHAZADA: [{ fila, columna, valor, mensaje }], hasta 10 000. NULL al vencer.
  errores           jsonb        NULL,
  motivo_fallo      varchar(300) NULL,
  lanzado_por       uuid         NOT NULL REFERENCES seg.usuario (id),
  creado_en         timestamptz  NOT NULL DEFAULT now(),
  -- Al encolar; NULL si vuelve a PREVISUALIZADA. Mide el trabajo perdido en la cola.
  encolado_en       timestamptz  NULL,
  aplicado_por      uuid         NULL REFERENCES seg.usuario (id),
  terminado_en      timestamptz  NULL,
  version           bigint       NOT NULL DEFAULT 0
);

-- Una sola importación encolada por catálogo.
CREATE UNIQUE INDEX ux_importacion_activa ON cat.importacion (catalogo_id) WHERE estado = 'EN_COLA';
CREATE INDEX ix_importacion_catalogo ON cat.importacion (catalogo_id, creado_en DESC);

GRANT SELECT, UPDATE ON cat.importacion TO cat_editor;

ALTER TABLE cat.importacion ENABLE ROW LEVEL SECURITY;
ALTER TABLE cat.importacion FORCE ROW LEVEL SECURITY;

-- Sin política de DELETE para la app: la traza no se borra.
CREATE POLICY importacion_select ON cat.importacion FOR SELECT
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
CREATE POLICY importacion_insert ON cat.importacion FOR INSERT
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
CREATE POLICY importacion_update ON cat.importacion FOR UPDATE
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
CREATE POLICY importacion_editor_select ON cat.importacion FOR SELECT TO cat_editor USING (true);
CREATE POLICY importacion_editor_update ON cat.importacion FOR UPDATE TO cat_editor USING (true) WITH CHECK (true);

-- ---------------------------------------------------------------------
-- 2. La versión global sube una sola vez por importación: dentro de la transacción que la aplica
--    (cat.importando con valor) el trigger por fila no hace nada y la sube cat.finalizar_importacion.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION cat.subir_version_global() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  fila record;
BEGIN
  IF COALESCE(current_setting('cat.importando', true), '') <> '' THEN
    RETURN NULL;
  END IF;
  IF TG_OP = 'DELETE' THEN fila := OLD; ELSE fila := NEW; END IF;
  IF fila.tenant_id IS NOT NULL THEN
    RETURN NULL;
  END IF;
  UPDATE cat.catalogo SET version = version + 1 WHERE id = fila.catalogo_id;
  RETURN NULL;
END;
$$;

-- ---------------------------------------------------------------------
-- 3. Aplicación. SQL crudo (regla 11): escritura por lotes desde el jsonb de operaciones con el
--    catálogo bloqueado; TypeORM no lo expresa sin traer miles de entidades a memoria.
--    Solo actúan sobre importaciones del tenant de app.tenant_id.
-- ---------------------------------------------------------------------
-- Falla si la transacción no está aplicando esta importación. Devuelve la importación.
CREATE FUNCTION cat.importacion_en_curso(p_importacion uuid) RETURNS cat.importacion
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  importacion cat.importacion;
BEGIN
  IF COALESCE(current_setting('cat.importando', true), '') <> p_importacion::text THEN
    RAISE EXCEPTION 'La transacción no está aplicando la importación %', p_importacion
      USING ERRCODE = 'object_not_in_prerequisite_state';
  END IF;
  SELECT * INTO importacion FROM cat.importacion i
   WHERE i.id = p_importacion AND i.tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid;
  RETURN importacion;
END;
$$;

-- false si no existe, si el estado no es EN_COLA o si cat.catalogo.version cambió desde la previsualización.
CREATE FUNCTION cat.iniciar_importacion(p_importacion uuid) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  catalogo        uuid;
  version_actual  bigint;
  importacion     cat.importacion;
BEGIN
  SELECT i.catalogo_id INTO catalogo FROM cat.importacion i
   WHERE i.id = p_importacion AND i.tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid;
  IF NOT FOUND THEN
    RETURN false;
  END IF;

  SELECT c.version INTO version_actual FROM cat.catalogo c WHERE c.id = catalogo FOR UPDATE;
  SELECT * INTO importacion FROM cat.importacion i WHERE i.id = p_importacion FOR UPDATE;
  IF importacion.estado <> 'EN_COLA' OR importacion.version_catalogo <> version_actual THEN
    RETURN false;
  END IF;

  PERFORM set_config('cat.importando', p_importacion::text, true);
  RETURN true;
END;
$$;

-- Aplica operaciones[p_desde..p_hasta) de altas o de cambios. Devuelve las filas escritas.
CREATE FUNCTION cat.aplicar_lote_importacion(p_importacion uuid, p_tipo varchar, p_desde int, p_hasta int)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  importacion cat.importacion := cat.importacion_en_curso(p_importacion);
  por         uuid := COALESCE(importacion.aplicado_por, importacion.lanzado_por);
  escritas    integer;
BEGIN
  IF p_tipo = 'ALTA' THEN
    INSERT INTO cat.catalogo_item (id, catalogo_id, tenant_id, codigo, codigo_externo, nombre, abreviatura, orden,
                                   atributos, vigente_desde, activo, creado_por, modificado_por)
    SELECT gen_random_uuid(), importacion.catalogo_id, NULL, alta.codigo, alta.codigo_externo, alta.nombre,
           alta.abreviatura, alta.orden, COALESCE(alta.atributos, '{}'), importacion.fecha_vigencia, true, por, por
      FROM jsonb_array_elements(importacion.operaciones -> 'altas') WITH ORDINALITY AS elemento (valor, posicion)
     CROSS JOIN LATERAL jsonb_to_record(elemento.valor) AS alta (codigo varchar, codigo_externo varchar, nombre varchar,
                                                                 abreviatura varchar, orden int, atributos jsonb)
     WHERE elemento.posicion > p_desde AND elemento.posicion <= p_hasta;
  ELSIF p_tipo = 'CAMBIO' THEN
    -- Solo pisa las claves de atributos que trae el diseño; un ítem cerrado o inactivo se reabre.
    UPDATE cat.catalogo_item item
       SET codigo_externo = cambio.codigo_externo, nombre = cambio.nombre, abreviatura = cambio.abreviatura,
           orden = cambio.orden, atributos = item.atributos || COALESCE(cambio.atributos, '{}'),
           vigente_hasta = NULL, activo = true,
           version = item.version + 1, modificado_por = por, modificado_en = now()
      FROM jsonb_array_elements(importacion.operaciones -> 'cambios') WITH ORDINALITY AS elemento (valor, posicion)
     CROSS JOIN LATERAL jsonb_to_record(elemento.valor) AS cambio (item_id uuid, codigo_externo varchar, nombre varchar,
                                                                   abreviatura varchar, orden int, atributos jsonb)
     WHERE elemento.posicion > p_desde AND elemento.posicion <= p_hasta
       AND item.id = cambio.item_id AND item.catalogo_id = importacion.catalogo_id AND item.tenant_id IS NULL;
  ELSE
    RAISE EXCEPTION 'Tipo de lote desconocido: %', p_tipo USING ERRCODE = 'invalid_parameter_value';
  END IF;

  GET DIAGNOSTICS escritas = ROW_COUNT;
  RETURN escritas;
END;
$$;

-- Cierra la vigencia de todas las bajas (TR-RN-013, TR-CA-074): nunca borra.
CREATE FUNCTION cat.cerrar_bajas_importacion(p_importacion uuid) RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  importacion cat.importacion := cat.importacion_en_curso(p_importacion);
  cerradas    integer;
BEGIN
  UPDATE cat.catalogo_item item
     SET vigente_hasta = GREATEST(importacion.fecha_vigencia - 1, item.vigente_desde),
         version = item.version + 1,
         modificado_por = COALESCE(importacion.aplicado_por, importacion.lanzado_por), modificado_en = now()
    FROM jsonb_array_elements_text(importacion.operaciones -> 'bajas') AS baja (item_id)
   WHERE item.id = baja.item_id::uuid AND item.catalogo_id = importacion.catalogo_id AND item.tenant_id IS NULL;
  GET DIAGNOSTICS cerradas = ROW_COUNT;
  RETURN cerradas;
END;
$$;

-- Sube cat.catalogo.version una sola vez, deja la importación APLICADA y quita la marca. Devuelve la versión nueva.
CREATE FUNCTION cat.finalizar_importacion(p_importacion uuid, p_por uuid) RETURNS bigint
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  importacion   cat.importacion := cat.importacion_en_curso(p_importacion);
  version_nueva bigint;
BEGIN
  UPDATE cat.catalogo SET version = version + 1 WHERE id = importacion.catalogo_id
  RETURNING version INTO version_nueva;

  UPDATE cat.importacion
     SET estado = 'APLICADA', operaciones = NULL, aplicado_por = p_por, terminado_en = now(), version = version + 1
   WHERE id = p_importacion;

  PERFORM set_config('cat.importando', '', true);
  RETURN version_nueva;
END;
$$;

ALTER FUNCTION cat.importacion_en_curso(uuid) OWNER TO cat_editor;
ALTER FUNCTION cat.iniciar_importacion(uuid) OWNER TO cat_editor;
ALTER FUNCTION cat.aplicar_lote_importacion(uuid, varchar, int, int) OWNER TO cat_editor;
ALTER FUNCTION cat.cerrar_bajas_importacion(uuid) OWNER TO cat_editor;
ALTER FUNCTION cat.finalizar_importacion(uuid, uuid) OWNER TO cat_editor;

REVOKE EXECUTE ON FUNCTION cat.importacion_en_curso(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION cat.iniciar_importacion(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION cat.aplicar_lote_importacion(uuid, varchar, int, int) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION cat.cerrar_bajas_importacion(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION cat.finalizar_importacion(uuid, uuid) FROM PUBLIC;

-- Solo el rol que corre la migración (en dev, postgres: el mismo de la api y el worker).
DO $$
BEGIN
  EXECUTE format('GRANT EXECUTE ON FUNCTION cat.iniciar_importacion(uuid) TO %I', current_user);
  EXECUTE format('GRANT EXECUTE ON FUNCTION cat.aplicar_lote_importacion(uuid, varchar, int, int) TO %I', current_user);
  EXECUTE format('GRANT EXECUTE ON FUNCTION cat.cerrar_bajas_importacion(uuid) TO %I', current_user);
  EXECUTE format('GRANT EXECUTE ON FUNCTION cat.finalizar_importacion(uuid, uuid) TO %I', current_user);
END
$$;

-- ---------------------------------------------------------------------
-- 4. Semilla: definiciones GLOBAL vacías de las tablas oficiales que el 19a no traía.
--    Los ítems llegan con el propio importador.
-- ---------------------------------------------------------------------
INSERT INTO cat.catalogo (id, codigo, nombre, alcance, fuente, editable_por_tenant) VALUES
  ('ca700000-0000-0000-0000-000000000005', 'UBIGEO', 'Ubigeo de distritos', 'GLOBAL', 'INEI, ubigeo de distritos', false),
  ('ca700000-0000-0000-0000-000000000006', 'CIE10', 'Clasificación internacional de enfermedades CIE-10', 'GLOBAL', 'OMS / MINSA, CIE-10', false),
  ('ca700000-0000-0000-0000-000000000007', 'UNIDAD_MEDIDA', 'Unidades de medida', 'GLOBAL', 'SUNAT catálogo 03', false),
  ('ca700000-0000-0000-0000-000000000008', 'AFECTACION_IGV', 'Tipos de afectación del IGV', 'GLOBAL', 'SUNAT catálogo 07', false),
  ('ca700000-0000-0000-0000-000000000009', 'MONEDA', 'Monedas', 'GLOBAL', 'SUNAT catálogo 02 (ISO 4217)', false)
ON CONFLICT (codigo) DO NOTHING;

-- ---------------------------------------------------------------------
-- 5. No se expone por la Data API (regla 8). En PostgreSQL plano (CI) los roles de Supabase no existen.
-- ---------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon')
     AND EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON cat.importacion FROM anon, authenticated;
    REVOKE ALL ON FUNCTION cat.importacion_en_curso(uuid), cat.iniciar_importacion(uuid),
                           cat.aplicar_lote_importacion(uuid, varchar, int, int), cat.cerrar_bajas_importacion(uuid),
                           cat.finalizar_importacion(uuid, uuid)
      FROM anon, authenticated;
  END IF;
END
$$;
