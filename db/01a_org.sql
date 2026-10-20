-- 01a · Estructura organizacional (TR-RN-001..006). PostgreSQL 16. Reversible: rollback/01a_org.sql.
-- Tenant → Empresa (RUC) → Sucursal (establecimiento) → Unidad operativa, más suscripción por producto
-- e historial de estados. Los ids los genera la aplicación (UUID v7); version es la del agregado.

CREATE SCHEMA org;

CREATE TABLE org.tenant (
  id                 uuid         PRIMARY KEY,
  codigo             varchar(30)  NOT NULL UNIQUE
                     CHECK (codigo ~ '^[a-z0-9]+(-[a-z0-9]+)*$' AND char_length(codigo) >= 3),
  nombre             varchar(150) NOT NULL CHECK (char_length(nombre) >= 3),
  estado             varchar(15)  NOT NULL CHECK (estado IN ('PRUEBA', 'ACTIVO', 'SUSPENDIDO', 'BAJA')),
  estado_motivo      varchar(500) NULL,
  estado_cambiado_en timestamptz  NULL,
  baja_en            timestamptz  NULL,
  version            bigint       NOT NULL,
  creado_en          timestamptz  NOT NULL DEFAULT now(),
  CONSTRAINT ck_tenant_baja CHECK ((estado = 'BAJA') = (baja_en IS NOT NULL))
);

-- id propio porque el outbox exige aggregate_id uuid; la clave de negocio es (tenant_id, producto_codigo).
CREATE TABLE org.suscripcion (
  id                uuid        PRIMARY KEY,
  tenant_id         uuid        NOT NULL REFERENCES org.tenant (id),
  producto_codigo   varchar(5)  NOT NULL
                    CHECK (producto_codigo IN ('REST', 'PSI', 'COL', 'LIB', 'GYM', 'CLI', 'DOC', 'ECO', 'LEX')),
  edicion           varchar(30) NULL,
  plan              varchar(30) NOT NULL CHECK (plan IN ('BASICO', 'PRO', 'EMPRESA')),
  estado            varchar(15) NOT NULL CHECK (estado IN ('PRUEBA', 'ACTIVA', 'VENCIDA', 'CANCELADA')),
  limite_sucursales int         NULL CHECK (limite_sucursales >= 1),
  limite_usuarios   int         NULL CHECK (limite_usuarios >= 1),
  vigente_hasta     date        NULL,
  version           bigint      NOT NULL,
  UNIQUE (tenant_id, producto_codigo)
);

CREATE TABLE org.empresa (
  id               uuid         PRIMARY KEY,
  tenant_id        uuid         NOT NULL REFERENCES org.tenant (id),
  ruc              char(11)     NOT NULL CHECK (ruc ~ '^(10|15|17|20)\d{9}$'),
  razon_social     varchar(200) NOT NULL CHECK (char_length(razon_social) >= 1),
  nombre_comercial varchar(150) NULL,
  direccion_fiscal varchar(250) NULL,
  ubigeo           char(6)      NULL CHECK (ubigeo ~ '^\d{6}$'),
  activo           boolean      NOT NULL DEFAULT true,
  version          bigint       NOT NULL,
  UNIQUE (tenant_id, ruc),
  UNIQUE (tenant_id, id)
);

