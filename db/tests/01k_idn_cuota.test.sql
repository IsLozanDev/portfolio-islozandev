-- Prueba de 01k_idn_cuota (spec 29). La ejecuta tools/migrar/test/db-esquemas.test.mjs sobre una base temporal
-- con db/ aplicado. Corre como superusuario y evalúa con idn_cuota_test_app, sin BYPASSRLS y con los mismos
-- privilegios que la aplicación. Todo en una transacción que se revierte.

BEGIN;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'idn_cuota_test_app') THEN
    CREATE ROLE idn_cuota_test_app NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'idn_cuota_test_sin_permiso') THEN
    CREATE ROLE idn_cuota_test_sin_permiso NOLOGIN;
  END IF;
END $$;
GRANT USAGE ON SCHEMA idn TO idn_cuota_test_app, idn_cuota_test_sin_permiso;
GRANT SELECT, INSERT, UPDATE ON idn.cuota TO idn_cuota_test_app;
GRANT SELECT ON idn.proveedor TO idn_cuota_test_app;
GRANT UPDATE (prioridad, ttl_dias, timeout_ms, activo, version) ON idn.proveedor TO idn_cuota_test_app;
GRANT EXECUTE ON FUNCTION idn.cuotas_del_periodo(char, varchar, int, int), idn.cuota_detalle(uuid, char)
  TO idn_cuota_test_app;

CREATE SCHEMA idn_cuota_test;
CREATE FUNCTION idn_cuota_test.debe_fallar(sentencia text, esperado text, caso text) RETURNS void
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
GRANT USAGE ON SCHEMA idn_cuota_test TO idn_cuota_test_app;

-- Datos como superusuario: dos tenants y consultas en el borde del mes en Lima (UTC-5).
-- 2026-11-01 04:59 UTC es el 31 de octubre en Lima; 05:00 UTC ya es noviembre.
INSERT INTO org.tenant (id, codigo, nombre, estado, version) VALUES
  ('29000000-0000-0000-0000-00000000000a', 'cuota-alfa', 'Pollería Alfa', 'ACTIVO', 1),
  ('29000000-0000-0000-0000-00000000000b', 'cuota-beta', 'Gym Beta', 'ACTIVO', 1);
INSERT INTO idn.consulta_log (tenant_id, tipo_doc, numero_hash, motivo, resultado, proveedor, consultado_en) VALUES
  ('29000000-0000-0000-0000-00000000000a', 'DNI', 'sha256:' || repeat('a', 64), 'OTRO', 'PROVEEDOR', 'DECOLECTA', '2026-10-01 05:00+00'),
  ('29000000-0000-0000-0000-00000000000a', 'DNI', 'sha256:' || repeat('a', 64), 'OTRO', 'PROVEEDOR', 'DECOLECTA', '2026-11-01 04:59+00'),
  ('29000000-0000-0000-0000-00000000000a', 'DNI', 'sha256:' || repeat('a', 64), 'OTRO', 'CACHE', NULL, '2026-10-15 12:00+00'),
  ('29000000-0000-0000-0000-00000000000a', 'DNI', 'sha256:' || repeat('a', 64), 'OTRO', 'CUOTA_AGOTADA', NULL, '2026-11-01 05:00+00'),
  ('29000000-0000-0000-0000-00000000000a', 'DNI', 'sha256:' || repeat('a', 64), 'OTRO', 'PROVEEDOR', 'DECOLECTA', '2026-10-01 04:59+00'),
  ('29000000-0000-0000-0000-00000000000b', 'DNI', 'sha256:' || repeat('a', 64), 'OTRO', 'PROVEEDOR', 'DECOLECTA', '2026-10-10 12:00+00');

SET ROLE idn_cuota_test_app;

-- ---------------------------------------------------------------------
-- Formato, plan y tope.
-- ---------------------------------------------------------------------
SELECT set_config('app.tenant_id', '29000000-0000-0000-0000-00000000000a', false);
INSERT INTO idn.cuota (tenant_id, periodo, plan, incluidas, consumidas)
VALUES ('29000000-0000-0000-0000-00000000000a', '2026-10', 'PRO', 500, 399);

SELECT idn_cuota_test.debe_fallar($$
  INSERT INTO idn.cuota (tenant_id, periodo, plan, incluidas)
  VALUES ('29000000-0000-0000-0000-00000000000a', '2026-13', 'PRO', 500)$$, '23514', 'mes 13');
SELECT idn_cuota_test.debe_fallar($$
  INSERT INTO idn.cuota (tenant_id, periodo, plan, incluidas)
  VALUES ('29000000-0000-0000-0000-00000000000a', '2026-1', 'PRO', 500)$$, '23514', 'periodo sin cero');
SELECT idn_cuota_test.debe_fallar($$
  INSERT INTO idn.cuota (tenant_id, periodo, plan, incluidas)
  VALUES ('29000000-0000-0000-0000-00000000000a', '2026-12', 'GRATIS', 500)$$, '23514', 'plan fuera de la lista');
