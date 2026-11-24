-- Prueba de 01l_per_fusion (spec 39). La ejecuta tools/migrar/test/db-esquemas.test.mjs sobre una base temporal
-- con db/ aplicado. Corre como superusuario y evalúa con per_test_app, sin BYPASSRLS y con los mismos
-- privilegios que la aplicación. Todo en una transacción que se revierte.

BEGIN;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'per_test_app') THEN
    CREATE ROLE per_test_app NOLOGIN;
  END IF;
END $$;
GRANT USAGE ON SCHEMA per TO per_test_app;
GRANT SELECT, INSERT, UPDATE ON per.persona TO per_test_app;
GRANT SELECT, INSERT ON per.fusion TO per_test_app;
GRANT SELECT, INSERT, DELETE ON per.par_descartado TO per_test_app;

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
-- Tenant A: Juana con DNI (conservada), Juana con pasaporte (absorbida) y otra persona.
-- ---------------------------------------------------------------------
SELECT set_config('app.tenant_id', '39000000-0000-0000-0000-00000000000a', false);

INSERT INTO per.persona (id, tenant_id, tipo_persona, tipo_documento, numero_documento, nombres, apellido_paterno, apellido_materno) VALUES
  ('39000000-0000-0000-0000-0000000000a1', '39000000-0000-0000-0000-00000000000a', 'NATURAL', 'DNI', '45781236', 'Juana', 'Quispe', 'Mamani'),
  ('39000000-0000-0000-0000-0000000000a2', '39000000-0000-0000-0000-00000000000a', 'NATURAL', 'PASAPORTE', 'P1234567', 'Juana', 'Quispe', NULL),
  ('39000000-0000-0000-0000-0000000000a3', '39000000-0000-0000-0000-00000000000a', 'NATURAL', 'DNI', '45781237', 'Rosa', 'Quispe', NULL);

-- Alias: completo, no propio e inactivo.
SELECT per_test.debe_fallar($$
  UPDATE per.persona SET activo = false, fusionada_en_id = '39000000-0000-0000-0000-0000000000a1'
   WHERE id = '39000000-0000-0000-0000-0000000000a2'$$,
  '23514', 'alias sin fecha');
SELECT per_test.debe_fallar($$
  UPDATE per.persona SET activo = false, fusionada_en_id = id, fusionada_en = now()
   WHERE id = '39000000-0000-0000-0000-0000000000a2'$$,
  '23514', 'alias de sí misma');
SELECT per_test.debe_fallar($$
  UPDATE per.persona SET fusionada_en_id = '39000000-0000-0000-0000-0000000000a1', fusionada_en = now()
   WHERE id = '39000000-0000-0000-0000-0000000000a2'$$,
  '23514', 'alias activo');
SELECT per_test.debe_fallar($$
  UPDATE per.persona SET activo = false, fusionada_en_id = gen_random_uuid(), fusionada_en = now()
   WHERE id = '39000000-0000-0000-0000-0000000000a2'$$,
  '23503', 'alias de una persona que no existe');

UPDATE per.persona SET activo = false, fusionada_en_id = '39000000-0000-0000-0000-0000000000a1', fusionada_en = now()
 WHERE id = '39000000-0000-0000-0000-0000000000a2';

-- Fusión: motivo de 5 a 300, distintas y una sola por absorbida.
SELECT per_test.debe_fallar($$
  INSERT INTO per.fusion (id, tenant_id, persona_conservada_id, persona_absorbida_id, campos_elegidos, motivo, fusionado_por)
  VALUES (gen_random_uuid(), '39000000-0000-0000-0000-00000000000a', '39000000-0000-0000-0000-0000000000a1',
          '39000000-0000-0000-0000-0000000000a2', '{}', '  abc  ', gen_random_uuid())$$,
  '23514', 'motivo de 3 caracteres recortado');
SELECT per_test.debe_fallar($$
  INSERT INTO per.fusion (id, tenant_id, persona_conservada_id, persona_absorbida_id, campos_elegidos, motivo, fusionado_por)
  VALUES (gen_random_uuid(), '39000000-0000-0000-0000-00000000000a', '39000000-0000-0000-0000-0000000000a1',
          '39000000-0000-0000-0000-0000000000a1', '{}', 'Misma clienta', gen_random_uuid())$$,
  '23514', 'conservada igual a absorbida');

INSERT INTO per.fusion (id, tenant_id, persona_conservada_id, persona_absorbida_id, campos_elegidos, motivo, fusionado_por)
VALUES ('39000000-0000-0000-0000-0000000000f1', '39000000-0000-0000-0000-00000000000a', '39000000-0000-0000-0000-0000000000a1',
        '39000000-0000-0000-0000-0000000000a2', '{"datos_basicos": {}, "principales": {}}', 'Misma clienta con pasaporte', gen_random_uuid());

SELECT per_test.debe_fallar($$
  INSERT INTO per.fusion (id, tenant_id, persona_conservada_id, persona_absorbida_id, campos_elegidos, motivo, fusionado_por)
  VALUES (gen_random_uuid(), '39000000-0000-0000-0000-00000000000a', '39000000-0000-0000-0000-0000000000a3',
          '39000000-0000-0000-0000-0000000000a2', '{}', 'Segunda fusión', gen_random_uuid())$$,
  '23505', 'absorbida dos veces');

