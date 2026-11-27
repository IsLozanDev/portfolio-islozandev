-- Prueba de 02a_not_bajas (spec 46). La ejecuta tools/migrar/test/db-esquemas.test.mjs sobre una base temporal con
-- db/ aplicado. Corre como superusuario y evalúa con not_test_app, sin BYPASSRLS y con los mismos privilegios que la
-- aplicación. Todo en una transacción que se revierte.

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
GRANT SELECT, INSERT ON ntf.baja TO not_test_app;

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
-- Tenant A: una baja por canal, alcance y destino; los dos alcances del mismo destino conviven.
-- ---------------------------------------------------------------------
SELECT set_config('app.tenant_id', '46000000-0000-0000-0000-00000000000a', false);

INSERT INTO ntf.baja (id, tenant_id, canal, alcance, destino_hash, persona_id)
VALUES ('46000000-0000-0000-0000-0000000000a1', '46000000-0000-0000-0000-00000000000a', 'CORREO', 'PROMOCIONAL',
        'sha256:ana', '46000000-0000-0000-0000-0000000000f1');
INSERT INTO ntf.baja (id, tenant_id, canal, alcance, destino_hash)
VALUES ('46000000-0000-0000-0000-0000000000a2', '46000000-0000-0000-0000-00000000000a', 'CORREO', 'CANAL', 'sha256:ana');
SELECT not_test.debe_fallar($$
  INSERT INTO ntf.baja (id, tenant_id, canal, alcance, destino_hash)
  VALUES (gen_random_uuid(), '46000000-0000-0000-0000-00000000000a', 'CORREO', 'PROMOCIONAL', 'sha256:ana')$$,
  '23505', 'dos bajas iguales');

DO $$ BEGIN
  IF (SELECT origen FROM ntf.baja WHERE id = '46000000-0000-0000-0000-0000000000a2') <> 'ENLACE' THEN
    RAISE EXCEPTION 'el origen por defecto debía ser ENLACE';
  END IF;
END $$;

-- CHECK de la baja.
SELECT not_test.debe_fallar($$
  INSERT INTO ntf.baja (id, tenant_id, canal, alcance, destino_hash)
  VALUES (gen_random_uuid(), '46000000-0000-0000-0000-00000000000a', 'SMS', 'CANAL', 'sha256:beto')$$,
  '23514', 'canal desconocido');
SELECT not_test.debe_fallar($$
  INSERT INTO ntf.baja (id, tenant_id, canal, alcance, destino_hash)
  VALUES (gen_random_uuid(), '46000000-0000-0000-0000-00000000000a', 'CORREO', 'TODO', 'sha256:beto')$$,
  '23514', 'alcance desconocido');
SELECT not_test.debe_fallar($$
  INSERT INTO ntf.baja (id, tenant_id, canal, alcance, destino_hash, origen)
  VALUES (gen_random_uuid(), '46000000-0000-0000-0000-00000000000a', 'CORREO', 'CANAL', 'sha256:beto', 'ADMIN')$$,
  '23514', 'origen desconocido');

-- Sin UPDATE, DELETE ni TRUNCATE para la aplicación.
SELECT not_test.debe_fallar($$UPDATE ntf.baja SET alcance = 'CANAL'$$, '42501', 'UPDATE de baja');
SELECT not_test.debe_fallar($$DELETE FROM ntf.baja$$, '42501', 'DELETE de baja');
SELECT not_test.debe_fallar($$TRUNCATE ntf.baja$$, '42501', 'TRUNCATE de baja');

-- ---------------------------------------------------------------------
-- Tenant B: no ve las bajas de A, no inserta con el tenant de A y el mismo destino en B es otra baja.
-- ---------------------------------------------------------------------
SELECT set_config('app.tenant_id', '46000000-0000-0000-0000-00000000000b', false);
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM ntf.baja) THEN RAISE EXCEPTION 'B no debía ver bajas de A'; END IF;
END $$;
INSERT INTO ntf.baja (id, tenant_id, canal, alcance, destino_hash)
VALUES ('46000000-0000-0000-0000-0000000000b1', '46000000-0000-0000-0000-00000000000b', 'CORREO', 'PROMOCIONAL', 'sha256:ana');
SELECT not_test.debe_fallar($$
  INSERT INTO ntf.baja (id, tenant_id, canal, alcance, destino_hash)
  VALUES (gen_random_uuid(), '46000000-0000-0000-0000-00000000000a', 'CORREO', 'CANAL', 'sha256:beto')$$,
  '42501', 'B inserta una baja con el tenant de A');

SELECT set_config('app.tenant_id', '', false);
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM ntf.baja) THEN RAISE EXCEPTION 'sin tenant no debía ver bajas'; END IF;
END $$;

SET ROLE not_test_sin_permiso;
SELECT not_test.debe_fallar($$SELECT 1 FROM ntf.baja$$, '42501', 'lectura de baja sin privilegio');

-- El trigger rechaza UPDATE y DELETE aun para el dueño de la tabla, que no pasa por los privilegios.
RESET ROLE;
SELECT set_config('app.tenant_id', '46000000-0000-0000-0000-00000000000a', false);
SELECT not_test.debe_fallar($$UPDATE ntf.baja SET persona_id = NULL WHERE id = '46000000-0000-0000-0000-0000000000a1'$$,
  '23514', 'UPDATE de baja por el dueño');
SELECT not_test.debe_fallar($$DELETE FROM ntf.baja WHERE id = '46000000-0000-0000-0000-0000000000a1'$$,
  '23514', 'DELETE de baja por el dueño');

-- anon y authenticated sin acceso (solo si existen: PostgreSQL plano no los trae).
DO $$
DECLARE rol text;
BEGIN
  FOREACH rol IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    CONTINUE WHEN NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = rol);
    IF has_table_privilege(rol, 'ntf.baja', 'SELECT') OR has_table_privilege(rol, 'ntf.baja', 'INSERT')
       OR has_table_privilege(rol, 'ntf.baja', 'UPDATE') OR has_table_privilege(rol, 'ntf.baja', 'DELETE') THEN
      RAISE EXCEPTION '% no debía tener acceso a ntf.baja', rol;
    END IF;
  END LOOP;
END $$;

ROLLBACK;
