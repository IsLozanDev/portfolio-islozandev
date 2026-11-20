-- Prueba de 01l_per_consentimientos (spec 37). La ejecuta tools/migrar/test/db-esquemas.test.mjs sobre una
-- base temporal con db/ aplicado. Corre como superusuario y evalúa con per_test_app, sin BYPASSRLS y con los
-- mismos privilegios que la aplicación. Todo en una transacción que se revierte.

BEGIN;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'per_test_app') THEN
    CREATE ROLE per_test_app NOLOGIN;
  END IF;
END $$;
GRANT USAGE ON SCHEMA per TO per_test_app;
GRANT SELECT, INSERT, UPDATE ON per.persona TO per_test_app;
GRANT SELECT, INSERT ON per.texto_finalidad TO per_test_app;
GRANT SELECT, INSERT, UPDATE ON per.consentimiento TO per_test_app;

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
-- Tenant A: una persona, dos textos de PROMOCIONES y uno de PRESTACION.
-- ---------------------------------------------------------------------
SELECT set_config('app.tenant_id', '37000000-0000-0000-0000-00000000000a', false);

INSERT INTO per.persona (id, tenant_id, tipo_persona, tipo_documento, numero_documento, nombres, apellido_paterno)
VALUES ('37000000-0000-0000-0000-0000000000a1', '37000000-0000-0000-0000-00000000000a', 'NATURAL', 'DNI', '45781236', 'Juana', 'Quispe');

INSERT INTO per.texto_finalidad (id, tenant_id, finalidad, version, texto, publicado_por, publicado_en) VALUES
  ('37000000-0000-0000-0000-0000000000f1', '37000000-0000-0000-0000-00000000000a', 'PROMOCIONES', '2026-03',
   'Acepto recibir promociones por WhatsApp y correo.', gen_random_uuid(), '2026-03-01'),
  ('37000000-0000-0000-0000-0000000000f2', '37000000-0000-0000-0000-00000000000a', 'PROMOCIONES', '2026-11',
   'Acepto recibir promociones por WhatsApp, correo y SMS.', gen_random_uuid(), '2026-11-01'),
  ('37000000-0000-0000-0000-0000000000f3', '37000000-0000-0000-0000-00000000000a', 'PRESTACION', 'v1',
   'Autorizo el tratamiento de mis datos para la prestación.', gen_random_uuid(), '2026-03-01');

-- CHECK de finalidad, versión y largo del texto; versión repetida en la finalidad.
SELECT per_test.debe_fallar($$
  INSERT INTO per.texto_finalidad (id, tenant_id, finalidad, version, texto, publicado_por)
  VALUES (gen_random_uuid(), '37000000-0000-0000-0000-00000000000a', 'MARKETING', 'v1', repeat('a', 20), gen_random_uuid())$$,
  '23514', 'finalidad fuera de lista');
SELECT per_test.debe_fallar($$
  INSERT INTO per.texto_finalidad (id, tenant_id, finalidad, version, texto, publicado_por)
  VALUES (gen_random_uuid(), '37000000-0000-0000-0000-00000000000a', 'PROMOCIONES', 'v 2', repeat('a', 20), gen_random_uuid())$$,
  '23514', 'versión con espacio');
SELECT per_test.debe_fallar($$
  INSERT INTO per.texto_finalidad (id, tenant_id, finalidad, version, texto, publicado_por)
  VALUES (gen_random_uuid(), '37000000-0000-0000-0000-00000000000a', 'PROMOCIONES', 'v2', repeat('a', 19), gen_random_uuid())$$,
  '23514', 'texto de 19 caracteres');
SELECT per_test.debe_fallar($$
  INSERT INTO per.texto_finalidad (id, tenant_id, finalidad, version, texto, publicado_por)
  VALUES (gen_random_uuid(), '37000000-0000-0000-0000-00000000000a', 'PROMOCIONES', 'v2', repeat('a', 10001), gen_random_uuid())$$,
  '23514', 'texto de 10001 caracteres');
