-- Prueba de la integración con Supabase Auth. La ejecuta tools/migrar/test/db-esquemas.test.mjs
-- sobre una base con db/, tools/migrar/test/fixtures/simular-supabase.sql y supabase/migrations.
-- Las altas en auth.users se hacen como supabase_auth_admin, como lo hace Supabase Auth.

CREATE SCHEMA supa_test;
CREATE FUNCTION supa_test.debe_fallar(sentencia text, esperado text, caso text) RETURNS void
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
GRANT USAGE ON SCHEMA supa_test TO supabase_auth_admin;

SET ROLE supabase_auth_admin;

-- ---------------------------------------------------------------------
-- 1. Espejo en el alta
-- ---------------------------------------------------------------------
INSERT INTO auth.users (id, email, raw_app_meta_data, raw_user_meta_data) VALUES
  -- 1.1 correo normalizado y nombre de user_metadata
  ('a1000000-0000-0000-0000-000000000001', 'Rosa.Huaman@Gmail.com', '{}', '{"nombre": "Rosa Huamán"}'),
  -- 1.2 user_metadata no eleva el tipo
  ('a1000000-0000-0000-0000-000000000002', 'intruso@gmail.com', '{}', '{"tipo_usuario": "SOPORTE"}'),
  -- 1.3 app_metadata sí lo fija; sin nombre se usa la parte local del correo
  ('a1000000-0000-0000-0000-000000000003', 'soporte.uno@vitrina.pe', '{"tipo_usuario": "INTERNO"}', NULL),
  -- 1.4 tipo inválido en app_metadata cae a EXTERNO
  ('a1000000-0000-0000-0000-000000000004', 'raro@gmail.com', '{"tipo_usuario": "ROOT"}', '{}');

-- 1.5 anónimo y usuario sin correo: alta en Auth sin espejo
INSERT INTO auth.users (id, email, is_anonymous) VALUES ('a1000000-0000-0000-0000-000000000005', NULL, true);
INSERT INTO auth.users (id, phone) VALUES ('a1000000-0000-0000-0000-000000000006', '+51987654321');

RESET ROLE;

DO $$
DECLARE
  u seg.usuario;
BEGIN
  SELECT * INTO u FROM seg.usuario WHERE id = 'a1000000-0000-0000-0000-000000000001';
  IF u.id IS NULL THEN RAISE EXCEPTION '1.1 no creó seg.usuario'; END IF;
  IF u.email <> 'rosa.huaman@gmail.com' THEN RAISE EXCEPTION '1.1 correo no normalizado: %', u.email; END IF;
  IF u.nombre <> 'Rosa Huamán' THEN RAISE EXCEPTION '1.1 nombre: %', u.nombre; END IF;
  IF u.estado <> 'ACTIVO' OR u.tipo <> 'EXTERNO' THEN RAISE EXCEPTION '1.1 estado/tipo: %/%', u.estado, u.tipo; END IF;

  IF (SELECT tipo FROM seg.usuario WHERE id = 'a1000000-0000-0000-0000-000000000002') <> 'EXTERNO' THEN
    RAISE EXCEPTION '1.2 user_metadata elevó el tipo';
  END IF;

  SELECT * INTO u FROM seg.usuario WHERE id = 'a1000000-0000-0000-0000-000000000003';
  IF u.tipo <> 'INTERNO' THEN RAISE EXCEPTION '1.3 app_metadata no fijó el tipo'; END IF;
  IF u.nombre <> 'soporte.uno' THEN RAISE EXCEPTION '1.3 nombre por defecto: %', u.nombre; END IF;

  IF (SELECT tipo FROM seg.usuario WHERE id = 'a1000000-0000-0000-0000-000000000004') <> 'EXTERNO' THEN
    RAISE EXCEPTION '1.4 tipo inválido no cayó a EXTERNO';
  END IF;

  IF EXISTS (SELECT 1 FROM seg.usuario WHERE id IN ('a1000000-0000-0000-0000-000000000005', 'a1000000-0000-0000-0000-000000000006')) THEN
    RAISE EXCEPTION '1.5 anónimo o sin correo no debía tener espejo';
  END IF;
  IF (SELECT count(*) FROM auth.users WHERE id IN ('a1000000-0000-0000-0000-000000000005', 'a1000000-0000-0000-0000-000000000006')) <> 2 THEN
    RAISE EXCEPTION '1.5 el alta en Auth debía quedar';
  END IF;
