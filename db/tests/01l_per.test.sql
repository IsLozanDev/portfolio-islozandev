-- Prueba de 01l_per (spec 31). La ejecuta tools/migrar/test/db-esquemas.test.mjs sobre una base temporal
-- con db/ aplicado. Corre como superusuario y evalúa con per_test_app, sin BYPASSRLS y con los mismos
-- privilegios que la aplicación. Todo en una transacción que se revierte.

BEGIN;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'per_test_app') THEN
    CREATE ROLE per_test_app NOLOGIN;
  END IF;
END $$;
GRANT USAGE ON SCHEMA per TO per_test_app;
GRANT SELECT, INSERT, UPDATE ON per.persona, per.persona_rol, per.contacto TO per_test_app;

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
-- Tenant A: natural con DNI, natural con RUC 10 y jurídica con RUC 20.
-- ---------------------------------------------------------------------
SELECT set_config('app.tenant_id', '31000000-0000-0000-0000-00000000000a', false);

INSERT INTO per.persona (id, tenant_id, tipo_persona, tipo_documento, numero_documento, nombres, apellido_paterno, apellido_materno)
VALUES ('31000000-0000-0000-0000-0000000000a1', '31000000-0000-0000-0000-00000000000a', 'NATURAL', 'DNI', '45781236', 'Juana', 'Quispe', 'Mamani');
INSERT INTO per.persona (id, tenant_id, tipo_persona, tipo_documento, numero_documento, nombres, apellido_paterno)
VALUES ('31000000-0000-0000-0000-0000000000a2', '31000000-0000-0000-0000-00000000000a', 'NATURAL', 'RUC', '10467793549', 'Pedro', 'Rojas');
INSERT INTO per.persona (id, tenant_id, tipo_persona, tipo_documento, numero_documento, razon_social)
VALUES ('31000000-0000-0000-0000-0000000000a3', '31000000-0000-0000-0000-00000000000a', 'JURIDICA', 'RUC', '20100070970', 'Supermercados Peruanos S.A.');

DO $$ BEGIN
  IF (SELECT count(*) FROM per.persona WHERE activo AND version = 1) <> 3 THEN
    RAISE EXCEPTION 'la persona debía nacer activa y en versión 1';
  END IF;
END $$;

-- Único por (tenant, tipo, número).
SELECT per_test.debe_fallar($$
  INSERT INTO per.persona (id, tenant_id, tipo_persona, tipo_documento, numero_documento, nombres, apellido_paterno)
  VALUES ('31000000-0000-0000-0000-0000000000a9', '31000000-0000-0000-0000-00000000000a', 'NATURAL', 'DNI', '45781236', 'Otra', 'Persona')$$,
  '23505', 'documento repetido en el tenant');
-- El mismo número con otro tipo sí entra.
INSERT INTO per.persona (id, tenant_id, tipo_persona, tipo_documento, numero_documento, nombres, apellido_paterno)
VALUES ('31000000-0000-0000-0000-0000000000a4', '31000000-0000-0000-0000-00000000000a', 'NATURAL', 'CE', '45781236', 'John', 'Smith');

-- CHECK de tipos, natural y jurídica.
SELECT per_test.debe_fallar($$
  INSERT INTO per.persona (id, tenant_id, tipo_persona, tipo_documento, numero_documento, nombres, apellido_paterno)
  VALUES (gen_random_uuid(), '31000000-0000-0000-0000-00000000000a', 'NATURAL', 'DOC_0', '1', 'Ana', 'Paz')$$,
  '23514', 'tipo de documento fuera de la lista');
SELECT per_test.debe_fallar($$
  INSERT INTO per.persona (id, tenant_id, tipo_persona, tipo_documento, numero_documento, nombres, apellido_paterno)
  VALUES (gen_random_uuid(), '31000000-0000-0000-0000-00000000000a', 'OTRA', 'DNI', '11111111', 'Ana', 'Paz')$$,
  '23514', 'tipo de persona fuera de la lista');
