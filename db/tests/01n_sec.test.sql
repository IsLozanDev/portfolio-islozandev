-- Prueba de 01n_sec (spec 41). La ejecuta tools/migrar/test/db-esquemas.test.mjs sobre una base temporal
-- con db/ aplicado. Corre como superusuario y evalúa con sec_test_app, sin BYPASSRLS y con los mismos
-- privilegios que la aplicación. Todo en una transacción que se revierte.

BEGIN;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'sec_test_app') THEN
    CREATE ROLE sec_test_app NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'sec_test_sin_permiso') THEN
    CREATE ROLE sec_test_sin_permiso NOLOGIN;
  END IF;
END $$;
GRANT USAGE ON SCHEMA sec TO sec_test_app, sec_test_sin_permiso;
GRANT SELECT, INSERT, UPDATE ON sec.clave_tenant TO sec_test_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON sec.secreto TO sec_test_app;
GRANT EXECUTE ON FUNCTION sec.tenants_por_reenvolver(smallint, integer) TO sec_test_app;

CREATE SCHEMA sec_test;
CREATE FUNCTION sec_test.debe_fallar(sentencia text, esperado text, caso text) RETURNS void
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
-- Bytes de relleno del largo pedido: la prueba no necesita cifrados reales.
CREATE FUNCTION sec_test.bytes(largo integer) RETURNS bytea
LANGUAGE sql IMMUTABLE AS $$ SELECT decode(repeat('ab', largo), 'hex') $$;
GRANT USAGE ON SCHEMA sec_test TO sec_test_app, sec_test_sin_permiso;
GRANT EXECUTE ON FUNCTION sec_test.bytes(integer) TO sec_test_app;

SET ROLE sec_test_app;

-- ---------------------------------------------------------------------
-- Tenant A: su clave envuelta con la maestra 1 y un secreto.
-- ---------------------------------------------------------------------
SELECT set_config('app.tenant_id', '41000000-0000-0000-0000-00000000000a', false);

INSERT INTO sec.clave_tenant (tenant_id, clave_cifrada, iv, version_clave_maestra)
VALUES ('41000000-0000-0000-0000-00000000000a', sec_test.bytes(48), sec_test.bytes(12), 1);
INSERT INTO sec.secreto (id, tenant_id, tipo, cifrado, iv, creado_por)
VALUES ('41000000-0000-0000-0000-0000000000a1', '41000000-0000-0000-0000-00000000000a', 'fe.clave_certificado',
        sec_test.bytes(17), sec_test.bytes(12), '41000000-0000-0000-0000-0000000000f1');

DO $$ BEGIN
  IF (SELECT count(*) FROM sec.secreto WHERE version = 1 AND rotado_por IS NULL AND rotado_en IS NULL) <> 1 THEN
    RAISE EXCEPTION 'el secreto debía nacer en versión 1 y sin rotación';
  END IF;
  IF (SELECT reenvuelta_en FROM sec.clave_tenant) IS NOT NULL THEN
    RAISE EXCEPTION 'la clave debía nacer sin re-envoltura';
  END IF;
END $$;

-- CHECK de tamaños de la clave envuelta.
SELECT sec_test.debe_fallar($$
  UPDATE sec.clave_tenant SET clave_cifrada = sec_test.bytes(47)$$, '23514', 'clave envuelta de 47 bytes');
SELECT sec_test.debe_fallar($$
  UPDATE sec.clave_tenant SET clave_cifrada = sec_test.bytes(49)$$, '23514', 'clave envuelta de 49 bytes');
SELECT sec_test.debe_fallar($$
  UPDATE sec.clave_tenant SET iv = sec_test.bytes(16)$$, '23514', 'IV de la clave de 16 bytes');
SELECT sec_test.debe_fallar($$
  UPDATE sec.clave_tenant SET version_clave_maestra = 0$$, '23514', 'versión de maestra cero');

-- CHECK de tamaños del secreto: de 1 B a 64 KiB más 16 de etiqueta.
UPDATE sec.secreto SET cifrado = sec_test.bytes(65552) WHERE id = '41000000-0000-0000-0000-0000000000a1';
SELECT sec_test.debe_fallar($$
  UPDATE sec.secreto SET cifrado = sec_test.bytes(65553)$$, '23514', 'secreto de más de 64 KiB');
SELECT sec_test.debe_fallar($$
  UPDATE sec.secreto SET cifrado = sec_test.bytes(16)$$, '23514', 'secreto vacío (solo etiqueta)');
SELECT sec_test.debe_fallar($$
  UPDATE sec.secreto SET iv = sec_test.bytes(11)$$, '23514', 'IV del secreto de 11 bytes');
SELECT sec_test.debe_fallar($$
  UPDATE sec.secreto SET version = 0$$, '23514', 'versión del secreto cero');

-- Formato componente.nombre del tipo.
SELECT sec_test.debe_fallar($$
  UPDATE sec.secreto SET tipo = 'FE.clave_certificado'$$, '23514', 'tipo en mayúsculas');