SELECT per_test.debe_fallar($$
  INSERT INTO per.texto_finalidad (id, tenant_id, finalidad, version, texto, publicado_por)
  VALUES (gen_random_uuid(), '37000000-0000-0000-0000-00000000000a', 'PROMOCIONES', '2026-03', repeat('a', 20), gen_random_uuid())$$,
  '23505', 'versión repetida');

-- Un texto publicado no se edita ni se borra.
SELECT per_test.debe_fallar($$UPDATE per.texto_finalidad SET texto = repeat('b', 30)$$, '42501', 'UPDATE de texto');
SELECT per_test.debe_fallar($$DELETE FROM per.texto_finalidad$$, '42501', 'DELETE de texto');

-- Decisiones: PRESTACION aceptada, PROMOCIONES aceptada con la versión anterior.
INSERT INTO per.consentimiento (id, tenant_id, persona_id, finalidad, decision, version_texto, canal, accion_expresa, registrado_por) VALUES
  ('37000000-0000-0000-0000-0000000000c1', '37000000-0000-0000-0000-00000000000a', '37000000-0000-0000-0000-0000000000a1',
   'PRESTACION', 'ACEPTA', 'v1', 'PRESENCIAL', true, gen_random_uuid()),
  ('37000000-0000-0000-0000-0000000000c2', '37000000-0000-0000-0000-00000000000a', '37000000-0000-0000-0000-0000000000a1',
   'PROMOCIONES', 'ACEPTA', '2026-03', 'WEB', true, gen_random_uuid());

-- CHECK de decisión, canal y acción expresa; versión inexistente; persona inexistente.
SELECT per_test.debe_fallar($$
  INSERT INTO per.consentimiento (id, tenant_id, persona_id, finalidad, decision, version_texto, canal, accion_expresa, registrado_por)
  VALUES (gen_random_uuid(), '37000000-0000-0000-0000-00000000000a', '37000000-0000-0000-0000-0000000000a1',
          'DATOS_SALUD', 'TALVEZ', 'v1', 'WEB', true, gen_random_uuid())$$,
  '23514', 'decisión fuera de lista');
SELECT per_test.debe_fallar($$
  INSERT INTO per.consentimiento (id, tenant_id, persona_id, finalidad, decision, version_texto, canal, accion_expresa, registrado_por)
  VALUES (gen_random_uuid(), '37000000-0000-0000-0000-00000000000a', '37000000-0000-0000-0000-0000000000a1',
          'PRESTACION', 'RECHAZA', 'v1', 'CORREO', true, gen_random_uuid())$$,
  '23514', 'canal fuera de lista');
SELECT per_test.debe_fallar($$
  INSERT INTO per.consentimiento (id, tenant_id, persona_id, finalidad, decision, version_texto, canal, accion_expresa, registrado_por)
  VALUES (gen_random_uuid(), '37000000-0000-0000-0000-00000000000a', '37000000-0000-0000-0000-0000000000a1',
          'PRESTACION', 'RECHAZA', 'v1', 'WEB', false, gen_random_uuid())$$,
  '23514', 'sin acción expresa');
SELECT per_test.debe_fallar($$
  INSERT INTO per.consentimiento (id, tenant_id, persona_id, finalidad, decision, version_texto, canal, accion_expresa, registrado_por)
  VALUES (gen_random_uuid(), '37000000-0000-0000-0000-00000000000a', '37000000-0000-0000-0000-0000000000a1',
          'PRESTACION', 'RECHAZA', 'v9', 'WEB', true, gen_random_uuid())$$,
  '23503', 'versión de texto que no existe');
SELECT per_test.debe_fallar($$
  INSERT INTO per.consentimiento (id, tenant_id, persona_id, finalidad, decision, version_texto, canal, accion_expresa, registrado_por)
  VALUES (gen_random_uuid(), '37000000-0000-0000-0000-00000000000a', gen_random_uuid(),
          'PRESTACION', 'RECHAZA', 'v1', 'WEB', true, gen_random_uuid())$$,
  '23503', 'persona que no existe');

