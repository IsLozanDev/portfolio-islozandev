-- 01b · Seguridad: tipos de ingreso y exportación en la bitácora (spec 18b). PostgreSQL 16.
-- Reversible: rollback/01b_seg_tipos_ingreso.sql. Ordena después de 01b_seg_soporte.sql, que crea el
-- CHECK de tipos y da a org_lector el esquema seg.

-- ---------------------------------------------------------------------
-- 1. Catálogo de tipos: LOGIN_FALLIDO (contraseña o MFA por la API) y EXPORTACION (XLSX auditado).
-- ---------------------------------------------------------------------
ALTER TABLE seg.evento_seguridad DROP CONSTRAINT ck_evento_seguridad_tipo;
ALTER TABLE seg.evento_seguridad
  ADD CONSTRAINT ck_evento_seguridad_tipo CHECK (tipo IN
    ('LOGIN', 'LOGIN_FALLIDO', 'ACCESO_DENEGADO', 'ASIGNACION_OTORGADA', 'ASIGNACION_REVOCADA',
     'ACCESO_SOPORTE', 'EXPORTACION'));

-- ---------------------------------------------------------------------
-- 2. Lo que org_lector necesita para las dos funciones. La inserción queda limitada por política a
--    los tipos de ingreso: un fallo de contraseña llega sin token y puede no tener tenant.
-- ---------------------------------------------------------------------
GRANT SELECT ON seg.usuario, seg.membresia TO org_lector;
CREATE POLICY membresia_ingreso ON seg.membresia FOR SELECT TO org_lector USING (true);

GRANT INSERT ON seg.evento_seguridad TO org_lector;
GRANT USAGE ON SEQUENCE seg.evento_seguridad_id_seq TO org_lector;
CREATE POLICY evento_seguridad_ingreso ON seg.evento_seguridad FOR INSERT TO org_lector
  WITH CHECK (tipo IN ('LOGIN', 'LOGIN_FALLIDO'));

-- ---------------------------------------------------------------------
-- 3. Usuario y tenant de un correo, con el orden de seg.tenant_para_token (el hook): el preferido y
--    luego la membresía activa más reciente. Usuario bloqueado o de baja: tenant NULL, como el hook.
--    Sin fila si el correo no existe.
-- ---------------------------------------------------------------------
CREATE FUNCTION seg.usuario_para_ingreso(p_correo text)
RETURNS TABLE (usuario_id uuid, tenant_id uuid)
LANGUAGE sql STABLE STRICT SECURITY DEFINER SET search_path = '' AS $$
  SELECT u.id,
         CASE WHEN u.estado = 'ACTIVO' THEN (
           SELECT m.tenant_id
             FROM seg.membresia m
             JOIN org.tenant t ON t.id = m.tenant_id AND t.estado IN ('PRUEBA', 'ACTIVO')
            WHERE m.usuario_id = u.id
              AND m.estado = 'ACTIVO'
              AND (m.hasta IS NULL OR m.hasta > now())
            ORDER BY coalesce(m.tenant_id = u.tenant_preferido, false) DESC, m.desde DESC
            LIMIT 1)
         END
    FROM seg.usuario u
   WHERE u.email = lower(btrim(p_correo));
$$;

-- ---------------------------------------------------------------------
-- 4. LOGIN y LOGIN_FALLIDO sin contexto de tenant. Cualquier otro tipo va por la RLS del llamador.
-- ---------------------------------------------------------------------
CREATE FUNCTION seg.registrar_evento_ingreso(p_tipo varchar, p_tenant uuid, p_usuario uuid,
                                             p_detalle jsonb, p_ip inet)
RETURNS void
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF p_tipo IS NULL OR p_tipo NOT IN ('LOGIN', 'LOGIN_FALLIDO') THEN
    RAISE EXCEPTION 'seg.registrar_evento_ingreso solo admite LOGIN y LOGIN_FALLIDO, no %', p_tipo
      USING ERRCODE = 'invalid_parameter_value';
  END IF;
  INSERT INTO seg.evento_seguridad (tenant_id, usuario_id, tipo, detalle, ip)
  VALUES (p_tenant, p_usuario, p_tipo, coalesce(p_detalle, '{}'::jsonb), p_ip);
END
$$;

ALTER FUNCTION seg.usuario_para_ingreso(text) OWNER TO org_lector;
ALTER FUNCTION seg.registrar_evento_ingreso(varchar, uuid, uuid, jsonb, inet) OWNER TO org_lector;
REVOKE EXECUTE ON FUNCTION seg.usuario_para_ingreso(text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION seg.registrar_evento_ingreso(varchar, uuid, uuid, jsonb, inet) FROM PUBLIC;

-- Solo el rol que corre la migración (en dev, postgres: el mismo de la api).
DO $$
BEGIN
  EXECUTE format('GRANT EXECUTE ON FUNCTION seg.usuario_para_ingreso(text) TO %I', current_user);
  EXECUTE format('GRANT EXECUTE ON FUNCTION seg.registrar_evento_ingreso(varchar, uuid, uuid, jsonb, inet) TO %I', current_user);
END
$$;

-- Los esquemas de plataforma no se exponen por la Data API (regla 8). En PostgreSQL plano
-- (CI) los roles de Supabase no existen.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon')
     AND EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON FUNCTION seg.usuario_para_ingreso(text) FROM anon, authenticated;
    REVOKE ALL ON FUNCTION seg.registrar_evento_ingreso(varchar, uuid, uuid, jsonb, inet) FROM anon, authenticated;
  END IF;
END
$$;
