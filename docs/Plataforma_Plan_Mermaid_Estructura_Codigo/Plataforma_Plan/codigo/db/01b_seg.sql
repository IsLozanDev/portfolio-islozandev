-- =====================================================================
-- Plataforma — Componentes transversales
-- Script 02 · PostgreSQL 15+ · Módulo de seguridad (autorización)
-- La AUTENTICACIÓN (contraseñas, MFA, sesiones, OAuth) la resuelve el
-- proveedor de identidad (Keycloak o Supabase Auth). Este esquema guarda la
-- AUTORIZACIÓN: membresías, roles, perfiles, opciones, permisos y alcances.
-- Versión 1.0 · 2026-10-09
-- =====================================================================
CREATE SCHEMA IF NOT EXISTS seg;

-- ---------------------------------------------------------------------
-- 1. Catálogo funcional declarado por cada producto (se siembra al desplegar)
-- ---------------------------------------------------------------------
CREATE TABLE seg.producto (
  codigo   varchar(5)   PRIMARY KEY,           -- PLAT, REST, PSI, COL, LIB, GYM, CLI, DOC, ECO, LEX
  nombre   varchar(80)  NOT NULL
);

CREATE TABLE seg.modulo (
  id               uuid        PRIMARY KEY,
  producto_codigo  varchar(5)  NOT NULL REFERENCES seg.producto (codigo),
  codigo           varchar(40) NOT NULL,
  nombre           varchar(100) NOT NULL,
  orden            smallint    NOT NULL DEFAULT 0,
  UNIQUE (producto_codigo, codigo)
);

-- Opción = entrada de menú o pantalla.
CREATE TABLE seg.opcion (
  id         uuid         PRIMARY KEY,
  modulo_id  uuid         NOT NULL REFERENCES seg.modulo (id),
  padre_id   uuid         NULL REFERENCES seg.opcion (id),
  codigo     varchar(60)  NOT NULL UNIQUE,
  nombre     varchar(100) NOT NULL,
  ruta       varchar(150) NULL,                 -- ruta Angular
  icono      varchar(40)  NULL,
  orden      smallint     NOT NULL DEFAULT 0
);

-- Permiso = acción atómica: <producto>.<recurso>.<accion>
CREATE TABLE seg.permiso (
  codigo           varchar(80)  PRIMARY KEY,   -- p. ej. rest.venta.anular
  producto_codigo  varchar(5)   NOT NULL REFERENCES seg.producto (codigo),
  descripcion      varchar(200) NOT NULL,
  alcance_minimo   varchar(10)  NOT NULL DEFAULT 'SUCURSAL'
                   CHECK (alcance_minimo IN ('TENANT', 'EMPRESA', 'SUCURSAL', 'UNIDAD')),
  sensible         boolean      NOT NULL DEFAULT false   -- exige MFA y queda auditado
);

-- Permiso(s) necesario(s) para ver una opción del menú.
CREATE TABLE seg.opcion_permiso (
  opcion_id       uuid        NOT NULL REFERENCES seg.opcion (id),
  permiso_codigo  varchar(80) NOT NULL REFERENCES seg.permiso (codigo),
  PRIMARY KEY (opcion_id, permiso_codigo)
);

-- ---------------------------------------------------------------------
-- 2. Roles y perfiles
-- Rol: conjunto de permisos de UN producto. tenant_id NULL = rol predefinido.
-- Perfil: plantilla de puesto que agrupa roles de uno o varios productos.
-- ---------------------------------------------------------------------
CREATE TABLE seg.rol (
  id               uuid         PRIMARY KEY,
  tenant_id        uuid         NULL REFERENCES org.tenant (id),
  producto_codigo  varchar(5)   NOT NULL REFERENCES seg.producto (codigo),
  codigo           varchar(50)  NOT NULL,
  nombre           varchar(100) NOT NULL,
  editable         boolean      NOT NULL DEFAULT true,
  activo           boolean      NOT NULL DEFAULT true
);
CREATE UNIQUE INDEX ux_rol_codigo ON seg.rol (COALESCE(tenant_id, '00000000-0000-0000-0000-000000000000'::uuid), codigo);

CREATE TABLE seg.rol_permiso (
  rol_id          uuid        NOT NULL REFERENCES seg.rol (id) ON DELETE CASCADE,
  permiso_codigo  varchar(80) NOT NULL REFERENCES seg.permiso (codigo),
  PRIMARY KEY (rol_id, permiso_codigo)
);

CREATE TABLE seg.perfil (
  id         uuid         PRIMARY KEY,
  tenant_id  uuid         NULL REFERENCES org.tenant (id),
  codigo     varchar(50)  NOT NULL,
  nombre     varchar(100) NOT NULL
);
CREATE UNIQUE INDEX ux_perfil_codigo ON seg.perfil (COALESCE(tenant_id, '00000000-0000-0000-0000-000000000000'::uuid), codigo);

