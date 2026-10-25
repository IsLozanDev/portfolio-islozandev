-- Prueba del relay (spec 11). La ejecuta tools/migrar/test/db-esquemas.test.mjs sobre una base
-- temporal con db/ aplicado. Corre como superusuario y cambia a roles sin BYPASSRLS.
-- DELETE se concede al rol para que el resultado sea de la RLS, no de privilegios.

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'sync_test_app') THEN
    CREATE ROLE sync_test_app NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'sync_test_sin_permiso') THEN
    CREATE ROLE sync_test_sin_permiso NOLOGIN;
  END IF;
END $$;
GRANT USAGE ON SCHEMA sync TO sync_test_app, sync_test_sin_permiso;
GRANT SELECT ON sync.outbox TO sync_test_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON sync.evento_procesado, sync.evento_fallido TO sync_test_app;
GRANT EXECUTE ON FUNCTION sync.read_events(bigint, interval, integer),
                          sync.read_events_ventana(bigint, interval, integer) TO sync_test_app;

-- Datos como superusuario. La prueba del outbox ya dejó filas: se cuenta solo lo que pasa de base.
-- e1 (A) hace una hora, fuera de la ventana; e2 (B) hace un minuto; e3 (A) ahora, dentro del margen.
SELECT set_config('prueba.base', (SELECT coalesce(max(seq), 0)::text FROM sync.outbox), false);
INSERT INTO sync.outbox (event_id, tenant_id, aggregate_type, aggregate_id, event_type, version, payload, schema_version, occurred_at, created_at)
VALUES
  ('e1000000-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 'cita', gen_random_uuid(), 'cita.creada', 1, '{}', 1, now(), now() - interval '1 hour'),
  ('e1000000-0000-0000-0000-000000000002', 'bbbbbbbb-0000-0000-0000-000000000002', 'cita', gen_random_uuid(), 'cita.creada', 1, '{}', 1, now(), now() - interval '1 minute'),
  ('e1000000-0000-0000-0000-000000000003', 'aaaaaaaa-0000-0000-0000-000000000001', 'cita', gen_random_uuid(), 'cita.creada', 1, '{}', 1, now(), now());
SELECT set_config('prueba.seq_e1', (SELECT seq::text FROM sync.outbox WHERE event_id = 'e1000000-0000-0000-0000-000000000001'), false);
SELECT set_config('prueba.seq_e2', (SELECT seq::text FROM sync.outbox WHERE event_id = 'e1000000-0000-0000-0000-000000000002'), false);

-- Un usuario para reprocesado_por (FK a seg.usuario).
INSERT INTO seg.usuario (id, email, nombre, tipo, estado)
VALUES ('e1000000-0000-0000-0000-0000000000a1', 'relay@prueba.test', 'Relay Prueba', 'INTERNO', 'ACTIVO');

SET ROLE sync_test_app;
SELECT set_config('app.tenant_id', 'aaaaaaaa-0000-0000-0000-000000000001', false);

-- read_events lee los dos tenants y excluye la fila dentro del margen.
DO $$
DECLARE
  base bigint := current_setting('prueba.base')::bigint;
  ids uuid[];
BEGIN
  SELECT array_agg(event_id ORDER BY seq) INTO ids FROM sync.read_events(base, interval '2 seconds', 100);
  IF ids IS DISTINCT FROM ARRAY['e1000000-0000-0000-0000-000000000001', 'e1000000-0000-0000-0000-000000000002']::uuid[] THEN
    RAISE EXCEPTION 'read_events debía devolver e1 (A) y e2 (B), sin e3: %', ids;
  END IF;
  IF EXISTS (SELECT 1 FROM sync.read_events(base, interval '2 hours', 100)) THEN
    RAISE EXCEPTION 'con margen de 2 h no debía devolver filas';
  END IF;
END $$;

-- Cursor y límite.
DO $$
DECLARE
  base bigint := current_setting('prueba.base')::bigint;
  seq_e1 bigint := current_setting('prueba.seq_e1')::bigint;
  ids uuid[];
BEGIN
  SELECT array_agg(event_id ORDER BY seq) INTO ids FROM sync.read_events(seq_e1, interval '2 seconds', 100);
  IF ids IS DISTINCT FROM ARRAY['e1000000-0000-0000-0000-000000000002']::uuid[] THEN
    RAISE EXCEPTION 'desde el cursor de e1 solo debía devolver e2: %', ids;
  END IF;
  SELECT array_agg(event_id ORDER BY seq) INTO ids FROM sync.read_events(base, interval '2 seconds', 1);
  IF ids IS DISTINCT FROM ARRAY['e1000000-0000-0000-0000-000000000001']::uuid[] THEN
    RAISE EXCEPTION 'con límite 1 solo debía devolver e1: %', ids;
  END IF;
END $$;

-- read_events_ventana: hasta el seq dado y dentro de la ventana.
DO $$
DECLARE
  base bigint := current_setting('prueba.base')::bigint;
  seq_e2 bigint := current_setting('prueba.seq_e2')::bigint;
  ids uuid[];
BEGIN
  SELECT array_agg(event_id ORDER BY seq) INTO ids
    FROM sync.read_events_ventana(seq_e2, interval '5 minutes', 100) WHERE seq > base;
  IF ids IS DISTINCT FROM ARRAY['e1000000-0000-0000-0000-000000000002']::uuid[] THEN
    RAISE EXCEPTION 'la ventana debía devolver solo e2 (e1 es viejo, e3 pasa del seq): %', ids;
  END IF;
END $$;

-- Límites inválidos.
DO $$ BEGIN
  PERFORM * FROM sync.read_events(0, interval '2 seconds', 0);
  RAISE EXCEPTION 'límite 0 debía fallar';
EXCEPTION WHEN invalid_parameter_value THEN NULL;
END $$;
DO $$ BEGIN
  PERFORM * FROM sync.read_events(0, interval '2 seconds', 1001);
  RAISE EXCEPTION 'límite 1001 debía fallar';
EXCEPTION WHEN invalid_parameter_value THEN NULL;
END $$;
DO $$ BEGIN
  PERFORM * FROM sync.read_events(0, interval '-1 second', 10);
  RAISE EXCEPTION 'margen negativo debía fallar';
EXCEPTION WHEN invalid_parameter_value THEN NULL;
END $$;
DO $$ BEGIN
  PERFORM * FROM sync.read_events_ventana(0, interval '-1 second', 10);
  RAISE EXCEPTION 'ventana negativa debía fallar';
EXCEPTION WHEN invalid_parameter_value THEN NULL;
END $$;

-- El SELECT directo sobre el outbox sigue aislado por tenant.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM sync.outbox WHERE tenant_id <> 'aaaaaaaa-0000-0000-0000-000000000001') THEN
    RAISE EXCEPTION 'el SELECT directo no debía ver filas de otro tenant';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM sync.outbox WHERE event_id = 'e1000000-0000-0000-0000-000000000001') THEN
    RAISE EXCEPTION 'el SELECT directo debía ver las filas propias';
  END IF;