-- Un solo ACEPTA vigente por persona y finalidad; un RECHAZA sí entra.
SELECT per_test.debe_fallar($$
  INSERT INTO per.consentimiento (id, tenant_id, persona_id, finalidad, decision, version_texto, canal, accion_expresa, registrado_por)
  VALUES (gen_random_uuid(), '37000000-0000-0000-0000-00000000000a', '37000000-0000-0000-0000-0000000000a1',
          'PROMOCIONES', 'ACEPTA', '2026-11', 'WEB', true, gen_random_uuid())$$,
  '23505', 'segundo ACEPTA vigente');

-- Revocación: marca las tres columnas juntas, una sola vez y solo en un ACEPTA.
SELECT per_test.debe_fallar($$
  UPDATE per.consentimiento SET revocado_en = now() WHERE id = '37000000-0000-0000-0000-0000000000c2'$$,
  '23514', 'revocación sin usuario ni canal');
SELECT per_test.debe_fallar($$
  UPDATE per.consentimiento SET decision = 'RECHAZA' WHERE id = '37000000-0000-0000-0000-0000000000c2'$$,
  '23514', 'cambiar la decisión');
SELECT per_test.debe_fallar($$
  UPDATE per.consentimiento SET version_texto = '2026-11' WHERE id = '37000000-0000-0000-0000-0000000000c2'$$,
  '23514', 'cambiar la versión aceptada');
UPDATE per.consentimiento SET revocado_en = now(), revocado_por = gen_random_uuid(), canal_revocacion = 'WHATSAPP'
 WHERE id = '37000000-0000-0000-0000-0000000000c2';
SELECT per_test.debe_fallar($$
  UPDATE per.consentimiento SET revocado_en = now(), revocado_por = gen_random_uuid(), canal_revocacion = 'WEB'
   WHERE id = '37000000-0000-0000-0000-0000000000c2'$$,
  '23514', 'revocar dos veces');

-- Revocado el anterior, entran un RECHAZA y un ACEPTA nuevo con la versión vigente.
INSERT INTO per.consentimiento (id, tenant_id, persona_id, finalidad, decision, version_texto, canal, accion_expresa, registrado_por) VALUES
  ('37000000-0000-0000-0000-0000000000c3', '37000000-0000-0000-0000-00000000000a', '37000000-0000-0000-0000-0000000000a1',
   'PROMOCIONES', 'RECHAZA', '2026-11', 'WEB', true, gen_random_uuid()),
  ('37000000-0000-0000-0000-0000000000c4', '37000000-0000-0000-0000-00000000000a', '37000000-0000-0000-0000-0000000000a1',
   'PROMOCIONES', 'ACEPTA', '2026-11', 'KIOSCO', true, gen_random_uuid());
SELECT per_test.debe_fallar($$
  UPDATE per.consentimiento SET revocado_en = now(), revocado_por = gen_random_uuid(), canal_revocacion = 'WEB'
   WHERE id = '37000000-0000-0000-0000-0000000000c3'$$,
  '23514', 'revocar un RECHAZA');

-- El historial no se borra.
SELECT per_test.debe_fallar($$DELETE FROM per.consentimiento$$, '42501', 'DELETE de consentimiento');
DO $$ BEGIN
  IF (SELECT count(*) FROM per.consentimiento) <> 4 THEN RAISE EXCEPTION 'A debía conservar sus 4 decisiones'; END IF;
END $$;

-- ---------------------------------------------------------------------
-- RLS entre dos tenants: B no ve ni cambia textos ni decisiones de A.
-- ---------------------------------------------------------------------
SELECT set_config('app.tenant_id', '37000000-0000-0000-0000-00000000000b', false);
INSERT INTO per.persona (id, tenant_id, tipo_persona, tipo_documento, numero_documento, nombres, apellido_paterno)
VALUES ('37000000-0000-0000-0000-0000000000b1', '37000000-0000-0000-0000-00000000000b', 'NATURAL', 'DNI', '45781236', 'Juana', 'Quispe');

