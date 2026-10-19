-- Prueba de sync.outbox. La ejecuta tools/migrar/test/db-sync-outbox.test.mjs sobre una base
-- temporal con db/ aplicado. Corre como superusuario y cambia a un rol sin BYPASSRLS.
-- UPDATE y DELETE se conceden al rol para que el fallo sea del trigger, no de privilegios.

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'outbox_test_app') THEN
    CREATE ROLE outbox_test_app NOLOGIN;
  END IF;
END $$;
GRANT USAGE ON SCHEMA sync TO outbox_test_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON sync.outbox TO outbox_test_app;

SET ROLE outbox_test_app;

-- Tenant A inserta y lee su fila.
SELECT set_config('app.tenant_id', 'aaaaaaaa-0000-0000-0000-000000000001', false);
INSERT INTO sync.outbox (event_id, tenant_id, aggregate_type, aggregate_id, event_type, version, payload, schema_version, occurred_at)
VALUES (gen_random_uuid(), 'aaaaaaaa-0000-0000-0000-000000000001', 'venta', gen_random_uuid(), 'venta.registrada', 1, '{}', 1, now());

DO $$ BEGIN
  IF (SELECT count(*) FROM sync.outbox) <> 1 THEN RAISE EXCEPTION 'tenant A debía ver 1 fila'; END IF;
  IF (SELECT origin FROM sync.outbox) <> 'CLOUD' THEN RAISE EXCEPTION 'origin por defecto debía ser CLOUD'; END IF;
END $$;

-- Insertar con el tenant_id de otro tenant falla por RLS.
DO $$ BEGIN
  INSERT INTO sync.outbox (event_id, tenant_id, aggregate_type, aggregate_id, event_type, version, payload, schema_version, occurred_at)
  VALUES (gen_random_uuid(), 'bbbbbbbb-0000-0000-0000-000000000002', 'venta', gen_random_uuid(), 'venta.registrada', 1, '{}', 1, now());
  RAISE EXCEPTION 'el INSERT cruzando tenants debía fallar';
EXCEPTION WHEN insufficient_privilege THEN NULL;
END $$;

-- Tenant B no ve filas de A.
SELECT set_config('app.tenant_id', 'bbbbbbbb-0000-0000-0000-000000000002', false);
DO $$ BEGIN
  IF (SELECT count(*) FROM sync.outbox) <> 0 THEN RAISE EXCEPTION 'tenant B no debía ver filas de A'; END IF;
END $$;

-- Sin tenant en el contexto ('' tras un SET LOCAL previo): no hay filas visibles y no se inserta.
SELECT set_config('app.tenant_id', '', false);
DO $$ BEGIN
  IF (SELECT count(*) FROM sync.outbox) <> 0 THEN RAISE EXCEPTION 'sin tenant no debía verse nada'; END IF;
  INSERT INTO sync.outbox (event_id, tenant_id, aggregate_type, aggregate_id, event_type, version, payload, schema_version, occurred_at)
  VALUES (gen_random_uuid(), 'aaaaaaaa-0000-0000-0000-000000000001', 'venta', gen_random_uuid(), 'venta.registrada', 1, '{}', 1, now());
  RAISE EXCEPTION 'el INSERT sin tenant debía fallar';
EXCEPTION WHEN insufficient_privilege THEN NULL;
END $$;

-- UPDATE y DELETE fallan con el error del trigger, aun cuando las filas son del propio tenant.
SELECT set_config('app.tenant_id', 'aaaaaaaa-0000-0000-0000-000000000001', false);
DO $$ BEGIN
  UPDATE sync.outbox SET origin = 'EDGE';
  RAISE EXCEPTION 'el UPDATE debía fallar';
EXCEPTION WHEN insufficient_privilege THEN
  IF SQLERRM NOT LIKE '%solo inserción%' THEN RAISE; END IF;
END $$;
DO $$ BEGIN
  DELETE FROM sync.outbox;
  RAISE EXCEPTION 'el DELETE debía fallar';
EXCEPTION WHEN insufficient_privilege THEN
  IF SQLERRM NOT LIKE '%solo inserción%' THEN RAISE; END IF;
END $$;

-- CHECK de origin y de longitudes.
DO $$ BEGIN
  INSERT INTO sync.outbox (event_id, tenant_id, aggregate_type, aggregate_id, event_type, version, origin, payload, schema_version, occurred_at)
  VALUES (gen_random_uuid(), 'aaaaaaaa-0000-0000-0000-000000000001', 'venta', gen_random_uuid(), 'venta.registrada', 1, 'OTRO', '{}', 1, now());
  RAISE EXCEPTION 'origin inválido debía fallar';
EXCEPTION WHEN check_violation THEN NULL;
END $$;
DO $$ BEGIN
  INSERT INTO sync.outbox (event_id, tenant_id, aggregate_type, aggregate_id, event_type, version, payload, schema_version, occurred_at)
  VALUES (gen_random_uuid(), 'aaaaaaaa-0000-0000-0000-000000000001', '', gen_random_uuid(), 'venta.registrada', 1, '{}', 1, now());
  RAISE EXCEPTION 'aggregate_type vacío debía fallar';
EXCEPTION WHEN check_violation THEN NULL;
END $$;

RESET ROLE;

-- anon y authenticated no tienen acceso (solo si existen: PostgreSQL plano no los trae).
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    IF has_schema_privilege('anon', 'sync', 'USAGE') OR has_schema_privilege('authenticated', 'sync', 'USAGE') THEN
      RAISE EXCEPTION 'anon/authenticated no deben tener USAGE sobre sync';
    END IF;
    IF has_table_privilege('anon', 'sync.outbox', 'SELECT') OR has_table_privilege('authenticated', 'sync.outbox', 'INSERT') THEN
      RAISE EXCEPTION 'anon/authenticated no deben tener privilegios sobre sync.outbox';
    END IF;
  END IF;
END $$;
