-- Prueba de 01o_not (spec 42). La ejecuta tools/migrar/test/db-esquemas.test.mjs sobre una base temporal
-- con db/ aplicado. Corre como superusuario y evalúa con not_test_app, sin BYPASSRLS y con los mismos
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
GRANT SELECT, INSERT, UPDATE ON ntf.plantilla, ntf.mensaje TO not_test_app;
GRANT SELECT, INSERT ON ntf.intento_entrega, ntf.contacto_invalido TO not_test_app;
GRANT EXECUTE ON FUNCTION ntf.mensaje_por_id_externo(varchar) TO not_test_app;

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
-- Tenant A: ve la plantilla base, crea la suya y un mensaje.
-- ---------------------------------------------------------------------
SELECT set_config('app.tenant_id', '42000000-0000-0000-0000-00000000000a', false);

DO $$ BEGIN
  IF (SELECT count(*) FROM ntf.plantilla WHERE codigo = 'PRUEBA_CORREO' AND tenant_id IS NULL) <> 1 THEN
    RAISE EXCEPTION 'A debía ver la plantilla base PRUEBA_CORREO';
  END IF;
END $$;

INSERT INTO ntf.plantilla (id, tenant_id, codigo, canal, version, asunto, cuerpo, plantilla_base_id)
VALUES ('42000000-0000-0000-0000-0000000000a1', '42000000-0000-0000-0000-00000000000a', 'PRUEBA_CORREO', 'CORREO', 2,
        'Prueba de A', '<p>Hola {{nombre}}</p>', '42000000-0000-0000-0000-000000000001');

-- CHECK de la plantilla.
SELECT not_test.debe_fallar($$
  INSERT INTO ntf.plantilla (id, tenant_id, codigo, canal, version, asunto, cuerpo)
  VALUES (gen_random_uuid(), '42000000-0000-0000-0000-00000000000a', 'prueba', 'CORREO', 1, 'x', 'x')$$,
  '23514', 'código en minúsculas');
SELECT not_test.debe_fallar($$
  INSERT INTO ntf.plantilla (id, tenant_id, codigo, canal, version, asunto, cuerpo)
  VALUES (gen_random_uuid(), '42000000-0000-0000-0000-00000000000a', 'OTRA', 'FAX', 1, 'x', 'x')$$,
  '23514', 'canal desconocido');
SELECT not_test.debe_fallar($$
  INSERT INTO ntf.plantilla (id, tenant_id, codigo, canal, version, cuerpo)
  VALUES (gen_random_uuid(), '42000000-0000-0000-0000-00000000000a', 'OTRA', 'CORREO', 1, 'x')$$,
  '23514', 'correo sin asunto');
SELECT not_test.debe_fallar($$
  INSERT INTO ntf.plantilla (id, tenant_id, codigo, canal, version, asunto, cuerpo)
  VALUES (gen_random_uuid(), '42000000-0000-0000-0000-00000000000a', 'OTRA', 'CORREO', 0, 'x', 'x')$$,
  '23514', 'versión cero');
SELECT not_test.debe_fallar($$
  INSERT INTO ntf.plantilla (id, tenant_id, codigo, canal, version, asunto, cuerpo, variables)
  VALUES (gen_random_uuid(), '42000000-0000-0000-0000-00000000000a', 'OTRA', 'CORREO', 1, 'x', 'x', '{}')$$,
  '23514', 'variables que no son arreglo');
SELECT not_test.debe_fallar($$
  INSERT INTO ntf.plantilla (id, tenant_id, codigo, canal, version, asunto, cuerpo)
  VALUES (gen_random_uuid(), '42000000-0000-0000-0000-00000000000a', 'PRUEBA_CORREO', 'CORREO', 2, 'x', 'x')$$,
  '23505', 'misma versión de la plantilla del tenant');
-- Las base solo por migración.
SELECT not_test.debe_fallar($$
  INSERT INTO ntf.plantilla (id, tenant_id, codigo, canal, version, asunto, cuerpo)
  VALUES (gen_random_uuid(), NULL, 'OTRA', 'CORREO', 1, 'x', 'x')$$,
  '42501', 'plantilla base desde un tenant');
