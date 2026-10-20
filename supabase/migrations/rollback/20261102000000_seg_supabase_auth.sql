DROP TRIGGER IF EXISTS trg_auth_usuario_creado ON auth.users;
DROP TRIGGER IF EXISTS trg_auth_usuario_correo ON auth.users;
DROP FUNCTION seg.custom_access_token_hook(jsonb);
DROP FUNCTION seg.tenant_para_token(uuid);
DROP FUNCTION seg.fn_auth_usuario_creado();
DROP FUNCTION seg.fn_auth_usuario_correo();
DROP FUNCTION seg.fn_auth_espejar_usuario(uuid, text, jsonb, jsonb);
REVOKE USAGE ON SCHEMA seg FROM supabase_auth_admin;
