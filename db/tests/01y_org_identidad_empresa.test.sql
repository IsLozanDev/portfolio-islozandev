-- Prueba de 01y_org_identidad_empresa (spec 17d). La ejecuta tools/migrar/test/db-esquemas.test.mjs sobre una base
-- temporal con db/ aplicado. Corre como superusuario y evalúa con org_identidad_test_app, sin BYPASSRLS y con los
-- mismos privilegios que la aplicación. Todo en una transacción que se revierte. La normalización de los teléfonos
-- de sucursal la prueba db-esquemas.test.mjs, que revierte y reaplica la migración con datos.

BEGIN;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'org_identidad_test_app') THEN
    CREATE ROLE org_identidad_test_app NOLOGIN;
  END IF;
END $$;
GRANT USAGE ON SCHEMA org TO org_identidad_test_app;
GRANT SELECT, INSERT, UPDATE ON ALL TABLES IN SCHEMA org TO org_identidad_test_app;

CREATE SCHEMA org_identidad_test;
CREATE FUNCTION org_identidad_test.debe_fallar(sentencia text, esperado text, caso text) RETURNS void
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
GRANT USAGE ON SCHEMA org_identidad_test TO org_identidad_test_app;

-- La categoría LOGO existe: jpeg y png, hasta 1 MB, no sensible.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM arc.categoria
                  WHERE codigo = 'LOGO' AND tamano_max_bytes = 1048576 AND NOT sensible
                    AND mimes_permitidos = ARRAY['image/jpeg', 'image/png']) THEN
    RAISE EXCEPTION 'falta la categoría LOGO de 1 MB con jpeg y png';
  END IF;
END $$;

SET ROLE org_identidad_test_app;
SELECT set_config('app.tenant_id', '17d00000-0000-0000-0000-00000000000a', false);

INSERT INTO org.tenant (id, codigo, nombre, estado, version)
VALUES ('17d00000-0000-0000-0000-00000000000a', 'identidad-a', 'Identidad A', 'ACTIVO', 1);
INSERT INTO org.empresa (id, tenant_id, ruc, razon_social, telefono, correo, sitio_web, version)
VALUES ('17d00000-0000-0000-0000-0000000000a1', '17d00000-0000-0000-0000-00000000000a', '20601234561', 'Identidad A SAC',
        '+51987654321', 'ventas@empresa.pe', 'https://ejemplo.pe', 1);
INSERT INTO org.sucursal (id, tenant_id, empresa_id, codigo, nombre, codigo_establecimiento_sunat, es_principal, telefono, version)
VALUES ('17d00000-0000-0000-0000-0000000000b1', '17d00000-0000-0000-0000-00000000000a', '17d00000-0000-0000-0000-0000000000a1',
        'PRINCIPAL', 'Principal', '0000', true, '+51987654321', 1);

-- Teléfono: un fijo de Lima también es E.164; sin +51, un 9 con 8 dígitos o texto se rechazan.
UPDATE org.empresa SET telefono = '+5115550101' WHERE id = '17d00000-0000-0000-0000-0000000000a1';
SELECT org_identidad_test.debe_fallar(
  $q$UPDATE org.empresa SET telefono = '987654321' WHERE id = '17d00000-0000-0000-0000-0000000000a1'$q$,
  '23514', 'teléfono sin +51');
SELECT org_identidad_test.debe_fallar(
  $q$UPDATE org.empresa SET telefono = '+5198765432' WHERE id = '17d00000-0000-0000-0000-0000000000a1'$q$,
  '23514', 'celular de 8 dígitos');
SELECT org_identidad_test.debe_fallar(
  $q$UPDATE org.empresa SET telefono = 'abc' WHERE id = '17d00000-0000-0000-0000-0000000000a1'$q$,
  '23514', 'teléfono con letras');

-- La sucursal exige E.164 en lo que se escribe desde ahora.
UPDATE org.sucursal SET telefono = '+5154123456' WHERE id = '17d00000-0000-0000-0000-0000000000b1';
SELECT org_identidad_test.debe_fallar(
  $q$UPDATE org.sucursal SET telefono = 'anexo 12' WHERE id = '17d00000-0000-0000-0000-0000000000b1'$q$,
  '23514', 'teléfono de sucursal que no es E.164');

-- Correo en minúsculas y con formato simple.
SELECT org_identidad_test.debe_fallar(
  $q$UPDATE org.empresa SET correo = 'Ventas@Empresa.PE' WHERE id = '17d00000-0000-0000-0000-0000000000a1'$q$,
  '23514', 'correo con mayúsculas');
SELECT org_identidad_test.debe_fallar(
  $q$UPDATE org.empresa SET correo = 'ventas.empresa.pe' WHERE id = '17d00000-0000-0000-0000-0000000000a1'$q$,
  '23514', 'correo sin @');

-- Sitio web solo con https://.
SELECT org_identidad_test.debe_fallar(
  $q$UPDATE org.empresa SET sitio_web = 'http://empresa.pe' WHERE id = '17d00000-0000-0000-0000-0000000000a1'$q$,
  '23514', 'sitio web con http://');
UPDATE org.empresa SET logo_archivo_id = gen_random_uuid() WHERE id = '17d00000-0000-0000-0000-0000000000a1';

-- Aislamiento: otro tenant no actualiza la empresa de A.
SELECT set_config('app.tenant_id', '17d00000-0000-0000-0000-00000000000b', false);
UPDATE org.empresa SET telefono = '+51911111111', logo_archivo_id = NULL WHERE id = '17d00000-0000-0000-0000-0000000000a1';
SELECT set_config('app.tenant_id', '17d00000-0000-0000-0000-00000000000a', false);
DO $$ BEGIN
  IF (SELECT telefono FROM org.empresa WHERE id = '17d00000-0000-0000-0000-0000000000a1') <> '+5115550101'
     OR (SELECT logo_archivo_id FROM org.empresa WHERE id = '17d00000-0000-0000-0000-0000000000a1') IS NULL THEN
    RAISE EXCEPTION 'otro tenant actualizó la empresa de A';
  END IF;
END $$;

-- En una base sin teléfonos viejos el CHECK de sucursal se puede validar: el patrón es el mismo que el de la empresa.
RESET ROLE;
ALTER TABLE org.sucursal VALIDATE CONSTRAINT ck_sucursal_telefono_e164;
DO $$ BEGIN
  IF (SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conname = 'ck_sucursal_telefono_e164')
     <> (SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conname = 'ck_empresa_telefono_e164') THEN
    RAISE EXCEPTION 'el CHECK de teléfono de sucursal y el de empresa no coinciden';
  END IF;
END $$;

-- La consola lee el logo de la empresa principal con org.tenant_detalle.
DO $$ BEGIN
  IF (SELECT empresa_principal ->> 'logo_archivo_id' FROM org.tenant_detalle('17d00000-0000-0000-0000-00000000000a')) IS NULL THEN
    RAISE EXCEPTION 'org.tenant_detalle debía traer el logo_archivo_id de la empresa principal';
  END IF;
END $$;

ROLLBACK;