-- La fusión no se edita ni se borra.
SELECT per_test.debe_fallar($$UPDATE per.fusion SET motivo = 'Otro motivo'$$, '42501', 'UPDATE de fusión');
SELECT per_test.debe_fallar($$DELETE FROM per.fusion$$, '42501', 'DELETE de fusión');

-- Descartes: par en orden, sin repetir, se quita con DELETE.
SELECT per_test.debe_fallar($$
  INSERT INTO per.par_descartado (tenant_id, persona_menor_id, persona_mayor_id, descartado_por)
  VALUES ('39000000-0000-0000-0000-00000000000a', '39000000-0000-0000-0000-0000000000a3',
          '39000000-0000-0000-0000-0000000000a1', gen_random_uuid())$$,
  '23514', 'par fuera de orden');
INSERT INTO per.par_descartado (tenant_id, persona_menor_id, persona_mayor_id, descartado_por)
VALUES ('39000000-0000-0000-0000-00000000000a', '39000000-0000-0000-0000-0000000000a1',
        '39000000-0000-0000-0000-0000000000a3', gen_random_uuid());
SELECT per_test.debe_fallar($$
  INSERT INTO per.par_descartado (tenant_id, persona_menor_id, persona_mayor_id, descartado_por)
  VALUES ('39000000-0000-0000-0000-00000000000a', '39000000-0000-0000-0000-0000000000a1',
          '39000000-0000-0000-0000-0000000000a3', gen_random_uuid())$$,
  '23505', 'par descartado dos veces');
SELECT per_test.debe_fallar($$UPDATE per.par_descartado SET descartado_en = now()$$, '42501', 'UPDATE de descarte');

-- ---------------------------------------------------------------------
-- Tenant B: no ve fusiones ni descartes de A, ni puede escribirlos con el tenant de A.
-- ---------------------------------------------------------------------
SELECT set_config('app.tenant_id', '39000000-0000-0000-0000-00000000000b', false);

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM per.fusion) THEN RAISE EXCEPTION 'B no debía ver fusiones de A'; END IF;
  IF EXISTS (SELECT 1 FROM per.par_descartado) THEN RAISE EXCEPTION 'B no debía ver descartes de A'; END IF;
END $$;
SELECT per_test.debe_fallar($$
  INSERT INTO per.par_descartado (tenant_id, persona_menor_id, persona_mayor_id, descartado_por)
  VALUES ('39000000-0000-0000-0000-00000000000a', '39000000-0000-0000-0000-0000000000a2',
          '39000000-0000-0000-0000-0000000000a3', gen_random_uuid())$$,
  '42501', 'descarte con el tenant de A');
DELETE FROM per.par_descartado;

SELECT set_config('app.tenant_id', '39000000-0000-0000-0000-00000000000a', false);

DO $$ BEGIN
  IF (SELECT count(*) FROM per.par_descartado) <> 1 THEN RAISE EXCEPTION 'el DELETE de B no debía borrar el descarte de A'; END IF;
END $$;
DELETE FROM per.par_descartado;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM per.par_descartado) THEN RAISE EXCEPTION 'A debía poder quitar su descarte'; END IF;
END $$;

RESET ROLE;

-- ---------------------------------------------------------------------
-- Privilegios del rol de la aplicación (el dueño, que corrió la migración), leídos de la ACL:
-- has_table_privilege responde verdadero a todo si el dueño es superusuario, como en CI.
-- ---------------------------------------------------------------------
CREATE FUNCTION per_test.concedido(tabla regclass, privilegio text) RETURNS boolean
LANGUAGE sql AS $$
  SELECT EXISTS (
    SELECT 1 FROM pg_class c, aclexplode(c.relacl) acl
     WHERE c.oid = tabla AND acl.grantee = c.relowner AND acl.privilege_type = privilegio)
$$;
DO $$ BEGIN
  IF NOT per_test.concedido('per.fusion', 'INSERT') OR NOT per_test.concedido('per.par_descartado', 'DELETE') THEN
    RAISE EXCEPTION 'la aplicación debía poder registrar fusiones y quitar descartes';
  END IF;
  IF per_test.concedido('per.fusion', 'UPDATE') OR per_test.concedido('per.fusion', 'DELETE')
     OR per_test.concedido('per.fusion', 'TRUNCATE') THEN
    RAISE EXCEPTION 'la aplicación no debía poder cambiar ni borrar fusiones';
  END IF;
  IF per_test.concedido('per.par_descartado', 'UPDATE') OR per_test.concedido('per.par_descartado', 'TRUNCATE') THEN
    RAISE EXCEPTION 'la aplicación no debía poder editar ni truncar descartes';
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
      IF has_table_privilege(rol, 'per.fusion', privilegio) THEN
        RAISE EXCEPTION '% no debía tener % en per.fusion', rol, privilegio;
      END IF;
      IF has_table_privilege(rol, 'per.par_descartado', privilegio) THEN
        RAISE EXCEPTION '% no debía tener % en per.par_descartado', rol, privilegio;
      END IF;
    END LOOP;
  END LOOP;
END $$;

ROLLBACK;