END $$;

-- evento_procesado: aislado por tenant, nombre de consumidor válido y sin duplicados.
INSERT INTO sync.evento_procesado (consumidor, event_id, tenant_id)
VALUES ('prueba-a', 'e1000000-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001');
DO $$ BEGIN
  INSERT INTO sync.evento_procesado (consumidor, event_id, tenant_id)
  VALUES ('prueba-a', 'e1000000-0000-0000-0000-000000000002', 'bbbbbbbb-0000-0000-0000-000000000002');
  RAISE EXCEPTION 'insertar procesado con otro tenant debía fallar';
EXCEPTION WHEN insufficient_privilege THEN NULL;
END $$;
DO $$ BEGIN
  INSERT INTO sync.evento_procesado (consumidor, event_id, tenant_id)
  VALUES ('prueba-a', 'e1000000-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001');
  RAISE EXCEPTION 'el procesado duplicado debía fallar';
EXCEPTION WHEN unique_violation THEN NULL;
END $$;
DO $$ BEGIN
  INSERT INTO sync.evento_procesado (consumidor, event_id, tenant_id)
  VALUES ('Prueba_A', gen_random_uuid(), 'aaaaaaaa-0000-0000-0000-000000000001');
  RAISE EXCEPTION 'un consumidor con formato inválido debía fallar';
EXCEPTION WHEN check_violation THEN NULL;
END $$;

-- evento_fallido: alta propia, CHECK y unicidad.
INSERT INTO sync.evento_fallido (id, tenant_id, consumidor, event_id, event_type, aggregate_type, aggregate_id, error, intentos, estado)
VALUES ('e1000000-0000-0000-0000-0000000000f1', 'aaaaaaaa-0000-0000-0000-000000000001', 'prueba-a',
        'e1000000-0000-0000-0000-000000000003', 'cita.creada', 'cita', gen_random_uuid(), 'boom', 8, 'FALLIDO');
DO $$ BEGIN
  INSERT INTO sync.evento_fallido (id, tenant_id, consumidor, event_id, event_type, aggregate_type, aggregate_id, error, intentos, estado)
  VALUES (gen_random_uuid(), 'aaaaaaaa-0000-0000-0000-000000000001', 'prueba-a',
          'e1000000-0000-0000-0000-000000000003', 'cita.creada', 'cita', gen_random_uuid(), 'boom', 1, 'FALLIDO');
  RAISE EXCEPTION 'ux_fallido debía impedir el duplicado';
EXCEPTION WHEN unique_violation THEN NULL;
END $$;
DO $$ BEGIN
  UPDATE sync.evento_fallido SET reprocesado_en = now() WHERE id = 'e1000000-0000-0000-0000-0000000000f1';
  RAISE EXCEPTION 'reprocesado_en sin reprocesado_por debía fallar';
EXCEPTION WHEN check_violation THEN NULL;
END $$;
DO $$ BEGIN
  UPDATE sync.evento_fallido SET estado = 'OTRO' WHERE id = 'e1000000-0000-0000-0000-0000000000f1';
  RAISE EXCEPTION 'un estado inválido debía fallar';
