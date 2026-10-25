-- 01d · Correlativos TR-SEQ (spec 10). PostgreSQL 16. Reversible: rollback/01d_seq.sql.
-- Series por empresa, sucursal o unidad, y numeración atómica sin duplicados ni huecos (TR-RN-016)
-- con reinicio NUNCA, ANUAL o DIARIO en la zona horaria de la sucursal.

CREATE SCHEMA seq;

-- ---------------------------------------------------------------------
-- 1. Series. ultimo_numero es el último emitido; el siguiente es ultimo_numero + 1.
-- ---------------------------------------------------------------------
CREATE TABLE seq.serie (
  id             uuid        PRIMARY KEY,
  tenant_id      uuid        NOT NULL REFERENCES org.tenant (id),
  empresa_id     uuid        NOT NULL,
  sucursal_id    uuid        NULL,
  unidad_id      uuid        NULL,
  tipo           varchar(12) NOT NULL CHECK (tipo IN ('BOLETA', 'FACTURA', 'NOTA_CREDITO', 'NOTA_DEBITO',
                                                      'TICKET', 'KARDEX', 'EXPEDIENTE', 'HC', 'ESCRITURA')),
  serie          varchar(10) NOT NULL CHECK (serie ~ '^[A-Z0-9]{1,10}$'),
  digitos        smallint    NOT NULL CHECK (digitos BETWEEN 1 AND 10),
  reinicio       varchar(7)  NOT NULL CHECK (reinicio IN ('NUNCA', 'ANUAL', 'DIARIO')),
  ultimo_numero  bigint      NOT NULL CHECK (ultimo_numero >= 0),
  periodo        varchar(10) NULL,
  activa         boolean     NOT NULL DEFAULT true,
  version        bigint      NOT NULL DEFAULT 0,
  creado_por     uuid        NOT NULL REFERENCES seg.usuario (id),
  creado_en      timestamptz NOT NULL DEFAULT now(),
  modificado_por uuid        NOT NULL REFERENCES seg.usuario (id),
  modificado_en  timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (tenant_id, empresa_id)  REFERENCES org.empresa (tenant_id, id),
  FOREIGN KEY (tenant_id, sucursal_id) REFERENCES org.sucursal (tenant_id, id),
  FOREIGN KEY (tenant_id, unidad_id)   REFERENCES org.unidad_operativa (tenant_id, id),
  CONSTRAINT ux_serie UNIQUE (tenant_id, empresa_id, tipo, serie),
  -- numeric y no bigint: 10 ^ digitos exacto, sin pasar por double precision.
  CONSTRAINT ck_serie_agotada CHECK (ultimo_numero < 10::numeric ^ digitos),
  CONSTRAINT ck_serie_periodo CHECK ((reinicio = 'NUNCA') = (periodo IS NULL)),
  -- TR-RN-017. Defensa ante inserciones que no pasan por el dominio (siembra, migración de SazónPOS).
  CONSTRAINT ck_serie_sunat CHECK (
       (tipo = 'FACTURA' AND serie ~ '^F[A-Z0-9]{3}$')
    OR (tipo = 'BOLETA'  AND serie ~ '^B[A-Z0-9]{3}$')
    OR (tipo IN ('NOTA_CREDITO', 'NOTA_DEBITO') AND serie ~ '^[FB][A-Z0-9]{3}$')
    OR tipo NOT IN ('FACTURA', 'BOLETA', 'NOTA_CREDITO', 'NOTA_DEBITO')),
  CONSTRAINT ck_serie_sunat_ambito CHECK (
    tipo NOT IN ('FACTURA', 'BOLETA', 'NOTA_CREDITO', 'NOTA_DEBITO') OR (sucursal_id IS NOT NULL AND digitos = 8))
);

