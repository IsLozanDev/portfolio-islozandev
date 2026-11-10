-- Prueba de 01g_aud_integridad (spec 20b). La ejecuta tools/migrar/test/db-esquemas.test.mjs sobre una base
-- temporal con db/ aplicado. Corre como superusuario y evalúa con aud_integridad_test_app, sin BYPASSRLS y con
-- los privilegios de la aplicación. Las alteraciones de la cadena se simulan como superusuario, con el trigger
-- de solo inserción desactivado solo dentro de esta transacción, que se revierte al final.

BEGIN;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'aud_integridad_test_app') THEN
    CREATE ROLE aud_integridad_test_app NOLOGIN;
  END IF;
END $$;
GRANT USAGE ON SCHEMA aud TO aud_integridad_test_app;
GRANT SELECT, INSERT ON aud.evento_auditoria, aud.verificacion_integridad TO aud_integridad_test_app;
GRANT EXECUTE ON FUNCTION aud.verificar_cadena(bigint, char, integer), aud.maximo_numero() TO aud_integridad_test_app;

CREATE SCHEMA aud_integridad_test;
GRANT USAGE ON SCHEMA aud_integridad_test TO aud_integridad_test_app;

CREATE FUNCTION aud_integridad_test.debe_fallar(sentencia text, esperado text, caso text) RETURNS void
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

-- Siembra una cadena de p_cantidad operaciones en el tenant y deja ese tenant en el contexto.
CREATE FUNCTION aud_integridad_test.sembrar(p_tenant uuid, p_cantidad int) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  PERFORM set_config('app.tenant_id', p_tenant::text, false);
  FOR indice IN 1..p_cantidad LOOP
    INSERT INTO aud.evento_auditoria (id, tenant_id, tipo, origen, accion, entidad_tipo, entidad_id, despues, ocurrido_en)
    VALUES (gen_random_uuid(), p_tenant, 'OPERACION', 'DIRECTO', 'rest.venta.anular', 'venta', 'V-' || indice,
            jsonb_build_object('monto', indice * 10), now());
  END LOOP;
END
$$;

-- Verifica la cadena completa del tenant y compara número roto y motivo.
CREATE FUNCTION aud_integridad_test.esperar_rotura(p_tenant uuid, p_numero bigint, p_motivo text, caso text) RETURNS void
LANGUAGE plpgsql AS $$
DECLARE
  resultado record;
BEGIN
  PERFORM set_config('app.tenant_id', p_tenant::text, false);
  SELECT * INTO resultado FROM aud.verificar_cadena(0, repeat('0', 64), 100);
  IF resultado.numero_roto IS DISTINCT FROM p_numero OR resultado.motivo IS DISTINCT FROM p_motivo THEN
    RAISE EXCEPTION '%: se esperaba % en % y llegó % en %', caso, p_motivo, p_numero, resultado.motivo, resultado.numero_roto;
  END IF;
  IF resultado.ultimo_numero <> p_numero - 1 OR resultado.filas <> p_numero - 1 THEN
    RAISE EXCEPTION '%: debía quedarse en el % y quedó en % con % filas', caso, p_numero - 1, resultado.ultimo_numero, resultado.filas;
  END IF;
END
$$;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA aud_integridad_test TO aud_integridad_test_app;

SET ROLE aud_integridad_test_app;

SELECT aud_integridad_test.sembrar('aaaaaaaa-0000-0000-0000-00000000000a', 5);
SELECT aud_integridad_test.sembrar('bbbbbbbb-0000-0000-0000-00000000000b', 2);
SELECT aud_integridad_test.sembrar('cccccccc-0000-0000-0000-00000000000c', 5);
SELECT aud_integridad_test.sembrar('dddddddd-0000-0000-0000-00000000000d', 5);
SELECT aud_integridad_test.sembrar('eeeeeeee-0000-0000-0000-00000000000e', 5);

-- ---------------------------------------------------------------------
-- Cadena sana: llega al último número con su hash, sin falla; por tramos retoma donde quedó.
-- ---------------------------------------------------------------------
SELECT set_config('app.tenant_id', 'aaaaaaaa-0000-0000-0000-00000000000a', false);

DO $$
DECLARE
  completa record;
  primer_tramo record;
  segundo_tramo record;
  hash_quinto char(64) := (SELECT hash FROM aud.evento_auditoria WHERE numero = 5);
