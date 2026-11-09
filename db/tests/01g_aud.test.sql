-- Prueba de 01g_aud (spec 20a). La ejecuta tools/migrar/test/db-esquemas.test.mjs sobre una base temporal
-- con db/ aplicado. Corre como superusuario y evalúa con aud_test_app, sin BYPASSRLS y con los mismos
-- privilegios que la aplicación (SELECT, INSERT). Todo en una transacción que se revierte: con filas en
-- aud.evento_auditoria el inverso se niega, y la ida y vuelta de db:down corre sin filas.

BEGIN;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'aud_test_app') THEN
    CREATE ROLE aud_test_app NOLOGIN;
  END IF;
END $$;
GRANT USAGE ON SCHEMA aud TO aud_test_app;
GRANT SELECT, INSERT ON aud.evento_auditoria TO aud_test_app;

CREATE SCHEMA aud_test;
CREATE FUNCTION aud_test.debe_fallar(sentencia text, esperado text, caso text) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  EXECUTE sentencia;
  RAISE EXCEPTION 'no falló';
EXCEPTION WHEN OTHERS THEN
  IF SQLSTATE <> esperado THEN
    RAISE EXCEPTION '%: se esperaba % y llegó % (%)', caso, esperado, SQLSTATE, SQLERRM;
  END IF;
END
$$;
GRANT USAGE ON SCHEMA aud_test TO aud_test_app;

-- Inserción mínima de una operación directa. numero, hash_anterior y hash los pone el trigger.
CREATE FUNCTION aud_test.operacion(p_tenant uuid, p_entidad varchar) RETURNS void
LANGUAGE sql AS $$
  INSERT INTO aud.evento_auditoria (id, tenant_id, tipo, origen, accion, entidad_tipo, entidad_id, ocurrido_en)
  VALUES (gen_random_uuid(), p_tenant, 'OPERACION', 'DIRECTO', 'rest.venta.anular', 'venta', p_entidad, now());
$$;

SET ROLE aud_test_app;
SELECT set_config('app.tenant_id', 'aaaaaaaa-0000-0000-0000-000000000001', false);

-- ---------------------------------------------------------------------
-- Cadena: el primero arranca en 1 con 64 ceros, aunque el INSERT traiga otros valores.
-- ---------------------------------------------------------------------
INSERT INTO aud.evento_auditoria (id, tenant_id, numero, tipo, origen, accion, entidad_tipo, entidad_id, antes, despues,
                                  motivo, usuario_id, ip, ocurrido_en, hash_anterior, hash)
VALUES ('a1000000-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 99, 'OPERACION', 'DIRECTO',
        'rest.venta.anular', 'venta', 'V-000981', '{"estado": "EMITIDA"}', '{"estado": "ANULADA"}', 'cliente desistió',
        'a1000000-0000-0000-0000-0000000000a1', '190.42.10.8', now(), repeat('f', 64), repeat('e', 64));

DO $$
DECLARE
  fila aud.evento_auditoria;
BEGIN
  SELECT * INTO fila FROM aud.evento_auditoria WHERE id = 'a1000000-0000-0000-0000-000000000001';
  IF fila.numero <> 1 THEN RAISE EXCEPTION 'el primero debía tener numero 1 y tiene %', fila.numero; END IF;
  IF fila.hash_anterior <> repeat('0', 64) THEN RAISE EXCEPTION 'el primero debía encadenar con 64 ceros: %', fila.hash_anterior; END IF;
  IF fila.hash = repeat('e', 64) OR fila.hash !~ '^[0-9a-f]{64}$' THEN RAISE EXCEPTION 'el hash del INSERT no se ignoró: %', fila.hash; END IF;
END $$;

SELECT aud_test.operacion('aaaaaaaa-0000-0000-0000-000000000001', 'V-000982');
SELECT aud_test.operacion('aaaaaaaa-0000-0000-0000-000000000001', 'V-000983');