SELECT sec_test.debe_fallar($$
  UPDATE sec.secreto SET tipo = 'clave_certificado'$$, '23514', 'tipo sin componente');
SELECT sec_test.debe_fallar($$
  UPDATE sec.secreto SET tipo = 'fe.clave.certificado'$$, '23514', 'tipo con dos puntos');
SELECT sec_test.debe_fallar($$
  UPDATE sec.secreto SET tipo = 'fe.1clave'$$, '23514', 'nombre que empieza con dígito');
UPDATE sec.secreto SET tipo = 'pag.llave_privada2' WHERE id = '41000000-0000-0000-0000-0000000000a1';

-- La rotación cambia el cifrado, el IV y la versión.
UPDATE sec.secreto SET cifrado = sec_test.bytes(40), iv = sec_test.bytes(12), version = version + 1,
       rotado_por = '41000000-0000-0000-0000-0000000000f1', rotado_en = now()
 WHERE id = '41000000-0000-0000-0000-0000000000a1' AND version = 1;
DO $$ BEGIN
  IF (SELECT version FROM sec.secreto WHERE id = '41000000-0000-0000-0000-0000000000a1') <> 2 THEN
    RAISE EXCEPTION 'la rotación debía dejar la versión 2';
  END IF;
END $$;

-- ---------------------------------------------------------------------
-- Tenant B: sin clave no hay secreto (FK); con su clave, en la maestra 2.
-- ---------------------------------------------------------------------
SELECT set_config('app.tenant_id', '41000000-0000-0000-0000-00000000000b', false);
SELECT sec_test.debe_fallar($$
  INSERT INTO sec.secreto (id, tenant_id, tipo, cifrado, iv, creado_por)
  VALUES (gen_random_uuid(), '41000000-0000-0000-0000-00000000000b', 'fe.clave_certificado', sec_test.bytes(17), sec_test.bytes(12), gen_random_uuid())$$,
  '23503', 'secreto de un tenant sin clave de datos');

INSERT INTO sec.clave_tenant (tenant_id, clave_cifrada, iv, version_clave_maestra)
VALUES ('41000000-0000-0000-0000-00000000000b', sec_test.bytes(48), sec_test.bytes(12), 2);
SELECT sec_test.debe_fallar($$
  INSERT INTO sec.clave_tenant (tenant_id, clave_cifrada, iv, version_clave_maestra)
  VALUES ('41000000-0000-0000-0000-00000000000b', sec_test.bytes(48), sec_test.bytes(12), 2)$$,
  '23505', 'segunda clave del mismo tenant');
INSERT INTO sec.secreto (id, tenant_id, tipo, cifrado, iv, creado_por)
VALUES ('41000000-0000-0000-0000-0000000000b1', '41000000-0000-0000-0000-00000000000b', 'not.token_canal',
        sec_test.bytes(30), sec_test.bytes(12), '41000000-0000-0000-0000-0000000000f2');

-- RLS entre dos tenants: B no ve ni toca lo de A.
DO $$
DECLARE filas int;
BEGIN
  IF (SELECT count(*) FROM sec.clave_tenant) <> 1 THEN RAISE EXCEPTION 'B debía ver solo su clave'; END IF;
  IF (SELECT count(*) FROM sec.secreto) <> 1 THEN RAISE EXCEPTION 'B debía ver solo su secreto'; END IF;
  UPDATE sec.secreto SET version = 9 WHERE id = '41000000-0000-0000-0000-0000000000a1';
  GET DIAGNOSTICS filas = ROW_COUNT;
  IF filas <> 0 THEN RAISE EXCEPTION 'B no debía modificar el secreto de A'; END IF;
  DELETE FROM sec.secreto WHERE id = '41000000-0000-0000-0000-0000000000a1';
  GET DIAGNOSTICS filas = ROW_COUNT;
  IF filas <> 0 THEN RAISE EXCEPTION 'B no debía borrar el secreto de A'; END IF;
  UPDATE sec.clave_tenant SET version_clave_maestra = 3 WHERE tenant_id = '41000000-0000-0000-0000-00000000000a';
  GET DIAGNOSTICS filas = ROW_COUNT;
  IF filas <> 0 THEN RAISE EXCEPTION 'B no debía re-envolver la clave de A'; END IF;
END $$;
SELECT sec_test.debe_fallar($$
  INSERT INTO sec.secreto (id, tenant_id, tipo, cifrado, iv, creado_por)
  VALUES (gen_random_uuid(), '41000000-0000-0000-0000-00000000000a', 'fe.clave_certificado', sec_test.bytes(17), sec_test.bytes(12), gen_random_uuid())$$,
  '42501', 'B inserta un secreto con el tenant de A');
SELECT sec_test.debe_fallar($$
  UPDATE sec.secreto SET tenant_id = '41000000-0000-0000-0000-00000000000a' WHERE id = '41000000-0000-0000-0000-0000000000b1'$$,
  '42501', 'B pasa su secreto a A');
