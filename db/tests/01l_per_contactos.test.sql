-- Prueba de 01l_per_contactos (spec 32). La ejecuta tools/migrar/test/db-esquemas.test.mjs sobre una base
-- temporal con db/ aplicado. Corre como superusuario y evalúa con per_test_app, sin BYPASSRLS y con los
-- mismos privilegios que la aplicación. Todo en una transacción que se revierte.

BEGIN;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'per_test_app') THEN
    CREATE ROLE per_test_app NOLOGIN;
  END IF;
END $$;
GRANT USAGE ON SCHEMA per TO per_test_app;
GRANT SELECT, INSERT, UPDATE ON per.persona, per.persona_rol TO per_test_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON per.contacto, per.direccion TO per_test_app;

CREATE SCHEMA per_test;
CREATE FUNCTION per_test.debe_fallar(sentencia text, esperado text, caso text) RETURNS void
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
GRANT USAGE ON SCHEMA per_test TO per_test_app;

SET ROLE per_test_app;

-- ---------------------------------------------------------------------
-- Tenant A: una persona con un rol, dos contactos y dos direcciones.
-- ---------------------------------------------------------------------
SELECT set_config('app.tenant_id', '32000000-0000-0000-0000-00000000000a', false);

INSERT INTO per.persona (id, tenant_id, tipo_persona, tipo_documento, numero_documento, nombres, apellido_paterno)
VALUES ('32000000-0000-0000-0000-0000000000a1', '32000000-0000-0000-0000-00000000000a', 'NATURAL', 'DNI', '45781236', 'Juana', 'Quispe');
INSERT INTO per.persona_rol (persona_id, tenant_id, producto_codigo, rol, desde)
VALUES ('32000000-0000-0000-0000-0000000000a1', '32000000-0000-0000-0000-00000000000a', 'CLI', 'PACIENTE', '2026-11-18');
INSERT INTO per.contacto (id, persona_id, tenant_id, tipo_contacto, valor, principal) VALUES
  ('32000000-0000-0000-0000-0000000000c1', '32000000-0000-0000-0000-0000000000a1', '32000000-0000-0000-0000-00000000000a', 'CELULAR', '987654321', true),
  ('32000000-0000-0000-0000-0000000000c2', '32000000-0000-0000-0000-0000000000a1', '32000000-0000-0000-0000-00000000000a', 'CELULAR', '912345678', false);

INSERT INTO per.direccion (id, persona_id, tenant_id, direccion, referencia, ubigeo, distrito, provincia, departamento, principal) VALUES
  ('32000000-0000-0000-0000-0000000000d1', '32000000-0000-0000-0000-0000000000a1', '32000000-0000-0000-0000-00000000000a',
   'Av. Ejército 710', 'Frente al parque', '040103', 'CAYMA', 'AREQUIPA', 'AREQUIPA', true);
INSERT INTO per.direccion (id, persona_id, tenant_id, direccion, ubigeo, distrito, provincia, departamento)
VALUES ('32000000-0000-0000-0000-0000000000d2', '32000000-0000-0000-0000-0000000000a1', '32000000-0000-0000-0000-00000000000a',
   'Calle Mercaderes 120', '040101', 'AREQUIPA', 'AREQUIPA', 'AREQUIPA');

DO $$ BEGIN
  IF (SELECT count(*) FROM per.direccion WHERE NOT principal AND referencia IS NULL) <> 1 THEN
    RAISE EXCEPTION 'la dirección debía nacer no principal y sin referencia';
  END IF;
END $$;

-- Una sola dirección principal por persona.
SELECT per_test.debe_fallar($$
  INSERT INTO per.direccion (id, persona_id, tenant_id, direccion, ubigeo, distrito, provincia, departamento, principal)
  VALUES (gen_random_uuid(), '32000000-0000-0000-0000-0000000000a1', '32000000-0000-0000-0000-00000000000a',
          'Jr. Puno 300', '040101', 'AREQUIPA', 'AREQUIPA', 'AREQUIPA', true)$$,
  '23505', 'segunda dirección principal');
SELECT per_test.debe_fallar($$
  UPDATE per.direccion SET principal = true WHERE id = '32000000-0000-0000-0000-0000000000d2'$$,
  '23505', 'marcar otra dirección como principal');
-- Desmarcar la anterior y marcar la nueva sí entra.
UPDATE per.direccion SET principal = false WHERE id = '32000000-0000-0000-0000-0000000000d1';
UPDATE per.direccion SET principal = true WHERE id = '32000000-0000-0000-0000-0000000000d2';

-- CHECK de longitud y de ubigeo.
SELECT per_test.debe_fallar($$
  INSERT INTO per.direccion (id, persona_id, tenant_id, direccion, ubigeo, distrito, provincia, departamento)
  VALUES (gen_random_uuid(), '32000000-0000-0000-0000-0000000000a1', '32000000-0000-0000-0000-00000000000a',
          'Av 1', '040103', 'CAYMA', 'AREQUIPA', 'AREQUIPA')$$,
  '23514', 'dirección de 4 caracteres');
