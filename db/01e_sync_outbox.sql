-- 01e · Outbox transaccional (TR-RF-092, TR-RN-034). Reversible: rollback/01e_sync_outbox.sql.
-- El relay (spec 11) lee por seq; esta tabla solo recibe inserciones de los casos de uso.

CREATE SCHEMA sync;

CREATE TABLE sync.outbox (
  seq            bigint GENERATED ALWAYS AS IDENTITY,
  event_id       uuid        PRIMARY KEY,
  tenant_id      uuid        NOT NULL,
  sede_id        uuid,
  aggregate_type text        NOT NULL CHECK (char_length(aggregate_type) BETWEEN 1 AND 40),
  aggregate_id   uuid        NOT NULL,
  event_type     text        NOT NULL CHECK (char_length(event_type) BETWEEN 1 AND 60),
  version        bigint      NOT NULL,
  origin         text        NOT NULL DEFAULT 'CLOUD' CHECK (origin IN ('CLOUD', 'EDGE')),
  payload        jsonb       NOT NULL,
  schema_version smallint    NOT NULL,
  occurred_at    timestamptz NOT NULL,
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX outbox_seq_uq ON sync.outbox (seq);
CREATE INDEX outbox_tenant_aggregate_ix ON sync.outbox (tenant_id, aggregate_type, aggregate_id, version);

-- Sin política de UPDATE/DELETE las filas quedarían invisibles y la sentencia afectaría 0 filas
-- sin error. El trigger por sentencia hace que falle siempre, también para el dueño.
CREATE FUNCTION sync.outbox_solo_insercion() RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  RAISE EXCEPTION 'sync.outbox es de solo inserción' USING ERRCODE = 'insufficient_privilege';
END;
$$;

CREATE TRIGGER outbox_solo_insercion
  BEFORE UPDATE OR DELETE ON sync.outbox
  FOR EACH STATEMENT EXECUTE FUNCTION sync.outbox_solo_insercion();

-- app.tenant_id queda en '' (no NULL) tras el primer SET LOCAL de la conexión: NULLIF evita el error de cast.
ALTER TABLE sync.outbox ENABLE ROW LEVEL SECURITY;
ALTER TABLE sync.outbox FORCE ROW LEVEL SECURITY;

CREATE POLICY outbox_tenant_select ON sync.outbox FOR SELECT
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

CREATE POLICY outbox_tenant_insert ON sync.outbox FOR INSERT
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

-- Los esquemas de plataforma no se exponen por la Data API (regla 8). En PostgreSQL plano
-- (CI) los roles de Supabase no existen.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon')
     AND EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON SCHEMA sync FROM anon, authenticated;
    REVOKE ALL ON ALL TABLES IN SCHEMA sync FROM anon, authenticated;
    REVOKE ALL ON ALL SEQUENCES IN SCHEMA sync FROM anon, authenticated;
    REVOKE ALL ON ALL FUNCTIONS IN SCHEMA sync FROM anon, authenticated;
  END IF;
END
$$;
