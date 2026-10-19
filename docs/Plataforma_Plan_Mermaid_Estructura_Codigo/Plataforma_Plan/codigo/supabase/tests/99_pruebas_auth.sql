-- Pruebas de la integración con Supabase Auth. Cada bloque lanza excepción si falla.
SET client_min_messages = warning;
CREATE TEMP TABLE resultado (n serial, prueba text, ok boolean);

-- Datos: dos tenants activos y uno suspendido
INSERT INTO org.tenant (id, codigo, nombre, estado) VALUES
 ('00000000-0000-0000-0000-0000000000a1', 'T-A', 'Tenant A', 'ACTIVO'),
 ('00000000-0000-0000-0000-0000000000b1', 'T-B', 'Tenant B', 'ACTIVO'),
 ('00000000-0000-0000-0000-0000000000c1', 'T-C', 'Tenant C', 'SUSPENDIDO');

-- 1. Alta en auth.users crea seg.usuario; user_metadata no puede elevar el tipo
INSERT INTO auth.users (id, email, raw_user_meta_data, raw_app_meta_data) VALUES
 ('11111111-1111-1111-1111-111111111111', 'Ana@Ejemplo.pe', '{"nombre":"Ana Torres","tipo_usuario":"SOPORTE"}', '{"tipo_usuario":"INTERNO"}'),
 ('22222222-2222-2222-2222-222222222222', 'intruso@ejemplo.pe', '{"tipo_usuario":"SOPORTE"}', '{}');
INSERT INTO resultado (prueba, ok) SELECT '1.1 seg.usuario creado con correo en minúsculas y nombre', (SELECT email = 'ana@ejemplo.pe' AND nombre = 'Ana Torres' AND tipo = 'INTERNO' FROM seg.usuario WHERE id = '11111111-1111-1111-1111-111111111111');
INSERT INTO resultado (prueba, ok) SELECT '1.2 user_metadata no otorga tipo SOPORTE (queda EXTERNO)', (SELECT tipo = 'EXTERNO' FROM seg.usuario WHERE id = '22222222-2222-2222-2222-222222222222');

-- 2. Cambio de correo se replica
UPDATE auth.users SET email = 'ana.torres@ejemplo.pe' WHERE id = '11111111-1111-1111-1111-111111111111';
INSERT INTO resultado (prueba, ok) SELECT '2.1 cambio de correo replicado', (SELECT email = 'ana.torres@ejemplo.pe' FROM seg.usuario WHERE id = '11111111-1111-1111-1111-111111111111');

-- 3. Hook sin membresías: tenant_id nulo, claims obligatorios intactos
CREATE TEMP TABLE ev AS SELECT jsonb_build_object('user_id', '11111111-1111-1111-1111-111111111111', 'authentication_method', 'password',
  'claims', jsonb_build_object('iss','https://x.supabase.co/auth/v1','aud','authenticated','exp',2000000000,'iat',1999996400,'sub','11111111-1111-1111-1111-111111111111',
  'role','authenticated','aal','aal1','session_id','s1','email','ana.torres@ejemplo.pe','phone','','is_anonymous',false)) AS e;
INSERT INTO resultado (prueba, ok) SELECT '3.1 sin membresía: tenant_id nulo y tipo INTERNO',
  (SELECT (r->'claims'->'tenant_id') = 'null'::jsonb AND r->'claims'->>'tipo_usuario' = 'INTERNO' FROM (SELECT seg.custom_access_token_hook(e) r FROM ev) x);
INSERT INTO resultado (prueba, ok) SELECT '3.2 claims obligatorios se conservan',
  (SELECT (r->'claims') ?& array['iss','aud','exp','iat','sub','role','aal','session_id','email','phone','is_anonymous'] FROM (SELECT seg.custom_access_token_hook(e) r FROM ev) x);

-- 4. Membresías: A (antigua), B (reciente), C (tenant suspendido, la más reciente)
INSERT INTO seg.membresia (id, usuario_id, tenant_id, estado, desde) VALUES
 (gen_random_uuid(), '11111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-0000000000a1', 'ACTIVO', now() - interval '30 days'),
 (gen_random_uuid(), '11111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-0000000000b1', 'ACTIVO', now() - interval '5 days'),
 (gen_random_uuid(), '11111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-0000000000c1', 'ACTIVO', now() - interval '1 day');
