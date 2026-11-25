-- Prueba de 01t_not_programacion (spec 45). La ejecuta tools/migrar/test/db-esquemas.test.mjs sobre una base
-- temporal con db/ aplicado. Corre como superusuario y evalúa con not_test_app, sin BYPASSRLS y con los mismos
-- privilegios que la aplicación. Todo en una transacción que se revierte.

BEGIN;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'not_test_app') THEN
    CREATE ROLE not_test_app NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'not_test_sin_permiso') THEN
    CREATE ROLE not_test_sin_permiso NOLOGIN;
  END IF;
END $$;
GRANT USAGE ON SCHEMA ntf TO not_test_app, not_test_sin_permiso;
GRANT SELECT, INSERT, UPDATE ON ntf.programacion TO not_test_app;
GRANT EXECUTE ON FUNCTION ntf.programaciones_atrasadas(timestamptz, integer) TO not_test_app;

CREATE SCHEMA not_test;
CREATE FUNCTION not_test.debe_fallar(sentencia text, esperado text, caso text) RETURNS void
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
GRANT USAGE ON SCHEMA not_test TO not_test_app, not_test_sin_permiso;

SET ROLE not_test_app;

-- ---------------------------------------------------------------------
-- Tenant A: una viva por referencia y plantilla; viva y cancelada conviven.
-- ---------------------------------------------------------------------
SELECT set_config('app.tenant_id', '45000000-0000-0000-0000-00000000000a', false);

INSERT INTO ntf.programacion (id, tenant_id, referencia_tipo, referencia_id, plantilla_codigo, destinatario, finalidad, enviar_en, estado)
VALUES ('45000000-0000-0000-0000-0000000000a1', '45000000-0000-0000-0000-00000000000a', 'psi.cita', 'cita-1', 'PRUEBA_CORREO',
        '{"correo":"ana@ejemplo.pe"}', 'TRANSACCIONAL', now() - interval '10 minutes', 'PROGRAMADA');
SELECT not_test.debe_fallar($$
  INSERT INTO ntf.programacion (id, tenant_id, referencia_tipo, referencia_id, plantilla_codigo, destinatario, finalidad, enviar_en, estado)
  VALUES (gen_random_uuid(), '45000000-0000-0000-0000-00000000000a', 'psi.cita', 'cita-1', 'PRUEBA_CORREO',
          '{"correo":"ana@ejemplo.pe"}', 'TRANSACCIONAL', now() + interval '1 day', 'PROGRAMADA')$$,
  '23505', 'dos vivas con la misma referencia y plantilla');
INSERT INTO ntf.programacion (id, tenant_id, referencia_tipo, referencia_id, plantilla_codigo, destinatario, finalidad, enviar_en, estado)
VALUES ('45000000-0000-0000-0000-0000000000a2', '45000000-0000-0000-0000-00000000000a', 'psi.cita', 'cita-1', 'PRUEBA_CORREO',
        '{"correo":"ana@ejemplo.pe"}', 'TRANSACCIONAL', now() - interval '1 day', 'CANCELADA');
-- Otra plantilla de la misma referencia también convive; esta vence en el futuro.
INSERT INTO ntf.programacion (id, tenant_id, referencia_tipo, referencia_id, plantilla_codigo, destinatario, finalidad, enviar_en, estado)
VALUES ('45000000-0000-0000-0000-0000000000a3', '45000000-0000-0000-0000-00000000000a', 'psi.cita', 'cita-1', 'OTRA_PLANTILLA',
        '{"correo":"ana@ejemplo.pe"}', 'TRANSACCIONAL', now() + interval '1 day', 'PROGRAMADA');

-- CHECK de la programación.
SELECT not_test.debe_fallar($$
  INSERT INTO ntf.programacion (id, tenant_id, referencia_tipo, referencia_id, plantilla_codigo, destinatario, finalidad, enviar_en, estado)
  VALUES (gen_random_uuid(), '45000000-0000-0000-0000-00000000000a', 'Cita', 'x', 'PRUEBA_CORREO', '{}', 'TRANSACCIONAL', now(), 'PROGRAMADA')$$,
  '23514', 'tipo de referencia con mayúscula');
SELECT not_test.debe_fallar($$
  INSERT INTO ntf.programacion (id, tenant_id, referencia_tipo, referencia_id, plantilla_codigo, destinatario, finalidad, enviar_en, estado)
  VALUES (gen_random_uuid(), '45000000-0000-0000-0000-00000000000a', 'cita', 'x', 'PRUEBA_CORREO', '{}', 'TRANSACCIONAL', now(), 'PERDIDA')$$,
  '23514', 'estado desconocido');
SELECT not_test.debe_fallar($$
  INSERT INTO ntf.programacion (id, tenant_id, referencia_tipo, referencia_id, plantilla_codigo, destinatario, finalidad, enviar_en, estado)
  VALUES (gen_random_uuid(), '45000000-0000-0000-0000-00000000000a', 'cita', 'x', 'PRUEBA_CORREO', '{}', 'MARKETING', now(), 'PROGRAMADA')$$,
  '23514', 'finalidad desconocida');
SELECT not_test.debe_fallar($$
  INSERT INTO ntf.programacion (id, tenant_id, referencia_tipo, referencia_id, plantilla_codigo, destinatario, finalidad, enviar_en, estado)
  VALUES (gen_random_uuid(), '45000000-0000-0000-0000-00000000000a', 'cita', 'x', 'PRUEBA_CORREO', '{}', 'TRANSACCIONAL', now(), 'ENVIADA')$$,
  '23514', 'ENVIADA sin mensaje');