SELECT per_test.debe_fallar($$
  INSERT INTO per.direccion (id, persona_id, tenant_id, direccion, ubigeo, distrito, provincia, departamento)
  VALUES (gen_random_uuid(), '32000000-0000-0000-0000-0000000000a1', '32000000-0000-0000-0000-00000000000a',
          repeat('a', 251), '040103', 'CAYMA', 'AREQUIPA', 'AREQUIPA')$$,
  '22001', 'dirección de 251 caracteres');
SELECT per_test.debe_fallar($$
  INSERT INTO per.direccion (id, persona_id, tenant_id, direccion, referencia, ubigeo, distrito, provincia, departamento)
  VALUES (gen_random_uuid(), '32000000-0000-0000-0000-0000000000a1', '32000000-0000-0000-0000-00000000000a',
          'Av. Ejército 710', repeat('a', 151), '040103', 'CAYMA', 'AREQUIPA', 'AREQUIPA')$$,
  '22001', 'referencia de 151 caracteres');
SELECT per_test.debe_fallar($$
  INSERT INTO per.direccion (id, persona_id, tenant_id, direccion, ubigeo, distrito, provincia, departamento)
  VALUES (gen_random_uuid(), '32000000-0000-0000-0000-0000000000a1', '32000000-0000-0000-0000-00000000000a',
          'Av. Ejército 710', '4010', 'CAYMA', 'AREQUIPA', 'AREQUIPA')$$,
  '23514', 'ubigeo de 4 dígitos');
SELECT per_test.debe_fallar($$
  INSERT INTO per.direccion (id, persona_id, tenant_id, direccion, ubigeo, distrito, provincia, departamento)
  VALUES (gen_random_uuid(), '32000000-0000-0000-0000-0000000000a1', '32000000-0000-0000-0000-00000000000a',
          'Av. Ejército 710', '04010A', 'CAYMA', 'AREQUIPA', 'AREQUIPA')$$,
  '23514', 'ubigeo con letras');
SELECT per_test.debe_fallar($$
  INSERT INTO per.direccion (id, persona_id, tenant_id, direccion, ubigeo, distrito, provincia, departamento)
  VALUES (gen_random_uuid(), gen_random_uuid(), '32000000-0000-0000-0000-00000000000a',
          'Av. Ejército 710', '040103', 'CAYMA', 'AREQUIPA', 'AREQUIPA')$$,
  '23503', 'dirección de una persona que no existe');

-- Contacto repetido: mismo tipo y valor en la persona. El mismo valor con otro tipo sí entra.
SELECT per_test.debe_fallar($$
  INSERT INTO per.contacto (id, persona_id, tenant_id, tipo_contacto, valor)
  VALUES (gen_random_uuid(), '32000000-0000-0000-0000-0000000000a1', '32000000-0000-0000-0000-00000000000a', 'CELULAR', '912345678')$$,
  '23505', 'contacto repetido');
SELECT per_test.debe_fallar($$
  UPDATE per.contacto SET valor = '987654321' WHERE id = '32000000-0000-0000-0000-0000000000c2'$$,
  '23505', 'editar un contacto al valor de otro');
INSERT INTO per.contacto (id, persona_id, tenant_id, tipo_contacto, valor)
VALUES ('32000000-0000-0000-0000-0000000000c3', '32000000-0000-0000-0000-0000000000a1', '32000000-0000-0000-0000-00000000000a', 'WHATSAPP', '912345678');

-- Borrado de contacto y de dirección propios.
DO $$
DECLARE filas int;
BEGIN
  DELETE FROM per.contacto WHERE id = '32000000-0000-0000-0000-0000000000c3';
  GET DIAGNOSTICS filas = ROW_COUNT;
  IF filas <> 1 THEN RAISE EXCEPTION 'A debía borrar su contacto'; END IF;
  DELETE FROM per.direccion WHERE id = '32000000-0000-0000-0000-0000000000d1';
  GET DIAGNOSTICS filas = ROW_COUNT;
  IF filas <> 1 THEN RAISE EXCEPTION 'A debía borrar su dirección'; END IF;
END $$;

-- Persona y rol siguen sin DELETE.
SELECT per_test.debe_fallar($$DELETE FROM per.persona_rol$$, '42501', 'DELETE de rol');
SELECT per_test.debe_fallar($$DELETE FROM per.persona$$, '42501', 'DELETE de persona');

-- ---------------------------------------------------------------------
-- RLS entre dos tenants: B no ve, cambia ni borra filas de A.
-- ---------------------------------------------------------------------
SELECT set_config('app.tenant_id', '32000000-0000-0000-0000-00000000000b', false);
INSERT INTO per.persona (id, tenant_id, tipo_persona, tipo_documento, numero_documento, nombres, apellido_paterno)
VALUES ('32000000-0000-0000-0000-0000000000b1', '32000000-0000-0000-0000-00000000000b', 'NATURAL', 'DNI', '45781236', 'Juana', 'Quispe');