SELECT idn_cuota_test.debe_fallar($$
  INSERT INTO idn.cuota (tenant_id, periodo, plan, incluidas, consumidas)
  VALUES ('29000000-0000-0000-0000-00000000000a', '2026-12', 'PRO', 5, 6)$$, '23514', 'consumidas sobre incluidas');
SELECT idn_cuota_test.debe_fallar($$
  UPDATE idn.cuota SET incluidas = 398 WHERE periodo = '2026-10'$$, '23514', 'incluidas por debajo de consumidas');

-- La reserva condicional se detiene en el tope sin error.
DO $$
DECLARE
  reservadas int := 0;
  filas int;
BEGIN
  FOR intento IN 1..3 LOOP
    UPDATE idn.cuota SET consumidas = consumidas + 1
     WHERE tenant_id = '29000000-0000-0000-0000-00000000000a' AND periodo = '2026-10' AND consumidas < incluidas - 99;
    GET DIAGNOSTICS filas = ROW_COUNT;
    reservadas := reservadas + filas;
  END LOOP;
  IF reservadas <> 2 OR (SELECT consumidas FROM idn.cuota WHERE periodo = '2026-10') <> 401 THEN
    RAISE EXCEPTION 'la reserva condicional debía cortar en el tope: % reservadas', reservadas;
  END IF;
END $$;

-- crearSiFalta: el segundo INSERT no cambia nada.
INSERT INTO idn.cuota (tenant_id, periodo, plan, incluidas)
VALUES ('29000000-0000-0000-0000-00000000000a', '2026-10', 'BASICO', 200) ON CONFLICT DO NOTHING;
DO $$ BEGIN
  IF (SELECT plan FROM idn.cuota WHERE periodo = '2026-10') <> 'PRO' THEN
    RAISE EXCEPTION 'ON CONFLICT DO NOTHING no debía pisar la fila';
  END IF;
END $$;

SELECT idn_cuota_test.debe_fallar($$DELETE FROM idn.cuota$$, '42501', 'DELETE de cuota');

-- ---------------------------------------------------------------------
-- RLS entre dos tenants.
-- ---------------------------------------------------------------------
SELECT set_config('app.tenant_id', '29000000-0000-0000-0000-00000000000b', false);
INSERT INTO idn.cuota (tenant_id, periodo, plan, incluidas, consumidas)
VALUES ('29000000-0000-0000-0000-00000000000b', '2026-10', 'BASICO', 200, 10);

DO $$
DECLARE filas int;
BEGIN
  IF (SELECT count(*) FROM idn.cuota) <> 1 THEN RAISE EXCEPTION 'B debía ver solo su cuota'; END IF;
  UPDATE idn.cuota SET consumidas = 0 WHERE tenant_id = '29000000-0000-0000-0000-00000000000a';
  GET DIAGNOSTICS filas = ROW_COUNT;
  IF filas <> 0 THEN RAISE EXCEPTION 'B no debía modificar la cuota de A'; END IF;
END $$;
SELECT idn_cuota_test.debe_fallar($$
  INSERT INTO idn.cuota (tenant_id, periodo, plan, incluidas)
  VALUES ('29000000-0000-0000-0000-00000000000a', '2026-11', 'PRO', 500)$$, '42501', 'B inserta con el tenant de A');
SELECT idn_cuota_test.debe_fallar($$
  UPDATE idn.cuota SET tenant_id = '29000000-0000-0000-0000-00000000000a' WHERE periodo = '2026-10'$$,
  '42501', 'B pasa su cuota a A');

SELECT set_config('app.tenant_id', '', false);
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM idn.cuota) THEN RAISE EXCEPTION 'sin tenant no debía ver cuotas'; END IF;
END $$;

-- ---------------------------------------------------------------------
-- Funciones de consola: todos los tenants, sin depender de app.tenant_id.
-- ---------------------------------------------------------------------
DO $$
DECLARE fila record;
BEGIN
  IF (SELECT array_agg(tenant_nombre) FROM idn.cuotas_del_periodo('2026-10', NULL, 20, 0)
       WHERE tenant_id::text LIKE '29000000-%') IS DISTINCT FROM ARRAY['Pollería Alfa', 'Gym Beta']::varchar[] THEN
    RAISE EXCEPTION 'la lista debía traer ambos tenants, de mayor a menor consumo';
  END IF;
  IF (SELECT array_agg(tenant_nombre) FROM idn.cuotas_del_periodo('2026-10', 'BETA', 20, 0))
     IS DISTINCT FROM ARRAY['Gym Beta']::varchar[] THEN
    RAISE EXCEPTION 'q debía filtrar por código sin distinguir mayúsculas';
  END IF;
  IF (SELECT count(*) FROM idn.cuotas_del_periodo('2026-10', 'cuota-', 1, 0)) <> 1
     OR (SELECT total FROM idn.cuotas_del_periodo('2026-10', 'cuota-', 1, 0)) <> 2 THEN
    RAISE EXCEPTION 'el límite corta la página y total cuenta todas las filas';
  END IF;
  IF EXISTS (SELECT 1 FROM idn.cuotas_del_periodo('2026-09', NULL, 20, 0) WHERE tenant_id::text LIKE '29000000-%') THEN
    RAISE EXCEPTION 'un periodo sin cuotas no debía devolver filas';
  END IF;

  SELECT * INTO STRICT fila FROM idn.cuota_detalle('29000000-0000-0000-0000-00000000000a', '2026-10');
  IF fila.consumidas <> 401 OR fila.plan <> 'PRO' OR fila.tenant_nombre <> 'Pollería Alfa' THEN
    RAISE EXCEPTION 'detalle de A incorrecto: %', fila;
  END IF;
  IF fila.consultas_por_resultado <> '{"CACHE": 1, "PROVEEDOR": 2, "NO_ENCONTRADO": 0, "INVALIDO": 0,
                                       "CUOTA_AGOTADA": 0, "PROVEEDOR_NO_DISPONIBLE": 0}'::jsonb THEN
    RAISE EXCEPTION 'los contadores debían cortar el mes en hora de Lima: %', fila.consultas_por_resultado;
  END IF;

  IF EXISTS (SELECT 1 FROM idn.cuota_detalle('29000000-0000-0000-0000-00000000000a', '2026-09')) THEN
    RAISE EXCEPTION 'un periodo sin fila no debía devolver detalle';
  END IF;
  IF EXISTS (SELECT 1 FROM idn.cuota_detalle(NULL, '2026-10')) THEN
    RAISE EXCEPTION 'con NULL no debía devolver filas';
  END IF;
