-- Prueba de las columnas de traza del outbox (spec 20a). La ejecuta tools/migrar/test/db-esquemas.test.mjs
-- sobre una base temporal con db/ aplicado, después de las del relay. Corre como superusuario.

INSERT INTO sync.outbox (event_id, tenant_id, aggregate_type, aggregate_id, event_type, version, payload,
                         schema_version, occurred_at, created_at, actor_id, ip, trace_id)
VALUES ('e2000000-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 'sucursal', gen_random_uuid(),
        'sucursal.creada', 1, '{}', 1, now(), now() - interval '1 hour',
        'e2000000-0000-0000-0000-0000000000a1', '190.42.10.8', '4bf92f3577b34da6a3ce929d0e0e4736');

-- read_events y read_events_ventana devuelven las tres columnas nuevas.
DO $$
DECLARE
  fila sync.outbox;
BEGIN
  SELECT * INTO fila FROM sync.read_events(0, interval '2 seconds', 1000)
   WHERE event_id = 'e2000000-0000-0000-0000-000000000001';
  IF fila.actor_id IS DISTINCT FROM 'e2000000-0000-0000-0000-0000000000a1'::uuid
     OR fila.ip IS DISTINCT FROM '190.42.10.8'::inet
     OR fila.trace_id IS DISTINCT FROM '4bf92f3577b34da6a3ce929d0e0e4736' THEN
    RAISE EXCEPTION 'read_events debía devolver actor_id, ip y trace_id: %', row_to_json(fila);
  END IF;

  SELECT * INTO fila FROM sync.read_events_ventana(fila.seq, interval '2 hours', 1000)
   WHERE event_id = 'e2000000-0000-0000-0000-000000000001';
  IF fila.actor_id IS NULL OR fila.ip IS NULL OR fila.trace_id IS NULL THEN
    RAISE EXCEPTION 'read_events_ventana debía devolver actor_id, ip y trace_id: %', row_to_json(fila);
  END IF;
END $$;

-- trace_id que no son 32 hex en minúsculas se rechaza.
DO $$ BEGIN
  INSERT INTO sync.outbox (event_id, tenant_id, aggregate_type, aggregate_id, event_type, version, payload,
                           schema_version, occurred_at, trace_id)
  VALUES (gen_random_uuid(), 'aaaaaaaa-0000-0000-0000-000000000001', 'sucursal', gen_random_uuid(),
          'sucursal.creada', 1, '{}', 1, now(), 'no-es-un-trace');
  RAISE EXCEPTION 'un trace_id inválido debía fallar';
EXCEPTION WHEN check_violation THEN NULL;
END $$;

-- Sin actor, IP ni trace: el evento se guarda igual (sistema).
INSERT INTO sync.outbox (event_id, tenant_id, aggregate_type, aggregate_id, event_type, version, payload, schema_version, occurred_at)
VALUES ('e2000000-0000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000001', 'tenant', gen_random_uuid(),
        'tenant.creado', 1, '{}', 1, now());
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM sync.outbox WHERE event_id = 'e2000000-0000-0000-0000-000000000002'
              AND (actor_id IS NOT NULL OR ip IS NOT NULL OR trace_id IS NOT NULL)) THEN
    RAISE EXCEPTION 'sin contexto, actor_id, ip y trace_id debían quedar NULL';
  END IF;
END $$;
