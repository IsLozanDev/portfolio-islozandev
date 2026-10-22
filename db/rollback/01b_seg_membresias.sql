-- Deja seg como lo dejó 01b_seg_autorizacion.sql. Una membresía FINALIZADO pasa a SUSPENDIDO con
-- su `hasta`: sigue sin acceso y cabe en el CHECK anterior.
CREATE OR REPLACE FUNCTION seg.asignaciones_aplicables(p_usuario uuid, p_tenant uuid, p_sucursal uuid, p_unidad uuid)
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

CREATE OR REPLACE FUNCTION seg.sucursales_accesibles(p_usuario uuid, p_tenant uuid)
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

DROP FUNCTION seg.invitacion_por_token(char);
DROP TABLE seg.invitacion;

ALTER TABLE seg.asignacion
  DROP CONSTRAINT ck_asig_revocacion,
  DROP COLUMN motivo_revocacion,
  DROP COLUMN revocada_por,
  DROP COLUMN revocada_en;

UPDATE seg.membresia SET estado = 'SUSPENDIDO', hasta = COALESCE(hasta, now()) WHERE estado = 'FINALIZADO';
ALTER TABLE seg.membresia
  DROP CONSTRAINT ck_membresia_estado,
  ADD CONSTRAINT membresia_estado_check CHECK (estado IN ('INVITADO', 'ACTIVO', 'SUSPENDIDO')),
  DROP COLUMN cambiado_en,
  DROP COLUMN cambiado_por,
  DROP COLUMN motivo,
  DROP COLUMN version;