DO $$
DECLARE filas int;
BEGIN
  UPDATE ntf.plantilla SET activa = false WHERE tenant_id IS NULL;
  GET DIAGNOSTICS filas = ROW_COUNT;
  IF filas <> 0 THEN RAISE EXCEPTION 'un tenant no debía modificar la plantilla base'; END IF;
END $$;

INSERT INTO ntf.mensaje (id, tenant_id, plantilla_id, canal, destino, destino_hash, finalidad, asunto, cuerpo,
                         clave_idempotencia, estado, id_externo)
VALUES ('42000000-0000-0000-0000-0000000000a2', '42000000-0000-0000-0000-00000000000a', '42000000-0000-0000-0000-0000000000a1',
        'CORREO', 'ana@ejemplo.pe', 'sha256:aaa', 'TRANSACCIONAL', 'Prueba de A', '<p>Hola Ana</p>',
        '42000000-0000-0000-0000-0000000000c1', 'ENVIADO', 're_a');
INSERT INTO ntf.intento_entrega (id, tenant_id, mensaje_id, numero, resultado)
VALUES (gen_random_uuid(), '42000000-0000-0000-0000-00000000000a', '42000000-0000-0000-0000-0000000000a2', 1, 'ACEPTADO');
INSERT INTO ntf.contacto_invalido (tenant_id, canal, destino_hash, motivo)
VALUES ('42000000-0000-0000-0000-00000000000a', 'CORREO', 'sha256:rebotado', 'REBOTE_DURO');
INSERT INTO ntf.contacto_invalido (tenant_id, canal, destino_hash, motivo)
VALUES ('42000000-0000-0000-0000-00000000000a', 'CORREO', 'sha256:rebotado', 'REBOTE_DURO')
ON CONFLICT DO NOTHING;

-- CHECK y unicidad del mensaje.
SELECT not_test.debe_fallar($$
  INSERT INTO ntf.mensaje (id, tenant_id, plantilla_id, canal, destino, destino_hash, finalidad, asunto, cuerpo, clave_idempotencia, estado)
  VALUES (gen_random_uuid(), '42000000-0000-0000-0000-00000000000a', '42000000-0000-0000-0000-000000000001', 'CORREO',
          'otro@ejemplo.pe', 'sha256:bbb', 'TRANSACCIONAL', 'x', 'x', '42000000-0000-0000-0000-0000000000c1', 'ENCOLADO')$$,
  '23505', 'clave de idempotencia repetida en el tenant');
SELECT not_test.debe_fallar($$
  INSERT INTO ntf.mensaje (id, tenant_id, plantilla_id, canal, destino, destino_hash, finalidad, asunto, cuerpo, clave_idempotencia, estado)
  VALUES (gen_random_uuid(), '42000000-0000-0000-0000-00000000000a', '42000000-0000-0000-0000-000000000001', 'SMS',
          'x', 'sha256:x', 'TRANSACCIONAL', 'x', 'x', gen_random_uuid(), 'ENCOLADO')$$,
  '23514', 'canal distinto de CORREO');
SELECT not_test.debe_fallar($$
  UPDATE ntf.mensaje SET estado = 'PERDIDO'$$, '23514', 'estado desconocido');
SELECT not_test.debe_fallar($$
  UPDATE ntf.mensaje SET finalidad = 'MARKETING'$$, '23514', 'finalidad desconocida');
SELECT not_test.debe_fallar($$
  INSERT INTO ntf.intento_entrega (id, tenant_id, mensaje_id, numero, resultado)
  VALUES (gen_random_uuid(), '42000000-0000-0000-0000-00000000000a', '42000000-0000-0000-0000-0000000000a2', 0, 'ACEPTADO')$$,
  '23514', 'intento número cero');
SELECT not_test.debe_fallar($$
  INSERT INTO ntf.intento_entrega (id, tenant_id, mensaje_id, numero, resultado)
  VALUES (gen_random_uuid(), '42000000-0000-0000-0000-00000000000a', '42000000-0000-0000-0000-0000000000a2', 1, 'PERDIDO')$$,
  '23514', 'resultado desconocido');