SELECT per_test.debe_fallar($$
  INSERT INTO per.persona (id, tenant_id, tipo_persona, tipo_documento, numero_documento, nombres)
  VALUES (gen_random_uuid(), '31000000-0000-0000-0000-00000000000a', 'NATURAL', 'DNI', '11111111', 'Ana')$$,
  '23514', 'natural sin apellido paterno');
SELECT per_test.debe_fallar($$
  INSERT INTO per.persona (id, tenant_id, tipo_persona, tipo_documento, numero_documento, apellido_paterno)
  VALUES (gen_random_uuid(), '31000000-0000-0000-0000-00000000000a', 'NATURAL', 'DNI', '11111111', 'Paz')$$,
  '23514', 'natural sin nombres');
SELECT per_test.debe_fallar($$
  INSERT INTO per.persona (id, tenant_id, tipo_persona, tipo_documento, numero_documento, nombres, apellido_paterno, razon_social)
  VALUES (gen_random_uuid(), '31000000-0000-0000-0000-00000000000a', 'NATURAL', 'DNI', '11111111', 'Ana', 'Paz', 'Ana Paz EIRL')$$,
  '23514', 'natural con razón social');
SELECT per_test.debe_fallar($$
  INSERT INTO per.persona (id, tenant_id, tipo_persona, tipo_documento, numero_documento, razon_social)
  VALUES (gen_random_uuid(), '31000000-0000-0000-0000-00000000000a', 'JURIDICA', 'RUC', '10467793549', 'Pedro Rojas')$$,
  '23514', 'jurídica con RUC 10');
SELECT per_test.debe_fallar($$
  INSERT INTO per.persona (id, tenant_id, tipo_persona, tipo_documento, numero_documento, razon_social)
  VALUES (gen_random_uuid(), '31000000-0000-0000-0000-00000000000a', 'JURIDICA', 'DNI', '20100070', 'Empresa S.A.')$$,
  '23514', 'jurídica con DNI');
SELECT per_test.debe_fallar($$
  INSERT INTO per.persona (id, tenant_id, tipo_persona, tipo_documento, numero_documento)
  VALUES (gen_random_uuid(), '31000000-0000-0000-0000-00000000000a', 'JURIDICA', 'RUC', '20601234565')$$,
  '23514', 'jurídica sin razón social');
SELECT per_test.debe_fallar($$
  INSERT INTO per.persona (id, tenant_id, tipo_persona, tipo_documento, numero_documento, razon_social, nombres)
  VALUES (gen_random_uuid(), '31000000-0000-0000-0000-00000000000a', 'JURIDICA', 'RUC', '20601234565', 'Empresa S.A.', 'Ana')$$,
  '23514', 'jurídica con nombres');

-- ---------------------------------------------------------------------
-- Roles: uno por (persona, producto, rol); producto y rol de la lista.
-- ---------------------------------------------------------------------
INSERT INTO per.persona_rol (persona_id, tenant_id, producto_codigo, rol, desde) VALUES
  ('31000000-0000-0000-0000-0000000000a1', '31000000-0000-0000-0000-00000000000a', 'CLI', 'PACIENTE', '2026-11-18'),
  ('31000000-0000-0000-0000-0000000000a1', '31000000-0000-0000-0000-00000000000a', 'GYM', 'SOCIO', '2026-11-18');
DO $$ BEGIN
  IF (SELECT count(*) FROM per.persona_rol WHERE hasta IS NULL) <> 2 THEN
    RAISE EXCEPTION 'TR-CA-103: una persona debía tener dos roles vigentes';
  END IF;
END $$;
SELECT per_test.debe_fallar($$
  INSERT INTO per.persona_rol (persona_id, tenant_id, producto_codigo, rol, desde)
  VALUES ('31000000-0000-0000-0000-0000000000a1', '31000000-0000-0000-0000-00000000000a', 'CLI', 'PACIENTE', '2026-11-19')$$,
  '23505', 'rol repetido');
