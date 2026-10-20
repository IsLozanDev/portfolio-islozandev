-- 01b · Seguridad: autorización (TR-RN-008). PostgreSQL 16. Reversible: rollback/01b_seg.sql.
-- Supabase Auth autentica (contraseñas, MFA, sesiones, OAuth); este esquema guarda la autorización:
-- catálogo, roles, perfiles, usuarios, membresías, asignaciones con alcance y bitácora de seguridad.
-- usuario.id = sub de Supabase Auth; lo llena el espejo de supabase/migrations.
-- Los ids los genera la aplicación (UUID v7). Las funciones de permisos efectivos son del spec 07.

CREATE SCHEMA seg;

-- ---------------------------------------------------------------------
-- 1. Catálogo funcional declarado por cada producto (global, se siembra al desplegar)
-- ---------------------------------------------------------------------
CREATE TABLE seg.producto (
  codigo varchar(5)  PRIMARY KEY,               -- PLAT, REST, PSI, COL, LIB, GYM, CLI, DOC, ECO, LEX
  nombre varchar(80) NOT NULL
);

CREATE TABLE seg.modulo (
  id              uuid         PRIMARY KEY,
  producto_codigo varchar(5)   NOT NULL REFERENCES seg.producto (codigo),
  codigo          varchar(40)  NOT NULL,
  nombre          varchar(100) NOT NULL,
  orden           smallint     NOT NULL DEFAULT 0,
  UNIQUE (producto_codigo, codigo)
);

-- Opción = entrada de menú o pantalla.
CREATE TABLE seg.opcion (
  id        uuid         PRIMARY KEY,
  modulo_id uuid         NOT NULL REFERENCES seg.modulo (id),
  padre_id  uuid         NULL REFERENCES seg.opcion (id),
  codigo    varchar(60)  NOT NULL UNIQUE,
  nombre    varchar(100) NOT NULL,
  ruta      varchar(150) NULL,                  -- ruta Angular
  icono     varchar(40)  NULL,
  orden     smallint     NOT NULL DEFAULT 0
);

-- Permiso = acción atómica: <producto>.<recurso>.<accion>
CREATE TABLE seg.permiso (
  codigo          varchar(80)  PRIMARY KEY,
  producto_codigo varchar(5)   NOT NULL REFERENCES seg.producto (codigo),
  descripcion     varchar(200) NOT NULL,
  alcance_minimo  varchar(10)  NOT NULL DEFAULT 'SUCURSAL'
                  CHECK (alcance_minimo IN ('TENANT', 'EMPRESA', 'SUCURSAL', 'UNIDAD')),
  sensible        boolean      NOT NULL DEFAULT false   -- exige MFA y queda auditado (TR-RN-009)
);

CREATE TABLE seg.opcion_permiso (
  opcion_id      uuid        NOT NULL REFERENCES seg.opcion (id),
  permiso_codigo varchar(80) NOT NULL REFERENCES seg.permiso (codigo),
  PRIMARY KEY (opcion_id, permiso_codigo)
);

-- ---------------------------------------------------------------------
-- 2. Roles y perfiles. tenant_id NULL = predefinido (visible a todos, no editable por un tenant).
-- ---------------------------------------------------------------------
CREATE TABLE seg.rol (
  id              uuid         PRIMARY KEY,
  tenant_id       uuid         NULL REFERENCES org.tenant (id),
  producto_codigo varchar(5)   NOT NULL REFERENCES seg.producto (codigo),
  codigo          varchar(50)  NOT NULL,
  nombre          varchar(100) NOT NULL,
  editable        boolean      NOT NULL DEFAULT true,
  activo          boolean      NOT NULL DEFAULT true
);
CREATE UNIQUE INDEX ux_rol_codigo ON seg.rol (COALESCE(tenant_id, '00000000-0000-0000-0000-000000000000'::uuid), codigo);

CREATE TABLE seg.rol_permiso (
  rol_id         uuid        NOT NULL REFERENCES seg.rol (id) ON DELETE CASCADE,
  permiso_codigo varchar(80) NOT NULL REFERENCES seg.permiso (codigo),
  PRIMARY KEY (rol_id, permiso_codigo)
);

