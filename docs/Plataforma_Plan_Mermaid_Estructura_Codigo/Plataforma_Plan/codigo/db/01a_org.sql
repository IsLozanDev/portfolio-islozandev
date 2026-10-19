-- =====================================================================
-- Plataforma — Componentes transversales
-- Script 01 · PostgreSQL 15+ (Supabase) · Estructura organizacional
-- Tenant → Empresa (RUC) → Sucursal (establecimiento) → Unidad operativa
-- Versión 1.0 · 2026-10-09
-- =====================================================================
CREATE SCHEMA IF NOT EXISTS org;

-- ---------------------------------------------------------------------
-- Tenant: el cliente que contrata la plataforma (cuenta comercial).
-- Puede agrupar una o varias empresas (RUC) del mismo dueño o grupo.
-- ---------------------------------------------------------------------
CREATE TABLE org.tenant (
  id              uuid PRIMARY KEY,
  codigo          varchar(30)  NOT NULL UNIQUE,
  nombre          varchar(150) NOT NULL,
  estado          varchar(15)  NOT NULL DEFAULT 'ACTIVO'
                  CHECK (estado IN ('PRUEBA', 'ACTIVO', 'SUSPENDIDO', 'BAJA')),
  creado_en       timestamptz  NOT NULL DEFAULT now()
);

-- Productos contratados por el tenant (licencia y límites).
CREATE TABLE org.suscripcion (
  tenant_id         uuid        NOT NULL REFERENCES org.tenant (id),
  producto_codigo   varchar(5)  NOT NULL,          -- REST, PSI, COL, LIB, GYM, CLI, DOC, ECO, LEX
  edicion           varchar(30) NULL,              -- p. ej. ESTUDIO / NOTARIA en LEX
  plan              varchar(30) NOT NULL,
  estado            varchar(15) NOT NULL DEFAULT 'ACTIVA' CHECK (estado IN ('PRUEBA', 'ACTIVA', 'VENCIDA', 'CANCELADA')),
  limite_sucursales int         NULL,
  limite_usuarios   int         NULL,
  vigente_hasta     date        NULL,
  PRIMARY KEY (tenant_id, producto_codigo)
);

-- ---------------------------------------------------------------------
-- Empresa: persona jurídica o natural con negocio, identificada por RUC.
-- Emite comprobantes; es la titular de series, datos tributarios y protocolo.
-- ---------------------------------------------------------------------
CREATE TABLE org.empresa (
  id                uuid         PRIMARY KEY,
  tenant_id         uuid         NOT NULL REFERENCES org.tenant (id),
  ruc               char(11)     NOT NULL CHECK (ruc ~ '^(10|15|17|20)\d{9}$'),
  razon_social      varchar(200) NOT NULL,
  nombre_comercial  varchar(150) NULL,
  direccion_fiscal  varchar(250) NULL,
  ubigeo            char(6)      NULL,
  activo            boolean      NOT NULL DEFAULT true,
  UNIQUE (tenant_id, ruc),
  UNIQUE (tenant_id, id)                                  -- habilita FK compuestas
);

-- ---------------------------------------------------------------------
-- Sucursal: establecimiento físico (local, sede, oficina, agencia).
-- codigo_establecimiento_sunat: código del establecimiento anexo del RUC.
-- ---------------------------------------------------------------------
CREATE TABLE org.sucursal (
  id                          uuid         PRIMARY KEY,
  tenant_id                   uuid         NOT NULL,
  empresa_id                  uuid         NOT NULL,
  codigo                      varchar(20)  NOT NULL,
  nombre                      varchar(150) NOT NULL,
  codigo_establecimiento_sunat char(4)     NULL CHECK (codigo_establecimiento_sunat ~ '^\d{4}$'),
  direccion                   varchar(250) NULL,
  ubigeo                      char(6)      NULL,
  telefono                    varchar(30)  NULL,
  zona_horaria                varchar(40)  NOT NULL DEFAULT 'America/Lima',
  es_principal                boolean      NOT NULL DEFAULT false,
  activo                      boolean      NOT NULL DEFAULT true,
  FOREIGN KEY (tenant_id, empresa_id) REFERENCES org.empresa (tenant_id, id),
  UNIQUE (empresa_id, codigo),
  UNIQUE (tenant_id, id)
);
-- Una sola sucursal principal por empresa.
CREATE UNIQUE INDEX ux_sucursal_principal ON org.sucursal (empresa_id) WHERE es_principal;

-- ---------------------------------------------------------------------
-- Unidad operativa: recurso físico u operativo dentro de una sucursal
-- (almacén, caja, punto de venta, consultorio, ventanilla, salón, estación
-- de producción, farmacia, oficina). El tipo viene del catálogo TIPO_UNIDAD.
-- Un ALMACEN puede pertenecer a la empresa sin sucursal (almacén central).
-- ---------------------------------------------------------------------
CREATE TABLE org.unidad_operativa (
  id            uuid         PRIMARY KEY,
  tenant_id     uuid         NOT NULL,
  empresa_id    uuid         NOT NULL,
  sucursal_id   uuid         NULL,
  tipo          varchar(30)  NOT NULL,       -- catálogo TIPO_UNIDAD
  codigo        varchar(20)  NOT NULL,
  nombre        varchar(150) NOT NULL,
  padre_id      uuid         NULL REFERENCES org.unidad_operativa (id),  -- p. ej. sub-almacén
  atributos     jsonb        NOT NULL DEFAULT '{}',                     -- capacidad, impresora, etc.
  activo        boolean      NOT NULL DEFAULT true,
  FOREIGN KEY (tenant_id, empresa_id) REFERENCES org.empresa (tenant_id, id),
  FOREIGN KEY (tenant_id, sucursal_id) REFERENCES org.sucursal (tenant_id, id),
  CONSTRAINT ck_unidad_sin_sucursal CHECK (sucursal_id IS NOT NULL OR tipo = 'ALMACEN'),
  UNIQUE (empresa_id, tipo, codigo)
);
CREATE INDEX ix_unidad_sucursal ON org.unidad_operativa (sucursal_id, tipo);

-- ---------------------------------------------------------------------
-- Aislamiento por tenant (segunda barrera)
-- ---------------------------------------------------------------------
ALTER TABLE org.empresa          ENABLE ROW LEVEL SECURITY;
ALTER TABLE org.sucursal         ENABLE ROW LEVEL SECURITY;
ALTER TABLE org.unidad_operativa ENABLE ROW LEVEL SECURITY;
ALTER TABLE org.suscripcion      ENABLE ROW LEVEL SECURITY;
CREATE POLICY p_empresa  ON org.empresa          USING (tenant_id = current_setting('app.tenant_id', true)::uuid);
CREATE POLICY p_sucursal ON org.sucursal         USING (tenant_id = current_setting('app.tenant_id', true)::uuid);
CREATE POLICY p_unidad   ON org.unidad_operativa USING (tenant_id = current_setting('app.tenant_id', true)::uuid);
CREATE POLICY p_suscrip  ON org.suscripcion      USING (tenant_id = current_setting('app.tenant_id', true)::uuid);
