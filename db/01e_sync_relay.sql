-- 01e · Relay del outbox TR-EVT (spec 11). PostgreSQL 16. Reversible: rollback/01e_sync_relay.sql.
-- Lectura entre tenants por cursor con margen (TR-RN-035), idempotencia por consumidor (TR-RN-034)
-- y cola de fallidos (TR-RF-095).

-- ---------------------------------------------------------------------
-- 1. Rol lector. Sin login, dueño de las funciones de lectura: su política ve todo el outbox
--    sin dar BYPASSRLS a nadie (en Supabase no se puede crear un rol con BYPASSRLS).
-- ---------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'sync_lector') THEN
    CREATE ROLE sync_lector NOLOGIN;
  END IF;
  -- PostgreSQL 16: quien crea un rol solo recibe ADMIN sobre él, y ALTER ... OWNER TO exige poder
  -- hacer SET ROLE al dueño nuevo.
  EXECUTE format('GRANT sync_lector TO %I', current_user);
END
$$;

-- CREATE: lo exige ALTER FUNCTION ... OWNER TO sobre funciones del esquema.
GRANT USAGE, CREATE ON SCHEMA sync TO sync_lector;
GRANT SELECT ON sync.outbox TO sync_lector;

CREATE POLICY outbox_relay_lectura ON sync.outbox FOR SELECT TO sync_lector USING (true);

-- ---------------------------------------------------------------------
-- 2. Cursor del relay. Global, sin tenant y sin RLS; solo lo toca el worker.
-- ---------------------------------------------------------------------
CREATE TABLE sync.relay_cursor (
  relay          varchar(40) PRIMARY KEY,
  ultimo_seq     bigint      NOT NULL DEFAULT 0 CHECK (ultimo_seq >= 0),
  actualizado_en timestamptz NOT NULL DEFAULT now()
);

INSERT INTO sync.relay_cursor (relay) VALUES ('principal');

-- ---------------------------------------------------------------------
-- 3. Idempotencia por consumidor. Se inserta en la misma transacción que el efecto.
-- ---------------------------------------------------------------------
CREATE TABLE sync.evento_procesado (
  consumidor   varchar(40) NOT NULL CHECK (consumidor ~ '^[a-z][a-z0-9-]{2,39}$'),
  event_id     uuid        NOT NULL,
  tenant_id    uuid        NOT NULL,
  procesado_en timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (consumidor, event_id)
);

ALTER TABLE sync.evento_procesado ENABLE ROW LEVEL SECURITY;
ALTER TABLE sync.evento_procesado FORCE ROW LEVEL SECURITY;

CREATE POLICY evento_procesado_select ON sync.evento_procesado FOR SELECT
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

CREATE POLICY evento_procesado_insert ON sync.evento_procesado FOR INSERT
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

-- ---------------------------------------------------------------------
-- 4. Cola de fallidos. error lleva el mensaje truncado, nunca el payload.
-- ---------------------------------------------------------------------
CREATE TABLE sync.evento_fallido (
  id              uuid          PRIMARY KEY,
  tenant_id       uuid          NOT NULL,
  consumidor      varchar(40)   NOT NULL,
  event_id        uuid          NOT NULL,
  event_type      text          NOT NULL,
  aggregate_type  text          NOT NULL,
  aggregate_id    uuid          NOT NULL,
  error           varchar(1000) NOT NULL,
  intentos        integer       NOT NULL CHECK (intentos > 0),
  estado          varchar(12)   NOT NULL CHECK (estado IN ('FALLIDO', 'REPROCESANDO', 'PROCESADO')),
  fallido_en      timestamptz   NOT NULL DEFAULT now(),
  reprocesado_por uuid          NULL REFERENCES seg.usuario (id),
  reprocesado_en  timestamptz   NULL,
  version         bigint        NOT NULL DEFAULT 0,
  CONSTRAINT ux_fallido UNIQUE (consumidor, event_id),
  CONSTRAINT ck_fallido_reproceso CHECK ((reprocesado_por IS NULL) = (reprocesado_en IS NULL))
);

CREATE INDEX fallido_tenant_estado_ix ON sync.evento_fallido (tenant_id, estado, fallido_en DESC);

