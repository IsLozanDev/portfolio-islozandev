-- 01c · Parámetros jerárquicos TR-CFG (spec 09). PostgreSQL 16. Reversible: rollback/01c_cfg.sql.
-- Definiciones globales por producto y valores por tenant, empresa o sucursal. El valor efectivo se
-- resuelve de lo más específico a lo más general (TR-RN-014) con cfg.valor.

CREATE SCHEMA cfg;

-- ---------------------------------------------------------------------
-- 1. Definiciones (globales, sin RLS como el catálogo de seg). Las escribe el CLI del manifiesto.
-- ---------------------------------------------------------------------
CREATE TABLE cfg.parametro_def (
  codigo          varchar(80)  PRIMARY KEY CHECK (char_length(codigo) >= 3),
  producto_codigo varchar(5)   NOT NULL REFERENCES seg.producto (codigo),
  descripcion     varchar(250) NOT NULL CHECK (char_length(descripcion) >= 3),
  tipo            varchar(8)   NOT NULL CHECK (tipo IN ('TEXTO', 'NUMERO', 'BOOLEANO', 'JSON')),
  valor_defecto   jsonb        NOT NULL,
  alcance_maximo  varchar(8)   NOT NULL CHECK (alcance_maximo IN ('TENANT', 'EMPRESA', 'SUCURSAL')),
  esquema         jsonb        NULL,
  obsoleto        boolean      NOT NULL DEFAULT false,
  actualizado_en  timestamptz  NOT NULL DEFAULT now()
);

