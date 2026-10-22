-- 01b · Seguridad: autorización (spec 06). PostgreSQL 16. Reversible: rollback/01b_seg_autorizacion.sql.
-- Agrega a seg lo que necesita el dominio de autorización: versión de los agregados, obsolescencia
-- del catálogo, última sucursal, manifiestos aplicados, versión de seguridad por tenant y las
-- funciones de permisos efectivos, menú y sucursales accesibles.

-- ---------------------------------------------------------------------
-- 1. Columnas nuevas
-- ---------------------------------------------------------------------
ALTER TABLE seg.rol        ADD COLUMN version bigint NOT NULL DEFAULT 0,
                           ADD COLUMN obsoleto boolean NOT NULL DEFAULT false;
ALTER TABLE seg.perfil     ADD COLUMN version bigint NOT NULL DEFAULT 0;
ALTER TABLE seg.asignacion ADD COLUMN version bigint NOT NULL DEFAULT 0;
ALTER TABLE seg.modulo     ADD COLUMN obsoleto boolean NOT NULL DEFAULT false;
ALTER TABLE seg.opcion     ADD COLUMN obsoleto boolean NOT NULL DEFAULT false;
ALTER TABLE seg.permiso    ADD COLUMN obsoleto boolean NOT NULL DEFAULT false;

ALTER TABLE seg.membresia ADD COLUMN ultima_sucursal_id uuid NULL,
  ADD CONSTRAINT fk_membresia_ultima_sucursal
    FOREIGN KEY (tenant_id, ultima_sucursal_id) REFERENCES org.sucursal (tenant_id, id);

-- ---------------------------------------------------------------------
-- 2. Manifiestos aplicados (global, sin RLS). La versión vigente es la fila más reciente por producto;
--    max(id) es la versión de catálogo que entra en la clave de caché.
-- ---------------------------------------------------------------------
CREATE TABLE seg.manifiesto_aplicado (
  id              bigserial   PRIMARY KEY,
  producto_codigo varchar(5)  NOT NULL REFERENCES seg.producto (codigo),
  version         varchar(20) NOT NULL,
  hash            char(64)    NOT NULL,
  cambios         jsonb       NOT NULL,
  aplicado_en     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (producto_codigo, version)
);