-- ---------------------------------------------------------------------
-- Tenant B: ve la base pero no la plantilla de A, ni mensajes, intentos o contactos inválidos ajenos.
-- La misma clave de idempotencia en otro tenant es otra.
-- ---------------------------------------------------------------------
SELECT set_config('app.tenant_id', '42000000-0000-0000-0000-00000000000b', false);
DO $$
DECLARE filas int;
BEGIN
  -- Las migraciones posteriores siembran más bases (spec 44): se cuenta solo PRUEBA_CORREO.
  IF (SELECT count(*) FROM ntf.plantilla WHERE tenant_id IS NOT NULL) <> 0
     OR (SELECT count(*) FROM ntf.plantilla WHERE tenant_id IS NULL AND codigo = 'PRUEBA_CORREO') <> 1 THEN
    RAISE EXCEPTION 'B debía ver solo la plantilla base';
  END IF;
  IF EXISTS (SELECT 1 FROM ntf.mensaje) THEN RAISE EXCEPTION 'B no debía ver mensajes de A'; END IF;
  IF EXISTS (SELECT 1 FROM ntf.intento_entrega) THEN RAISE EXCEPTION 'B no debía ver intentos de A'; END IF;
  IF EXISTS (SELECT 1 FROM ntf.contacto_invalido) THEN RAISE EXCEPTION 'B no debía ver contactos inválidos de A'; END IF;
  UPDATE ntf.mensaje SET estado = 'FALLIDO' WHERE id = '42000000-0000-0000-0000-0000000000a2';
  GET DIAGNOSTICS filas = ROW_COUNT;
  IF filas <> 0 THEN RAISE EXCEPTION 'B no debía modificar el mensaje de A'; END IF;
  UPDATE ntf.plantilla SET activa = false WHERE id = '42000000-0000-0000-0000-0000000000a1';
  GET DIAGNOSTICS filas = ROW_COUNT;
  IF filas <> 0 THEN RAISE EXCEPTION 'B no debía modificar la plantilla de A'; END IF;
END $$;

INSERT INTO ntf.mensaje (id, tenant_id, plantilla_id, canal, destino, destino_hash, finalidad, asunto, cuerpo,
                         clave_idempotencia, estado)
VALUES ('42000000-0000-0000-0000-0000000000b2', '42000000-0000-0000-0000-00000000000b', '42000000-0000-0000-0000-000000000001',
        'CORREO', 'beto@ejemplo.pe', 'sha256:bbb', 'TRANSACCIONAL', 'Prueba', '<p>Hola Beto</p>',
        '42000000-0000-0000-0000-0000000000c1', 'ENCOLADO');
SELECT not_test.debe_fallar($$
  INSERT INTO ntf.mensaje (id, tenant_id, plantilla_id, canal, destino, destino_hash, finalidad, asunto, cuerpo, clave_idempotencia, estado)
  VALUES (gen_random_uuid(), '42000000-0000-0000-0000-00000000000a', '42000000-0000-0000-0000-000000000001', 'CORREO',
          'x@ejemplo.pe', 'sha256:x', 'TRANSACCIONAL', 'x', 'x', gen_random_uuid(), 'ENCOLADO')$$,
  '42501', 'B inserta un mensaje con el tenant de A');
SELECT not_test.debe_fallar($$
  INSERT INTO ntf.contacto_invalido (tenant_id, canal, destino_hash, motivo)
  VALUES ('42000000-0000-0000-0000-00000000000a', 'CORREO', 'sha256:x', 'REBOTE_DURO')$$,
  '42501', 'B marca un contacto inválido de A');
SELECT not_test.debe_fallar($$
  UPDATE ntf.mensaje SET tenant_id = '42000000-0000-0000-0000-00000000000a' WHERE id = '42000000-0000-0000-0000-0000000000b2'$$,
  '42501', 'B pasa su mensaje a A');