EXCEPTION WHEN check_violation THEN NULL;
END $$;
UPDATE sync.evento_fallido
   SET estado = 'REPROCESANDO', reprocesado_por = 'e1000000-0000-0000-0000-0000000000a1', reprocesado_en = now(), version = version + 1
 WHERE id = 'e1000000-0000-0000-0000-0000000000f1';
DO $$ BEGIN
  INSERT INTO sync.evento_fallido (id, tenant_id, consumidor, event_id, event_type, aggregate_type, aggregate_id, error, intentos, estado)
  VALUES (gen_random_uuid(), 'bbbbbbbb-0000-0000-0000-000000000002', 'prueba-a',
          'e1000000-0000-0000-0000-000000000002', 'cita.creada', 'cita', gen_random_uuid(), 'boom', 1, 'FALLIDO');
  RAISE EXCEPTION 'insertar fallido con otro tenant debía fallar';
EXCEPTION WHEN insufficient_privilege THEN NULL;
END $$;

-- DELETE no borra ni las filas propias.
DELETE FROM sync.evento_fallido;
DO $$ BEGIN
  IF (SELECT count(*) FROM sync.evento_fallido) <> 1 THEN RAISE EXCEPTION 'el DELETE no debía borrar el fallido'; END IF;
END $$;

-- Tenant B no ve ni toca las filas de A.
SELECT set_config('app.tenant_id', 'bbbbbbbb-0000-0000-0000-000000000002', false);
DO $$
DECLARE afectadas integer;
BEGIN
  IF EXISTS (SELECT 1 FROM sync.evento_procesado) THEN RAISE EXCEPTION 'B no debía ver procesados de A'; END IF;
  IF EXISTS (SELECT 1 FROM sync.evento_fallido) THEN RAISE EXCEPTION 'B no debía ver fallidos de A'; END IF;
  UPDATE sync.evento_fallido SET estado = 'PROCESADO';
  GET DIAGNOSTICS afectadas = ROW_COUNT;
  IF afectadas <> 0 THEN RAISE EXCEPTION 'B no debía actualizar fallidos de A'; END IF;
END $$;

RESET ROLE;

DO $$ BEGIN
  IF (SELECT estado FROM sync.evento_fallido WHERE id = 'e1000000-0000-0000-0000-0000000000f1') <> 'REPROCESANDO' THEN
    RAISE EXCEPTION 'el fallido de A debía seguir en REPROCESANDO';
  END IF;
END $$;

-- Un rol sin EXECUTE no puede leer entre tenants.
SET ROLE sync_test_sin_permiso;
DO $$ BEGIN
  PERFORM * FROM sync.read_events(0, interval '2 seconds', 10);
  RAISE EXCEPTION 'sin EXECUTE read_events debía fallar';
EXCEPTION WHEN insufficient_privilege THEN NULL;
END $$;
DO $$ BEGIN
  PERFORM * FROM sync.read_events_ventana(0, interval '5 minutes', 10);
  RAISE EXCEPTION 'sin EXECUTE read_events_ventana debía fallar';
EXCEPTION WHEN insufficient_privilege THEN NULL;
END $$;
RESET ROLE;

-- sync_lector: sin login ni BYPASSRLS, dueño de funciones SECURITY DEFINER con search_path fijo.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'sync_lector' AND (rolcanlogin OR rolbypassrls OR rolsuper)) THEN
    RAISE EXCEPTION 'sync_lector debe ser NOLOGIN sin BYPASSRLS';
  END IF;
  IF (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = 'sync' AND p.proname IN ('read_events', 'read_events_ventana')
         AND p.prosecdef AND pg_get_userbyid(p.proowner) = 'sync_lector'
         AND p.proconfig @> ARRAY['search_path=""']) <> 2 THEN
    RAISE EXCEPTION 'read_events y read_events_ventana deben ser SECURITY DEFINER de sync_lector con search_path vacío';
  END IF;
  IF (SELECT ultimo_seq FROM sync.relay_cursor WHERE relay = 'principal') <> 0 THEN
    RAISE EXCEPTION 'el cursor principal debía nacer en 0';
  END IF;
END $$;

-- anon y authenticated no tienen acceso (solo si existen: PostgreSQL plano no los trae).
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    IF has_function_privilege('anon', 'sync.read_events(bigint, interval, integer)', 'EXECUTE')
       OR has_function_privilege('authenticated', 'sync.read_events_ventana(bigint, interval, integer)', 'EXECUTE') THEN
      RAISE EXCEPTION 'anon/authenticated no deben ejecutar las funciones del relay';
    END IF;
    IF has_table_privilege('anon', 'sync.evento_fallido', 'SELECT')
       OR has_table_privilege('authenticated', 'sync.evento_procesado', 'INSERT')
       OR has_table_privilege('anon', 'sync.relay_cursor', 'SELECT') THEN
      RAISE EXCEPTION 'anon/authenticated no deben tener privilegios sobre las tablas del relay';
    END IF;
  END IF;
END $$;
