-- Prueba de 01q_not_plantillas (spec 43). La ejecuta tools/migrar/test/db-esquemas.test.mjs sobre una base temporal
-- con db/ aplicado. Corre como superusuario y evalúa con not_plantillas_test_app, sin BYPASSRLS y con los mismos
-- privilegios que la aplicación. Todo en una transacción que se revierte.

BEGIN;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'not_plantillas_test_app') THEN
    CREATE ROLE not_plantillas_test_app NOLOGIN;
  END IF;
END $$;
GRANT USAGE ON SCHEMA ntf TO not_plantillas_test_app;
GRANT SELECT, INSERT, UPDATE ON ntf.plantilla TO not_plantillas_test_app;

CREATE SCHEMA not_plantillas_test;
CREATE FUNCTION not_plantillas_test.debe_fallar(sentencia text, esperado text, caso text) RETURNS void
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
GRANT USAGE ON SCHEMA not_plantillas_test TO not_plantillas_test_app;

-- La base trae los ejemplos de la vista previa y no tiene autor.
DO $$ BEGIN
  IF (SELECT variables FROM ntf.plantilla WHERE id = '42000000-0000-0000-0000-000000000001')
     <> '[{"nombre":"nombre","tipo":"texto","ejemplo":"María Quispe"},{"nombre":"producto","tipo":"texto","ejemplo":"SazónPOS"}]'::jsonb THEN
    RAISE EXCEPTION 'PRUEBA_CORREO debía declarar el ejemplo de cada variable';
  END IF;
  IF (SELECT creado_por FROM ntf.plantilla WHERE id = '42000000-0000-0000-0000-000000000001') IS NOT NULL THEN
    RAISE EXCEPTION 'la base no debía tener autor';
  END IF;
END $$;

SET ROLE not_plantillas_test_app;

-- ---------------------------------------------------------------------
-- Tenant A: personaliza PRUEBA_CORREO; una segunda versión activa falla hasta desactivar la primera.
-- ---------------------------------------------------------------------
SELECT set_config('app.tenant_id', '43000000-0000-0000-0000-00000000000a', false);

INSERT INTO ntf.plantilla (id, tenant_id, codigo, canal, version, asunto, cuerpo, plantilla_base_id, creado_por, nombre)
VALUES ('43000000-0000-0000-0000-0000000000a1', '43000000-0000-0000-0000-00000000000a', 'PRUEBA_CORREO', 'CORREO', 1,
        'Prueba de A', '<p>Hola {{nombre}}</p>', '42000000-0000-0000-0000-000000000001', '43000000-0000-0000-0000-0000000000f1', 'Correo de prueba');

SELECT not_plantillas_test.debe_fallar($$
  INSERT INTO ntf.plantilla (id, tenant_id, codigo, canal, version, asunto, cuerpo, plantilla_base_id, nombre)
  VALUES (gen_random_uuid(), '43000000-0000-0000-0000-00000000000a', 'PRUEBA_CORREO', 'CORREO', 2, 'x', 'x',
          '42000000-0000-0000-0000-000000000001', 'Correo de prueba')$$,
  '23505', 'dos versiones activas del mismo tenant y código');

UPDATE ntf.plantilla SET activa = false WHERE id = '43000000-0000-0000-0000-0000000000a1';
INSERT INTO ntf.plantilla (id, tenant_id, codigo, canal, version, asunto, cuerpo, plantilla_base_id, creado_por, nombre)
VALUES ('43000000-0000-0000-0000-0000000000a2', '43000000-0000-0000-0000-00000000000a', 'PRUEBA_CORREO', 'CORREO', 2,
        'Prueba de A v2', '<p>Hola {{nombre}}</p>', '42000000-0000-0000-0000-000000000001', '43000000-0000-0000-0000-0000000000f1', 'Correo de prueba');

-- Reactivar la versión vieja con otra activa también falla.
SELECT not_plantillas_test.debe_fallar($$
  UPDATE ntf.plantilla SET activa = true WHERE id = '43000000-0000-0000-0000-0000000000a1'$$,
  '23505', 'reactivar una versión con otra activa');

-- El tenant no puede modificar la base.
DO $$
DECLARE filas int;
BEGIN
  UPDATE ntf.plantilla SET activa = false, asunto = 'cambiada' WHERE tenant_id IS NULL;
  GET DIAGNOSTICS filas = ROW_COUNT;
  IF filas <> 0 THEN RAISE EXCEPTION 'un tenant no debía modificar la plantilla base'; END IF;
END $$;

-- ---------------------------------------------------------------------
-- Tenant B: su versión activa convive con la de A; no ve ni desactiva la de A.
-- ---------------------------------------------------------------------
SELECT set_config('app.tenant_id', '43000000-0000-0000-0000-00000000000b', false);

INSERT INTO ntf.plantilla (id, tenant_id, codigo, canal, version, asunto, cuerpo, plantilla_base_id, creado_por, nombre)
VALUES ('43000000-0000-0000-0000-0000000000b1', '43000000-0000-0000-0000-00000000000b', 'PRUEBA_CORREO', 'CORREO', 1,
        'Prueba de B', '<p>Hola {{nombre}}</p>', '42000000-0000-0000-0000-000000000001', '43000000-0000-0000-0000-0000000000f2', 'Correo de prueba');

DO $$
DECLARE filas int;
BEGIN
  IF EXISTS (SELECT 1 FROM ntf.plantilla WHERE tenant_id = '43000000-0000-0000-0000-00000000000a') THEN
    RAISE EXCEPTION 'B no debía ver la personalización de A';
  END IF;
  UPDATE ntf.plantilla SET activa = false WHERE tenant_id = '43000000-0000-0000-0000-00000000000a';
  GET DIAGNOSTICS filas = ROW_COUNT;
  IF filas <> 0 THEN RAISE EXCEPTION 'B no debía desactivar la personalización de A'; END IF;
END $$;
SELECT not_plantillas_test.debe_fallar($$
  INSERT INTO ntf.plantilla (id, tenant_id, codigo, canal, version, asunto, cuerpo, nombre)
  VALUES (gen_random_uuid(), '43000000-0000-0000-0000-00000000000a', 'PRUEBA_CORREO', 'CORREO', 3, 'x', 'x', 'Correo de prueba')$$,
  '42501', 'B inserta una versión con el tenant de A');

-- A sigue con su versión 2 activa.
SELECT set_config('app.tenant_id', '43000000-0000-0000-0000-00000000000a', false);
DO $$ BEGIN
  IF (SELECT version FROM ntf.plantilla WHERE tenant_id IS NOT NULL AND activa) <> 2 THEN
    RAISE EXCEPTION 'A debía conservar su versión 2 activa';
  END IF;
END $$;

RESET ROLE;

ROLLBACK;