CREATE TABLE seg.perfil (
  id        uuid         PRIMARY KEY,
  tenant_id uuid         NULL REFERENCES org.tenant (id),
  codigo    varchar(50)  NOT NULL,
  nombre    varchar(100) NOT NULL
);
CREATE UNIQUE INDEX ux_perfil_codigo ON seg.perfil (COALESCE(tenant_id, '00000000-0000-0000-0000-000000000000'::uuid), codigo);

CREATE TABLE seg.perfil_rol (
  perfil_id uuid NOT NULL REFERENCES seg.perfil (id) ON DELETE CASCADE,
  rol_id    uuid NOT NULL REFERENCES seg.rol (id),
  PRIMARY KEY (perfil_id, rol_id)
);

-- ---------------------------------------------------------------------
-- 3. Usuarios (identidad global), membresías y asignaciones con alcance
-- ---------------------------------------------------------------------
CREATE TABLE seg.usuario (
  id               uuid         PRIMARY KEY,
  email            varchar(255) NOT NULL UNIQUE CHECK (email = lower(email)),
  nombre           varchar(150) NOT NULL,
  tipo             varchar(10)  NOT NULL CHECK (tipo IN ('INTERNO', 'EXTERNO', 'SOPORTE')),
  estado           varchar(12)  NOT NULL CHECK (estado IN ('ACTIVO', 'BLOQUEADO', 'BAJA')),
  ultimo_acceso    timestamptz  NULL,
  tenant_preferido uuid         NULL REFERENCES org.tenant (id),
  creado_en        timestamptz  NOT NULL DEFAULT now()
);

CREATE TABLE seg.membresia (
  id             uuid        PRIMARY KEY,
  usuario_id     uuid        NOT NULL REFERENCES seg.usuario (id),
  tenant_id      uuid        NOT NULL REFERENCES org.tenant (id),
  estado         varchar(12) NOT NULL DEFAULT 'INVITADO' CHECK (estado IN ('INVITADO', 'ACTIVO', 'SUSPENDIDO')),
  es_propietario boolean     NOT NULL DEFAULT false,
  invitado_por   uuid        NULL REFERENCES seg.usuario (id),
  desde          timestamptz NOT NULL DEFAULT now(),
  hasta          timestamptz NULL,
  UNIQUE (usuario_id, tenant_id),
  UNIQUE (tenant_id, id),
  CONSTRAINT ck_membresia_vigencia CHECK (hasta IS NULL OR hasta > desde)
);

-- Asignación = acceso: rol o perfil + alcance + vigencia (TR-RN-008). Las FK compuestas impiden
-- colgar la asignación de una membresía, empresa, sucursal o unidad de otro tenant.
CREATE TABLE seg.asignacion (
  id            uuid        PRIMARY KEY,
  tenant_id     uuid        NOT NULL,
  membresia_id  uuid        NOT NULL,
  rol_id        uuid        NULL REFERENCES seg.rol (id),
  perfil_id     uuid        NULL REFERENCES seg.perfil (id),
  alcance       varchar(10) NOT NULL CHECK (alcance IN ('TENANT', 'EMPRESA', 'SUCURSAL', 'UNIDAD')),
  empresa_id    uuid        NULL,
  sucursal_id   uuid        NULL,
  unidad_id     uuid        NULL,
  vigente_desde date        NOT NULL DEFAULT current_date,
  vigente_hasta date        NULL,
  otorgado_por  uuid        NULL REFERENCES seg.usuario (id),
  FOREIGN KEY (tenant_id, membresia_id) REFERENCES seg.membresia (tenant_id, id) ON DELETE CASCADE,
  FOREIGN KEY (tenant_id, empresa_id) REFERENCES org.empresa (tenant_id, id),
  FOREIGN KEY (tenant_id, sucursal_id) REFERENCES org.sucursal (tenant_id, id),
  FOREIGN KEY (tenant_id, unidad_id) REFERENCES org.unidad_operativa (tenant_id, id),
  CONSTRAINT ck_asig_rol_o_perfil CHECK ((rol_id IS NULL) <> (perfil_id IS NULL)),
  CONSTRAINT ck_asig_alcance CHECK (
       (alcance = 'TENANT'   AND empresa_id IS NULL AND sucursal_id IS NULL AND unidad_id IS NULL)
    OR (alcance = 'EMPRESA'  AND empresa_id IS NOT NULL AND sucursal_id IS NULL AND unidad_id IS NULL)
    OR (alcance = 'SUCURSAL' AND sucursal_id IS NOT NULL AND unidad_id IS NULL)
    OR (alcance = 'UNIDAD'   AND unidad_id IS NOT NULL)),
  CONSTRAINT ck_asig_vigencia CHECK (vigente_hasta IS NULL OR vigente_hasta >= vigente_desde)
);
CREATE INDEX ix_asignacion_membresia ON seg.asignacion (membresia_id);