BEGIN
  SELECT * INTO completa FROM aud.verificar_cadena(0, repeat('0', 64), 100);
  IF completa.ultimo_numero <> 5 OR completa.filas <> 5 OR completa.ultimo_hash <> hash_quinto
     OR completa.numero_roto IS NOT NULL OR completa.motivo IS NOT NULL THEN
    RAISE EXCEPTION 'cadena sana: %', completa;
  END IF;

  SELECT * INTO primer_tramo FROM aud.verificar_cadena(0, repeat('0', 64), 3);
  SELECT * INTO segundo_tramo FROM aud.verificar_cadena(primer_tramo.ultimo_numero, primer_tramo.ultimo_hash, 3);
  IF primer_tramo.ultimo_numero <> 3 OR segundo_tramo.ultimo_numero <> 5 OR segundo_tramo.filas <> 2
     OR segundo_tramo.ultimo_hash <> hash_quinto OR segundo_tramo.motivo IS NOT NULL THEN
    RAISE EXCEPTION 'por tramos: % y %', primer_tramo, segundo_tramo;
  END IF;

  IF aud.maximo_numero() <> 5 THEN RAISE EXCEPTION 'maximo_numero de A debía ser 5: %', aud.maximo_numero(); END IF;
END $$;

-- Sin filas posteriores devuelve el punto de partida sin falla.
DO $$
DECLARE
  resultado record;
BEGIN
  SELECT * INTO resultado FROM aud.verificar_cadena(5, repeat('f', 64), 100);
  IF resultado.ultimo_numero <> 5 OR resultado.ultimo_hash <> repeat('f', 64) OR resultado.filas <> 0 OR resultado.motivo IS NOT NULL THEN
    RAISE EXCEPTION 'sin filas nuevas: %', resultado;
  END IF;
END $$;

SELECT aud_integridad_test.debe_fallar($$SELECT aud.verificar_cadena(0, repeat('0', 64), 0)$$, '22023', 'límite 0');
SELECT aud_integridad_test.debe_fallar($$SELECT aud.verificar_cadena(0, repeat('0', 64), 50001)$$, '22023', 'límite 50 001');

-- ---------------------------------------------------------------------
-- Aislamiento: B verifica solo sus 2 filas; sin tenant no hay filas.
-- ---------------------------------------------------------------------
SELECT set_config('app.tenant_id', 'bbbbbbbb-0000-0000-0000-00000000000b', false);
DO $$
DECLARE
  resultado record;
BEGIN
  SELECT * INTO resultado FROM aud.verificar_cadena(0, repeat('0', 64), 100);
  IF resultado.ultimo_numero <> 2 OR resultado.filas <> 2 OR resultado.motivo IS NOT NULL THEN
    RAISE EXCEPTION 'B debía verificar solo sus 2 filas: %', resultado;
  END IF;
  IF aud.maximo_numero() <> 2 THEN RAISE EXCEPTION 'maximo_numero de B debía ser 2'; END IF;
END $$;

SELECT set_config('app.tenant_id', '', false);
DO $$ BEGIN
  IF aud.maximo_numero() <> 0 THEN RAISE EXCEPTION 'sin tenant maximo_numero debía ser 0'; END IF;
  IF (SELECT filas FROM aud.verificar_cadena(0, repeat('0', 64), 100)) <> 0 THEN RAISE EXCEPTION 'sin tenant no debía recorrer filas'; END IF;
END $$;

-- La aplicación sin EXECUTE de tenants_con_eventos (solo el rol que corre la migración).
SELECT aud_integridad_test.debe_fallar($$SELECT aud.tenants_con_eventos()$$, '42501', 'rol de prueba llama a tenants_con_eventos');

-- ---------------------------------------------------------------------
-- verificacion_integridad: RLS, CHECKs y solo inserción para la aplicación.
-- ---------------------------------------------------------------------
SELECT set_config('app.tenant_id', 'aaaaaaaa-0000-0000-0000-00000000000a', false);
INSERT INTO aud.verificacion_integridad (id, tenant_id, modo, desde_numero, hasta_numero, ultimo_hash, filas, estado,
                                         iniciada_en, terminada_en)