-- ---------------------------------------------------------------------
-- ntf.mensaje_por_id_externo corre como org_lector: ubica el mensaje de A desde B o sin tenant.
-- ---------------------------------------------------------------------
DO $$ BEGIN
  IF (SELECT tenant_id FROM ntf.mensaje_por_id_externo('re_a')) <> '42000000-0000-0000-0000-00000000000a' THEN
    RAISE EXCEPTION 'desde B la función debía ubicar el mensaje de A';
  END IF;
  IF EXISTS (SELECT 1 FROM ntf.mensaje_por_id_externo('re_desconocido')) THEN
    RAISE EXCEPTION 'un id externo desconocido no debía devolver filas';
  END IF;
END $$;
SELECT set_config('app.tenant_id', '', false);
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM ntf.mensaje) OR EXISTS (SELECT 1 FROM ntf.plantilla WHERE tenant_id IS NOT NULL) THEN
    RAISE EXCEPTION 'sin tenant no debía ver filas de tenants';
  END IF;
  IF (SELECT id FROM ntf.mensaje_por_id_externo('re_a')) <> '42000000-0000-0000-0000-0000000000a2' THEN
    RAISE EXCEPTION 'la función no debía depender del tenant del contexto';
  END IF;
END $$;

-- Sin DELETE ni TRUNCATE; intentos y contactos inválidos no se modifican.
SELECT set_config('app.tenant_id', '42000000-0000-0000-0000-00000000000a', false);
SELECT not_test.debe_fallar($$DELETE FROM ntf.mensaje$$, '42501', 'DELETE de mensaje');
SELECT not_test.debe_fallar($$DELETE FROM ntf.plantilla$$, '42501', 'DELETE de plantilla');
SELECT not_test.debe_fallar($$TRUNCATE ntf.intento_entrega$$, '42501', 'TRUNCATE de intento_entrega');
SELECT not_test.debe_fallar($$UPDATE ntf.intento_entrega SET numero = 2$$, '42501', 'UPDATE de intento_entrega');
SELECT not_test.debe_fallar($$UPDATE ntf.contacto_invalido SET motivo = 'X'$$, '42501', 'UPDATE de contacto_invalido');

-- Solo el rol de la aplicación ejecuta la función y lee las tablas.
SET ROLE not_test_sin_permiso;
SELECT not_test.debe_fallar($$SELECT * FROM ntf.mensaje_por_id_externo('re_a')$$, '42501', 'función sin EXECUTE');
SELECT not_test.debe_fallar($$SELECT 1 FROM ntf.mensaje$$, '42501', 'lectura de mensaje sin privilegio');
SELECT not_test.debe_fallar($$SELECT 1 FROM ntf.plantilla$$, '42501', 'lectura de plantilla sin privilegio');

RESET ROLE;

-- anon y authenticated sin acceso (solo si existen: PostgreSQL plano no los trae).
DO $$
DECLARE
  rol text;
  tabla text;
BEGIN
  FOREACH rol IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    CONTINUE WHEN NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = rol);
    IF has_schema_privilege(rol, 'ntf', 'USAGE') THEN
      RAISE EXCEPTION '% no debía tener USAGE en ntf', rol;
    END IF;
    IF has_function_privilege(rol, 'ntf.mensaje_por_id_externo(varchar)', 'EXECUTE') THEN
      RAISE EXCEPTION '% no debía ejecutar ntf.mensaje_por_id_externo', rol;
    END IF;
    FOREACH tabla IN ARRAY ARRAY['ntf.plantilla', 'ntf.mensaje', 'ntf.intento_entrega', 'ntf.contacto_invalido'] LOOP
      IF has_table_privilege(rol, tabla, 'SELECT') OR has_table_privilege(rol, tabla, 'INSERT')
         OR has_table_privilege(rol, tabla, 'UPDATE') OR has_table_privilege(rol, tabla, 'DELETE') THEN
        RAISE EXCEPTION '% no debía tener acceso a %', rol, tabla;
      END IF;
    END LOOP;
  END LOOP;
END $$;

ROLLBACK;