-- Cada uno encadena con el anterior y aud.calcular_hash reproduce el hash guardado.
DO $$
DECLARE
  numeros bigint[];
  rotos int;
  recalculo_distinto int;
BEGIN
  SELECT array_agg(numero ORDER BY numero) INTO numeros FROM aud.evento_auditoria;
  IF numeros IS DISTINCT FROM ARRAY[1, 2, 3]::bigint[] THEN RAISE EXCEPTION 'numeros debían ser 1, 2, 3: %', numeros; END IF;

  SELECT count(*) INTO rotos
    FROM aud.evento_auditoria e JOIN aud.evento_auditoria previo ON previo.tenant_id = e.tenant_id AND previo.numero = e.numero - 1
   WHERE e.hash_anterior <> previo.hash;
  IF rotos <> 0 THEN RAISE EXCEPTION '% registros no encadenan con el hash del anterior', rotos; END IF;

  SELECT count(*) INTO recalculo_distinto FROM aud.evento_auditoria e WHERE aud.calcular_hash(e, e.hash_anterior) <> e.hash;
  IF recalculo_distinto <> 0 THEN RAISE EXCEPTION '% hashes no se reproducen con aud.calcular_hash', recalculo_distinto; END IF;
END $$;

-- ---------------------------------------------------------------------
-- Aislamiento: el tenant B lleva su propia cadena y no ve ni inserta filas de A.
-- ---------------------------------------------------------------------
SELECT set_config('app.tenant_id', 'bbbbbbbb-0000-0000-0000-000000000002', false);
SELECT aud_test.operacion('bbbbbbbb-0000-0000-0000-000000000002', 'V-000001');

DO $$
DECLARE
  fila aud.evento_auditoria;
BEGIN
  IF (SELECT count(*) FROM aud.evento_auditoria) <> 1 THEN RAISE EXCEPTION 'B debía ver solo su fila'; END IF;
  SELECT * INTO fila FROM aud.evento_auditoria;
  IF fila.numero <> 1 OR fila.hash_anterior <> repeat('0', 64) THEN
    RAISE EXCEPTION 'la cadena de B debía arrancar en 1 con 64 ceros: % %', fila.numero, fila.hash_anterior;
  END IF;
END $$;

SELECT aud_test.debe_fallar($$SELECT aud_test.operacion('aaaaaaaa-0000-0000-0000-000000000001', 'V-X')$$, '42501',
                            'B no inserta con el tenant de A');

SELECT set_config('app.tenant_id', '', false);
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM aud.evento_auditoria) THEN RAISE EXCEPTION 'sin tenant no debía ver filas'; END IF;
END $$;
SELECT aud_test.debe_fallar($$SELECT aud_test.operacion('aaaaaaaa-0000-0000-0000-000000000001', 'V-X')$$, '42501',
                            'sin tenant no inserta');

-- ---------------------------------------------------------------------
-- Solo inserción con el rol de la aplicación (TR-CA-210): sin privilegios de cambio.
-- ---------------------------------------------------------------------
SELECT set_config('app.tenant_id', 'aaaaaaaa-0000-0000-0000-000000000001', false);
SELECT aud_test.debe_fallar($$UPDATE aud.evento_auditoria SET motivo = 'x'$$, '42501', 'UPDATE con el rol de la app');
SELECT aud_test.debe_fallar($$DELETE FROM aud.evento_auditoria$$, '42501', 'DELETE con el rol de la app');
SELECT aud_test.debe_fallar($$TRUNCATE aud.evento_auditoria$$, '42501', 'TRUNCATE con el rol de la app');