-- ---------------------------------------------------------------------
-- 2. Periodo. Una sola implementación, usada al crear y al numerar.
-- ---------------------------------------------------------------------
CREATE FUNCTION seq.periodo_de(p_reinicio varchar, p_zona varchar, p_instante timestamptz)
RETURNS varchar
LANGUAGE sql IMMUTABLE SET search_path = '' AS $$
  SELECT CASE p_reinicio
           WHEN 'ANUAL'  THEN to_char(p_instante AT TIME ZONE p_zona, 'YYYY')
           WHEN 'DIARIO' THEN to_char(p_instante AT TIME ZONE p_zona, 'YYYY-MM-DD')
         END;
$$;

-- Sin sucursal (serie de empresa o de un almacén sin sucursal) la zona es la de Lima.
CREATE FUNCTION seq.zona_de(p_sucursal uuid)
RETURNS varchar
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = '' AS $$
  SELECT COALESCE((SELECT su.zona_horaria FROM org.sucursal su WHERE su.id = p_sucursal), 'America/Lima');
$$;

-- Una serie migrada con último 342 hoy no reinicia en su primer número del mismo día.
CREATE FUNCTION seq.fijar_periodo_inicial() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
BEGIN
  NEW.periodo := seq.periodo_de(NEW.reinicio, seq.zona_de(NEW.sucursal_id), NEW.creado_en);
  RETURN NEW;
END;
$$;

CREATE TRIGGER serie_periodo_inicial BEFORE INSERT ON seq.serie
  FOR EACH ROW EXECUTE FUNCTION seq.fijar_periodo_inicial();

-- ---------------------------------------------------------------------
-- 3. Aislamiento por tenant (segunda barrera). Sin política de DELETE: las series no se borran.
-- ---------------------------------------------------------------------
ALTER TABLE seq.serie ENABLE ROW LEVEL SECURITY;
ALTER TABLE seq.serie FORCE ROW LEVEL SECURITY;

CREATE POLICY serie_select ON seq.serie FOR SELECT
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
CREATE POLICY serie_insert ON seq.serie FOR INSERT
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
CREATE POLICY serie_update ON seq.serie FOR UPDATE
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

-- ---------------------------------------------------------------------
-- 4. Numeración. Un solo UPDATE: el bloqueo de fila serializa a los emisores hasta el commit, y bajo
--    READ COMMITTED el SET se reevalúa sobre la versión ya commiteada, así que dos pedidos en el
--    cambio de periodo no reinician dos veces. Si la transacción del llamador se revierte, el número
--    no se consume. Nunca una SEQUENCE: se consume al revertir y deja huecos.
--    Inexistente, inactiva o de otro tenant: 0 filas. No toca version (bloqueo optimista de la administración).
-- ---------------------------------------------------------------------
CREATE FUNCTION seq.siguiente(p_tenant uuid, p_empresa uuid, p_tipo varchar, p_serie varchar,
                              p_instante timestamptz DEFAULT now())
RETURNS TABLE (serie varchar, numero bigint, digitos smallint)
LANGUAGE sql VOLATILE SECURITY INVOKER SET search_path = '' AS $$
  UPDATE seq.serie s
     SET ultimo_numero = CASE
                           WHEN s.periodo IS DISTINCT FROM seq.periodo_de(s.reinicio, seq.zona_de(s.sucursal_id), p_instante)
                           THEN 1
                           ELSE s.ultimo_numero + 1
                         END,
         periodo = seq.periodo_de(s.reinicio, seq.zona_de(s.sucursal_id), p_instante)
   WHERE s.tenant_id = p_tenant
     AND p_tenant = NULLIF(current_setting('app.tenant_id', true), '')::uuid
     AND s.empresa_id = p_empresa
     AND s.tipo = p_tipo
     AND s.serie = p_serie
     AND s.activa
  RETURNING s.serie, s.ultimo_numero, s.digitos;
$$;

-- Los esquemas de plataforma no se exponen por la Data API (regla 8).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon')
     AND EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON SCHEMA seq FROM anon, authenticated;
    REVOKE ALL ON ALL TABLES IN SCHEMA seq FROM anon, authenticated;
    REVOKE ALL ON ALL FUNCTIONS IN SCHEMA seq FROM anon, authenticated;
  END IF;
END
$$;