END $$;

-- 1.6 correo que ya tiene otro usuario: falla y no deja la fila en auth.users
SET ROLE supabase_auth_admin;
SELECT supa_test.debe_fallar(
  $q$INSERT INTO auth.users (id, email) VALUES ('a1000000-0000-0000-0000-000000000007', 'ROSA.huaman@gmail.com')$q$,
  '23505', '1.6 correo duplicado en el alta');
RESET ROLE;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM auth.users WHERE id = 'a1000000-0000-0000-0000-000000000007') THEN
    RAISE EXCEPTION '1.6 el alta en Auth debía revertirse';
  END IF;
END $$;

-- 1.7 reimportar el mismo id (CC-10) no falla ni cambia la fila
SELECT seg.fn_auth_espejar_usuario('a1000000-0000-0000-0000-000000000001', 'Rosa.Huaman@Gmail.com',
                                   '{"tipo_usuario": "SOPORTE"}', '{"nombre": "Otra Rosa"}');
DO $$ BEGIN
  IF (SELECT nombre || '/' || tipo FROM seg.usuario WHERE id = 'a1000000-0000-0000-0000-000000000001') <> 'Rosa Huamán/EXTERNO' THEN
    RAISE EXCEPTION '1.7 la reimportación cambió la fila';
  END IF;
END $$;

-- ---------------------------------------------------------------------
-- 2. Cambio de correo
-- ---------------------------------------------------------------------
SET ROLE supabase_auth_admin;
-- 2.1 se replica en minúsculas
UPDATE auth.users SET email = 'Rosa.H@Hotmail.com' WHERE id = 'a1000000-0000-0000-0000-000000000001';
-- 2.2 a uno de otro usuario: falla
SELECT supa_test.debe_fallar(
  $q$UPDATE auth.users SET email = 'intruso@gmail.com' WHERE id = 'a1000000-0000-0000-0000-000000000001'$q$,
  '23505', '2.2 correo duplicado en el cambio');
-- 2.3 el usuario sin correo lo agrega: se crea el espejo
UPDATE auth.users SET email = 'telefono@gmail.com' WHERE id = 'a1000000-0000-0000-0000-000000000006';
-- 2.4 correo a nulo: el espejo no cambia
UPDATE auth.users SET email = NULL WHERE id = 'a1000000-0000-0000-0000-000000000004';
RESET ROLE;

DO $$ BEGIN
  IF (SELECT email FROM seg.usuario WHERE id = 'a1000000-0000-0000-0000-000000000001') <> 'rosa.h@hotmail.com' THEN
    RAISE EXCEPTION '2.1 el cambio de correo no se replicó';
  END IF;
  IF (SELECT email FROM auth.users WHERE id = 'a1000000-0000-0000-0000-000000000001') <> 'Rosa.H@Hotmail.com' THEN
    RAISE EXCEPTION '2.2 el cambio fallido debía revertirse en Auth';
  END IF;
  IF (SELECT email FROM seg.usuario WHERE id = 'a1000000-0000-0000-0000-000000000006') IS DISTINCT FROM 'telefono@gmail.com' THEN
    RAISE EXCEPTION '2.3 agregar correo debía crear el espejo';
  END IF;
  IF (SELECT email FROM seg.usuario WHERE id = 'a1000000-0000-0000-0000-000000000004') <> 'raro@gmail.com' THEN
    RAISE EXCEPTION '2.4 correo nulo no debía tocar el espejo';
  END IF;