-- La principal es el domicilio fiscal: establecimiento 0000, solo ella y siempre activa (TR-RN-003).
CREATE TABLE org.sucursal (
  id                           uuid         PRIMARY KEY,
  tenant_id                    uuid         NOT NULL,
  empresa_id                   uuid         NOT NULL,
  codigo                       varchar(20)  NOT NULL CHECK (char_length(codigo) >= 1),
  nombre                       varchar(150) NOT NULL CHECK (char_length(nombre) >= 3),
  codigo_establecimiento_sunat char(4)      NULL CHECK (codigo_establecimiento_sunat ~ '^\d{4}$'),
  direccion                    varchar(250) NULL,
  ubigeo                       char(6)      NULL CHECK (ubigeo ~ '^\d{6}$'),
  telefono                     varchar(30)  NULL,
  zona_horaria                 varchar(40)  NOT NULL DEFAULT 'America/Lima',
  es_principal                 boolean      NOT NULL DEFAULT false,
  activo                       boolean      NOT NULL DEFAULT true,
  version                      bigint       NOT NULL,
  FOREIGN KEY (tenant_id, empresa_id) REFERENCES org.empresa (tenant_id, id),
  UNIQUE (empresa_id, codigo),
  UNIQUE (empresa_id, codigo_establecimiento_sunat),
  UNIQUE (tenant_id, id),
  CONSTRAINT ck_sucursal_principal_0000 CHECK (NOT es_principal OR codigo_establecimiento_sunat = '0000'),
  CONSTRAINT ck_sucursal_0000_principal CHECK (es_principal OR codigo_establecimiento_sunat IS DISTINCT FROM '0000'),
  CONSTRAINT ck_sucursal_principal_activa CHECK (NOT es_principal OR activo)
);
CREATE UNIQUE INDEX ux_sucursal_principal ON org.sucursal (empresa_id) WHERE es_principal;
-- El tope de sucursales del plan cuenta las activas del tenant (TR-RN-006).
CREATE INDEX ix_sucursal_tenant_activa ON org.sucursal (tenant_id) WHERE activo;

-- El tipo se valida en el dominio hasta que exista el catálogo TIPO_UNIDAD (spec 19a).
CREATE TABLE org.unidad_operativa (
  id          uuid         PRIMARY KEY,
  tenant_id   uuid         NOT NULL,
  empresa_id  uuid         NOT NULL,
  sucursal_id uuid         NULL,
  tipo        varchar(30)  NOT NULL,
  codigo      varchar(20)  NOT NULL CHECK (char_length(codigo) >= 1),
  nombre      varchar(150) NOT NULL CHECK (char_length(nombre) >= 3),
  padre_id    uuid         NULL,
  atributos   jsonb        NOT NULL DEFAULT '{}',
  activo      boolean      NOT NULL DEFAULT true,
  version     bigint       NOT NULL,
  FOREIGN KEY (tenant_id, empresa_id) REFERENCES org.empresa (tenant_id, id),
  FOREIGN KEY (tenant_id, sucursal_id) REFERENCES org.sucursal (tenant_id, id),
  UNIQUE (tenant_id, id),
  FOREIGN KEY (tenant_id, padre_id) REFERENCES org.unidad_operativa (tenant_id, id),
  CONSTRAINT ck_unidad_sin_sucursal CHECK (sucursal_id IS NOT NULL OR tipo = 'ALMACEN'),
  CONSTRAINT ck_unidad_padre CHECK (padre_id IS DISTINCT FROM id),
  UNIQUE (empresa_id, tipo, codigo)
);
CREATE INDEX ix_unidad_sucursal ON org.unidad_operativa (sucursal_id, tipo);

-- actor_id es seg.usuario; sin FK porque seg depende de org.
CREATE TABLE org.tenant_estado_historial (
  id              uuid         PRIMARY KEY,
  tenant_id       uuid         NOT NULL REFERENCES org.tenant (id),
  estado_anterior varchar(15)  NOT NULL CHECK (estado_anterior IN ('PRUEBA', 'ACTIVO', 'SUSPENDIDO', 'BAJA')),
  estado_nuevo    varchar(15)  NOT NULL CHECK (estado_nuevo IN ('PRUEBA', 'ACTIVO', 'SUSPENDIDO', 'BAJA')),
  motivo          varchar(500) NOT NULL CHECK (char_length(motivo) >= 10),
  fecha_efectiva  timestamptz  NOT NULL,
  actor_id        uuid         NULL,
  registrado_en   timestamptz  NOT NULL DEFAULT now()
);
CREATE INDEX ix_tenant_estado_historial ON org.tenant_estado_historial (tenant_id, registrado_en);

-- Sin política de DELETE la sentencia afectaría 0 filas sin error. El trigger por sentencia
-- hace que falle siempre, también para el dueño (mismo criterio que sync.outbox).
CREATE FUNCTION org.sin_borrado() RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  RAISE EXCEPTION 'org.% no admite %: se inactiva o cambia de estado', TG_TABLE_NAME, TG_OP
    USING ERRCODE = 'insufficient_privilege';
END;
$$;

