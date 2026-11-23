-- 01p · Facturación electrónica TR-FE: emisor por empresa y avisos de vencimiento del certificado (spec 49).
-- PostgreSQL 16. Reversible: rollback/01p_fe.sql.
-- La credencial del proveedor, el .pfx y su clave viven cifrados en sec.secreto (spec 41): aquí solo sus ids.

CREATE SCHEMA fe;

-- ---------------------------------------------------------------------
-- 1. Emisor: uno por empresa. El CHECK de estado ya admite VERIFICADO y PRODUCCION (spec 50).
--    version es el bloqueo optimista.
-- ---------------------------------------------------------------------
CREATE TABLE fe.emisor (
  id                            uuid PRIMARY KEY,
  tenant_id                     uuid NOT NULL,
  empresa_id                    uuid NOT NULL,
  proveedor                     varchar(40) NOT NULL,
  ambiente                      varchar(10) NOT NULL DEFAULT 'BETA' CHECK (ambiente IN ('BETA','PRODUCCION')),
  estado                        varchar(12) NOT NULL DEFAULT 'BORRADOR'
                                  CHECK (estado IN ('BORRADOR','CONFIGURADO','VERIFICADO','PRODUCCION')),
  regimen_igv                   varchar(24) NOT NULL DEFAULT 'GENERAL' CHECK (regimen_igv IN ('GENERAL','REDUCIDO_RESTAURANTES')),
  leyenda_pie                   varchar(300),
  usuario_proveedor             varchar(100),
  secreto_credencial_id         uuid,
  secreto_certificado_id        uuid,
  secreto_clave_certificado_id  uuid,
  certificado_ruc               char(11) CHECK (certificado_ruc ~ '^(10|15|17|20)\d{9}$'),
  certificado_vence_en          timestamptz,
  certificado_huella_sha256     char(64) CHECK (certificado_huella_sha256 ~ '^[0-9a-f]{64}$'),
  version                       integer NOT NULL DEFAULT 1 CHECK (version >= 1),
  creado_por                    uuid NOT NULL,
  creado_en                     timestamptz NOT NULL DEFAULT now(),
  modificado_por                uuid,
  modificado_en                 timestamptz,
  CONSTRAINT uq_emisor_empresa UNIQUE (tenant_id, empresa_id),
  -- org.empresa ya tiene UNIQUE (tenant_id, id): la FK no cruza tenants.
  CONSTRAINT fk_emisor_empresa FOREIGN KEY (tenant_id, empresa_id) REFERENCES org.empresa (tenant_id, id),
  CONSTRAINT ck_emisor_certificado CHECK ((secreto_certificado_id IS NULL) = (certificado_huella_sha256 IS NULL)),
  -- El certificado llega completo: su clave, su RUC y su vencimiento van juntos con la huella.
  CONSTRAINT ck_emisor_certificado_completo CHECK (
    (certificado_huella_sha256 IS NULL) = (secreto_clave_certificado_id IS NULL)
    AND (certificado_huella_sha256 IS NULL) = (certificado_ruc IS NULL)
    AND (certificado_huella_sha256 IS NULL) = (certificado_vence_en IS NULL))
);
CREATE INDEX ix_emisor_certificado_vence ON fe.emisor (certificado_vence_en) WHERE certificado_vence_en IS NOT NULL;

-- ---------------------------------------------------------------------
-- 2. Un aviso de vencimiento por certificado (huella): la tarea diaria no repite el aviso y un certificado
--    nuevo vuelve a avisar.
-- ---------------------------------------------------------------------
CREATE TABLE fe.aviso_certificado (
  id                 uuid PRIMARY KEY,
  tenant_id          uuid NOT NULL,
  emisor_id          uuid NOT NULL REFERENCES fe.emisor (id),
  huella_sha256      char(64) NOT NULL,
  dias_antes         smallint NOT NULL CHECK (dias_antes BETWEEN 1 AND 90),
  vence_en           timestamptz NOT NULL,
  fecha_ejecucion    date NOT NULL,
  registrado_en      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_aviso_certificado UNIQUE (emisor_id, huella_sha256)
);

-- ---------------------------------------------------------------------
-- 3. RLS. app.tenant_id queda en '' tras el primer SET LOCAL de la conexión: NULLIF evita el error de cast.
--    El emisor no se borra en este spec y el aviso es histórico: sin DELETE.
-- ---------------------------------------------------------------------
ALTER TABLE fe.emisor            ENABLE ROW LEVEL SECURITY;
ALTER TABLE fe.emisor            FORCE ROW LEVEL SECURITY;
ALTER TABLE fe.aviso_certificado ENABLE ROW LEVEL SECURITY;
ALTER TABLE fe.aviso_certificado FORCE ROW LEVEL SECURITY;

CREATE POLICY emisor_select ON fe.emisor FOR SELECT
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
CREATE POLICY emisor_insert ON fe.emisor FOR INSERT
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
CREATE POLICY emisor_update ON fe.emisor FOR UPDATE
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

CREATE POLICY aviso_certificado_select ON fe.aviso_certificado FOR SELECT
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
CREATE POLICY aviso_certificado_insert ON fe.aviso_certificado FOR INSERT
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

