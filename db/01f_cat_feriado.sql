-- 01f · Feriados de TR-CAT (spec 19c). PostgreSQL 16. Reversible: rollback/01f_cat_feriado.sql.
-- Feriados GLOBAL (solo el operador, con funciones SECURITY DEFINER de cat_editor), del tenant y de
-- sucursal; lectura de fechas para el cálculo de días hábiles y lista de administración de ítems.

-- ---------------------------------------------------------------------
-- 1. Tabla. Un recurrente vale desde el año de su fecha. Sin índice único: el duplicado cruza
--    niveles y recurrencia, y lo valida cat.feriado_choca.
-- ---------------------------------------------------------------------
CREATE TABLE cat.feriado (
  id                uuid         PRIMARY KEY,
  alcance           varchar(8)   NOT NULL CHECK (alcance IN ('GLOBAL', 'TENANT', 'SUCURSAL')),
  tenant_id         uuid         NULL REFERENCES org.tenant (id),
  sucursal_id       uuid         NULL,
  fecha             date         NOT NULL,
  nombre            varchar(100) NOT NULL CHECK (char_length(nombre) BETWEEN 3 AND 100),
  recurrente_anual  boolean      NOT NULL DEFAULT false,
  version           bigint       NOT NULL DEFAULT 0,
  -- NULL en la semilla.
  creado_por        uuid         NULL REFERENCES seg.usuario (id),
  creado_en         timestamptz  NOT NULL DEFAULT now(),
  modificado_por    uuid         NULL REFERENCES seg.usuario (id),
  modificado_en     timestamptz  NOT NULL DEFAULT now(),
  -- La sucursal es del mismo tenant. Con sucursal_id NULL no se evalúa (MATCH SIMPLE).
  FOREIGN KEY (tenant_id, sucursal_id) REFERENCES org.sucursal (tenant_id, id),
  CONSTRAINT ck_feriado_alcance CHECK (
       (alcance = 'GLOBAL'   AND tenant_id IS NULL     AND sucursal_id IS NULL)
    OR (alcance = 'TENANT'   AND tenant_id IS NOT NULL AND sucursal_id IS NULL)
    OR (alcance = 'SUCURSAL' AND tenant_id IS NOT NULL AND sucursal_id IS NOT NULL))
);

CREATE INDEX ix_feriado_fecha ON cat.feriado (fecha);
-- extract y no to_char: to_char no es IMMUTABLE y no se puede indexar.
CREATE INDEX ix_feriado_mes_dia ON cat.feriado ((extract(month FROM fecha)), (extract(day FROM fecha)))
  WHERE recurrente_anual;
