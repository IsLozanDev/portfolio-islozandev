-- 01b · Seguridad: membresías (spec 08). PostgreSQL 16. Reversible: rollback/01b_seg_membresias.sql.
-- Ciclo de vida de la membresía (estado FINALIZADO, motivo y actor), revocación de asignaciones e
-- invitaciones con token propio de un solo uso (solo se guarda su sha256).

-- ---------------------------------------------------------------------
-- 1. Membresía: FINALIZADO, versión del agregado y último cambio de estado.
-- ---------------------------------------------------------------------
ALTER TABLE seg.membresia
  DROP CONSTRAINT membresia_estado_check,
  ADD CONSTRAINT ck_membresia_estado CHECK (estado IN ('INVITADO', 'ACTIVO', 'SUSPENDIDO', 'FINALIZADO')),
  ADD COLUMN version      bigint       NOT NULL DEFAULT 0,
  ADD COLUMN motivo       varchar(300) NULL,
  ADD COLUMN cambiado_por uuid         NULL REFERENCES seg.usuario (id),
  ADD COLUMN cambiado_en  timestamptz  NULL;

-- ---------------------------------------------------------------------
-- 2. Asignación revocada. vigente_hasta = ayer rompería ck_asig_vigencia si empezó hoy.
-- ---------------------------------------------------------------------
ALTER TABLE seg.asignacion
  ADD COLUMN revocada_en       timestamptz  NULL,
  ADD COLUMN revocada_por      uuid         NULL REFERENCES seg.usuario (id),
  ADD COLUMN motivo_revocacion varchar(300) NULL,
  ADD CONSTRAINT ck_asig_revocacion CHECK (
    (revocada_en IS NULL AND revocada_por IS NULL AND motivo_revocacion IS NULL)
    OR (revocada_en IS NOT NULL AND motivo_revocacion IS NOT NULL));

-- ---------------------------------------------------------------------
-- 3. Invitaciones. Una sola pendiente (ni usada ni anulada) por membresía.
-- ---------------------------------------------------------------------
CREATE TABLE seg.invitacion (
  id           uuid        PRIMARY KEY,
  tenant_id    uuid        NOT NULL,
  membresia_id uuid        NOT NULL,
  token_hash   char(64)    NOT NULL UNIQUE,
  expira_en    timestamptz NOT NULL,
  usada_en     timestamptz NULL,
  anulada_en   timestamptz NULL,
  creada_por   uuid        NOT NULL REFERENCES seg.usuario (id),
  creada_en    timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (tenant_id, membresia_id) REFERENCES seg.membresia (tenant_id, id),
  CONSTRAINT ck_invitacion_uso CHECK (usada_en IS NULL OR anulada_en IS NULL)
);
CREATE UNIQUE INDEX ux_invitacion_pendiente ON seg.invitacion (membresia_id)
  WHERE usada_en IS NULL AND anulada_en IS NULL;

CREATE TRIGGER invitacion_sin_borrado BEFORE DELETE ON seg.invitacion
  FOR EACH STATEMENT EXECUTE FUNCTION seg.sin_borrado();

ALTER TABLE seg.invitacion ENABLE ROW LEVEL SECURITY;
ALTER TABLE seg.invitacion FORCE ROW LEVEL SECURITY;
CREATE POLICY invitacion_select ON seg.invitacion FOR SELECT
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
CREATE POLICY invitacion_insert ON seg.invitacion FOR INSERT
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
CREATE POLICY invitacion_update ON seg.invitacion FOR UPDATE
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

-- Única lectura antes de conocer el tenant: el invitado aún no tiene tenant_id en su token.
-- SECURITY DEFINER para saltar la RLS, acotada a la fila del hash y sin datos personales.
CREATE FUNCTION seg.invitacion_por_token(p_hash char(64))
RETURNS TABLE (invitacion_id uuid, tenant_id uuid, membresia_id uuid, usuario_id uuid,
               tenant_nombre varchar, expira_en timestamptz, usada_en timestamptz, anulada_en timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT i.id, i.tenant_id, i.membresia_id, m.usuario_id, t.nombre, i.expira_en, i.usada_en, i.anulada_en
    FROM seg.invitacion i
    JOIN seg.membresia m ON m.tenant_id = i.tenant_id AND m.id = i.membresia_id
    JOIN org.tenant t ON t.id = i.tenant_id
   WHERE i.token_hash = p_hash;
$$;
REVOKE EXECUTE ON FUNCTION seg.invitacion_por_token(char) FROM PUBLIC;

-- ---------------------------------------------------------------------
-- 4. Las asignaciones revocadas dejan de dar acceso. Mismo cuerpo que 01b_seg_autorizacion
--    más `a.revocada_en IS NULL`.
-- ---------------------------------------------------------------------
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
     AND a.revocada_en IS NULL
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
     AND a.revocada_en IS NULL
     AND current_date BETWEEN a.vigente_desde AND COALESCE(a.vigente_hasta, 'infinity'::date)
     AND (   a.alcance = 'TENANT'
          OR (a.alcance = 'EMPRESA'  AND a.empresa_id = s.empresa_id)
          OR (a.alcance = 'SUCURSAL' AND a.sucursal_id = s.id)
          OR (a.alcance = 'UNIDAD'
              AND EXISTS (SELECT 1 FROM org.unidad_operativa uo
                           WHERE uo.tenant_id = a.tenant_id AND uo.id = a.unidad_id
                             AND uo.sucursal_id = s.id AND uo.activo)));
$$;

-- Los esquemas de plataforma no se exponen por la Data API (regla 8).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon')
     AND EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON seg.invitacion FROM anon, authenticated;
    REVOKE ALL ON FUNCTION seg.invitacion_por_token(char) FROM anon, authenticated;
  END IF;
END
$$;