CREATE TABLE seg.perfil_rol (
  perfil_id  uuid NOT NULL REFERENCES seg.perfil (id) ON DELETE CASCADE,
  rol_id     uuid NOT NULL REFERENCES seg.rol (id),
  PRIMARY KEY (perfil_id, rol_id)
);

-- ---------------------------------------------------------------------
-- 3. Usuarios, membresías y asignaciones con alcance
-- usuario.id = identificador (sub) del proveedor de identidad.
-- Un usuario puede pertenecer a varios tenants (membresías).
-- ---------------------------------------------------------------------
CREATE TABLE seg.usuario (
  id             uuid         PRIMARY KEY,
  email          varchar(150) NOT NULL UNIQUE,
  nombre         varchar(150) NOT NULL,
  tipo           varchar(10)  NOT NULL DEFAULT 'INTERNO' CHECK (tipo IN ('INTERNO', 'EXTERNO', 'SOPORTE')),
  estado         varchar(12)  NOT NULL DEFAULT 'ACTIVO' CHECK (estado IN ('ACTIVO', 'BLOQUEADO', 'BAJA')),
  ultimo_acceso  timestamptz  NULL
);

CREATE TABLE seg.membresia (
  id            uuid        PRIMARY KEY,
  usuario_id    uuid        NOT NULL REFERENCES seg.usuario (id),
  tenant_id     uuid        NOT NULL REFERENCES org.tenant (id),
  estado        varchar(12) NOT NULL DEFAULT 'INVITADO' CHECK (estado IN ('INVITADO', 'ACTIVO', 'SUSPENDIDO')),
  es_propietario boolean    NOT NULL DEFAULT false,
  invitado_por  uuid        NULL REFERENCES seg.usuario (id),
  desde         timestamptz NOT NULL DEFAULT now(),
  hasta         timestamptz NULL,
  UNIQUE (usuario_id, tenant_id)
);

-- Asignación = acceso: rol o perfil + alcance (tenant, empresa, sucursal o unidad) + vigencia.
CREATE TABLE seg.asignacion (
  id             uuid        PRIMARY KEY,
  membresia_id   uuid        NOT NULL REFERENCES seg.membresia (id) ON DELETE CASCADE,
  rol_id         uuid        NULL REFERENCES seg.rol (id),
  perfil_id      uuid        NULL REFERENCES seg.perfil (id),
  alcance        varchar(10) NOT NULL CHECK (alcance IN ('TENANT', 'EMPRESA', 'SUCURSAL', 'UNIDAD')),
  empresa_id     uuid        NULL REFERENCES org.empresa (id),
  sucursal_id    uuid        NULL REFERENCES org.sucursal (id),
  unidad_id      uuid        NULL REFERENCES org.unidad_operativa (id),
  vigente_desde  date        NOT NULL DEFAULT current_date,
  vigente_hasta  date        NULL,
  otorgado_por   uuid        NULL REFERENCES seg.usuario (id),
  CONSTRAINT ck_asig_rol_o_perfil CHECK ((rol_id IS NULL) <> (perfil_id IS NULL)),
  CONSTRAINT ck_asig_alcance CHECK (
       (alcance = 'TENANT'   AND empresa_id IS NULL AND sucursal_id IS NULL AND unidad_id IS NULL)
    OR (alcance = 'EMPRESA'  AND empresa_id IS NOT NULL AND sucursal_id IS NULL AND unidad_id IS NULL)
    OR (alcance = 'SUCURSAL' AND sucursal_id IS NOT NULL AND unidad_id IS NULL)
    OR (alcance = 'UNIDAD'   AND unidad_id IS NOT NULL))
);
CREATE INDEX ix_asignacion_membresia ON seg.asignacion (membresia_id);