SELECT per_test.debe_fallar($$
  INSERT INTO per.persona_rol (persona_id, tenant_id, producto_codigo, rol, desde)
  VALUES ('31000000-0000-0000-0000-0000000000a1', '31000000-0000-0000-0000-00000000000a', 'XYZ', 'CLIENTE', '2026-11-18')$$,
  '23514', 'producto fuera de la lista');
SELECT per_test.debe_fallar($$
  INSERT INTO per.persona_rol (persona_id, tenant_id, producto_codigo, rol, desde)
  VALUES ('31000000-0000-0000-0000-0000000000a1', '31000000-0000-0000-0000-00000000000a', 'CLI', 'DUEÑO', '2026-11-18')$$,
  '23514', 'rol fuera de la lista');
SELECT per_test.debe_fallar($$
  INSERT INTO per.persona_rol (persona_id, tenant_id, producto_codigo, rol, desde)
  VALUES (gen_random_uuid(), '31000000-0000-0000-0000-00000000000a', 'CLI', 'PACIENTE', '2026-11-18')$$,
  '23503', 'rol de una persona que no existe');

-- ---------------------------------------------------------------------
-- Contactos: un solo principal por tipo; varios no principales.
-- ---------------------------------------------------------------------
INSERT INTO per.contacto (id, persona_id, tenant_id, tipo_contacto, valor, principal) VALUES
  ('31000000-0000-0000-0000-0000000000c1', '31000000-0000-0000-0000-0000000000a1', '31000000-0000-0000-0000-00000000000a', 'CELULAR', '987654321', true),
  ('31000000-0000-0000-0000-0000000000c2', '31000000-0000-0000-0000-0000000000a1', '31000000-0000-0000-0000-00000000000a', 'CORREO', 'juana@vitrina.pe', true),
  ('31000000-0000-0000-0000-0000000000c3', '31000000-0000-0000-0000-0000000000a1', '31000000-0000-0000-0000-00000000000a', 'CELULAR', '912345678', false),
  ('31000000-0000-0000-0000-0000000000c4', '31000000-0000-0000-0000-0000000000a1', '31000000-0000-0000-0000-00000000000a', 'CELULAR', '923456789', false);
SELECT per_test.debe_fallar($$
  INSERT INTO per.contacto (id, persona_id, tenant_id, tipo_contacto, valor, principal)
  VALUES (gen_random_uuid(), '31000000-0000-0000-0000-0000000000a1', '31000000-0000-0000-0000-00000000000a', 'CELULAR', '934567890', true)$$,
  '23505', 'segundo celular principal');
SELECT per_test.debe_fallar($$
  UPDATE per.contacto SET principal = true WHERE id = '31000000-0000-0000-0000-0000000000c3'$$,
  '23505', 'marcar otro celular como principal');
SELECT per_test.debe_fallar($$
  INSERT INTO per.contacto (id, persona_id, tenant_id, tipo_contacto, valor)
  VALUES (gen_random_uuid(), '31000000-0000-0000-0000-0000000000a1', '31000000-0000-0000-0000-00000000000a', 'TELEGRAM', '987654321')$$,
  '23514', 'tipo de contacto fuera de la lista');

-- Sin DELETE en ninguna tabla.
SELECT per_test.debe_fallar($$DELETE FROM per.contacto$$, '42501', 'DELETE de contacto');
SELECT per_test.debe_fallar($$DELETE FROM per.persona_rol$$, '42501', 'DELETE de rol');
SELECT per_test.debe_fallar($$DELETE FROM per.persona$$, '42501', 'DELETE de persona');

-- ---------------------------------------------------------------------
-- RLS entre dos tenants. El mismo documento entra en el tenant B.
-- ---------------------------------------------------------------------
SELECT set_config('app.tenant_id', '31000000-0000-0000-0000-00000000000b', false);
INSERT INTO per.persona (id, tenant_id, tipo_persona, tipo_documento, numero_documento, nombres, apellido_paterno)
VALUES ('31000000-0000-0000-0000-0000000000b1', '31000000-0000-0000-0000-00000000000b', 'NATURAL', 'DNI', '45781236', 'Juana', 'Quispe');