END $$;

-- ---------------------------------------------------------------------
-- 3. Hook sin membresías: claims de entrada intactos, tenant_id nulo y tipo_usuario
-- ---------------------------------------------------------------------
CREATE FUNCTION supa_test.evento(p_usuario uuid) RETURNS jsonb LANGUAGE sql AS $$
  SELECT jsonb_build_object('user_id', p_usuario, 'authentication_method', 'password', 'claims',
    jsonb_build_object('sub', p_usuario, 'role', 'authenticated', 'aal', 'aal1', 'session_id', 's-1',
                       'amr', jsonb_build_array(jsonb_build_object('method', 'password', 'timestamp', 1)),
                       'exp', 2000000000, 'iat', 1900000000));
$$;
CREATE FUNCTION supa_test.tenant(p_usuario uuid) RETURNS text LANGUAGE sql AS $$
  SELECT seg.custom_access_token_hook(supa_test.evento(p_usuario)) -> 'claims' ->> 'tenant_id';
$$;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA supa_test TO supabase_auth_admin;

DO $$
DECLARE
  entrada jsonb := supa_test.evento('a1000000-0000-0000-0000-000000000003') -> 'claims';
  salida  jsonb := seg.custom_access_token_hook(supa_test.evento('a1000000-0000-0000-0000-000000000003')) -> 'claims';
BEGIN
  IF salida - 'tenant_id' - 'tipo_usuario' <> entrada THEN RAISE EXCEPTION '3.1 alteró claims de entrada: %', salida; END IF;
  IF NOT salida ? 'tenant_id' OR salida -> 'tenant_id' <> 'null'::jsonb THEN RAISE EXCEPTION '3.1 tenant_id debía ser null'; END IF;
  IF salida ->> 'tipo_usuario' <> 'INTERNO' THEN RAISE EXCEPTION '3.1 tipo_usuario: %', salida ->> 'tipo_usuario'; END IF;
  -- 3.2 solo dos claims nuevos (ni permisos ni versión de permisos)
  IF (SELECT count(*) FROM jsonb_object_keys(salida)) <> (SELECT count(*) FROM jsonb_object_keys(entrada)) + 2 THEN
    RAISE EXCEPTION '3.2 el hook agregó claims de más: %', salida;
  END IF;
  -- 3.3 usuario sin espejo (anónimo): EXTERNO y sin tenant
  salida := seg.custom_access_token_hook(supa_test.evento('a1000000-0000-0000-0000-000000000005')) -> 'claims';
  IF salida ->> 'tipo_usuario' <> 'EXTERNO' OR salida ->> 'tenant_id' IS NOT NULL THEN
    RAISE EXCEPTION '3.3 usuario sin espejo: %', salida;
  END IF;
END $$;

-- ---------------------------------------------------------------------
-- 4. Membresías. Rosa (a1..01): A antigua, B reciente; C (tenant suspendido), D (INVITADO),
--    E (vencida) y F (membresía SUSPENDIDO) son más recientes que B y no cuentan.
-- ---------------------------------------------------------------------
INSERT INTO org.tenant (id, codigo, nombre, estado, version, baja_en) VALUES
  ('b1000000-0000-0000-0000-00000000000a', 'hook-a', 'Hook A', 'ACTIVO', 1, NULL),
  ('b1000000-0000-0000-0000-00000000000b', 'hook-b', 'Hook B', 'PRUEBA', 1, NULL),
  ('b1000000-0000-0000-0000-00000000000c', 'hook-c', 'Hook C', 'SUSPENDIDO', 1, NULL),
  ('b1000000-0000-0000-0000-00000000000d', 'hook-d', 'Hook D', 'ACTIVO', 1, NULL),
  ('b1000000-0000-0000-0000-00000000000e', 'hook-e', 'Hook E', 'ACTIVO', 1, NULL),
  ('b1000000-0000-0000-0000-00000000000f', 'hook-f', 'Hook F', 'ACTIVO', 1, NULL),
  ('b1000000-0000-0000-0000-000000000010', 'hook-baja', 'Hook baja', 'BAJA', 1, now());