DO $$
DECLARE filas int;
BEGIN
  IF EXISTS (SELECT 1 FROM per.direccion) THEN RAISE EXCEPTION 'B no debía ver direcciones de A'; END IF;
  IF EXISTS (SELECT 1 FROM per.contacto) THEN RAISE EXCEPTION 'B no debía ver contactos de A'; END IF;
  UPDATE per.direccion SET direccion = 'Otra dirección' WHERE id = '32000000-0000-0000-0000-0000000000d2';
  GET DIAGNOSTICS filas = ROW_COUNT;
  IF filas <> 0 THEN RAISE EXCEPTION 'B no debía modificar la dirección de A'; END IF;
  DELETE FROM per.direccion WHERE id = '32000000-0000-0000-0000-0000000000d2';
  GET DIAGNOSTICS filas = ROW_COUNT;
  IF filas <> 0 THEN RAISE EXCEPTION 'B no debía borrar la dirección de A'; END IF;
  DELETE FROM per.contacto WHERE id = '32000000-0000-0000-0000-0000000000c1';
  GET DIAGNOSTICS filas = ROW_COUNT;
  IF filas <> 0 THEN RAISE EXCEPTION 'B no debía borrar el contacto de A'; END IF;
END $$;
SELECT per_test.debe_fallar($$
  INSERT INTO per.direccion (id, persona_id, tenant_id, direccion, ubigeo, distrito, provincia, departamento)
  VALUES (gen_random_uuid(), '32000000-0000-0000-0000-0000000000b1', '32000000-0000-0000-0000-00000000000a',
          'Av. Ejército 710', '040103', 'CAYMA', 'AREQUIPA', 'AREQUIPA')$$,
  '42501', 'B inserta dirección con el tenant de A');

-- A conserva lo que B intentó cambiar o borrar.
SELECT set_config('app.tenant_id', '32000000-0000-0000-0000-00000000000a', false);
DO $$ BEGIN
  IF (SELECT count(*) FROM per.direccion WHERE direccion = 'Calle Mercaderes 120') <> 1
     OR (SELECT count(*) FROM per.contacto) <> 2 THEN
    RAISE EXCEPTION 'A debía conservar su dirección y sus dos contactos';
  END IF;
END $$;

SELECT set_config('app.tenant_id', '', false);
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM per.direccion) THEN RAISE EXCEPTION 'sin tenant no debía ver direcciones'; END IF;
END $$;

RESET ROLE;

-- Privilegios concedidos al rol de la aplicación (el dueño, que corrió la migración). Se leen de la ACL:
-- has_table_privilege responde verdadero a todo si el dueño es superusuario, como en CI.
CREATE FUNCTION per_test.concedido(tabla regclass, privilegio text) RETURNS boolean
LANGUAGE sql AS $$
  SELECT EXISTS (
    SELECT 1 FROM pg_class c, aclexplode(c.relacl) acl
     WHERE c.oid = tabla AND acl.grantee = c.relowner AND acl.privilege_type = privilegio)
$$;
DO $$ BEGIN
  IF NOT per_test.concedido('per.contacto', 'DELETE') OR NOT per_test.concedido('per.direccion', 'DELETE') THEN
    RAISE EXCEPTION 'la aplicación debía poder borrar contactos y direcciones';
  END IF;
  IF per_test.concedido('per.persona', 'DELETE') OR per_test.concedido('per.persona_rol', 'DELETE') THEN
    RAISE EXCEPTION 'la aplicación no debía poder borrar personas ni roles';
  END IF;
  IF per_test.concedido('per.direccion', 'TRUNCATE') OR per_test.concedido('per.contacto', 'TRUNCATE') THEN
    RAISE EXCEPTION 'la aplicación no debía poder truncar contactos ni direcciones';
  END IF;
END $$;

-- anon y authenticated sin acceso (solo si existen: PostgreSQL plano no los trae).
DO $$
DECLARE
  rol text;
  privilegio text;
BEGIN
  FOREACH rol IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    CONTINUE WHEN NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = rol);
    FOREACH privilegio IN ARRAY ARRAY['SELECT', 'INSERT', 'UPDATE', 'DELETE'] LOOP
      IF has_table_privilege(rol, 'per.direccion', privilegio) THEN
        RAISE EXCEPTION '% no debía tener % en per.direccion', rol, privilegio;
      END IF;
      IF has_table_privilege(rol, 'per.contacto', privilegio) THEN
        RAISE EXCEPTION '% no debía tener % en per.contacto', rol, privilegio;
      END IF;
    END LOOP;
  END LOOP;
END $$;

ROLLBACK;
