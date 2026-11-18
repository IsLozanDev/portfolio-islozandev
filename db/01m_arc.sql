-- 01m · Archivos TR-ARC (spec 33). PostgreSQL 16. Reversible: rollback/01m_arc.sql.
-- Metadatos de los archivos del tenant. Los bytes viven en el bucket privado de Supabase Storage
-- (supabase/migrations/20261118000000_arc_storage.sql), en la ruta {tenant_id}/{archivo_id}/{numero}.

CREATE SCHEMA arc;

-- ---------------------------------------------------------------------
-- 1. Categorías. Sembradas y de solo lectura: el producto no crea categorías.
-- ---------------------------------------------------------------------
CREATE TABLE arc.categoria (
  codigo            varchar(20) PRIMARY KEY,
  mimes_permitidos  text[]  NOT NULL,
  tamano_max_bytes  bigint  NOT NULL CHECK (tamano_max_bytes > 0),
  sensible          boolean NOT NULL
);

INSERT INTO arc.categoria (codigo, mimes_permitidos, tamano_max_bytes, sensible) VALUES
  ('IMAGEN', ARRAY['image/jpeg', 'image/png', 'image/webp'], 10485760, false),
  ('DOCUMENTO', ARRAY['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'image/jpeg'], 26214400, true),
  ('CPE_XML', ARRAY['application/xml', 'application/zip'], 26214400, false),
  ('EVIDENCIA', ARRAY['application/pdf', 'image/jpeg', 'image/png'], 26214400, true),
  ('ADJUNTO_SOPORTE', ARRAY['application/pdf', 'image/jpeg', 'image/png', 'text/plain'], 26214400, false);

-- ---------------------------------------------------------------------
-- 2. Archivo y sus versiones. El estado vive solo en el archivo. hash, bytes y mime_real los llena
--    el análisis del worker. uq_version_hash nace aquí para el spec 35 (TR-CA-203).
-- ---------------------------------------------------------------------
CREATE TABLE arc.archivo (
  id               uuid PRIMARY KEY,
  tenant_id        uuid NOT NULL,
  categoria        varchar(20)  NOT NULL REFERENCES arc.categoria(codigo),
  entidad_tipo     varchar(40)  NOT NULL CHECK (entidad_tipo ~ '^[A-Z][A-Z0-9_]{1,39}$'),
  entidad_id       varchar(80)  NOT NULL,
  nombre_original  varchar(255) NOT NULL CHECK (length(nombre_original) >= 1),
  estado           varchar(16)  NOT NULL CHECK (estado IN ('PENDIENTE_CARGA','EN_ANALISIS','DISPONIBLE','CUARENTENA','RECHAZADO')),
  motivo_rechazo   varchar(20)  CHECK (motivo_rechazo IN ('TIPO_NO_PERMITIDO','TAMANO_NO_COINCIDE')),
  version_vigente  integer,
  version          integer NOT NULL DEFAULT 1,
  creado_por       uuid NOT NULL,
  creado_en        timestamptz NOT NULL DEFAULT now(),
  actualizado_en   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ck_archivo_disponible CHECK ((estado = 'DISPONIBLE') = (version_vigente IS NOT NULL)),
  CONSTRAINT ck_archivo_rechazo CHECK ((estado = 'RECHAZADO') = (motivo_rechazo IS NOT NULL))
);
CREATE INDEX ix_archivo_entidad ON arc.archivo (tenant_id, entidad_tipo, entidad_id);
CREATE INDEX ix_archivo_pendiente ON arc.archivo (creado_en) WHERE estado = 'PENDIENTE_CARGA';

CREATE TABLE arc.version_archivo (
  archivo_id        uuid    NOT NULL REFERENCES arc.archivo(id) ON DELETE CASCADE,
  numero            integer NOT NULL CHECK (numero >= 1),
  tenant_id         uuid    NOT NULL,
  ruta_storage      varchar(120) NOT NULL UNIQUE,
  mime_declarado    varchar(100) NOT NULL,
  bytes_declarados  bigint  NOT NULL CHECK (bytes_declarados > 0),
  hash_sha256       char(64) CHECK (hash_sha256 ~ '^[0-9a-f]{64}$'),
  bytes             bigint,
  mime_real         varchar(100),
  subido_por        uuid NOT NULL,
  subido_en         timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (archivo_id, numero),
  CONSTRAINT uq_version_hash UNIQUE (archivo_id, hash_sha256)
);

-- ---------------------------------------------------------------------
-- 3. RLS. app.tenant_id queda en '' tras el primer SET LOCAL de la conexión: NULLIF evita el error de cast.
--    arc.categoria no lleva tenant ni RLS. El DELETE lo usa solo la limpieza de cargas huérfanas.
-- ---------------------------------------------------------------------
ALTER TABLE arc.archivo         ENABLE ROW LEVEL SECURITY;
ALTER TABLE arc.archivo         FORCE ROW LEVEL SECURITY;
ALTER TABLE arc.version_archivo ENABLE ROW LEVEL SECURITY;
ALTER TABLE arc.version_archivo FORCE ROW LEVEL SECURITY;

CREATE POLICY archivo_select ON arc.archivo FOR SELECT
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
CREATE POLICY archivo_insert ON arc.archivo FOR INSERT
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
CREATE POLICY archivo_update ON arc.archivo FOR UPDATE
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
CREATE POLICY archivo_delete ON arc.archivo FOR DELETE
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

CREATE POLICY version_archivo_select ON arc.version_archivo FOR SELECT
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
CREATE POLICY version_archivo_insert ON arc.version_archivo FOR INSERT
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
CREATE POLICY version_archivo_update ON arc.version_archivo FOR UPDATE
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
CREATE POLICY version_archivo_delete ON arc.version_archivo FOR DELETE
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

-- ---------------------------------------------------------------------
-- 4. Lectura entre tenants para la limpieza diaria. Dueño org_lector (spec 12): sin login ni
--    BYPASSRLS, con una política de lectura propia. Solo ids; el borrado va con la RLS de cada tenant.
-- ---------------------------------------------------------------------
DO $$
BEGIN
  EXECUTE format('GRANT org_lector TO %I', current_user);
END
$$;
-- CREATE: lo exige ALTER FUNCTION ... OWNER TO sobre funciones del esquema.
GRANT USAGE, CREATE ON SCHEMA arc TO org_lector;
GRANT SELECT ON arc.archivo TO org_lector;
CREATE POLICY archivo_lector ON arc.archivo FOR SELECT TO org_lector USING (true);

CREATE FUNCTION arc.cargas_pendientes_vencidas(p_antes timestamptz, p_limite integer)
RETURNS TABLE (tenant_id uuid, archivo_id uuid)
LANGUAGE sql STABLE STRICT SECURITY DEFINER SET search_path = '' AS $$
  SELECT a.tenant_id, a.id
    FROM arc.archivo a
   WHERE a.estado = 'PENDIENTE_CARGA' AND a.creado_en < p_antes
   ORDER BY a.creado_en, a.id
   LIMIT p_limite;
$$;

ALTER FUNCTION arc.cargas_pendientes_vencidas(timestamptz, integer) OWNER TO org_lector;
REVOKE EXECUTE ON FUNCTION arc.cargas_pendientes_vencidas(timestamptz, integer) FROM PUBLIC;

-- ---------------------------------------------------------------------
-- 5. Privilegios. El rol de la aplicación es el que corre la migración (en dev, postgres: el mismo
--    de la api y del worker).
-- ---------------------------------------------------------------------
REVOKE ALL ON SCHEMA arc FROM PUBLIC;
REVOKE ALL ON ALL TABLES IN SCHEMA arc FROM PUBLIC;

DO $$
BEGIN
  EXECUTE format('GRANT USAGE ON SCHEMA arc TO %I', current_user);
  EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON arc.archivo, arc.version_archivo TO %I', current_user);
  EXECUTE format('REVOKE TRUNCATE ON arc.archivo, arc.version_archivo FROM %I', current_user);
  EXECUTE format('GRANT SELECT ON arc.categoria TO %I', current_user);
  EXECUTE format('REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON arc.categoria FROM %I', current_user);
  EXECUTE format('GRANT EXECUTE ON FUNCTION arc.cargas_pendientes_vencidas(timestamptz, integer) TO %I', current_user);
END
$$;

-- Los esquemas de plataforma no se exponen por la Data API (regla 8). En PostgreSQL plano
-- (CI) los roles de Supabase no existen.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon')
     AND EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON SCHEMA arc FROM anon, authenticated;
    REVOKE ALL ON ALL TABLES IN SCHEMA arc FROM anon, authenticated;
    REVOKE ALL ON FUNCTION arc.cargas_pendientes_vencidas(timestamptz, integer) FROM anon, authenticated;
  END IF;
END
$$;