INSERT INTO seg.membresia (id, usuario_id, tenant_id, estado, desde, hasta) VALUES
  ('b2000000-0000-0000-0000-00000000000a', 'a1000000-0000-0000-0000-000000000001', 'b1000000-0000-0000-0000-00000000000a', 'ACTIVO',    now() - interval '10 days', NULL),
  ('b2000000-0000-0000-0000-00000000000b', 'a1000000-0000-0000-0000-000000000001', 'b1000000-0000-0000-0000-00000000000b', 'ACTIVO',    now() - interval '1 day',   NULL),
  ('b2000000-0000-0000-0000-00000000000c', 'a1000000-0000-0000-0000-000000000001', 'b1000000-0000-0000-0000-00000000000c', 'ACTIVO',    now() - interval '1 hour',  NULL),
  ('b2000000-0000-0000-0000-00000000000d', 'a1000000-0000-0000-0000-000000000001', 'b1000000-0000-0000-0000-00000000000d', 'INVITADO',  now() - interval '1 hour',  NULL),
  ('b2000000-0000-0000-0000-00000000000e', 'a1000000-0000-0000-0000-000000000001', 'b1000000-0000-0000-0000-00000000000e', 'ACTIVO',    now() - interval '2 hours', now() - interval '1 hour'),
  ('b2000000-0000-0000-0000-00000000000f', 'a1000000-0000-0000-0000-000000000001', 'b1000000-0000-0000-0000-00000000000f', 'SUSPENDIDO', now() - interval '1 hour', NULL),
  ('b2000000-0000-0000-0000-000000000010', 'a1000000-0000-0000-0000-000000000001', 'b1000000-0000-0000-0000-000000000010', 'ACTIVO',    now() - interval '1 hour',  NULL);

DO $$ BEGIN
  -- 4.1 la membresía activa más reciente
  IF supa_test.tenant('a1000000-0000-0000-0000-000000000001') <> 'b1000000-0000-0000-0000-00000000000b' THEN
    RAISE EXCEPTION '4.1 debía elegir B, eligió %', supa_test.tenant('a1000000-0000-0000-0000-000000000001');
  END IF;
  -- 4.2 el tenant preferido manda
  UPDATE seg.usuario SET tenant_preferido = 'b1000000-0000-0000-0000-00000000000a' WHERE id = 'a1000000-0000-0000-0000-000000000001';
  IF supa_test.tenant('a1000000-0000-0000-0000-000000000001') <> 'b1000000-0000-0000-0000-00000000000a' THEN
    RAISE EXCEPTION '4.2 debía elegir el preferido A';
  END IF;
  -- 4.3 un preferido suspendido o con membresía vencida se ignora
  UPDATE seg.usuario SET tenant_preferido = 'b1000000-0000-0000-0000-00000000000c' WHERE id = 'a1000000-0000-0000-0000-000000000001';
  IF supa_test.tenant('a1000000-0000-0000-0000-000000000001') <> 'b1000000-0000-0000-0000-00000000000b' THEN
    RAISE EXCEPTION '4.3 preferido suspendido no debía elegirse';
  END IF;
  UPDATE seg.usuario SET tenant_preferido = 'b1000000-0000-0000-0000-00000000000e' WHERE id = 'a1000000-0000-0000-0000-000000000001';
  IF supa_test.tenant('a1000000-0000-0000-0000-000000000001') <> 'b1000000-0000-0000-0000-00000000000b' THEN
    RAISE EXCEPTION '4.3 preferido con membresía vencida no debía elegirse';
  END IF;
  -- 4.4 sin membresías vigentes: nulo
  UPDATE seg.membresia SET estado = 'SUSPENDIDO'
   WHERE id IN ('b2000000-0000-0000-0000-00000000000a', 'b2000000-0000-0000-0000-00000000000b');
  IF supa_test.tenant('a1000000-0000-0000-0000-000000000001') IS NOT NULL THEN
    RAISE EXCEPTION '4.4 sin membresías vigentes debía ser nulo';
  END IF;
  UPDATE seg.membresia SET estado = 'ACTIVO'
   WHERE id IN ('b2000000-0000-0000-0000-00000000000a', 'b2000000-0000-0000-0000-00000000000b');

  -- 5. usuario bloqueado o dado de baja: sin tenant
  UPDATE seg.usuario SET estado = 'BLOQUEADO' WHERE id = 'a1000000-0000-0000-0000-000000000001';
  IF supa_test.tenant('a1000000-0000-0000-0000-000000000001') IS NOT NULL THEN RAISE EXCEPTION '5.1 BLOQUEADO con tenant'; END IF;
  UPDATE seg.usuario SET estado = 'BAJA' WHERE id = 'a1000000-0000-0000-0000-000000000001';
  IF supa_test.tenant('a1000000-0000-0000-0000-000000000001') IS NOT NULL THEN RAISE EXCEPTION '5.2 BAJA con tenant'; END IF;
  UPDATE seg.usuario SET estado = 'ACTIVO' WHERE id = 'a1000000-0000-0000-0000-000000000001';
