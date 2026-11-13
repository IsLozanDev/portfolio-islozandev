-- Prueba de sync.estado_outbox (spec 21). La ejecuta tools/migrar/test/db-esquemas.test.mjs sobre la base
-- temporal con db/ aplicado. Las pruebas anteriores dejan filas: se mide la diferencia contra la base.

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'obs_test_app') THEN
    CREATE ROLE obs_test_app NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'obs_test_sin_permiso') THEN
    CREATE ROLE obs_test_sin_permiso NOLOGIN;
  END IF;
END $$;
GRANT USAGE ON SCHEMA sync TO obs_test_app, obs_test_sin_permiso;
GRANT EXECUTE ON FUNCTION sync.estado_outbox() TO obs_test_app;

-- El cursor queda en el último seq: lo anterior cuenta como leído.
UPDATE sync.relay_cursor SET ultimo_seq = (SELECT coalesce(max(seq), 0) FROM sync.outbox) WHERE relay = 'principal';
SELECT set_config('prueba.fallidos_base', (SELECT count(*)::text FROM sync.evento_fallido WHERE estado = 'FALLIDO'), false);

-- Dos pendientes de tenants distintos, el más antiguo de hace 2 minutos.
INSERT INTO sync.outbox (event_id, tenant_id, aggregate_type, aggregate_id, event_type, version, payload, schema_version, occurred_at, created_at)
VALUES
  ('e2100000-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-0000000000a1', 'cita', gen_random_uuid(), 'cita.creada', 1, '{}', 1, now(), now() - interval '2 minutes'),
  ('e2100000-0000-0000-0000-000000000002', 'bbbbbbbb-0000-0000-0000-0000000000b2', 'cita', gen_random_uuid(), 'cita.creada', 1, '{}', 1, now(), now());

-- Un fallido por tenant y uno ya procesado, que no cuenta.
INSERT INTO sync.evento_fallido (id, tenant_id, consumidor, event_id, event_type, aggregate_type, aggregate_id, error, intentos, estado)
VALUES
  (gen_random_uuid(), 'aaaaaaaa-0000-0000-0000-0000000000a1', 'obs-prueba', gen_random_uuid(), 'cita.creada', 'cita', gen_random_uuid(), 'falla', 8, 'FALLIDO'),
  (gen_random_uuid(), 'bbbbbbbb-0000-0000-0000-0000000000b2', 'obs-prueba', gen_random_uuid(), 'cita.creada', 'cita', gen_random_uuid(), 'falla', 8, 'FALLIDO'),
  (gen_random_uuid(), 'bbbbbbbb-0000-0000-0000-0000000000b2', 'obs-prueba', gen_random_uuid(), 'cita.creada', 'cita', gen_random_uuid(), 'falla', 8, 'PROCESADO');

-- Con el contexto de un solo tenant, cuenta los dos (la función agrega entre tenants).
SET ROLE obs_test_app;
SELECT set_config('app.tenant_id', 'aaaaaaaa-0000-0000-0000-0000000000a1', false);
DO $$
DECLARE
  estado record;
BEGIN
  SELECT * INTO estado FROM sync.estado_outbox();
  IF estado.pendientes <> 2 THEN
    RAISE EXCEPTION 'pendientes: se esperaban 2, hay %', estado.pendientes;
  END IF;
  IF estado.fallidos <> current_setting('prueba.fallidos_base')::bigint + 2 THEN
    RAISE EXCEPTION 'fallidos: se esperaban 2 más que la base, hay %', estado.fallidos;
  END IF;
  IF estado.edad_pendiente_seg NOT BETWEEN 119 AND 180 THEN
    RAISE EXCEPTION 'edad del pendiente más antiguo fuera de rango: %', estado.edad_pendiente_seg;
  END IF;
END $$;
RESET ROLE;

-- Con el cursor al día no hay pendientes y la edad es 0.
UPDATE sync.relay_cursor SET ultimo_seq = (SELECT max(seq) FROM sync.outbox) WHERE relay = 'principal';
DO $$
DECLARE
  estado record;
BEGIN
  SELECT * INTO estado FROM sync.estado_outbox();
  IF estado.pendientes <> 0 OR estado.edad_pendiente_seg <> 0 THEN
    RAISE EXCEPTION 'con el cursor al día: pendientes % y edad %', estado.pendientes, estado.edad_pendiente_seg;
  END IF;
END $$;

-- Un rol sin EXECUTE no puede llamarla.
SET ROLE obs_test_sin_permiso;
DO $$
BEGIN
  PERFORM * FROM sync.estado_outbox();
  RAISE EXCEPTION 'obs_test_sin_permiso no debía poder ejecutar sync.estado_outbox';
EXCEPTION WHEN insufficient_privilege THEN
  NULL;
END $$;
RESET ROLE;
