-- =====================================================================
-- Plataforma · TR-SEG · Integración con Supabase Auth
-- Requiere: 01a_org.sql y 01b_seg.sql (esquemas org y seg).
-- Supabase Auth AUTENTICA (quién es). La plataforma AUTORIZA (qué puede
-- hacer, en qué sucursal) con seg.permisos_efectivos desde el backend.
-- El token solo lleva el tenant activo y el tipo de usuario.
-- Versión 1.0 · 2026-10-19
-- =====================================================================

-- 1. Tenant preferido: el último tenant elegido por el usuario.
ALTER TABLE seg.usuario
  ADD COLUMN IF NOT EXISTS tenant_preferido uuid NULL REFERENCES org.tenant (id),
  ADD COLUMN IF NOT EXISTS creado_en timestamptz NOT NULL DEFAULT now();

-- 2. Espejo de auth.users -> seg.usuario.
--    El tipo de usuario se toma SOLO de raw_app_meta_data (lo fija el backend
--    con la Admin API). raw_user_meta_data lo controla el propio usuario al
--    registrarse, así que nunca decide privilegios.
CREATE OR REPLACE FUNCTION seg.fn_auth_usuario_creado()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  INSERT INTO seg.usuario (id, email, nombre, tipo)
  VALUES (
    NEW.id,
    lower(NEW.email),
    left(coalesce(nullif(trim(NEW.raw_user_meta_data ->> 'nombre'), ''), split_part(NEW.email, '@', 1)), 150),
    CASE WHEN NEW.raw_app_meta_data ->> 'tipo_usuario' IN ('INTERNO', 'EXTERNO', 'SOPORTE')
         THEN NEW.raw_app_meta_data ->> 'tipo_usuario' ELSE 'EXTERNO' END
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION seg.fn_auth_usuario_correo()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NEW.email IS DISTINCT FROM OLD.email THEN
    UPDATE seg.usuario SET email = lower(NEW.email) WHERE id = NEW.id;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_auth_usuario_creado ON auth.users;
CREATE TRIGGER trg_auth_usuario_creado AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION seg.fn_auth_usuario_creado();
DROP TRIGGER IF EXISTS trg_auth_usuario_correo ON auth.users;
CREATE TRIGGER trg_auth_usuario_correo AFTER UPDATE OF email ON auth.users
  FOR EACH ROW EXECUTE FUNCTION seg.fn_auth_usuario_correo();

-- 3. Tenant activo para el token: el preferido si la membresía y el tenant
--    siguen activos; si no, la membresía activa más reciente.
CREATE OR REPLACE FUNCTION seg.tenant_para_token(p_usuario uuid)
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT m.tenant_id
    FROM seg.membresia m
    JOIN org.tenant t ON t.id = m.tenant_id AND t.estado IN ('PRUEBA', 'ACTIVO')
    LEFT JOIN seg.usuario u ON u.id = m.usuario_id
   WHERE m.usuario_id = p_usuario
     AND m.estado = 'ACTIVO'
     AND (m.hasta IS NULL OR m.hasta > now())
   ORDER BY coalesce(m.tenant_id = u.tenant_preferido, false) DESC, m.desde DESC
   LIMIT 1;
$$;

-- 4. Custom Access Token Hook (Supabase Auth lo invoca antes de emitir cada token).
--    Agrega tenant_id y tipo_usuario como claims de primer nivel.
--    No agrega la lista de permisos: el token se haría pesado y quedaría
--    desactualizado hasta su expiración; el backend los resuelve con caché.
CREATE OR REPLACE FUNCTION seg.custom_access_token_hook(event jsonb)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_claims  jsonb := event -> 'claims';
  v_usuario uuid  := (event ->> 'user_id')::uuid;
  v_tipo    text;
  v_estado  text;
BEGIN
  SELECT u.tipo, u.estado INTO v_tipo, v_estado FROM seg.usuario u WHERE u.id = v_usuario;

  v_claims := v_claims
    || jsonb_build_object(
         'tenant_id',    CASE WHEN v_estado = 'ACTIVO' THEN seg.tenant_para_token(v_usuario) END,
         'tipo_usuario', coalesce(v_tipo, 'EXTERNO'));

  -- Usuario bloqueado o dado de baja en la plataforma: se emite el token sin
  -- tenant; el backend lo rechaza en cualquier endpoint que exija tenant.
  RETURN jsonb_build_object('claims', v_claims);
END $$;

-- 5. Permisos: solo Supabase Auth ejecuta el hook; nadie más.
--    Las funciones son SECURITY DEFINER: supabase_auth_admin no necesita leer tablas.
GRANT USAGE ON SCHEMA seg TO supabase_auth_admin;
GRANT EXECUTE ON FUNCTION seg.custom_access_token_hook(jsonb) TO supabase_auth_admin;
GRANT EXECUTE ON FUNCTION seg.tenant_para_token(uuid) TO supabase_auth_admin;
REVOKE EXECUTE ON FUNCTION seg.custom_access_token_hook(jsonb) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION seg.tenant_para_token(uuid) FROM PUBLIC, anon, authenticated;

-- 6. Los esquemas de plataforma NO se exponen por la Data API (PostgREST):
--    los frontends hablan solo con la API NestJS.
REVOKE ALL ON ALL TABLES IN SCHEMA seg, org FROM anon, authenticated;
REVOKE USAGE ON SCHEMA seg, org FROM anon, authenticated;

-- Activación en Supabase: Authentication > Hooks > Custom Access Token
--   tipo Postgres, esquema seg, función custom_access_token_hook
-- o en supabase/config.toml:
--   [auth.hook.custom_access_token]
--   enabled = true
--   uri = "pg-functions://postgres/seg/custom_access_token_hook"
