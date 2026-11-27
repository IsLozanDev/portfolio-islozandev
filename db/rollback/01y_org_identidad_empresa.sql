-- Deja org y arc como los dejó 01x_fe_envio. Se niega si hay archivos LOGO (borrar la categoría los dejaría
-- huérfanos) o si alguna empresa tiene logo, teléfono, correo o web (se perderían en silencio). Los teléfonos de
-- sucursal quedan en E.164, que también cabe en la columna de antes. Todo en un DO para que el NO FORCE (el dueño
-- ve las filas de todos los tenants) no quede si se corta.
DO $$
BEGIN
  ALTER TABLE arc.archivo NO FORCE ROW LEVEL SECURITY;
  ALTER TABLE org.empresa NO FORCE ROW LEVEL SECURITY;
  IF EXISTS (SELECT 1 FROM arc.archivo WHERE categoria = 'LOGO') THEN
    RAISE EXCEPTION 'Hay archivos LOGO: bórralos (y sus objetos en Storage) antes de revertir 01y_org_identidad_empresa'
      USING ERRCODE = 'object_in_use';
  END IF;
  IF EXISTS (SELECT 1 FROM org.empresa
              WHERE logo_archivo_id IS NOT NULL OR telefono IS NOT NULL OR correo IS NOT NULL OR sitio_web IS NOT NULL) THEN
    RAISE EXCEPTION 'Hay empresas con logo o datos de contacto: se perderían al revertir 01y_org_identidad_empresa'
      USING ERRCODE = 'object_in_use';
  END IF;
  ALTER TABLE arc.archivo FORCE ROW LEVEL SECURITY;
  ALTER TABLE org.empresa FORCE ROW LEVEL SECURITY;
END
$$;

ALTER TABLE org.sucursal
  DROP CONSTRAINT ck_sucursal_telefono_e164;

ALTER TABLE org.empresa
  DROP COLUMN sitio_web,
  DROP COLUMN correo,
  DROP COLUMN telefono,
  DROP COLUMN logo_archivo_id;

DO $$
BEGIN
  EXECUTE format('GRANT DELETE ON arc.categoria TO %I', current_user);
  DELETE FROM arc.categoria WHERE codigo = 'LOGO';
  EXECUTE format('REVOKE DELETE ON arc.categoria FROM %I', current_user);
END
$$;