-- Una fila por registro con cambios. vd = max(id): cambiar un defecto invalida la caché de todos.
CREATE TABLE cfg.definiciones_aplicadas (
  id              bigserial   PRIMARY KEY,
  producto_codigo varchar(5)  NOT NULL REFERENCES seg.producto (codigo),
  cambios         jsonb       NOT NULL,
  aplicado_en     timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------
-- 2. Valores por nivel. La sucursal no guarda empresa: se deriva de org.sucursal en cfg.valor.
-- ---------------------------------------------------------------------
CREATE TABLE cfg.parametro_valor (
  id             uuid        PRIMARY KEY,
  tenant_id      uuid        NOT NULL REFERENCES org.tenant (id),
  codigo         varchar(80) NOT NULL REFERENCES cfg.parametro_def (codigo),
  alcance        varchar(8)  NOT NULL CHECK (alcance IN ('TENANT', 'EMPRESA', 'SUCURSAL')),
  empresa_id     uuid        NULL,
  sucursal_id    uuid        NULL,
  valor          jsonb       NOT NULL,
  version        bigint      NOT NULL DEFAULT 0,
  modificado_por uuid        NOT NULL REFERENCES seg.usuario (id),
  modificado_en  timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (tenant_id, empresa_id)  REFERENCES org.empresa (tenant_id, id),
  FOREIGN KEY (tenant_id, sucursal_id) REFERENCES org.sucursal (tenant_id, id),
  CONSTRAINT ck_valor_ambito CHECK (
       (alcance = 'TENANT'   AND empresa_id IS NULL     AND sucursal_id IS NULL)
    OR (alcance = 'EMPRESA'  AND empresa_id IS NOT NULL AND sucursal_id IS NULL)
    OR (alcance = 'SUCURSAL' AND empresa_id IS NULL     AND sucursal_id IS NOT NULL)),
  CONSTRAINT ux_valor_nivel UNIQUE NULLS NOT DISTINCT (tenant_id, codigo, alcance, empresa_id, sucursal_id)
);

-- Versión de valores del tenant (TR-RNF-101). La sube el trigger; nadie la escribe a mano.
CREATE TABLE cfg.version_tenant (
  tenant_id   uuid        PRIMARY KEY REFERENCES org.tenant (id),
  version     bigint      NOT NULL DEFAULT 1,
  cambiado_en timestamptz NOT NULL DEFAULT now()
);

CREATE FUNCTION cfg.subir_version() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  fila record;
BEGIN
  IF TG_OP = 'DELETE' THEN fila := OLD; ELSE fila := NEW; END IF;
  INSERT INTO cfg.version_tenant AS v (tenant_id) VALUES (fila.tenant_id)
  ON CONFLICT (tenant_id) DO UPDATE SET version = v.version + 1, cambiado_en = now();
  RETURN NULL;
END;
$$;
REVOKE EXECUTE ON FUNCTION cfg.subir_version() FROM PUBLIC;

CREATE TRIGGER parametro_valor_version AFTER INSERT OR UPDATE OR DELETE ON cfg.parametro_valor
  FOR EACH ROW EXECUTE FUNCTION cfg.subir_version();

-- ---------------------------------------------------------------------
-- 3. Aislamiento por tenant (segunda barrera). NULLIF: app.tenant_id queda en '' tras el primer SET LOCAL.
-- ---------------------------------------------------------------------
ALTER TABLE cfg.parametro_valor ENABLE ROW LEVEL SECURITY;
ALTER TABLE cfg.parametro_valor FORCE ROW LEVEL SECURITY;
ALTER TABLE cfg.version_tenant  ENABLE ROW LEVEL SECURITY;
ALTER TABLE cfg.version_tenant  FORCE ROW LEVEL SECURITY;

CREATE POLICY parametro_valor_select ON cfg.parametro_valor FOR SELECT
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
CREATE POLICY parametro_valor_insert ON cfg.parametro_valor FOR INSERT
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
CREATE POLICY parametro_valor_update ON cfg.parametro_valor FOR UPDATE
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
CREATE POLICY parametro_valor_delete ON cfg.parametro_valor FOR DELETE
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
CREATE POLICY version_tenant_select ON cfg.version_tenant FOR SELECT
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

-- ---------------------------------------------------------------------
-- 4. Resolución. SECURITY INVOKER: corre con la RLS del llamador. Si p_tenant no es app.tenant_id,
--    no devuelve filas (primera barrera dentro de la base).
-- ---------------------------------------------------------------------
-- Orden: SUCURSAL, EMPRESA, TENANT, DEFECTO. Ignora niveles más específicos que alcance_maximo.
-- Una sucursal de otro tenant no se encuentra y se resuelve como si no se hubiera pasado.
CREATE FUNCTION cfg.valor(p_codigo varchar, p_tenant uuid, p_empresa uuid DEFAULT NULL, p_sucursal uuid DEFAULT NULL)
RETURNS TABLE (valor jsonb, origen varchar)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = '' AS $$
  WITH d AS (
    SELECT def.codigo, def.valor_defecto, def.alcance_maximo
      FROM cfg.parametro_def def
     WHERE def.codigo = p_codigo
       AND p_tenant = NULLIF(current_setting('app.tenant_id', true), '')::uuid
  ), s AS (
    SELECT su.id, su.empresa_id FROM org.sucursal su WHERE su.tenant_id = p_tenant AND su.id = p_sucursal
  ), niveles AS (
    SELECT v.valor, v.alcance::varchar AS origen,
           CASE v.alcance WHEN 'SUCURSAL' THEN 1 WHEN 'EMPRESA' THEN 2 ELSE 3 END AS orden
      FROM cfg.parametro_valor v
      JOIN d ON d.codigo = v.codigo
     WHERE v.tenant_id = p_tenant
       AND (   v.alcance = 'TENANT'
            OR (v.alcance = 'EMPRESA' AND d.alcance_maximo IN ('EMPRESA', 'SUCURSAL')
                AND v.empresa_id = COALESCE(p_empresa, (SELECT s.empresa_id FROM s)))
            OR (v.alcance = 'SUCURSAL' AND d.alcance_maximo = 'SUCURSAL'
                AND v.sucursal_id = (SELECT s.id FROM s)))
    UNION ALL
    SELECT d.valor_defecto, 'DEFECTO', 4 FROM d
  )
  SELECT n.valor, n.origen FROM niveles n ORDER BY n.orden LIMIT 1;
$$;

CREATE FUNCTION cfg.versiones(p_tenant uuid)
RETURNS TABLE (vt bigint, vd bigint)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = '' AS $$
  SELECT COALESCE((SELECT v.version FROM cfg.version_tenant v WHERE v.tenant_id = p_tenant), 0),
         COALESCE((SELECT max(d.id) FROM cfg.definiciones_aplicadas d), 0)
   WHERE p_tenant = NULLIF(current_setting('app.tenant_id', true), '')::uuid;
$$;

-- Los esquemas de plataforma no se exponen por la Data API (regla 8).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon')
     AND EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON SCHEMA cfg FROM anon, authenticated;
    REVOKE ALL ON ALL TABLES IN SCHEMA cfg FROM anon, authenticated;
    REVOKE ALL ON ALL SEQUENCES IN SCHEMA cfg FROM anon, authenticated;
    REVOKE ALL ON ALL FUNCTIONS IN SCHEMA cfg FROM anon, authenticated;
  END IF;
END
$$;