SELECT sec_test.debe_fallar($$
  UPDATE sec.clave_tenant SET tenant_id = '41000000-0000-0000-0000-00000000000a'$$,
  '42501', 'B pasa su clave a A');

-- La clave de un tenant no se borra ni se trunca.
SELECT sec_test.debe_fallar($$DELETE FROM sec.clave_tenant$$, '42501', 'DELETE de clave_tenant');
SELECT sec_test.debe_fallar($$TRUNCATE sec.clave_tenant CASCADE$$, '42501', 'TRUNCATE de clave_tenant');
SELECT sec_test.debe_fallar($$TRUNCATE sec.secreto$$, '42501', 'TRUNCATE de secreto');

-- ---------------------------------------------------------------------
-- sec.tenants_por_reenvolver corre como org_lector: ve las claves de todos los tenants sin depender del
-- tenant del contexto.
-- ---------------------------------------------------------------------
DO $$ BEGIN
  IF (SELECT array_agg(tenant_id ORDER BY tenant_id) FROM sec.tenants_por_reenvolver(2::smallint, 200))
     <> ARRAY['41000000-0000-0000-0000-00000000000a']::uuid[] THEN
    RAISE EXCEPTION 'con la 2 activa solo debía salir A, envuelta con la 1';
  END IF;
  IF (SELECT count(*) FROM sec.tenants_por_reenvolver(3::smallint, 200)) <> 2 THEN
    RAISE EXCEPTION 'con la 3 activa debían salir A y B';
  END IF;
  IF (SELECT count(*) FROM sec.tenants_por_reenvolver(3::smallint, 1)) <> 1 THEN
    RAISE EXCEPTION 'el límite debía dejar un solo tenant';
  END IF;
END $$;

SELECT set_config('app.tenant_id', '', false);
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM sec.clave_tenant) OR EXISTS (SELECT 1 FROM sec.secreto) THEN
    RAISE EXCEPTION 'sin tenant no debía ver filas';
  END IF;
  IF (SELECT count(*) FROM sec.tenants_por_reenvolver(3::smallint, 200)) <> 2 THEN
    RAISE EXCEPTION 'la función no debía depender del tenant del contexto';
  END IF;
END $$;

-- Con el contexto de A se re-envuelve su clave y se borra su secreto.
SELECT set_config('app.tenant_id', '41000000-0000-0000-0000-00000000000a', false);
UPDATE sec.clave_tenant SET clave_cifrada = sec_test.bytes(48), iv = sec_test.bytes(12), version_clave_maestra = 2, reenvuelta_en = now();
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM sec.tenants_por_reenvolver(2::smallint, 200)) THEN
    RAISE EXCEPTION 'tras re-envolver A no debía quedar ninguna clave en la 1';
  END IF;
END $$;
DELETE FROM sec.secreto WHERE id = '41000000-0000-0000-0000-0000000000a1';
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM sec.secreto) THEN RAISE EXCEPTION 'el borrado debía llevarse el secreto de A'; END IF;
END $$;

-- Solo el rol de la aplicación ejecuta la función y lee las tablas.
SET ROLE sec_test_sin_permiso;
SELECT sec_test.debe_fallar($$SELECT * FROM sec.tenants_por_reenvolver(1::smallint, 200)$$, '42501', 'función sin EXECUTE');
SELECT sec_test.debe_fallar($$SELECT 1 FROM sec.clave_tenant$$, '42501', 'lectura de clave_tenant sin privilegio');
SELECT sec_test.debe_fallar($$SELECT 1 FROM sec.secreto$$, '42501', 'lectura de secreto sin privilegio');

RESET ROLE;

-- anon y authenticated sin acceso (solo si existen: PostgreSQL plano no los trae).
DO $$
DECLARE
  rol text;
  tabla text;
BEGIN
  FOREACH rol IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    CONTINUE WHEN NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = rol);
    IF has_schema_privilege(rol, 'sec', 'USAGE') THEN
      RAISE EXCEPTION '% no debía tener USAGE en sec', rol;
    END IF;
    IF has_function_privilege(rol, 'sec.tenants_por_reenvolver(smallint, integer)', 'EXECUTE') THEN
      RAISE EXCEPTION '% no debía ejecutar sec.tenants_por_reenvolver', rol;
    END IF;
    FOREACH tabla IN ARRAY ARRAY['sec.clave_tenant', 'sec.secreto'] LOOP
      IF has_table_privilege(rol, tabla, 'SELECT') OR has_table_privilege(rol, tabla, 'INSERT')
         OR has_table_privilege(rol, tabla, 'UPDATE') OR has_table_privilege(rol, tabla, 'DELETE') THEN
        RAISE EXCEPTION '% no debía tener acceso a %', rol, tabla;
      END IF;
    END LOOP;
  END LOOP;
END $$;

ROLLBACK;