-- Sin política de DELETE: un DELETE no borra ninguna fila.
ALTER TABLE sync.evento_fallido ENABLE ROW LEVEL SECURITY;
ALTER TABLE sync.evento_fallido FORCE ROW LEVEL SECURITY;

CREATE POLICY evento_fallido_select ON sync.evento_fallido FOR SELECT
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

CREATE POLICY evento_fallido_insert ON sync.evento_fallido FOR INSERT
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

CREATE POLICY evento_fallido_update ON sync.evento_fallido FOR UPDATE
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

-- ---------------------------------------------------------------------
-- 5. Lectura entre tenants. SECURITY DEFINER con dueño sync_lector; STRICT: un NULL no devuelve filas.
-- ---------------------------------------------------------------------
CREATE FUNCTION sync.validar_lectura_relay(p_intervalo interval, p_limite integer)
RETURNS void
LANGUAGE plpgsql IMMUTABLE SET search_path = '' AS $$
BEGIN
  IF p_limite NOT BETWEEN 1 AND 1000 THEN
    RAISE EXCEPTION 'el límite debe estar entre 1 y 1000' USING ERRCODE = 'invalid_parameter_value';
  END IF;
  IF p_intervalo < interval '0' THEN
    RAISE EXCEPTION 'el margen o la ventana no pueden ser negativos' USING ERRCODE = 'invalid_parameter_value';
  END IF;
END;
$$;

-- TR-RN-035: solo filas más antiguas que el margen, para no saltar transacciones confirmadas fuera de orden.
CREATE FUNCTION sync.read_events(p_cursor bigint, p_margen interval, p_limite integer)
RETURNS SETOF sync.outbox
LANGUAGE plpgsql STABLE STRICT SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  PERFORM sync.validar_lectura_relay(p_margen, p_limite);
  RETURN QUERY
    SELECT o.* FROM sync.outbox o
     WHERE o.seq > p_cursor AND o.created_at < now() - p_margen
     ORDER BY o.seq
     LIMIT p_limite;
END;
$$;

-- Re-barrido: created_at es la hora de inicio de la transacción, así que una transacción más larga
-- que el margen confirma con un seq que el cursor ya pasó.
CREATE FUNCTION sync.read_events_ventana(p_hasta_seq bigint, p_ventana interval, p_limite integer)
RETURNS SETOF sync.outbox
LANGUAGE plpgsql STABLE STRICT SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  PERFORM sync.validar_lectura_relay(p_ventana, p_limite);
  RETURN QUERY
    SELECT o.* FROM sync.outbox o
     WHERE o.seq <= p_hasta_seq AND o.created_at >= now() - p_ventana
     ORDER BY o.seq
     LIMIT p_limite;
END;
$$;

ALTER FUNCTION sync.validar_lectura_relay(interval, integer) OWNER TO sync_lector;
ALTER FUNCTION sync.read_events(bigint, interval, integer) OWNER TO sync_lector;
ALTER FUNCTION sync.read_events_ventana(bigint, interval, integer) OWNER TO sync_lector;

REVOKE EXECUTE ON FUNCTION sync.validar_lectura_relay(interval, integer) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION sync.read_events(bigint, interval, integer) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION sync.read_events_ventana(bigint, interval, integer) FROM PUBLIC;

-- Solo el rol que corre la migración (en dev, postgres: el mismo de la api y del worker).
DO $$
BEGIN
  EXECUTE format('GRANT EXECUTE ON FUNCTION sync.read_events(bigint, interval, integer) TO %I', current_user);
  EXECUTE format('GRANT EXECUTE ON FUNCTION sync.read_events_ventana(bigint, interval, integer) TO %I', current_user);
END
$$;

-- Los esquemas de plataforma no se exponen por la Data API (regla 8). En PostgreSQL plano
-- (CI) los roles de Supabase no existen.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon')
     AND EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON ALL TABLES IN SCHEMA sync FROM anon, authenticated;
    REVOKE ALL ON ALL FUNCTIONS IN SCHEMA sync FROM anon, authenticated;
  END IF;
END
$$;
