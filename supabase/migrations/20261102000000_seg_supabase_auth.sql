-- Seg · Integración con Supabase Auth. PostgreSQL 16. Reversible: rollback/20261102000000_seg_supabase_auth.sql.
-- Requiere db/01a_org.sql y db/01b_seg.sql. La aplica tools/migrar (pnpm db:up:supabase).
-- Supabase Auth autentica (quién es); la plataforma autoriza desde el backend (ADR-29).

-- ---------------------------------------------------------------------
-- 1. Espejo auth.users -> seg.usuario (usuario.id = sub).
--    El tipo se toma SOLO de raw_app_meta_data (lo fija el backend con la Admin API);
--    raw_user_meta_data lo controla el propio usuario y solo aporta el nombre.
--    Un correo que ya tiene otro usuario aborta la operación en Auth: mejor un alta rechazada
--    que un usuario sin espejo.
-- ---------------------------------------------------------------------
CREATE FUNCTION seg.fn_auth_espejar_usuario(p_id uuid, p_email text, p_app jsonb, p_user jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  INSERT INTO seg.usuario (id, email, nombre, tipo, estado)
  VALUES (
    p_id,
    lower(p_email),
    left(coalesce(nullif(trim(p_user ->> 'nombre'), ''), split_part(p_email, '@', 1)), 150),
    CASE WHEN p_app ->> 'tipo_usuario' IN ('INTERNO', 'EXTERNO', 'SOPORTE')
         THEN p_app ->> 'tipo_usuario' ELSE 'EXTERNO' END,
    'ACTIVO'
  )
  ON CONFLICT (id) DO NOTHING;   -- reimportar con el mismo UUID (CC-10)
EXCEPTION WHEN unique_violation THEN
  RAISE EXCEPTION 'seg.usuario: el correo ya pertenece a otro usuario' USING ERRCODE = 'unique_violation';
END $$;

-- Anónimos y usuarios sin correo (teléfono) no tienen espejo.
CREATE FUNCTION seg.fn_auth_usuario_creado()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NOT NEW.is_anonymous AND NEW.email IS NOT NULL THEN
    PERFORM seg.fn_auth_espejar_usuario(NEW.id, NEW.email, NEW.raw_app_meta_data, NEW.raw_user_meta_data);
  END IF;
  RETURN NEW;
END $$;

-- Si el usuario no tenía espejo (se dio de alta sin correo), lo crea.
CREATE FUNCTION seg.fn_auth_usuario_correo()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NEW.email IS NOT DISTINCT FROM OLD.email OR NEW.email IS NULL OR NEW.is_anonymous THEN
    RETURN NEW;
  END IF;
  BEGIN
    UPDATE seg.usuario SET email = lower(NEW.email) WHERE id = NEW.id;
  EXCEPTION WHEN unique_violation THEN
    RAISE EXCEPTION 'seg.usuario: el correo ya pertenece a otro usuario' USING ERRCODE = 'unique_violation';
  END;
  IF NOT FOUND THEN
    PERFORM seg.fn_auth_espejar_usuario(NEW.id, NEW.email, NEW.raw_app_meta_data, NEW.raw_user_meta_data);
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER trg_auth_usuario_creado AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION seg.fn_auth_usuario_creado();
CREATE TRIGGER trg_auth_usuario_correo AFTER UPDATE OF email ON auth.users
  FOR EACH ROW EXECUTE FUNCTION seg.fn_auth_usuario_correo();

-- ---------------------------------------------------------------------
-- 2. Tenant activo para el token: el preferido si su membresía y su tenant siguen activos;
--    si no, la membresía activa más reciente.
-- ---------------------------------------------------------------------
CREATE FUNCTION seg.tenant_para_token(p_usuario uuid)
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

-- ---------------------------------------------------------------------
-- 3. Custom Access Token Hook: Supabase Auth lo invoca antes de emitir cada token.
--    Solo agrega tenant_id y tipo_usuario (ADR-32). Ni permisos ni su versión: el token se haría
--    pesado y quedaría desactualizado hasta expirar; el backend los resuelve con caché.
--    Un usuario bloqueado o dado de baja recibe tenant_id nulo; el backend lo rechaza.
-- ---------------------------------------------------------------------
CREATE FUNCTION seg.custom_access_token_hook(event jsonb)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_claims  jsonb := event -> 'claims';
  v_usuario uuid  := (event ->> 'user_id')::uuid;
  v_tipo    text;
  v_estado  text;
BEGIN
  SELECT u.tipo, u.estado INTO v_tipo, v_estado FROM seg.usuario u WHERE u.id = v_usuario;

  v_claims := v_claims || jsonb_build_object(
    'tenant_id',    CASE WHEN v_estado = 'ACTIVO' THEN seg.tenant_para_token(v_usuario) END,
    'tipo_usuario', coalesce(v_tipo, 'EXTERNO'));

  RETURN jsonb_build_object('claims', v_claims);
END $$;

-- ---------------------------------------------------------------------
-- 4. Privilegios: solo Supabase Auth ejecuta el hook. Las funciones son SECURITY DEFINER
--    (dueño con BYPASSRLS): supabase_auth_admin no necesita leer tablas de seg ni org.
-- ---------------------------------------------------------------------
GRANT USAGE ON SCHEMA seg TO supabase_auth_admin;
GRANT EXECUTE ON FUNCTION seg.custom_access_token_hook(jsonb) TO supabase_auth_admin;
GRANT EXECUTE ON FUNCTION seg.tenant_para_token(uuid) TO supabase_auth_admin;
REVOKE EXECUTE ON FUNCTION seg.custom_access_token_hook(jsonb) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION seg.tenant_para_token(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION seg.fn_auth_espejar_usuario(uuid, text, jsonb, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION seg.fn_auth_usuario_creado() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION seg.fn_auth_usuario_correo() FROM PUBLIC, anon, authenticated;
