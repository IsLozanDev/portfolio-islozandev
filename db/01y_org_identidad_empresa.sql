-- 01y · Organización: identidad y contacto de la empresa (spec 17d). PostgreSQL 16. Reversible: rollback/01y_org_identidad_empresa.sql.
-- La empresa suma logo, teléfono, correo y sitio web, todos opcionales. El logo es un archivo de TR-ARC de la
-- categoría LOGO; logo_archivo_id no lleva FK hacia arc (TR-RNF-119): ORG lo valida con ValidadorLogoPort.
-- Teléfono en E.164 peruano: +51 y un celular de 9 dígitos que empieza con 9, o un fijo de 8 dígitos
-- (código de área sin el 0 y número).

-- 01m_arc.sql le quitó INSERT sobre arc.categoria al rol que migra: se le devuelve solo para sembrar LOGO.
DO $$
BEGIN
  EXECUTE format('GRANT INSERT ON arc.categoria TO %I', current_user);
  INSERT INTO arc.categoria (codigo, mimes_permitidos, tamano_max_bytes, sensible)
  VALUES ('LOGO', ARRAY['image/jpeg', 'image/png'], 1048576, false);
  EXECUTE format('REVOKE INSERT ON arc.categoria FROM %I', current_user);
END
$$;

ALTER TABLE org.empresa
  ADD COLUMN logo_archivo_id uuid NULL,
  ADD COLUMN telefono        varchar(12)  NULL CONSTRAINT ck_empresa_telefono_e164
    CHECK (telefono ~ '^\+51(9[0-9]{8}|[1-8][0-9]{7})$'),
  ADD COLUMN correo          varchar(254) NULL CONSTRAINT ck_empresa_correo
    CHECK (correo = lower(correo) AND correo ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  ADD COLUMN sitio_web       varchar(200) NULL CONSTRAINT ck_empresa_sitio_web
    CHECK (sitio_web ~ '^https://[^\s/$.?#][^\s]*$');

-- Sucursal: los teléfonos que se pueden normalizar pasan a E.164; los demás quedan como están. NO FORCE para que
-- el dueño vea las filas de todos los tenants (en Supabase no es superusuario); en un DO para que no quede si se corta.
DO $$
BEGIN
  ALTER TABLE org.sucursal NO FORCE ROW LEVEL SECURITY;
  UPDATE org.sucursal
     SET telefono = '+51' || regexp_replace(regexp_replace(telefono, '\D', '', 'g'), '^(51|0)', '')
   WHERE telefono IS NOT NULL
     AND regexp_replace(regexp_replace(telefono, '\D', '', 'g'), '^(51|0)', '') ~ '^(9[0-9]{8}|[1-8][0-9]{7})$';
  ALTER TABLE org.sucursal FORCE ROW LEVEL SECURITY;
END
$$;

-- NOT VALID: rige para lo que se escriba desde ahora y no falla por un teléfono viejo que no se pudo normalizar.
ALTER TABLE org.sucursal
  ADD CONSTRAINT ck_sucursal_telefono_e164 CHECK (telefono ~ '^\+51(9[0-9]{8}|[1-8][0-9]{7})$') NOT VALID;

-- Detalle de la consola: la empresa principal suma logo_archivo_id, para que la api firme su URL (spec 17d).
-- CREATE OR REPLACE conserva el dueño (org_lector) y los privilegios que dejó 01a_org_consola.sql.
CREATE OR REPLACE FUNCTION org.tenant_detalle(p_id uuid)
RETURNS TABLE (id uuid, codigo varchar, nombre varchar, estado varchar, estado_motivo varchar,
               estado_cambiado_en timestamptz, version bigint, creado_en timestamptz,
               suscripciones jsonb, empresa_principal jsonb, historial jsonb)
LANGUAGE sql STABLE STRICT SECURITY DEFINER SET search_path = '' AS $$
  SELECT t.id, t.codigo, t.nombre, t.estado, t.estado_motivo, t.estado_cambiado_en, t.version, t.creado_en,
         COALESCE((SELECT jsonb_agg(jsonb_build_object(
                            'producto_codigo', s.producto_codigo, 'plan', s.plan,
                            'estado', s.estado, 'vigente_hasta', s.vigente_hasta)
                          ORDER BY s.producto_codigo)
                     FROM org.suscripcion s WHERE s.tenant_id = t.id), '[]'::jsonb),
         (SELECT jsonb_build_object('id', e.id, 'ruc', e.ruc, 'razon_social', e.razon_social, 'logo_archivo_id', e.logo_archivo_id)
            FROM org.empresa e
           WHERE e.tenant_id = t.id AND e.activo
             AND EXISTS (SELECT 1 FROM org.sucursal su WHERE su.empresa_id = e.id AND su.es_principal)
           ORDER BY e.razon_social, e.id
           LIMIT 1),
         COALESCE((SELECT jsonb_agg(jsonb_build_object(
                            'estado_anterior', h.estado_anterior, 'estado_nuevo', h.estado_nuevo,
                            'motivo', h.motivo, 'fecha_efectiva', h.fecha_efectiva,
                            'actor_id', h.actor_id, 'registrado_en', h.registrado_en)
                          ORDER BY h.registrado_en DESC, h.id)
                     FROM org.tenant_estado_historial h WHERE h.tenant_id = t.id), '[]'::jsonb)
    FROM org.tenant t
   WHERE t.id = p_id;
$$;