DO $$
DECLARE filas int;
BEGIN
  IF (SELECT count(*) FROM per.persona) <> 1 THEN RAISE EXCEPTION 'B debía ver solo su persona'; END IF;
  IF EXISTS (SELECT 1 FROM per.persona_rol) THEN RAISE EXCEPTION 'B no debía ver roles de A'; END IF;
  IF EXISTS (SELECT 1 FROM per.contacto) THEN RAISE EXCEPTION 'B no debía ver contactos de A'; END IF;
  UPDATE per.persona SET nombres = 'Otra' WHERE id = '31000000-0000-0000-0000-0000000000a1';
  GET DIAGNOSTICS filas = ROW_COUNT;
  IF filas <> 0 THEN RAISE EXCEPTION 'B no debía modificar la persona de A'; END IF;
  UPDATE per.contacto SET valor = '900000000' WHERE id = '31000000-0000-0000-0000-0000000000c1';
  GET DIAGNOSTICS filas = ROW_COUNT;
  IF filas <> 0 THEN RAISE EXCEPTION 'B no debía modificar el contacto de A'; END IF;
END $$;
SELECT per_test.debe_fallar($$
  INSERT INTO per.persona (id, tenant_id, tipo_persona, tipo_documento, numero_documento, nombres, apellido_paterno)
  VALUES (gen_random_uuid(), '31000000-0000-0000-0000-00000000000a', 'NATURAL', 'DNI', '22222222', 'Ana', 'Paz')$$,
  '42501', 'B inserta persona con el tenant de A');
SELECT per_test.debe_fallar($$
  INSERT INTO per.persona_rol (persona_id, tenant_id, producto_codigo, rol, desde)
  VALUES ('31000000-0000-0000-0000-0000000000b1', '31000000-0000-0000-0000-00000000000a', 'CLI', 'PACIENTE', '2026-11-18')$$,
  '42501', 'B inserta rol con el tenant de A');
SELECT per_test.debe_fallar($$
  INSERT INTO per.contacto (id, persona_id, tenant_id, tipo_contacto, valor)
  VALUES (gen_random_uuid(), '31000000-0000-0000-0000-0000000000b1', '31000000-0000-0000-0000-00000000000a', 'CELULAR', '987654321')$$,
  '42501', 'B inserta contacto con el tenant de A');
SELECT per_test.debe_fallar($$
  UPDATE per.persona SET tenant_id = '31000000-0000-0000-0000-00000000000a' WHERE id = '31000000-0000-0000-0000-0000000000b1'$$,
  '42501', 'B pasa su persona a A');

SELECT set_config('app.tenant_id', '', false);
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM per.persona) OR EXISTS (SELECT 1 FROM per.persona_rol) OR EXISTS (SELECT 1 FROM per.contacto) THEN
    RAISE EXCEPTION 'sin tenant no debía ver filas';
  END IF;
END $$;

RESET ROLE;

-- anon y authenticated sin acceso (solo si existen: PostgreSQL plano no los trae).
DO $$
DECLARE
  rol text;
  tabla text;
BEGIN
  FOREACH rol IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    CONTINUE WHEN NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = rol);
    IF has_schema_privilege(rol, 'per', 'USAGE') THEN
      RAISE EXCEPTION '% no debía tener USAGE en per', rol;
    END IF;
    FOREACH tabla IN ARRAY ARRAY['per.persona', 'per.persona_rol', 'per.contacto'] LOOP
      IF has_table_privilege(rol, tabla, 'SELECT') OR has_table_privilege(rol, tabla, 'INSERT')
         OR has_table_privilege(rol, tabla, 'UPDATE') THEN
        RAISE EXCEPTION '% no debía tener acceso a %', rol, tabla;
      END IF;
    END LOOP;
  END LOOP;
END $$;

ROLLBACK;