END $$;

-- ---------------------------------------------------------------------
-- Proveedor: solo se editan los parámetros, con versión.
-- ---------------------------------------------------------------------
DO $$ BEGIN
  IF (SELECT version FROM idn.proveedor WHERE codigo = 'DECOLECTA') <> 1 THEN
    RAISE EXCEPTION 'version de proveedor debía nacer en 1';
  END IF;
END $$;
UPDATE idn.proveedor SET prioridad = 2, timeout_ms = 2500, version = version + 1 WHERE codigo = 'DECOLECTA' AND version = 1;
DO $$ BEGIN
  IF (SELECT version FROM idn.proveedor WHERE codigo = 'DECOLECTA') <> 2 THEN
    RAISE EXCEPTION 'la aplicación debía poder editar el proveedor';
  END IF;
END $$;
SELECT idn_cuota_test.debe_fallar($$UPDATE idn.proveedor SET codigo = 'OTRO'$$, '42501', 'UPDATE de código');
SELECT idn_cuota_test.debe_fallar($$UPDATE idn.proveedor SET tipos_doc = '{DNI}'$$, '42501', 'UPDATE de tipos');
SELECT idn_cuota_test.debe_fallar($$INSERT INTO idn.proveedor VALUES ('OTRO', '{DNI}', 9, 1, 100, true, 1)$$,
                                  '42501', 'INSERT de proveedor');
SELECT idn_cuota_test.debe_fallar($$DELETE FROM idn.proveedor$$, '42501', 'DELETE de proveedor');

RESET ROLE;

-- Un rol sin EXECUTE no lee entre tenants.
SET ROLE idn_cuota_test_sin_permiso;
DO $$ BEGIN
  PERFORM * FROM idn.cuotas_del_periodo('2026-10', NULL, 20, 0);
  RAISE EXCEPTION 'sin EXECUTE cuotas_del_periodo debía fallar';
EXCEPTION WHEN insufficient_privilege THEN NULL;
END $$;
DO $$ BEGIN
  PERFORM * FROM idn.cuota_detalle('29000000-0000-0000-0000-00000000000a', '2026-10');
  RAISE EXCEPTION 'sin EXECUTE cuota_detalle debía fallar';
EXCEPTION WHEN insufficient_privilege THEN NULL;
END $$;
RESET ROLE;

-- Dueño idn_lector, SECURITY DEFINER, search_path vacío y sin EXECUTE para PUBLIC.
DO $$ BEGIN
  IF (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = 'idn' AND p.proname IN ('cuotas_del_periodo', 'cuota_detalle')
         AND p.prosecdef AND pg_get_userbyid(p.proowner) = 'idn_lector'
         AND p.proconfig @> ARRAY['search_path=""']
         AND NOT has_function_privilege('public', p.oid, 'EXECUTE')) <> 2 THEN
    RAISE EXCEPTION 'las funciones de consola deben ser SECURITY DEFINER de idn_lector, con search_path vacío y sin PUBLIC';
  END IF;
END $$;

-- anon y authenticated sin acceso (solo si existen: PostgreSQL plano no los trae).
DO $$
DECLARE rol text;
BEGIN
  FOREACH rol IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    CONTINUE WHEN NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = rol);
    IF has_table_privilege(rol, 'idn.cuota', 'SELECT') OR has_table_privilege(rol, 'idn.cuota', 'INSERT')
       OR has_function_privilege(rol, 'idn.cuotas_del_periodo(char, varchar, int, int)', 'EXECUTE')
       OR has_function_privilege(rol, 'idn.cuota_detalle(uuid, char)', 'EXECUTE') THEN
      RAISE EXCEPTION '% no debía tener acceso a la cuota', rol;
    END IF;
  END LOOP;
END $$;

ROLLBACK;