VALUES (gen_random_uuid(), 'aaaaaaaa-0000-0000-0000-00000000000a', 'COMPLETA', 0, 5, repeat('a', 64), 5, 'OK', now(), now());

SELECT aud_integridad_test.debe_fallar($$
  INSERT INTO aud.verificacion_integridad (id, tenant_id, modo, desde_numero, hasta_numero, ultimo_hash, filas, estado,
                                           iniciada_en, terminada_en)
  VALUES (gen_random_uuid(), 'aaaaaaaa-0000-0000-0000-00000000000a', 'COMPLETA', 0, 5, repeat('a', 64), 5, 'ROTA', now(), now())$$,
  '23514', 'ROTA sin motivo');
SELECT aud_integridad_test.debe_fallar($$
  INSERT INTO aud.verificacion_integridad (id, tenant_id, modo, desde_numero, hasta_numero, ultimo_hash, filas, estado, motivo,
                                           iniciada_en, terminada_en)
  VALUES (gen_random_uuid(), 'aaaaaaaa-0000-0000-0000-00000000000a', 'COMPLETA', 0, 5, repeat('a', 64), 5, 'OK', 'HASH', now(), now())$$,
  '23514', 'OK con motivo');
SELECT aud_integridad_test.debe_fallar($$
  INSERT INTO aud.verificacion_integridad (id, tenant_id, modo, desde_numero, hasta_numero, ultimo_hash, filas, estado,
                                           iniciada_en, terminada_en)
  VALUES (gen_random_uuid(), 'aaaaaaaa-0000-0000-0000-00000000000a', 'COMPLETA', 0, 5, repeat('a', 64), 5, 'MAL', now(), now())$$,
  '23514', 'estado fuera de la lista');
SELECT aud_integridad_test.debe_fallar($$
  INSERT INTO aud.verificacion_integridad (id, tenant_id, modo, desde_numero, hasta_numero, ultimo_hash, filas, estado, motivo,
                                           iniciada_en, terminada_en)
  VALUES (gen_random_uuid(), 'aaaaaaaa-0000-0000-0000-00000000000a', 'COMPLETA', 0, 5, repeat('a', 64), 5, 'ROTA', 'OTRO', now(), now())$$,
  '23514', 'motivo fuera de la lista');
SELECT aud_integridad_test.debe_fallar($$
  INSERT INTO aud.verificacion_integridad (id, tenant_id, modo, desde_numero, hasta_numero, ultimo_hash, filas, estado,
                                           iniciada_en, terminada_en)
  VALUES (gen_random_uuid(), 'bbbbbbbb-0000-0000-0000-00000000000b', 'COMPLETA', 0, 2, repeat('a', 64), 2, 'OK', now(), now())$$,
  '42501', 'A no inserta verificaciones de B');

SELECT aud_integridad_test.debe_fallar($$UPDATE aud.verificacion_integridad SET filas = 0$$, '42501', 'UPDATE con el rol de la app');
SELECT aud_integridad_test.debe_fallar($$DELETE FROM aud.verificacion_integridad$$, '42501', 'DELETE con el rol de la app');

SELECT set_config('app.tenant_id', 'bbbbbbbb-0000-0000-0000-00000000000b', false);
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM aud.verificacion_integridad) THEN RAISE EXCEPTION 'B no debía ver verificaciones de A'; END IF;
END $$;

-- ---------------------------------------------------------------------
-- Alteraciones con privilegios (TR-RNF-112): cambiar despues da HASH, cambiar hash_anterior da ENLACE y
-- borrar una fila intermedia da HUECO, cada una en la fila 3.
-- ---------------------------------------------------------------------
RESET ROLE;
ALTER TABLE aud.evento_auditoria DISABLE TRIGGER evento_auditoria_solo_insercion;
UPDATE aud.evento_auditoria SET despues = '{"monto": 9999}'
 WHERE tenant_id = 'cccccccc-0000-0000-0000-00000000000c' AND numero = 3;
UPDATE aud.evento_auditoria SET hash_anterior = repeat('1', 64)
 WHERE tenant_id = 'dddddddd-0000-0000-0000-00000000000d' AND numero = 3;
DELETE FROM aud.evento_auditoria
 WHERE tenant_id = 'eeeeeeee-0000-0000-0000-00000000000e' AND numero = 3;
ALTER TABLE aud.evento_auditoria ENABLE TRIGGER evento_auditoria_solo_insercion;