CREATE INDEX ix_feriado_tenant ON cat.feriado (tenant_id, sucursal_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON cat.feriado TO cat_editor;

-- ---------------------------------------------------------------------
-- 2. Aislamiento por tenant (segunda barrera). La app lee los globales y escribe solo los suyos.
-- ---------------------------------------------------------------------
ALTER TABLE cat.feriado ENABLE ROW LEVEL SECURITY;
ALTER TABLE cat.feriado FORCE ROW LEVEL SECURITY;

CREATE POLICY feriado_select ON cat.feriado FOR SELECT
  USING (tenant_id IS NULL OR tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
CREATE POLICY feriado_insert ON cat.feriado FOR INSERT
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
CREATE POLICY feriado_update ON cat.feriado FOR UPDATE
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
CREATE POLICY feriado_delete ON cat.feriado FOR DELETE
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
CREATE POLICY feriado_editor ON cat.feriado FOR ALL TO cat_editor USING (true) WITH CHECK (true);

-- ---------------------------------------------------------------------
-- 3. Lectura. SECURITY INVOKER: corre con la RLS del llamador.
-- ---------------------------------------------------------------------
-- SQL crudo (regla 11): proyecta los recurrentes a cada año del rango en una sola consulta.
-- Fechas sin repetir de los globales, los del tenant del contexto y los de p_sucursal (NULL: ninguna sucursal).
-- Un 29 de febrero recurrente solo cae en años bisiestos: sumar años lo lleva al 28 y se descarta por el día.
-- No se usa make_date: PostgreSQL no garantiza el orden de las condiciones y fallaría con el 29 en años no bisiestos.
CREATE FUNCTION cat.fechas_feriado(p_desde date, p_hasta date, p_sucursal uuid)
RETURNS SETOF date
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = '' AS $$
  SELECT DISTINCT proyeccion.fecha_efectiva
    FROM cat.feriado f
   CROSS JOIN LATERAL (
         SELECT f.fecha
          WHERE NOT f.recurrente_anual
         UNION ALL
         SELECT anual.fecha_del_anio
           FROM generate_series(greatest(extract(year FROM f.fecha)::int, extract(year FROM p_desde)::int),
                                extract(year FROM p_hasta)::int) AS anio
          CROSS JOIN LATERAL (
                SELECT (f.fecha + make_interval(years => anio - extract(year FROM f.fecha)::int))::date
              ) AS anual (fecha_del_anio)
          WHERE f.recurrente_anual
            AND extract(day FROM anual.fecha_del_anio) = extract(day FROM f.fecha)
       ) AS proyeccion (fecha_efectiva)
   WHERE (f.tenant_id IS NULL
          OR (f.tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
              AND (f.sucursal_id IS NULL OR f.sucursal_id = p_sucursal)))
     AND (f.recurrente_anual OR f.fecha BETWEEN p_desde AND p_hasta)
     AND proyeccion.fecha_efectiva BETWEEN p_desde AND p_hasta
   ORDER BY 1;
$$;

-- SQL crudo (regla 11): regla de duplicado de TR-CA-077 entre niveles y con recurrencia.
-- Compara con el mismo nivel y con los que lo cubren: GLOBAL con GLOBAL; TENANT con GLOBAL y TENANT del
-- tenant; SUCURSAL con los anteriores y SUCURSAL de p_sucursal. Misma fecha efectiva: dos no recurrentes
-- con la misma fecha; o mismo día y mes si alguno es recurrente, con el no recurrente en un año
-- igual o posterior al del recurrente. p_excluir: el id que se está editando.
CREATE FUNCTION cat.feriado_choca(p_alcance varchar, p_sucursal uuid, p_fecha date, p_recurrente boolean,
                                  p_excluir uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = '' AS $$
  SELECT EXISTS (
    SELECT 1
      FROM cat.feriado f
     WHERE f.id IS DISTINCT FROM p_excluir
       AND (f.alcance = 'GLOBAL'
            OR (p_alcance IN ('TENANT', 'SUCURSAL') AND f.alcance = 'TENANT'
                AND f.tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
            OR (p_alcance = 'SUCURSAL' AND f.alcance = 'SUCURSAL' AND f.sucursal_id = p_sucursal
                AND f.tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid))
       AND (CASE
              WHEN NOT p_recurrente AND NOT f.recurrente_anual THEN f.fecha = p_fecha
              ELSE extract(month FROM f.fecha) = extract(month FROM p_fecha)
                   AND extract(day FROM f.fecha) = extract(day FROM p_fecha)
                   AND (CASE
                          WHEN p_recurrente AND f.recurrente_anual THEN true
                          WHEN p_recurrente THEN extract(year FROM f.fecha) >= extract(year FROM p_fecha)
                          ELSE extract(year FROM p_fecha) >= extract(year FROM f.fecha)
                        END)
            END)
  );
$$;

-- SQL crudo (regla 11): reutiliza los estados de cat.items y suma los datos del ítem y del ajuste del
-- tenant. p_texto busca en código o nombre (los comodines del texto son literales). total: filas que
-- cumplen los filtros, antes de paginar. Sin filas si p_tenant no es app.tenant_id (lo garantiza cat.items).
CREATE FUNCTION cat.items_administracion(p_codigo varchar, p_tenant uuid, p_fecha date, p_texto varchar,
                                         p_estado varchar, p_origen varchar, p_limite int, p_desplazamiento int)
RETURNS TABLE (item_id uuid, codigo varchar, codigo_externo varchar, nombre varchar, abreviatura varchar,
               orden integer, atributos jsonb, vigente_desde date, vigente_hasta date, activo boolean,
               propio boolean, estado varchar, ajuste_visible boolean, ajuste_orden integer,
               ajuste_alias varchar, version bigint, ajuste_version bigint, total bigint)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = '' AS $$
  SELECT i.id, i.codigo, i.codigo_externo, i.nombre, i.abreviatura, i.orden, i.atributos, i.vigente_desde,
         i.vigente_hasta, i.activo, e.propio, e.estado, a.visible, a.orden, a.alias, i.version, a.version,
         count(*) OVER ()
    FROM cat.items(p_codigo, p_tenant, p_fecha) e
    JOIN cat.catalogo_item i ON i.id = e.item_id
    LEFT JOIN cat.catalogo_item_tenant a ON a.item_id = i.id AND a.tenant_id = p_tenant
   CROSS JOIN (SELECT '%' || replace(replace(replace(p_texto, '\', '\\'), '%', '\%'), '_', '\_') || '%') AS busqueda (patron)
   WHERE (p_estado IS NULL OR e.estado = p_estado)
     AND (p_origen IS NULL OR e.propio = (p_origen = 'PROPIO'))
     AND (p_texto IS NULL OR i.codigo ILIKE busqueda.patron OR i.nombre ILIKE busqueda.patron)
   ORDER BY e.orden, e.nombre, e.codigo
   LIMIT p_limite OFFSET p_desplazamiento;
$$;

-- ---------------------------------------------------------------------
-- 4. Escritura de globales. SECURITY DEFINER (cat_editor): la app comprueba el operador antes de llamarlas.
-- ---------------------------------------------------------------------
-- p_version NULL crea; si no, actualiza. Devuelve la versión, o NULL si el global no existe o la versión no coincide.
CREATE FUNCTION cat.guardar_feriado_global(p_id uuid, p_version bigint, p_fecha date, p_nombre varchar,
                                           p_recurrente boolean, p_por uuid)
RETURNS bigint
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  version_nueva bigint;
BEGIN
  IF p_version IS NULL THEN
    INSERT INTO cat.feriado (id, alcance, fecha, nombre, recurrente_anual, creado_por, modificado_por)
    VALUES (p_id, 'GLOBAL', p_fecha, p_nombre, p_recurrente, p_por, p_por)
    RETURNING version INTO version_nueva;
    RETURN version_nueva;
  END IF;

  UPDATE cat.feriado
     SET fecha = p_fecha, nombre = p_nombre, recurrente_anual = p_recurrente,
         version = version + 1, modificado_por = p_por, modificado_en = now()
   WHERE id = p_id AND alcance = 'GLOBAL' AND version = p_version
  RETURNING version INTO version_nueva;
  RETURN version_nueva;
END;
$$;

-- false si el global no existe o la versión no coincide.
CREATE FUNCTION cat.eliminar_feriado_global(p_id uuid, p_version bigint)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  DELETE FROM cat.feriado WHERE id = p_id AND alcance = 'GLOBAL' AND version = p_version;
  RETURN FOUND;
END;
$$;

ALTER FUNCTION cat.guardar_feriado_global(uuid, bigint, date, varchar, boolean, uuid) OWNER TO cat_editor;
ALTER FUNCTION cat.eliminar_feriado_global(uuid, bigint) OWNER TO cat_editor;

REVOKE EXECUTE ON FUNCTION cat.guardar_feriado_global(uuid, bigint, date, varchar, boolean, uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION cat.eliminar_feriado_global(uuid, bigint) FROM PUBLIC;

-- Solo el rol que corre la migración (en dev, postgres: el mismo de la api).
DO $$
BEGIN
  EXECUTE format('GRANT EXECUTE ON FUNCTION cat.guardar_feriado_global(uuid, bigint, date, varchar, boolean, uuid) TO %I', current_user);
  EXECUTE format('GRANT EXECUTE ON FUNCTION cat.eliminar_feriado_global(uuid, bigint) TO %I', current_user);
END
$$;

-- ---------------------------------------------------------------------
-- 5. Semilla: feriados nacionales de Perú. Los fijos son recurrentes desde 2026; Semana Santa, por año.
-- ---------------------------------------------------------------------
INSERT INTO cat.feriado (id, alcance, fecha, nombre, recurrente_anual) VALUES
  ('ca700000-0000-0000-00fe-000000000001', 'GLOBAL', '2026-01-01', 'Año Nuevo', true),
  ('ca700000-0000-0000-00fe-000000000002', 'GLOBAL', '2026-04-02', 'Jueves Santo', false),
  ('ca700000-0000-0000-00fe-000000000003', 'GLOBAL', '2026-04-03', 'Viernes Santo', false),
  ('ca700000-0000-0000-00fe-000000000004', 'GLOBAL', '2026-05-01', 'Día del Trabajo', true),
  ('ca700000-0000-0000-00fe-000000000005', 'GLOBAL', '2026-06-07', 'Batalla de Arica y Día de la Bandera', true),
  ('ca700000-0000-0000-00fe-000000000006', 'GLOBAL', '2026-06-29', 'San Pedro y San Pablo', true),
  ('ca700000-0000-0000-00fe-000000000007', 'GLOBAL', '2026-07-23', 'Día de la Fuerza Aérea', true),
  ('ca700000-0000-0000-00fe-000000000008', 'GLOBAL', '2026-07-28', 'Fiestas Patrias', true),
  ('ca700000-0000-0000-00fe-000000000009', 'GLOBAL', '2026-07-29', 'Fiestas Patrias', true),
  ('ca700000-0000-0000-00fe-000000000010', 'GLOBAL', '2026-08-06', 'Batalla de Junín', true),
  ('ca700000-0000-0000-00fe-000000000011', 'GLOBAL', '2026-08-30', 'Santa Rosa de Lima', true),
  ('ca700000-0000-0000-00fe-000000000012', 'GLOBAL', '2026-10-08', 'Combate de Angamos', true),
  ('ca700000-0000-0000-00fe-000000000013', 'GLOBAL', '2026-11-01', 'Todos los Santos', true),
  ('ca700000-0000-0000-00fe-000000000014', 'GLOBAL', '2026-12-08', 'Inmaculada Concepción', true),
  ('ca700000-0000-0000-00fe-000000000015', 'GLOBAL', '2026-12-09', 'Batalla de Ayacucho', true),
  ('ca700000-0000-0000-00fe-000000000016', 'GLOBAL', '2026-12-25', 'Navidad', true),
  ('ca700000-0000-0000-00fe-000000000017', 'GLOBAL', '2027-03-25', 'Jueves Santo', false),
  ('ca700000-0000-0000-00fe-000000000018', 'GLOBAL', '2027-03-26', 'Viernes Santo', false);

-- ---------------------------------------------------------------------
-- 6. Los esquemas de plataforma no se exponen por la Data API (regla 8). En PostgreSQL plano
--    (CI) los roles de Supabase no existen.
-- ---------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon')
     AND EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON cat.feriado FROM anon, authenticated;
    REVOKE ALL ON FUNCTION cat.fechas_feriado(date, date, uuid) FROM anon, authenticated;
    REVOKE ALL ON FUNCTION cat.feriado_choca(varchar, uuid, date, boolean, uuid) FROM anon, authenticated;
    REVOKE ALL ON FUNCTION cat.items_administracion(varchar, uuid, date, varchar, varchar, varchar, int, int)
      FROM anon, authenticated;
    REVOKE ALL ON FUNCTION cat.guardar_feriado_global(uuid, bigint, date, varchar, boolean, uuid) FROM anon, authenticated;
    REVOKE ALL ON FUNCTION cat.eliminar_feriado_global(uuid, bigint) FROM anon, authenticated;
  END IF;
END
$$;