INSERT INTO resultado (prueba, ok) SELECT '4.1 sin preferido: membresía activa más reciente de tenant activo (B, no C suspendido)',
  (SELECT r->'claims'->>'tenant_id' = '00000000-0000-0000-0000-0000000000b1' FROM (SELECT seg.custom_access_token_hook(e) r FROM ev) x);
UPDATE seg.usuario SET tenant_preferido = '00000000-0000-0000-0000-0000000000a1' WHERE id = '11111111-1111-1111-1111-111111111111';
INSERT INTO resultado (prueba, ok) SELECT '4.2 con preferido A: el token lleva A',
  (SELECT r->'claims'->>'tenant_id' = '00000000-0000-0000-0000-0000000000a1' FROM (SELECT seg.custom_access_token_hook(e) r FROM ev) x);
UPDATE seg.membresia SET estado = 'SUSPENDIDO' WHERE tenant_id = '00000000-0000-0000-0000-0000000000a1';
INSERT INTO resultado (prueba, ok) SELECT '4.3 preferido con membresía suspendida: cae a B',
  (SELECT r->'claims'->>'tenant_id' = '00000000-0000-0000-0000-0000000000b1' FROM (SELECT seg.custom_access_token_hook(e) r FROM ev) x);
UPDATE seg.membresia SET hasta = now() - interval '1 minute' WHERE tenant_id = '00000000-0000-0000-0000-0000000000b1';
INSERT INTO resultado (prueba, ok) SELECT '4.4 membresía vencida (hasta) no cuenta: sin tenant',
  (SELECT (r->'claims'->'tenant_id') = 'null'::jsonb FROM (SELECT seg.custom_access_token_hook(e) r FROM ev) x);
UPDATE seg.membresia SET hasta = NULL;
UPDATE seg.usuario SET estado = 'BLOQUEADO' WHERE id = '11111111-1111-1111-1111-111111111111';
INSERT INTO resultado (prueba, ok) SELECT '4.5 usuario bloqueado en plataforma: token sin tenant',
  (SELECT (r->'claims'->'tenant_id') = 'null'::jsonb FROM (SELECT seg.custom_access_token_hook(e) r FROM ev) x);
UPDATE seg.usuario SET estado = 'ACTIVO';

-- 5. Privilegios
INSERT INTO resultado (prueba, ok) SELECT '5.1 supabase_auth_admin puede ejecutar el hook', has_function_privilege('supabase_auth_admin', 'seg.custom_access_token_hook(jsonb)', 'EXECUTE');
INSERT INTO resultado (prueba, ok) SELECT '5.2 authenticated NO puede ejecutar el hook', NOT has_function_privilege('authenticated', 'seg.custom_access_token_hook(jsonb)', 'EXECUTE');
INSERT INTO resultado (prueba, ok) SELECT '5.3 anon NO puede ejecutar el hook', NOT has_function_privilege('anon', 'seg.custom_access_token_hook(jsonb)', 'EXECUTE');
INSERT INTO resultado (prueba, ok) SELECT '5.4 authenticated sin acceso a seg.usuario', NOT has_table_privilege('authenticated', 'seg.usuario', 'SELECT');
INSERT INTO resultado (prueba, ok) SELECT '5.5 authenticated sin uso del esquema seg', NOT has_schema_privilege('authenticated', 'seg', 'USAGE');

-- 6. Ejecutado como supabase_auth_admin (como lo hace Supabase Auth)
GRANT SELECT ON ev TO supabase_auth_admin;
SET ROLE supabase_auth_admin;
\o /dev/null
SELECT set_config('t.r6', (SELECT seg.custom_access_token_hook(e)::text FROM ev), false);
RESET ROLE;
\o
INSERT INTO resultado (prueba, ok) SELECT '6.1 el hook funciona con el rol supabase_auth_admin', (current_setting('t.r6')::jsonb->'claims'->>'tenant_id' = '00000000-0000-0000-0000-0000000000b1');

SELECT n, CASE WHEN ok THEN 'OK  ' ELSE 'FALLA' END AS estado, prueba FROM resultado ORDER BY n;
DO $$ BEGIN IF EXISTS (SELECT 1 FROM resultado WHERE ok IS NOT TRUE) THEN RAISE EXCEPTION 'Hay pruebas fallidas'; END IF; END $$;