-- Bitácora de seguridad (accesos, denegaciones, cambios de permisos, soporte). Solo inserción.
CREATE TABLE seg.evento_seguridad (
  id          bigserial   PRIMARY KEY,
  tenant_id   uuid        NULL REFERENCES org.tenant (id),
  usuario_id  uuid        NULL,
  tipo        varchar(30) NOT NULL,   -- LOGIN, ACCESO_DENEGADO, ASIGNACION_OTORGADA, ASIGNACION_REVOCADA, ACCESO_SOPORTE
  detalle     jsonb       NOT NULL DEFAULT '{}',
  ip          inet        NULL,
  ocurrido_en timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------
-- 4. Sin borrado. Sin política de DELETE la sentencia afectaría 0 filas sin error; el trigger
--    por sentencia hace que falle siempre (mismo criterio que org).
-- ---------------------------------------------------------------------
CREATE FUNCTION seg.sin_borrado() RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  RAISE EXCEPTION 'seg.% no admite %: se cambia de estado o vigencia', TG_TABLE_NAME, TG_OP
    USING ERRCODE = 'insufficient_privilege';
END;
$$;

CREATE TRIGGER rol_sin_borrado BEFORE DELETE ON seg.rol
  FOR EACH STATEMENT EXECUTE FUNCTION seg.sin_borrado();
CREATE TRIGGER perfil_sin_borrado BEFORE DELETE ON seg.perfil
  FOR EACH STATEMENT EXECUTE FUNCTION seg.sin_borrado();
CREATE TRIGGER membresia_sin_borrado BEFORE DELETE ON seg.membresia
  FOR EACH STATEMENT EXECUTE FUNCTION seg.sin_borrado();
CREATE TRIGGER asignacion_sin_borrado BEFORE DELETE ON seg.asignacion
  FOR EACH STATEMENT EXECUTE FUNCTION seg.sin_borrado();
CREATE TRIGGER evento_seguridad_solo_insercion BEFORE UPDATE OR DELETE ON seg.evento_seguridad
  FOR EACH STATEMENT EXECUTE FUNCTION seg.sin_borrado();

-- ---------------------------------------------------------------------
-- 5. Aislamiento por tenant (segunda barrera). El catálogo y usuario no son datos de un tenant.
--    NULLIF: app.tenant_id queda en '' tras el primer SET LOCAL.
-- ---------------------------------------------------------------------
ALTER TABLE seg.rol              ENABLE ROW LEVEL SECURITY;
ALTER TABLE seg.rol_permiso      ENABLE ROW LEVEL SECURITY;
ALTER TABLE seg.perfil           ENABLE ROW LEVEL SECURITY;
ALTER TABLE seg.perfil_rol       ENABLE ROW LEVEL SECURITY;
ALTER TABLE seg.membresia        ENABLE ROW LEVEL SECURITY;
ALTER TABLE seg.asignacion       ENABLE ROW LEVEL SECURITY;
ALTER TABLE seg.evento_seguridad ENABLE ROW LEVEL SECURITY;
ALTER TABLE seg.rol              FORCE ROW LEVEL SECURITY;
ALTER TABLE seg.rol_permiso      FORCE ROW LEVEL SECURITY;
ALTER TABLE seg.perfil           FORCE ROW LEVEL SECURITY;
ALTER TABLE seg.perfil_rol       FORCE ROW LEVEL SECURITY;
ALTER TABLE seg.membresia        FORCE ROW LEVEL SECURITY;
ALTER TABLE seg.asignacion       FORCE ROW LEVEL SECURITY;
ALTER TABLE seg.evento_seguridad FORCE ROW LEVEL SECURITY;

DO $$
DECLARE
  t text;
BEGIN
  -- Membresía y asignación: solo el tenant del contexto.
  FOREACH t IN ARRAY ARRAY['membresia', 'asignacion'] LOOP
    EXECUTE format(
      'CREATE POLICY %1$s_select ON seg.%1$I FOR SELECT
         USING (tenant_id = NULLIF(current_setting(''app.tenant_id'', true), '''')::uuid)', t);
    EXECUTE format(
      'CREATE POLICY %1$s_insert ON seg.%1$I FOR INSERT
         WITH CHECK (tenant_id = NULLIF(current_setting(''app.tenant_id'', true), '''')::uuid)', t);
    EXECUTE format(
      'CREATE POLICY %1$s_update ON seg.%1$I FOR UPDATE
         USING (tenant_id = NULLIF(current_setting(''app.tenant_id'', true), '''')::uuid)
         WITH CHECK (tenant_id = NULLIF(current_setting(''app.tenant_id'', true), '''')::uuid)', t);
  END LOOP;

  -- Rol y perfil: se leen los predefinidos y los propios; solo se escriben los propios.
  FOREACH t IN ARRAY ARRAY['rol', 'perfil'] LOOP
    EXECUTE format(
      'CREATE POLICY %1$s_select ON seg.%1$I FOR SELECT
         USING (tenant_id IS NULL OR tenant_id = NULLIF(current_setting(''app.tenant_id'', true), '''')::uuid)', t);
    EXECUTE format(
      'CREATE POLICY %1$s_insert ON seg.%1$I FOR INSERT
         WITH CHECK (tenant_id = NULLIF(current_setting(''app.tenant_id'', true), '''')::uuid)', t);
    EXECUTE format(
      'CREATE POLICY %1$s_update ON seg.%1$I FOR UPDATE
         USING (tenant_id = NULLIF(current_setting(''app.tenant_id'', true), '''')::uuid)
         WITH CHECK (tenant_id = NULLIF(current_setting(''app.tenant_id'', true), '''')::uuid)', t);
  END LOOP;
END
$$;

-- rol_permiso y perfil_rol siguen a su rol o perfil. El EXISTS de lectura pasa por la RLS de rol/perfil.
CREATE POLICY rol_permiso_select ON seg.rol_permiso FOR SELECT
  USING (EXISTS (SELECT 1 FROM seg.rol r WHERE r.id = rol_id));
CREATE POLICY rol_permiso_insert ON seg.rol_permiso FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM seg.rol r WHERE r.id = rol_id
                        AND r.tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid));
CREATE POLICY rol_permiso_delete ON seg.rol_permiso FOR DELETE
  USING (EXISTS (SELECT 1 FROM seg.rol r WHERE r.id = rol_id
                   AND r.tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid));

CREATE POLICY perfil_rol_select ON seg.perfil_rol FOR SELECT
  USING (EXISTS (SELECT 1 FROM seg.perfil p WHERE p.id = perfil_id));
CREATE POLICY perfil_rol_insert ON seg.perfil_rol FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM seg.perfil p WHERE p.id = perfil_id
                        AND p.tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid));
CREATE POLICY perfil_rol_delete ON seg.perfil_rol FOR DELETE
  USING (EXISTS (SELECT 1 FROM seg.perfil p WHERE p.id = perfil_id
                   AND p.tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid));

-- Las filas sin tenant (p. ej. login fallido) no las ve ni las escribe el rol de la aplicación.
CREATE POLICY evento_seguridad_select ON seg.evento_seguridad FOR SELECT
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
CREATE POLICY evento_seguridad_insert ON seg.evento_seguridad FOR INSERT
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

-- Los esquemas de plataforma no se exponen por la Data API (regla 8). En PostgreSQL plano
-- (CI) los roles de Supabase no existen.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon')
     AND EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON SCHEMA seg FROM anon, authenticated;
    REVOKE ALL ON ALL TABLES IN SCHEMA seg FROM anon, authenticated;
    REVOKE ALL ON ALL SEQUENCES IN SCHEMA seg FROM anon, authenticated;
    REVOKE ALL ON ALL FUNCTIONS IN SCHEMA seg FROM anon, authenticated;
  END IF;
END
$$;