END $$;

-- ---------------------------------------------------------------------
-- 6. Privilegios: solo supabase_auth_admin ejecuta el hook y tenant_para_token
-- ---------------------------------------------------------------------
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'hook_test_nadie') THEN CREATE ROLE hook_test_nadie NOLOGIN; END IF;
END $$;
DO $$
DECLARE
  rol text;
BEGIN
  FOREACH rol IN ARRAY ARRAY['anon', 'authenticated', 'hook_test_nadie'] LOOP
    IF has_function_privilege(rol, 'seg.custom_access_token_hook(jsonb)', 'EXECUTE')
       OR has_function_privilege(rol, 'seg.tenant_para_token(uuid)', 'EXECUTE')
       OR has_function_privilege(rol, 'seg.fn_auth_espejar_usuario(uuid, text, jsonb, jsonb)', 'EXECUTE') THEN
      RAISE EXCEPTION '6.1 % no debe ejecutar las funciones de seg', rol;
    END IF;
  END LOOP;
  IF NOT has_function_privilege('supabase_auth_admin', 'seg.custom_access_token_hook(jsonb)', 'EXECUTE') THEN
    RAISE EXCEPTION '6.1 supabase_auth_admin debe ejecutar el hook';
  END IF;
  IF has_table_privilege('supabase_auth_admin', 'seg.membresia', 'SELECT') THEN
    RAISE EXCEPTION '6.1 supabase_auth_admin no necesita leer seg.membresia';
  END IF;
END $$;

-- 6.2 ejecutado como supabase_auth_admin (como lo hace Supabase Auth)
SET ROLE supabase_auth_admin;
DO $$ BEGIN
  IF supa_test.tenant('a1000000-0000-0000-0000-000000000001') <> 'b1000000-0000-0000-0000-00000000000b' THEN
    RAISE EXCEPTION '6.2 el hook como supabase_auth_admin debía devolver B';
  END IF;
END $$;
RESET ROLE;

-- 6.3 anon no puede invocarlo
GRANT USAGE ON SCHEMA supa_test TO anon;
SET ROLE anon;
SELECT supa_test.debe_fallar(
  $q$SELECT seg.custom_access_token_hook('{"user_id": "a1000000-0000-0000-0000-000000000001", "claims": {}}')$q$,
  '42501', '6.3 anon ejecutando el hook');
RESET ROLE;

DROP SCHEMA supa_test CASCADE;
DROP ROLE hook_test_nadie;