-- ---------------------------------------------------------------------
-- CHECKs de acceso sensible, SOPORTE, origen/event_id y formato de acción; event_id único.
-- ---------------------------------------------------------------------
SELECT aud_test.debe_fallar($$
  INSERT INTO aud.evento_auditoria (id, tenant_id, tipo, origen, accion, entidad_tipo, entidad_id, usuario_id, finalidad, ocurrido_en)
  VALUES (gen_random_uuid(), 'aaaaaaaa-0000-0000-0000-000000000001', 'ACCESO_SENSIBLE', 'DIRECTO', 'aud.dato_sensible.acceder',
          'HISTORIA_CLINICA', 'HC-1', gen_random_uuid(), 'ATENCION', now())$$, '23514', 'acceso sensible sin titular');

SELECT aud_test.debe_fallar($$
  INSERT INTO aud.evento_auditoria (id, tenant_id, tipo, origen, accion, entidad_tipo, entidad_id, usuario_id,
                                    persona_titular_id, finalidad, ocurrido_en)
  VALUES (gen_random_uuid(), 'aaaaaaaa-0000-0000-0000-000000000001', 'ACCESO_SENSIBLE', 'DIRECTO', 'aud.dato_sensible.acceder',
          'venta', 'V-1', gen_random_uuid(), gen_random_uuid(), 'ATENCION', now())$$, '23514', 'acceso sensible a un recurso no sensible');

SELECT aud_test.debe_fallar($$
  INSERT INTO aud.evento_auditoria (id, tenant_id, tipo, origen, accion, entidad_tipo, entidad_id, usuario_id,
                                    persona_titular_id, finalidad, ocurrido_en)
  VALUES (gen_random_uuid(), 'aaaaaaaa-0000-0000-0000-000000000001', 'ACCESO_SENSIBLE', 'DIRECTO', 'aud.dato_sensible.acceder',
          'EXPEDIENTE', 'EXP-1', gen_random_uuid(), gen_random_uuid(), 'SOPORTE', now())$$, '23514', 'SOPORTE sin ticket (TR-CA-212)');

-- Válidos: ATENCION (TR-CA-211) y SOPORTE con ticket (TR-CA-212).
INSERT INTO aud.evento_auditoria (id, tenant_id, tipo, origen, accion, entidad_tipo, entidad_id, usuario_id,
                                  persona_titular_id, finalidad, ticket, ocurrido_en)
VALUES (gen_random_uuid(), 'aaaaaaaa-0000-0000-0000-000000000001', 'ACCESO_SENSIBLE', 'DIRECTO', 'aud.dato_sensible.acceder',
        'HISTORIA_CLINICA', 'HC-1', gen_random_uuid(), gen_random_uuid(), 'ATENCION', NULL, now()),
       (gen_random_uuid(), 'aaaaaaaa-0000-0000-0000-000000000001', 'ACCESO_SENSIBLE', 'DIRECTO', 'aud.dato_sensible.acceder',
        'EXPEDIENTE', 'EXP-1', gen_random_uuid(), gen_random_uuid(), 'SOPORTE', 'TCK-1042', now());

SELECT aud_test.debe_fallar($$
  INSERT INTO aud.evento_auditoria (id, tenant_id, tipo, origen, accion, entidad_tipo, entidad_id, ocurrido_en)
  VALUES (gen_random_uuid(), 'aaaaaaaa-0000-0000-0000-000000000001', 'OPERACION', 'EVENTO', 'sucursal.creada',
          'sucursal', 'S-1', now())$$, '23514', 'origen EVENTO sin event_id');

SELECT aud_test.debe_fallar($$
  INSERT INTO aud.evento_auditoria (id, tenant_id, tipo, origen, event_id, accion, entidad_tipo, entidad_id, ocurrido_en)
  VALUES (gen_random_uuid(), 'aaaaaaaa-0000-0000-0000-000000000001', 'OPERACION', 'DIRECTO', gen_random_uuid(),
          'rest.venta.anular', 'venta', 'V-1', now())$$, '23514', 'origen DIRECTO con event_id');