-- ---------------------------------------------------------------------
-- 4. Lectura entre tenants para la tarea diaria. Dueño org_lector (spec 12), como
--    arc.versiones_pendientes_vencidas (spec 35): sin login ni BYPASSRLS, con políticas de lectura propias.
--    Solo ids; el aviso se registra con la RLS de cada tenant.
--    p_despues: cursor por id del emisor, para recorrer en lotes aunque haya pendientes que aún no tocan aviso.
-- ---------------------------------------------------------------------
DO $$
BEGIN
  EXECUTE format('GRANT org_lector TO %I', current_user);
END
$$;
-- CREATE: lo exige ALTER FUNCTION ... OWNER TO sobre funciones del esquema.
GRANT USAGE, CREATE ON SCHEMA fe TO org_lector;
GRANT SELECT ON fe.emisor, fe.aviso_certificado TO org_lector;
CREATE POLICY emisor_lector ON fe.emisor FOR SELECT TO org_lector USING (true);
CREATE POLICY aviso_certificado_lector ON fe.aviso_certificado FOR SELECT TO org_lector USING (true);

CREATE FUNCTION fe.certificados_con_aviso_pendiente(p_hasta timestamptz, p_despues uuid, p_limite integer)
RETURNS TABLE (tenant_id uuid, emisor_id uuid)
LANGUAGE sql STABLE STRICT SECURITY DEFINER SET search_path = '' AS $$
  SELECT e.tenant_id, e.id
    FROM fe.emisor e
   WHERE e.certificado_vence_en IS NOT NULL
     AND e.certificado_vence_en < p_hasta
     AND e.id > p_despues
     AND NOT EXISTS (
       SELECT 1 FROM fe.aviso_certificado a
        WHERE a.emisor_id = e.id AND a.huella_sha256 = e.certificado_huella_sha256)
   ORDER BY e.id
   LIMIT p_limite;
$$;

ALTER FUNCTION fe.certificados_con_aviso_pendiente(timestamptz, uuid, integer) OWNER TO org_lector;
REVOKE EXECUTE ON FUNCTION fe.certificados_con_aviso_pendiente(timestamptz, uuid, integer) FROM PUBLIC;

-- ---------------------------------------------------------------------
-- 5. Privilegios. El rol de la aplicación es el que corre la migración (en dev, postgres: el mismo
--    de la api y del worker).
-- ---------------------------------------------------------------------
REVOKE ALL ON SCHEMA fe FROM PUBLIC;
REVOKE ALL ON ALL TABLES IN SCHEMA fe FROM PUBLIC;

DO $$
BEGIN
  EXECUTE format('GRANT USAGE ON SCHEMA fe TO %I', current_user);
  EXECUTE format('GRANT SELECT, INSERT, UPDATE ON fe.emisor TO %I', current_user);
  EXECUTE format('REVOKE DELETE, TRUNCATE ON fe.emisor FROM %I', current_user);
  EXECUTE format('GRANT SELECT, INSERT ON fe.aviso_certificado TO %I', current_user);
  EXECUTE format('REVOKE UPDATE, DELETE, TRUNCATE ON fe.aviso_certificado FROM %I', current_user);
  EXECUTE format('GRANT EXECUTE ON FUNCTION fe.certificados_con_aviso_pendiente(timestamptz, uuid, integer) TO %I', current_user);
END
$$;

-- Los esquemas de plataforma no se exponen por la Data API (regla 8). En PostgreSQL plano
-- (CI) los roles de Supabase no existen.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon')
     AND EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON SCHEMA fe FROM anon, authenticated;
    REVOKE ALL ON ALL TABLES IN SCHEMA fe FROM anon, authenticated;
    REVOKE ALL ON FUNCTION fe.certificados_con_aviso_pendiente(timestamptz, uuid, integer) FROM anon, authenticated;
  END IF;
END
$$;

-- ---------------------------------------------------------------------
-- 6. Catálogo GLOBAL de proveedores PSE/OSE. Solo el simulador: el PSE real llega con su adaptador (spec 50).
--    El trigger sube la versión al insertar el ítem; queda en 1, como en 01f_cat.sql.
-- ---------------------------------------------------------------------
INSERT INTO cat.catalogo (id, codigo, nombre, alcance, fuente, editable_por_tenant) VALUES
  ('ca700000-0000-0000-0000-000000000020', 'PROVEEDOR_FE', 'Proveedores de facturación electrónica', 'GLOBAL', 'Plataforma', false);

INSERT INTO cat.catalogo_item (id, catalogo_id, codigo, nombre, orden, atributos, vigente_desde) VALUES
  ('ca700000-0000-0000-0020-000000000001', 'ca700000-0000-0000-0000-000000000020', 'SIMULADO', 'Simulador (solo dev y CI)', 1,
   '{"requiere_certificado": true, "soporta_resumen": true, "url_beta": null}', '2026-01-01');

UPDATE cat.catalogo SET version = 1 WHERE id = 'ca700000-0000-0000-0000-000000000020';