CREATE TRIGGER tenant_sin_borrado BEFORE DELETE ON org.tenant
  FOR EACH STATEMENT EXECUTE FUNCTION org.sin_borrado();
CREATE TRIGGER suscripcion_sin_borrado BEFORE DELETE ON org.suscripcion
  FOR EACH STATEMENT EXECUTE FUNCTION org.sin_borrado();
CREATE TRIGGER empresa_sin_borrado BEFORE DELETE ON org.empresa
  FOR EACH STATEMENT EXECUTE FUNCTION org.sin_borrado();
CREATE TRIGGER sucursal_sin_borrado BEFORE DELETE ON org.sucursal
  FOR EACH STATEMENT EXECUTE FUNCTION org.sin_borrado();
CREATE TRIGGER unidad_operativa_sin_borrado BEFORE DELETE ON org.unidad_operativa
  FOR EACH STATEMENT EXECUTE FUNCTION org.sin_borrado();
CREATE TRIGGER tenant_estado_historial_solo_insercion BEFORE UPDATE OR DELETE ON org.tenant_estado_historial
  FOR EACH STATEMENT EXECUTE FUNCTION org.sin_borrado();

-- Aislamiento por tenant (segunda barrera). NULLIF: app.tenant_id queda en '' tras el primer SET LOCAL.
ALTER TABLE org.tenant                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE org.suscripcion             ENABLE ROW LEVEL SECURITY;
ALTER TABLE org.empresa                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE org.sucursal                ENABLE ROW LEVEL SECURITY;
ALTER TABLE org.unidad_operativa        ENABLE ROW LEVEL SECURITY;
ALTER TABLE org.tenant_estado_historial ENABLE ROW LEVEL SECURITY;
ALTER TABLE org.tenant                  FORCE ROW LEVEL SECURITY;
ALTER TABLE org.suscripcion             FORCE ROW LEVEL SECURITY;
ALTER TABLE org.empresa                 FORCE ROW LEVEL SECURITY;
ALTER TABLE org.sucursal                FORCE ROW LEVEL SECURITY;
ALTER TABLE org.unidad_operativa        FORCE ROW LEVEL SECURITY;
ALTER TABLE org.tenant_estado_historial FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_select ON org.tenant FOR SELECT
  USING (id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
CREATE POLICY tenant_insert ON org.tenant FOR INSERT
  WITH CHECK (id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
CREATE POLICY tenant_update ON org.tenant FOR UPDATE
  USING (id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['suscripcion', 'empresa', 'sucursal', 'unidad_operativa', 'tenant_estado_historial'] LOOP
    EXECUTE format(
      'CREATE POLICY %1$s_select ON org.%1$I FOR SELECT
         USING (tenant_id = NULLIF(current_setting(''app.tenant_id'', true), '''')::uuid)', t);
    EXECUTE format(
      'CREATE POLICY %1$s_insert ON org.%1$I FOR INSERT
         WITH CHECK (tenant_id = NULLIF(current_setting(''app.tenant_id'', true), '''')::uuid)', t);
  END LOOP;
  -- El historial es de solo inserción: sin política de UPDATE.
  FOREACH t IN ARRAY ARRAY['suscripcion', 'empresa', 'sucursal', 'unidad_operativa'] LOOP
    EXECUTE format(
      'CREATE POLICY %1$s_update ON org.%1$I FOR UPDATE
         USING (tenant_id = NULLIF(current_setting(''app.tenant_id'', true), '''')::uuid)
         WITH CHECK (tenant_id = NULLIF(current_setting(''app.tenant_id'', true), '''')::uuid)', t);
  END LOOP;
END
$$;

-- Los esquemas de plataforma no se exponen por la Data API (regla 8). En PostgreSQL plano
-- (CI) los roles de Supabase no existen.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon')
     AND EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON SCHEMA org FROM anon, authenticated;
    REVOKE ALL ON ALL TABLES IN SCHEMA org FROM anon, authenticated;
    REVOKE ALL ON ALL SEQUENCES IN SCHEMA org FROM anon, authenticated;
    REVOKE ALL ON ALL FUNCTIONS IN SCHEMA org FROM anon, authenticated;
  END IF;
END
$$;
