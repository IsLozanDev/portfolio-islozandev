-- Prueba de 01w_arc_carga_sistema (spec 52). La ejecuta tools/migrar/test/db-esquemas.test.mjs sobre una base temporal
-- con db/ aplicado. Corre como superusuario y evalúa con arc_test_app, sin BYPASSRLS y con los mismos privilegios
-- que la aplicación. Todo en una transacción que se revierte.

BEGIN;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'arc_test_app') THEN
    CREATE ROLE arc_test_app NOLOGIN;
  END IF;
END $$;
GRANT USAGE ON SCHEMA arc TO arc_test_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON arc.archivo, arc.version_archivo TO arc_test_app;

CREATE SCHEMA arc_test;
CREATE FUNCTION arc_test.debe_fallar(sentencia text, esperado text, caso text) RETURNS void
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
GRANT USAGE ON SCHEMA arc_test TO arc_test_app;

SET ROLE arc_test_app;
SELECT set_config('app.tenant_id', '52000000-0000-0000-0000-00000000000a', false);

-- Un archivo SISTEMA nace DISPONIBLE sin actor, con su versión 1 analizada y sin subido_por.
INSERT INTO arc.archivo (id, tenant_id, categoria, entidad_tipo, entidad_id, nombre_original, estado, version_vigente, origen, creado_por)
VALUES ('52000000-0000-0000-0000-0000000000a1', '52000000-0000-0000-0000-00000000000a', 'CPE_XML', 'FE_COMPROBANTE', 'C-1',
        '20601234561-01-F001-00000001.xml', 'DISPONIBLE', 1, 'SISTEMA', NULL);
INSERT INTO arc.version_archivo (archivo_id, numero, tenant_id, ruta_storage, mime_declarado, bytes_declarados, estado,
                                 hash_sha256, bytes, mime_real, subido_por)
VALUES ('52000000-0000-0000-0000-0000000000a1', 1, '52000000-0000-0000-0000-00000000000a', 'a/a1/1', 'application/xml', 120,
        'DISPONIBLE', repeat('a', 64), 120, 'application/xml', NULL);

-- Un archivo CARGA sigue exigiendo actor; origen fuera de la lista falla.
SELECT arc_test.debe_fallar($$
  INSERT INTO arc.archivo (id, tenant_id, categoria, entidad_tipo, entidad_id, nombre_original, estado, creado_por)
  VALUES ('52000000-0000-0000-0000-0000000000a2', '52000000-0000-0000-0000-00000000000a', 'DOCUMENTO', 'PRUEBA', 'E-1',
          'contrato.pdf', 'PENDIENTE_CARGA', NULL)$$,
  '23514', 'archivo CARGA sin actor');
SELECT arc_test.debe_fallar($$
  INSERT INTO arc.archivo (id, tenant_id, categoria, entidad_tipo, entidad_id, nombre_original, estado, origen, creado_por)
  VALUES ('52000000-0000-0000-0000-0000000000a3', '52000000-0000-0000-0000-00000000000a', 'DOCUMENTO', 'PRUEBA', 'E-1',
          'contrato.pdf', 'PENDIENTE_CARGA', 'OTRO', gen_random_uuid())$$,
  '23514', 'origen fuera de la lista');

-- Un archivo creado sin origen es CARGA.
INSERT INTO arc.archivo (id, tenant_id, categoria, entidad_tipo, entidad_id, nombre_original, estado, creado_por)
VALUES ('52000000-0000-0000-0000-0000000000a4', '52000000-0000-0000-0000-00000000000a', 'DOCUMENTO', 'PRUEBA', 'E-2',
        'acta.pdf', 'PENDIENTE_CARGA', gen_random_uuid());

DO $$ BEGIN
  IF (SELECT origen FROM arc.archivo WHERE id = '52000000-0000-0000-0000-0000000000a4') <> 'CARGA' THEN
    RAISE EXCEPTION 'un archivo sin origen debía ser CARGA';
  END IF;
  -- Consulta de control: solo las versiones de archivos SISTEMA quedan sin subido_por.
  IF EXISTS (SELECT 1 FROM arc.version_archivo v JOIN arc.archivo a ON a.id = v.archivo_id
              WHERE v.subido_por IS NULL AND a.origen <> 'SISTEMA') THEN
    RAISE EXCEPTION 'una versión sin subido_por pertenece a un archivo CARGA';
  END IF;
END $$;

-- Aislamiento: otro tenant no ve el archivo SISTEMA.
SELECT set_config('app.tenant_id', '52000000-0000-0000-0000-00000000000b', false);
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM arc.archivo WHERE id = '52000000-0000-0000-0000-0000000000a1') THEN
    RAISE EXCEPTION 'otro tenant ve el archivo SISTEMA';
  END IF;
END $$;

RESET ROLE;
ROLLBACK;