-- ---------------------------------------------------------------------
-- 3. Versión de seguridad por tenant (TR-RNF-101). Solo la escriben los triggers.
-- ---------------------------------------------------------------------
CREATE TABLE seg.version_seguridad (
  tenant_id   uuid        PRIMARY KEY REFERENCES org.tenant (id),
  version     bigint      NOT NULL DEFAULT 1,
  cambiado_en timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE seg.version_seguridad ENABLE ROW LEVEL SECURITY;
ALTER TABLE seg.version_seguridad FORCE ROW LEVEL SECURITY;
CREATE POLICY version_seguridad_select ON seg.version_seguridad FOR SELECT
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

-- SECURITY DEFINER: la tabla no tiene políticas de escritura. Los roles y perfiles predefinidos
-- (tenant nulo) no suben ninguna: los cubre la versión de catálogo.
CREATE FUNCTION seg.subir_version_seguridad() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  fila     record;
  v_tenant uuid;
BEGIN
  IF TG_OP = 'DELETE' THEN fila := OLD; ELSE fila := NEW; END IF;

  CASE TG_TABLE_NAME
    WHEN 'rol_permiso' THEN SELECT r.tenant_id INTO v_tenant FROM seg.rol r WHERE r.id = fila.rol_id;
    WHEN 'perfil_rol'  THEN SELECT p.tenant_id INTO v_tenant FROM seg.perfil p WHERE p.id = fila.perfil_id;
    ELSE v_tenant := fila.tenant_id;
  END CASE;

  IF v_tenant IS NOT NULL THEN
    INSERT INTO seg.version_seguridad AS v (tenant_id) VALUES (v_tenant)
    ON CONFLICT (tenant_id) DO UPDATE SET version = v.version + 1, cambiado_en = now();
  END IF;
  RETURN NULL;
END;
$$;
REVOKE EXECUTE ON FUNCTION seg.subir_version_seguridad() FROM PUBLIC;

CREATE TRIGGER rol_version_seguridad AFTER UPDATE ON seg.rol
  FOR EACH ROW WHEN (OLD.activo IS DISTINCT FROM NEW.activo OR OLD.obsoleto IS DISTINCT FROM NEW.obsoleto)
  EXECUTE FUNCTION seg.subir_version_seguridad();
CREATE TRIGGER rol_permiso_version_seguridad AFTER INSERT OR DELETE ON seg.rol_permiso
  FOR EACH ROW EXECUTE FUNCTION seg.subir_version_seguridad();
CREATE TRIGGER perfil_rol_version_seguridad AFTER INSERT OR DELETE ON seg.perfil_rol
  FOR EACH ROW EXECUTE FUNCTION seg.subir_version_seguridad();
CREATE TRIGGER asignacion_version_seguridad AFTER INSERT OR UPDATE ON seg.asignacion
  FOR EACH ROW EXECUTE FUNCTION seg.subir_version_seguridad();
-- ultima_sucursal_id no invalida: es una preferencia, no un acceso.
CREATE TRIGGER membresia_version_seguridad AFTER UPDATE ON seg.membresia
  FOR EACH ROW WHEN (OLD.estado IS DISTINCT FROM NEW.estado OR OLD.hasta IS DISTINCT FROM NEW.hasta)
  EXECUTE FUNCTION seg.subir_version_seguridad();
CREATE TRIGGER suscripcion_version_seguridad_alta AFTER INSERT ON org.suscripcion
  FOR EACH ROW EXECUTE FUNCTION seg.subir_version_seguridad();
CREATE TRIGGER suscripcion_version_seguridad AFTER UPDATE ON org.suscripcion
  FOR EACH ROW WHEN (OLD.estado IS DISTINCT FROM NEW.estado OR OLD.vigente_hasta IS DISTINCT FROM NEW.vigente_hasta)
  EXECUTE FUNCTION seg.subir_version_seguridad();

-- ---------------------------------------------------------------------
-- 4. Funciones de autorización. SECURITY INVOKER: corren con la RLS del llamador (segunda barrera).
--    La primera barrera dentro de la base: si p_tenant no es app.tenant_id, no devuelven filas.
-- ---------------------------------------------------------------------

-- Asignaciones vigentes del usuario que cubren la sucursal (y la unidad, si viene) pedida (TR-RN-007).
CREATE FUNCTION seg.asignaciones_aplicables(p_usuario uuid, p_tenant uuid, p_sucursal uuid, p_unidad uuid)
RETURNS TABLE (rol_id uuid, perfil_id uuid)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = '' AS $$
  SELECT a.rol_id, a.perfil_id
    FROM seg.asignacion a
    JOIN seg.membresia m ON m.tenant_id = a.tenant_id AND m.id = a.membresia_id
    JOIN seg.usuario u ON u.id = m.usuario_id
    JOIN org.sucursal s ON s.tenant_id = a.tenant_id AND s.id = p_sucursal AND s.activo
   WHERE p_tenant = NULLIF(current_setting('app.tenant_id', true), '')::uuid
     AND a.tenant_id = p_tenant
     AND m.usuario_id = p_usuario
     AND m.estado = 'ACTIVO' AND (m.hasta IS NULL OR m.hasta > now())
     AND u.estado = 'ACTIVO'
     AND current_date BETWEEN a.vigente_desde AND COALESCE(a.vigente_hasta, 'infinity'::date)
     AND (   a.alcance = 'TENANT'
          OR (a.alcance = 'EMPRESA'  AND a.empresa_id = s.empresa_id)
          OR (a.alcance = 'SUCURSAL' AND a.sucursal_id = s.id)
          OR (a.alcance = 'UNIDAD'   AND a.unidad_id = p_unidad
              AND EXISTS (SELECT 1 FROM org.unidad_operativa uo
                           WHERE uo.tenant_id = a.tenant_id AND uo.id = p_unidad
                             AND uo.sucursal_id = s.id AND uo.activo)));
$$;

CREATE FUNCTION seg.permisos_efectivos(p_usuario uuid, p_tenant uuid, p_sucursal uuid, p_unidad uuid DEFAULT NULL)
RETURNS TABLE (permiso_codigo varchar)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = '' AS $$
  WITH roles AS (
    SELECT aa.rol_id FROM seg.asignaciones_aplicables(p_usuario, p_tenant, p_sucursal, p_unidad) aa
     WHERE aa.rol_id IS NOT NULL
    UNION
    SELECT pr.rol_id
      FROM seg.asignaciones_aplicables(p_usuario, p_tenant, p_sucursal, p_unidad) aa
      JOIN seg.perfil pf ON pf.id = aa.perfil_id AND (pf.tenant_id IS NULL OR pf.tenant_id = p_tenant)
      JOIN seg.perfil_rol pr ON pr.perfil_id = pf.id
  )
  SELECT DISTINCT p.codigo
    FROM roles
    JOIN seg.rol r ON r.id = roles.rol_id AND r.activo AND NOT r.obsoleto
                  AND (r.tenant_id IS NULL OR r.tenant_id = p_tenant)
    JOIN seg.rol_permiso rp ON rp.rol_id = r.id
    JOIN seg.permiso p ON p.codigo = rp.permiso_codigo AND NOT p.obsoleto
   WHERE p.producto_codigo = 'PLAT'   -- TR-RN-007: PLAT no depende de suscripción
      OR EXISTS (SELECT 1 FROM org.suscripcion su
                  WHERE su.tenant_id = p_tenant AND su.producto_codigo = p.producto_codigo
                    AND su.estado IN ('PRUEBA', 'ACTIVA')
                    AND (su.vigente_hasta IS NULL OR su.vigente_hasta >= current_date));
$$;

-- Opciones con al menos un permiso efectivo, más sus ancestros.
CREATE FUNCTION seg.menu_usuario(p_usuario uuid, p_tenant uuid, p_sucursal uuid, p_unidad uuid DEFAULT NULL)
RETURNS TABLE (opcion_id uuid, padre_id uuid, codigo varchar, nombre varchar, ruta varchar, icono varchar, orden smallint)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = '' AS $$
  WITH RECURSIVE visibles AS (
    SELECT o.id, o.padre_id
      FROM seg.opcion o
      JOIN seg.modulo mo ON mo.id = o.modulo_id AND NOT mo.obsoleto
     WHERE NOT o.obsoleto
       AND EXISTS (SELECT 1 FROM seg.opcion_permiso op
                    JOIN seg.permisos_efectivos(p_usuario, p_tenant, p_sucursal, p_unidad) pe
                      ON pe.permiso_codigo = op.permiso_codigo
                   WHERE op.opcion_id = o.id)
    UNION
    SELECT o.id, o.padre_id
      FROM seg.opcion o
      JOIN visibles v ON v.padre_id = o.id
     WHERE NOT o.obsoleto
  )
  SELECT o.id, o.padre_id, o.codigo, o.nombre, o.ruta, o.icono, o.orden
    FROM seg.opcion o
   WHERE o.id IN (SELECT id FROM visibles);
$$;

-- Sucursales activas cubiertas por alguna asignación vigente del usuario.
CREATE FUNCTION seg.sucursales_accesibles(p_usuario uuid, p_tenant uuid)
RETURNS TABLE (sucursal_id uuid, empresa_id uuid, codigo varchar, nombre varchar)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = '' AS $$
  SELECT DISTINCT s.id, s.empresa_id, s.codigo, s.nombre
    FROM seg.asignacion a
    JOIN seg.membresia m ON m.tenant_id = a.tenant_id AND m.id = a.membresia_id
    JOIN seg.usuario u ON u.id = m.usuario_id
    JOIN org.sucursal s ON s.tenant_id = a.tenant_id AND s.activo
   WHERE p_tenant = NULLIF(current_setting('app.tenant_id', true), '')::uuid
     AND a.tenant_id = p_tenant
     AND m.usuario_id = p_usuario
     AND m.estado = 'ACTIVO' AND (m.hasta IS NULL OR m.hasta > now())
     AND u.estado = 'ACTIVO'
     AND current_date BETWEEN a.vigente_desde AND COALESCE(a.vigente_hasta, 'infinity'::date)
     AND (   a.alcance = 'TENANT'
          OR (a.alcance = 'EMPRESA'  AND a.empresa_id = s.empresa_id)
          OR (a.alcance = 'SUCURSAL' AND a.sucursal_id = s.id)
          OR (a.alcance = 'UNIDAD'
              AND EXISTS (SELECT 1 FROM org.unidad_operativa uo
                           WHERE uo.tenant_id = a.tenant_id AND uo.id = a.unidad_id
                             AND uo.sucursal_id = s.id AND uo.activo)));
$$;

-- vt: versión de seguridad del tenant (0 si nunca cambió); vc: versión de catálogo.
CREATE FUNCTION seg.versiones_seguridad(p_tenant uuid)
RETURNS TABLE (vt bigint, vc bigint)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = '' AS $$
  SELECT COALESCE((SELECT v.version FROM seg.version_seguridad v WHERE v.tenant_id = p_tenant), 0),
         COALESCE((SELECT max(ma.id) FROM seg.manifiesto_aplicado ma), 0)
   WHERE p_tenant = NULLIF(current_setting('app.tenant_id', true), '')::uuid;
$$;

-- Los esquemas de plataforma no se exponen por la Data API (regla 8).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon')
     AND EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON ALL TABLES IN SCHEMA seg FROM anon, authenticated;
    REVOKE ALL ON ALL SEQUENCES IN SCHEMA seg FROM anon, authenticated;
    REVOKE ALL ON ALL FUNCTIONS IN SCHEMA seg FROM anon, authenticated;
  END IF;
END
$$;