SELECT not_test.debe_fallar($$
  INSERT INTO ntf.programacion (id, tenant_id, referencia_tipo, referencia_id, plantilla_codigo, destinatario, finalidad, enviar_en, estado)
  VALUES (gen_random_uuid(), '45000000-0000-0000-0000-00000000000a', 'cita', 'x', 'PRUEBA_CORREO', '{}', 'TRANSACCIONAL', now(), 'DESCARTADA')$$,
  '23514', 'DESCARTADA sin motivo');

-- ---------------------------------------------------------------------
-- Tenant B: no ve ni cambia las de A; la misma referencia en B es otra.
-- ---------------------------------------------------------------------
SELECT set_config('app.tenant_id', '45000000-0000-0000-0000-00000000000b', false);
DO $$
DECLARE filas int;
BEGIN
  IF EXISTS (SELECT 1 FROM ntf.programacion) THEN RAISE EXCEPTION 'B no debía ver programaciones de A'; END IF;
  UPDATE ntf.programacion SET estado = 'CANCELADA' WHERE id = '45000000-0000-0000-0000-0000000000a1';
  GET DIAGNOSTICS filas = ROW_COUNT;
  IF filas <> 0 THEN RAISE EXCEPTION 'B no debía cancelar la programación de A'; END IF;
END $$;
INSERT INTO ntf.programacion (id, tenant_id, referencia_tipo, referencia_id, plantilla_codigo, destinatario, finalidad, enviar_en, estado)
VALUES ('45000000-0000-0000-0000-0000000000b1', '45000000-0000-0000-0000-00000000000b', 'psi.cita', 'cita-1', 'PRUEBA_CORREO',
        '{"correo":"beto@ejemplo.pe"}', 'TRANSACCIONAL', now() - interval '20 minutes', 'PROGRAMADA');
SELECT not_test.debe_fallar($$
  INSERT INTO ntf.programacion (id, tenant_id, referencia_tipo, referencia_id, plantilla_codigo, destinatario, finalidad, enviar_en, estado)
  VALUES (gen_random_uuid(), '45000000-0000-0000-0000-00000000000a', 'cita', 'x', 'PRUEBA_CORREO', '{}', 'TRANSACCIONAL', now(), 'PROGRAMADA')$$,
  '42501', 'B inserta una programación con el tenant de A');

-- ---------------------------------------------------------------------
-- ntf.programaciones_atrasadas corre como org_lector: solo las PROGRAMADA vencidas, de todos los tenants, sin
-- depender del tenant del contexto, de la más antigua a la más nueva y con el límite.
-- ---------------------------------------------------------------------
SELECT set_config('app.tenant_id', '', false);
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM ntf.programacion) THEN RAISE EXCEPTION 'sin tenant no debía ver programaciones'; END IF;
  IF (SELECT array_agg(atrasada.id ORDER BY atrasada.orden)
        FROM ntf.programaciones_atrasadas(now() - interval '5 minutes', 500) WITH ORDINALITY AS atrasada(id, tenant_id, version, orden))
     <> ARRAY['45000000-0000-0000-0000-0000000000b1', '45000000-0000-0000-0000-0000000000a1']::uuid[] THEN
    RAISE EXCEPTION 'la función debía devolver solo las PROGRAMADA vencidas de A y B, la más antigua primero';
  END IF;
  IF (SELECT count(*) FROM ntf.programaciones_atrasadas(now() - interval '5 minutes', 1)) <> 1 THEN
    RAISE EXCEPTION 'la función debía respetar el límite';
  END IF;
  IF EXISTS (SELECT 1 FROM ntf.programaciones_atrasadas(now() - interval '15 minutes', 500) WHERE id = '45000000-0000-0000-0000-0000000000a1') THEN
    RAISE EXCEPTION 'una programación vencida hace 10 min no está atrasada con un corte de 15 min';
  END IF;
END $$;

-- Sin DELETE ni TRUNCATE.
SELECT set_config('app.tenant_id', '45000000-0000-0000-0000-00000000000a', false);
SELECT not_test.debe_fallar($$DELETE FROM ntf.programacion$$, '42501', 'DELETE de programacion');
SELECT not_test.debe_fallar($$TRUNCATE ntf.programacion$$, '42501', 'TRUNCATE de programacion');

-- Solo el rol de la aplicación ejecuta la función y lee la tabla.
SET ROLE not_test_sin_permiso;
SELECT not_test.debe_fallar($$SELECT * FROM ntf.programaciones_atrasadas(now(), 10)$$, '42501', 'función sin EXECUTE');
SELECT not_test.debe_fallar($$SELECT 1 FROM ntf.programacion$$, '42501', 'lectura de programacion sin privilegio');

RESET ROLE;

-- anon y authenticated sin acceso (solo si existen: PostgreSQL plano no los trae).
DO $$
DECLARE rol text;
BEGIN
  FOREACH rol IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    CONTINUE WHEN NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = rol);
    IF has_function_privilege(rol, 'ntf.programaciones_atrasadas(timestamptz, integer)', 'EXECUTE') THEN
      RAISE EXCEPTION '% no debía ejecutar ntf.programaciones_atrasadas', rol;
    END IF;
    IF has_table_privilege(rol, 'ntf.programacion', 'SELECT') OR has_table_privilege(rol, 'ntf.programacion', 'INSERT')
       OR has_table_privilege(rol, 'ntf.programacion', 'UPDATE') OR has_table_privilege(rol, 'ntf.programacion', 'DELETE') THEN
      RAISE EXCEPTION '% no debía tener acceso a ntf.programacion', rol;
    END IF;
  END LOOP;
END $$;

ROLLBACK;
