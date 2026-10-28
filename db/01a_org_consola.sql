-- 01a_org_consola · Lectura de tenants para la consola del operador TR-ORG (spec 17a). PostgreSQL 16.
-- Reversible: rollback/01a_org_consola.sql. Ordena después de 01a_org_alta.sql y no referencia seg.
-- La api solo llama a estas funciones después de comprobar que el actor es del tenant operador.

-- ---------------------------------------------------------------------
-- 1. org_lector (spec 12) lee además empresa, sucursal e historial para el detalle.
-- ---------------------------------------------------------------------
GRANT SELECT ON org.empresa, org.sucursal, org.tenant_estado_historial TO org_lector;

CREATE POLICY empresa_consola   ON org.empresa                 FOR SELECT TO org_lector USING (true);
CREATE POLICY sucursal_consola  ON org.sucursal                FOR SELECT TO org_lector USING (true);
CREATE POLICY historial_consola ON org.tenant_estado_historial FOR SELECT TO org_lector USING (true);

-- ---------------------------------------------------------------------
-- 2. Lista paginada: solo cabecera y suscripciones (TR-RNF-010). Filtros NULL no filtran.
-- ---------------------------------------------------------------------
CREATE FUNCTION org.tenants_listar(p_q varchar, p_estado varchar, p_producto varchar, p_limite int, p_desplazamiento int)
RETURNS TABLE (id uuid, codigo varchar, nombre varchar, estado varchar, creado_en timestamptz, suscripciones jsonb, total bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT t.id, t.codigo, t.nombre, t.estado, t.creado_en,
         COALESCE((SELECT jsonb_agg(jsonb_build_object(
                            'producto_codigo', s.producto_codigo, 'plan', s.plan,
                            'estado', s.estado, 'vigente_hasta', s.vigente_hasta)
                          ORDER BY s.producto_codigo)
                     FROM org.suscripcion s WHERE s.tenant_id = t.id), '[]'::jsonb),
         count(*) OVER ()
    FROM org.tenant t
   WHERE (p_q IS NULL OR t.codigo ILIKE '%' || p_q || '%' OR t.nombre ILIKE '%' || p_q || '%')
     AND (p_estado IS NULL OR t.estado = p_estado)
     AND (p_producto IS NULL OR EXISTS (
           SELECT 1 FROM org.suscripcion s WHERE s.tenant_id = t.id AND s.producto_codigo = p_producto))
   ORDER BY t.codigo
   LIMIT p_limite OFFSET p_desplazamiento;
$$;

-- ---------------------------------------------------------------------
-- 3. Detalle: cabecera, suscripciones, empresa principal e historial (más reciente primero).
--    Empresa principal: la activa de menor razón social que tiene sucursal principal. Ninguna fila si el id no existe.
-- ---------------------------------------------------------------------
CREATE FUNCTION org.tenant_detalle(p_id uuid)
RETURNS TABLE (id uuid, codigo varchar, nombre varchar, estado varchar, estado_motivo varchar,
               estado_cambiado_en timestamptz, version bigint, creado_en timestamptz,
               suscripciones jsonb, empresa_principal jsonb, historial jsonb)
LANGUAGE sql STABLE STRICT SECURITY DEFINER SET search_path = '' AS $$
  SELECT t.id, t.codigo, t.nombre, t.estado, t.estado_motivo, t.estado_cambiado_en, t.version, t.creado_en,
         COALESCE((SELECT jsonb_agg(jsonb_build_object(
                            'producto_codigo', s.producto_codigo, 'plan', s.plan,
                            'estado', s.estado, 'vigente_hasta', s.vigente_hasta)
                          ORDER BY s.producto_codigo)
                     FROM org.suscripcion s WHERE s.tenant_id = t.id), '[]'::jsonb),
         (SELECT jsonb_build_object('id', e.id, 'ruc', e.ruc, 'razon_social', e.razon_social)
            FROM org.empresa e
           WHERE e.tenant_id = t.id AND e.activo
             AND EXISTS (SELECT 1 FROM org.sucursal su WHERE su.empresa_id = e.id AND su.es_principal)
           ORDER BY e.razon_social, e.id
           LIMIT 1),
         COALESCE((SELECT jsonb_agg(jsonb_build_object(
                            'estado_anterior', h.estado_anterior, 'estado_nuevo', h.estado_nuevo,
                            'motivo', h.motivo, 'fecha_efectiva', h.fecha_efectiva,
                            'actor_id', h.actor_id, 'registrado_en', h.registrado_en)
                          ORDER BY h.registrado_en DESC, h.id)
                     FROM org.tenant_estado_historial h WHERE h.tenant_id = t.id), '[]'::jsonb)
    FROM org.tenant t
   WHERE t.id = p_id;
$$;

ALTER FUNCTION org.tenants_listar(varchar, varchar, varchar, int, int) OWNER TO org_lector;
ALTER FUNCTION org.tenant_detalle(uuid) OWNER TO org_lector;
REVOKE EXECUTE ON FUNCTION org.tenants_listar(varchar, varchar, varchar, int, int) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION org.tenant_detalle(uuid) FROM PUBLIC;

-- Solo el rol que corre la migración (en dev, postgres: el mismo de la api).
DO $$
BEGIN
  EXECUTE format('GRANT EXECUTE ON FUNCTION org.tenants_listar(varchar, varchar, varchar, int, int) TO %I', current_user);
  EXECUTE format('GRANT EXECUTE ON FUNCTION org.tenant_detalle(uuid) TO %I', current_user);
END
$$;

-- Los esquemas de plataforma no se exponen por la Data API (regla 8). En PostgreSQL plano
-- (CI) los roles de Supabase no existen.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon')
     AND EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON FUNCTION org.tenants_listar(varchar, varchar, varchar, int, int) FROM anon, authenticated;
    REVOKE ALL ON FUNCTION org.tenant_detalle(uuid) FROM anon, authenticated;
  END IF;
END
$$;