DO $$
DECLARE filas int;
BEGIN
  IF EXISTS (SELECT 1 FROM per.texto_finalidad) THEN RAISE EXCEPTION 'B no debía ver textos de A'; END IF;
  IF EXISTS (SELECT 1 FROM per.consentimiento) THEN RAISE EXCEPTION 'B no debía ver consentimientos de A'; END IF;
  UPDATE per.consentimiento SET revocado_en = now(), revocado_por = gen_random_uuid(), canal_revocacion = 'WEB'
   WHERE id = '37000000-0000-0000-0000-0000000000c1';
  GET DIAGNOSTICS filas = ROW_COUNT;
  IF filas <> 0 THEN RAISE EXCEPTION 'B no debía revocar el consentimiento de A'; END IF;
END $$;
SELECT per_test.debe_fallar($$
  INSERT INTO per.texto_finalidad (id, tenant_id, finalidad, version, texto, publicado_por)
  VALUES (gen_random_uuid(), '37000000-0000-0000-0000-00000000000a', 'PRESTACION', 'v2', repeat('a', 20), gen_random_uuid())$$,
  '42501', 'B publica texto con el tenant de A');
-- B no puede registrar con la versión de A: el texto es del tenant (FK por tenant_id).
SELECT per_test.debe_fallar($$
  INSERT INTO per.consentimiento (id, tenant_id, persona_id, finalidad, decision, version_texto, canal, accion_expresa, registrado_por)
  VALUES (gen_random_uuid(), '37000000-0000-0000-0000-00000000000b', '37000000-0000-0000-0000-0000000000b1',
          'PRESTACION', 'ACEPTA', 'v1', 'WEB', true, gen_random_uuid())$$,
  '23503', 'B registra con un texto de A');

SELECT set_config('app.tenant_id', '37000000-0000-0000-0000-00000000000a', false);
DO $$ BEGIN
  IF (SELECT revocado_en FROM per.consentimiento WHERE id = '37000000-0000-0000-0000-0000000000c1') IS NOT NULL THEN
    RAISE EXCEPTION 'A debía conservar su consentimiento sin revocar';
  END IF;
END $$;

SELECT set_config('app.tenant_id', '', false);
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM per.consentimiento) OR EXISTS (SELECT 1 FROM per.texto_finalidad) THEN
    RAISE EXCEPTION 'sin tenant no debía ver textos ni consentimientos';
  END IF;
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
  IF NOT per_test.concedido('per.texto_finalidad', 'INSERT') OR NOT per_test.concedido('per.consentimiento', 'UPDATE') THEN
    RAISE EXCEPTION 'la aplicación debía poder publicar textos y revocar consentimientos';
  END IF;
  IF per_test.concedido('per.texto_finalidad', 'UPDATE') OR per_test.concedido('per.texto_finalidad', 'DELETE')
     OR per_test.concedido('per.consentimiento', 'DELETE') THEN
    RAISE EXCEPTION 'la aplicación no debía poder editar ni borrar textos, ni borrar consentimientos';
  END IF;
  IF per_test.concedido('per.texto_finalidad', 'TRUNCATE') OR per_test.concedido('per.consentimiento', 'TRUNCATE') THEN
    RAISE EXCEPTION 'la aplicación no debía poder truncar textos ni consentimientos';
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
      IF has_table_privilege(rol, 'per.texto_finalidad', privilegio) THEN
        RAISE EXCEPTION '% no debía tener % en per.texto_finalidad', rol, privilegio;
      END IF;
      IF has_table_privilege(rol, 'per.consentimiento', privilegio) THEN
        RAISE EXCEPTION '% no debía tener % en per.consentimiento', rol, privilegio;
      END IF;
    END LOOP;
  END LOOP;
END $$;

ROLLBACK;