SELECT aud_test.debe_fallar($$
  INSERT INTO aud.evento_auditoria (id, tenant_id, tipo, origen, accion, entidad_tipo, entidad_id, ocurrido_en)
  VALUES (gen_random_uuid(), 'aaaaaaaa-0000-0000-0000-000000000001', 'OPERACION', 'DIRECTO', 'Venta Anulada',
          'venta', 'V-1', now())$$, '23514', 'acción fuera de formato');

INSERT INTO aud.evento_auditoria (id, tenant_id, tipo, origen, event_id, accion, entidad_tipo, entidad_id, ocurrido_en)
VALUES (gen_random_uuid(), 'aaaaaaaa-0000-0000-0000-000000000001', 'OPERACION', 'EVENTO',
        'a1000000-0000-0000-0000-0000000000e1', 'sucursal.creada', 'sucursal', 'S-1', now());
SELECT aud_test.debe_fallar($$
  INSERT INTO aud.evento_auditoria (id, tenant_id, tipo, origen, event_id, accion, entidad_tipo, entidad_id, ocurrido_en)
  VALUES (gen_random_uuid(), 'aaaaaaaa-0000-0000-0000-000000000001', 'OPERACION', 'EVENTO',
          'a1000000-0000-0000-0000-0000000000e1', 'sucursal.creada', 'sucursal', 'S-1', now())$$, '23505', 'event_id repetido');

-- ---------------------------------------------------------------------
-- Solo inserción también para el dueño y postgres: el trigger por sentencia (TR-CA-210).
-- ---------------------------------------------------------------------
RESET ROLE;

CREATE FUNCTION aud_test.falla_por_trigger(sentencia text, caso text) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  EXECUTE sentencia;
  RAISE EXCEPTION '%: no falló', caso;
EXCEPTION WHEN insufficient_privilege THEN
  IF SQLERRM NOT LIKE '%solo inserción%' THEN RAISE EXCEPTION '%: falló, pero no por el trigger (%)', caso, SQLERRM; END IF;
END
$$;

SELECT aud_test.falla_por_trigger($$UPDATE aud.evento_auditoria SET motivo = 'x'$$, 'UPDATE como superusuario');
SELECT aud_test.falla_por_trigger($$DELETE FROM aud.evento_auditoria$$, 'DELETE como superusuario');
SELECT aud_test.falla_por_trigger($$TRUNCATE aud.evento_auditoria$$, 'TRUNCATE como superusuario');

-- El dueño de la tabla no tiene UPDATE, DELETE ni TRUNCATE.
DO $$
DECLARE
  dueno name := (SELECT tableowner FROM pg_tables WHERE schemaname = 'aud' AND tablename = 'evento_auditoria');
BEGIN
  IF has_table_privilege(dueno, 'aud.evento_auditoria', 'UPDATE')
     OR has_table_privilege(dueno, 'aud.evento_auditoria', 'DELETE')
     OR has_table_privilege(dueno, 'aud.evento_auditoria', 'TRUNCATE') THEN
    -- Un superusuario tiene todos los privilegios por definición: ahí solo cuenta el trigger.
    IF NOT (SELECT rolsuper FROM pg_roles WHERE rolname = dueno) THEN
      RAISE EXCEPTION 'el dueño % no debía tener UPDATE, DELETE ni TRUNCATE', dueno;
    END IF;
  END IF;
END $$;

-- ---------------------------------------------------------------------
-- anon y authenticated sin acceso al esquema (regla 8).
-- ---------------------------------------------------------------------
DO $$
DECLARE
  rol text;
BEGIN
  FOREACH rol IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    CONTINUE WHEN NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = rol);
    IF has_schema_privilege(rol, 'aud', 'USAGE')
       OR has_table_privilege(rol, 'aud.evento_auditoria', 'SELECT')
       OR has_table_privilege(rol, 'aud.evento_auditoria', 'INSERT') THEN
      RAISE EXCEPTION '% no debía tener acceso a aud', rol;
    END IF;
  END LOOP;
END $$;

ROLLBACK;
