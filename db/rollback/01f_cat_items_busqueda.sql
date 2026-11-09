-- Deja cat.items_administracion como la dejó 01f_cat_feriado: el texto busca solo en código o nombre.
CREATE OR REPLACE FUNCTION cat.items_administracion(p_codigo varchar, p_tenant uuid, p_fecha date, p_texto varchar,
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