SET ROLE aud_integridad_test_app;
SELECT aud_integridad_test.esperar_rotura('cccccccc-0000-0000-0000-00000000000c', 3, 'HASH', 'despues alterado');
SELECT aud_integridad_test.esperar_rotura('dddddddd-0000-0000-0000-00000000000d', 3, 'ENLACE', 'hash_anterior alterado');
SELECT aud_integridad_test.esperar_rotura('eeeeeeee-0000-0000-0000-00000000000e', 3, 'HUECO', 'fila intermedia borrada');
RESET ROLE;

-- ---------------------------------------------------------------------
-- Solo inserción también para el superusuario: el trigger por sentencia.
-- ---------------------------------------------------------------------
CREATE FUNCTION aud_integridad_test.falla_por_trigger(sentencia text, caso text) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  EXECUTE sentencia;
  RAISE EXCEPTION '%: no falló', caso;
EXCEPTION WHEN insufficient_privilege THEN
  IF SQLERRM NOT LIKE '%solo inserción%' THEN RAISE EXCEPTION '%: falló, pero no por el trigger (%)', caso, SQLERRM; END IF;
END
$$;

SELECT aud_integridad_test.falla_por_trigger($$UPDATE aud.verificacion_integridad SET filas = 0$$, 'UPDATE como superusuario');
SELECT aud_integridad_test.falla_por_trigger($$DELETE FROM aud.verificacion_integridad$$, 'DELETE como superusuario');
SELECT aud_integridad_test.falla_por_trigger($$TRUNCATE aud.verificacion_integridad$$, 'TRUNCATE como superusuario');

-- ---------------------------------------------------------------------
-- tenants_con_eventos: lista todos los tenants con filas, solo ids. Rol lector sin login ni BYPASSRLS.
-- ---------------------------------------------------------------------
DO $$
DECLARE
  tenants uuid[] := ARRAY(SELECT aud.tenants_con_eventos());
BEGIN
  IF NOT tenants @> ARRAY['aaaaaaaa-0000-0000-0000-00000000000a', 'bbbbbbbb-0000-0000-0000-00000000000b']::uuid[] THEN
    RAISE EXCEPTION 'tenants_con_eventos debía listar A y B: %', tenants;
  END IF;
  IF cardinality(tenants) <> (SELECT count(DISTINCT tenant_id) FROM aud.evento_auditoria) THEN
    RAISE EXCEPTION 'tenants_con_eventos debía devolver cada tenant una vez: %', tenants;
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'aud_lector' AND (rolcanlogin OR rolbypassrls OR rolsuper)) THEN
    RAISE EXCEPTION 'aud_lector debe ser NOLOGIN sin BYPASSRLS';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'aud' AND p.proname = 'tenants_con_eventos'
       AND p.prosecdef AND pg_get_userbyid(p.proowner) = 'aud_lector' AND p.proconfig @> ARRAY['search_path=""']) THEN
    RAISE EXCEPTION 'tenants_con_eventos debe ser SECURITY DEFINER de aud_lector con search_path vacío';
  END IF;
  IF has_function_privilege('aud_integridad_test_app', 'aud.tenants_con_eventos()', 'EXECUTE') THEN
    RAISE EXCEPTION 'el rol de prueba no debía tener EXECUTE de tenants_con_eventos';
  END IF;
END $$;

-- ---------------------------------------------------------------------
-- anon y authenticated sin acceso (regla 8).
-- ---------------------------------------------------------------------
DO $$
DECLARE
  rol text;
BEGIN
  FOREACH rol IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    CONTINUE WHEN NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = rol);
    IF has_table_privilege(rol, 'aud.verificacion_integridad', 'SELECT')
       OR has_table_privilege(rol, 'aud.verificacion_integridad', 'INSERT')
       OR has_function_privilege(rol, 'aud.tenants_con_eventos()', 'EXECUTE')
       OR has_function_privilege(rol, 'aud.verificar_cadena(bigint, char, integer)', 'EXECUTE')
       OR has_function_privilege(rol, 'aud.maximo_numero()', 'EXECUTE') THEN
      RAISE EXCEPTION '% no debía tener acceso a la integridad de aud', rol;
    END IF;
  END LOOP;
END $$;

ROLLBACK;