-- Bitácora de seguridad (accesos, denegaciones, cambios de permisos, soporte).
CREATE TABLE seg.evento_seguridad (
  id          bigserial    PRIMARY KEY,
  tenant_id   uuid         NULL,
  usuario_id  uuid         NULL,
  tipo        varchar(30)  NOT NULL,   -- LOGIN, ACCESO_DENEGADO, ASIGNACION_OTORGADA, ASIGNACION_REVOCADA, ACCESO_SOPORTE
  detalle     jsonb        NOT NULL DEFAULT '{}',
  ip          inet         NULL,
  ocurrido_en timestamptz  NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------
-- 4. Permisos efectivos
-- Devuelve los permisos de un usuario en un tenant, para una sucursal
-- (y opcionalmente una unidad). Reglas de cobertura del alcance:
--   TENANT   cubre todas las empresas y sucursales del tenant
--   EMPRESA  cubre las sucursales y unidades de esa empresa
--   SUCURSAL cubre esa sucursal y sus unidades
--   UNIDAD   cubre solo esa unidad (requiere p_unidad)
-- Solo cuentan productos con suscripción vigente.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION seg.permisos_efectivos(
  p_usuario  uuid,
  p_tenant   uuid,
  p_sucursal uuid DEFAULT NULL,
  p_unidad   uuid DEFAULT NULL
)
RETURNS TABLE (permiso_codigo varchar)
LANGUAGE sql STABLE AS $$
  WITH ctx AS (
    SELECT s.id AS sucursal_id, s.empresa_id
      FROM org.sucursal s
     WHERE s.id = p_sucursal
  ),
  asig AS (
    SELECT a.*
      FROM seg.asignacion a
      JOIN seg.membresia m ON m.id = a.membresia_id
     WHERE m.usuario_id = p_usuario
       AND m.tenant_id = p_tenant
       AND m.estado = 'ACTIVO'
       AND current_date BETWEEN a.vigente_desde AND COALESCE(a.vigente_hasta, 'infinity'::date)
       AND (
            a.alcance = 'TENANT'
         OR (a.alcance = 'EMPRESA'  AND a.empresa_id  = (SELECT empresa_id  FROM ctx))
         OR (a.alcance = 'SUCURSAL' AND a.sucursal_id = (SELECT sucursal_id FROM ctx))
         OR (a.alcance = 'UNIDAD'   AND a.unidad_id   = p_unidad)
       )
  ),
  roles AS (
    SELECT rol_id FROM asig WHERE rol_id IS NOT NULL
    UNION
    SELECT pr.rol_id FROM asig JOIN seg.perfil_rol pr ON pr.perfil_id = asig.perfil_id
  )
  SELECT DISTINCT rp.permiso_codigo
    FROM roles
    JOIN seg.rol r          ON r.id = roles.rol_id AND r.activo
    JOIN seg.rol_permiso rp ON rp.rol_id = r.id
    JOIN org.suscripcion su ON su.tenant_id = p_tenant
                           AND su.producto_codigo = r.producto_codigo
                           AND su.estado IN ('PRUEBA', 'ACTIVA')
                           AND (su.vigente_hasta IS NULL OR su.vigente_hasta >= current_date)
   UNION
  -- Permisos de plataforma (PLAT) no dependen de suscripción
  SELECT DISTINCT rp.permiso_codigo
    FROM roles
    JOIN seg.rol r          ON r.id = roles.rol_id AND r.activo AND r.producto_codigo = 'PLAT'
    JOIN seg.rol_permiso rp ON rp.rol_id = r.id;
$$;

-- Menú visible: opciones cuyos permisos requeridos están todos en los efectivos.
CREATE OR REPLACE FUNCTION seg.menu_usuario(p_usuario uuid, p_tenant uuid, p_sucursal uuid)
RETURNS TABLE (opcion_codigo varchar, nombre varchar, ruta varchar, orden smallint)
LANGUAGE sql STABLE AS $$
  WITH ef AS (SELECT permiso_codigo FROM seg.permisos_efectivos(p_usuario, p_tenant, p_sucursal))
  SELECT o.codigo, o.nombre, o.ruta, o.orden
    FROM seg.opcion o
   WHERE NOT EXISTS (
           SELECT 1 FROM seg.opcion_permiso op
            WHERE op.opcion_id = o.id
              AND op.permiso_codigo NOT IN (SELECT permiso_codigo FROM ef))
     AND EXISTS (SELECT 1 FROM seg.opcion_permiso op WHERE op.opcion_id = o.id)
   ORDER BY o.orden;
$$;

-- Sucursales a las que el usuario puede ingresar (selector de sucursal al iniciar sesión).
CREATE OR REPLACE FUNCTION seg.sucursales_accesibles(p_usuario uuid, p_tenant uuid)
RETURNS TABLE (sucursal_id uuid, sucursal varchar, empresa varchar)
LANGUAGE sql STABLE AS $$
  SELECT DISTINCT s.id, s.nombre, e.razon_social
    FROM seg.membresia m
    JOIN seg.asignacion a ON a.membresia_id = m.id
    JOIN org.sucursal s   ON s.tenant_id = m.tenant_id AND s.activo
    JOIN org.empresa e    ON e.id = s.empresa_id
    LEFT JOIN org.unidad_operativa u ON u.id = a.unidad_id
   WHERE m.usuario_id = p_usuario AND m.tenant_id = p_tenant AND m.estado = 'ACTIVO'
     AND current_date BETWEEN a.vigente_desde AND COALESCE(a.vigente_hasta, 'infinity'::date)
     AND (   a.alcance = 'TENANT'
          OR (a.alcance = 'EMPRESA'  AND a.empresa_id = s.empresa_id)
          OR (a.alcance = 'SUCURSAL' AND a.sucursal_id = s.id)
          OR (a.alcance = 'UNIDAD'   AND u.sucursal_id = s.id));
$$;
