-- Prueba de 01m_arc (spec 33). La ejecuta tools/migrar/test/db-esquemas.test.mjs sobre una base temporal
-- con db/ aplicado. Corre como superusuario y evalúa con arc_test_app, sin BYPASSRLS y con los mismos
-- privilegios que la aplicación. Todo en una transacción que se revierte.

BEGIN;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'arc_test_app') THEN
    CREATE ROLE arc_test_app NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'arc_test_sin_permiso') THEN
    CREATE ROLE arc_test_sin_permiso NOLOGIN;
  END IF;
END $$;
GRANT USAGE ON SCHEMA arc TO arc_test_app, arc_test_sin_permiso;
GRANT SELECT, INSERT, UPDATE, DELETE ON arc.archivo, arc.version_archivo TO arc_test_app;
GRANT SELECT ON arc.categoria TO arc_test_app;
GRANT EXECUTE ON FUNCTION arc.cargas_pendientes_vencidas(timestamptz, integer) TO arc_test_app;

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
GRANT USAGE ON SCHEMA arc_test TO arc_test_app, arc_test_sin_permiso;

SET ROLE arc_test_app;

-- ---------------------------------------------------------------------
-- Siembra: cinco categorías con su máximo y su marca de sensible. Solo lectura.
-- ---------------------------------------------------------------------
DO $$ BEGIN
  IF (SELECT count(*) FROM arc.categoria) <> 5 THEN RAISE EXCEPTION 'debían sembrarse cinco categorías'; END IF;
  IF (SELECT array_agg(codigo ORDER BY codigo) FROM arc.categoria WHERE sensible) <> ARRAY['DOCUMENTO', 'EVIDENCIA']::varchar[] THEN
    RAISE EXCEPTION 'las sensibles debían ser DOCUMENTO y EVIDENCIA';
  END IF;
  IF (SELECT tamano_max_bytes FROM arc.categoria WHERE codigo = 'IMAGEN') <> 10485760 THEN
    RAISE EXCEPTION 'IMAGEN debía admitir 10 MB';
  END IF;
  IF (SELECT count(*) FROM arc.categoria WHERE codigo <> 'IMAGEN' AND tamano_max_bytes = 26214400) <> 4 THEN
    RAISE EXCEPTION 'las demás categorías debían admitir 25 MB';
  END IF;
  IF NOT (SELECT mimes_permitidos @> ARRAY['text/plain'] FROM arc.categoria WHERE codigo = 'ADJUNTO_SOPORTE')
     OR (SELECT mimes_permitidos @> ARRAY['text/plain'] FROM arc.categoria WHERE codigo = 'DOCUMENTO') THEN
    RAISE EXCEPTION 'text/plain solo debía entrar en ADJUNTO_SOPORTE';
  END IF;
END $$;
SELECT arc_test.debe_fallar($$
  INSERT INTO arc.categoria (codigo, mimes_permitidos, tamano_max_bytes, sensible) VALUES ('VIDEO', ARRAY['video/mp4'], 1, false)$$,
  '42501', 'la aplicación crea una categoría');
SELECT arc_test.debe_fallar($$UPDATE arc.categoria SET sensible = false$$, '42501', 'la aplicación cambia una categoría');

-- ---------------------------------------------------------------------
-- Tenant A: una carga pendiente con su versión 1.
-- ---------------------------------------------------------------------
SELECT set_config('app.tenant_id', '33000000-0000-0000-0000-00000000000a', false);

INSERT INTO arc.archivo (id, tenant_id, categoria, entidad_tipo, entidad_id, nombre_original, estado, creado_por, creado_en)
VALUES ('33000000-0000-0000-0000-0000000000a1', '33000000-0000-0000-0000-00000000000a', 'DOCUMENTO', 'PRUEBA_SENSIBLE', 'E-1',
        'contrato.pdf', 'PENDIENTE_CARGA', '33000000-0000-0000-0000-0000000000f1', '2026-11-16 08:00-05');
INSERT INTO arc.version_archivo (archivo_id, numero, tenant_id, ruta_storage, mime_declarado, bytes_declarados, estado, subido_por)
VALUES ('33000000-0000-0000-0000-0000000000a1', 1, '33000000-0000-0000-0000-00000000000a',
        '33000000-0000-0000-0000-00000000000a/33000000-0000-0000-0000-0000000000a1/1', 'application/pdf', 1258291,
        'PENDIENTE_CARGA', '33000000-0000-0000-0000-0000000000f1');

DO $$ BEGIN
  IF (SELECT count(*) FROM arc.archivo WHERE version = 1 AND version_vigente IS NULL AND motivo_rechazo IS NULL) <> 1 THEN
    RAISE EXCEPTION 'el archivo debía nacer en versión 1, sin versión vigente ni motivo';
  END IF;
END $$;

-- CHECK de estado, versión vigente, motivo de rechazo, entidad, nombre y categoría.
SELECT arc_test.debe_fallar($$
  INSERT INTO arc.archivo (id, tenant_id, categoria, entidad_tipo, entidad_id, nombre_original, estado, creado_por)
  VALUES (gen_random_uuid(), '33000000-0000-0000-0000-00000000000a', 'IMAGEN', 'PRODUCTO', 'P-1', 'foto.png', 'BORRADO', gen_random_uuid())$$,
  '23514', 'estado fuera de la lista');
SELECT arc_test.debe_fallar($$
  INSERT INTO arc.archivo (id, tenant_id, categoria, entidad_tipo, entidad_id, nombre_original, estado, creado_por)
  VALUES (gen_random_uuid(), '33000000-0000-0000-0000-00000000000a', 'IMAGEN', 'PRODUCTO', 'P-1', 'foto.png', 'DISPONIBLE', gen_random_uuid())$$,
  '23514', 'DISPONIBLE sin versión vigente');
SELECT arc_test.debe_fallar($$
  UPDATE arc.archivo SET version_vigente = 1 WHERE id = '33000000-0000-0000-0000-0000000000a1'$$,
  '23514', 'versión vigente en un archivo pendiente');
SELECT arc_test.debe_fallar($$
  UPDATE arc.archivo SET estado = 'RECHAZADO' WHERE id = '33000000-0000-0000-0000-0000000000a1'$$,
  '23514', 'RECHAZADO sin motivo');
SELECT arc_test.debe_fallar($$
  UPDATE arc.archivo SET motivo_rechazo = 'TIPO_NO_PERMITIDO' WHERE id = '33000000-0000-0000-0000-0000000000a1'$$,
  '23514', 'motivo de rechazo en un archivo pendiente');
SELECT arc_test.debe_fallar($$
  UPDATE arc.archivo SET estado = 'RECHAZADO', motivo_rechazo = 'INFECTADO' WHERE id = '33000000-0000-0000-0000-0000000000a1'$$,
  '23514', 'motivo de rechazo fuera de la lista');
SELECT arc_test.debe_fallar($$
  INSERT INTO arc.archivo (id, tenant_id, categoria, entidad_tipo, entidad_id, nombre_original, estado, creado_por)
  VALUES (gen_random_uuid(), '33000000-0000-0000-0000-00000000000a', 'IMAGEN', 'producto', 'P-1', 'foto.png', 'PENDIENTE_CARGA', gen_random_uuid())$$,
  '23514', 'entidad_tipo en minúsculas');
SELECT arc_test.debe_fallar($$
  INSERT INTO arc.archivo (id, tenant_id, categoria, entidad_tipo, entidad_id, nombre_original, estado, creado_por)
  VALUES (gen_random_uuid(), '33000000-0000-0000-0000-00000000000a', 'IMAGEN', 'PRODUCTO', 'P-1', '', 'PENDIENTE_CARGA', gen_random_uuid())$$,
  '23514', 'nombre original vacío');
SELECT arc_test.debe_fallar($$
  INSERT INTO arc.archivo (id, tenant_id, categoria, entidad_tipo, entidad_id, nombre_original, estado, creado_por)
  VALUES (gen_random_uuid(), '33000000-0000-0000-0000-00000000000a', 'VIDEO', 'PRODUCTO', 'P-1', 'clip.mp4', 'PENDIENTE_CARGA', gen_random_uuid())$$,
  '23503', 'categoría que no existe');

-- El recorrido válido: en análisis, disponible con su versión vigente y de vuelta.
UPDATE arc.archivo SET estado = 'EN_ANALISIS' WHERE id = '33000000-0000-0000-0000-0000000000a1';
UPDATE arc.version_archivo SET estado = 'DISPONIBLE', hash_sha256 = repeat('a', 64), bytes = 1258291, mime_real = 'application/pdf'
 WHERE archivo_id = '33000000-0000-0000-0000-0000000000a1' AND numero = 1;
UPDATE arc.archivo SET estado = 'DISPONIBLE', version_vigente = 1 WHERE id = '33000000-0000-0000-0000-0000000000a1';
UPDATE arc.archivo SET estado = 'RECHAZADO', version_vigente = NULL, motivo_rechazo = 'TAMANO_NO_COINCIDE'
 WHERE id = '33000000-0000-0000-0000-0000000000a1';
UPDATE arc.archivo SET estado = 'PENDIENTE_CARGA', motivo_rechazo = NULL WHERE id = '33000000-0000-0000-0000-0000000000a1';

-- Versiones: único de hash por archivo, ruta única, formato del hash y tamaño declarado.
SELECT arc_test.debe_fallar($$
  INSERT INTO arc.version_archivo (archivo_id, numero, tenant_id, ruta_storage, mime_declarado, bytes_declarados, estado, hash_sha256, subido_por)
  VALUES ('33000000-0000-0000-0000-0000000000a1', 2, '33000000-0000-0000-0000-00000000000a', 'a/a1/2', 'application/pdf', 10,
          'DISPONIBLE', repeat('a', 64), gen_random_uuid())$$,
  '23505', 'hash repetido en el mismo archivo');
SELECT arc_test.debe_fallar($$
  INSERT INTO arc.version_archivo (archivo_id, numero, tenant_id, ruta_storage, mime_declarado, bytes_declarados, estado, subido_por)
  VALUES ('33000000-0000-0000-0000-0000000000a1', 2, '33000000-0000-0000-0000-00000000000a',
          '33000000-0000-0000-0000-00000000000a/33000000-0000-0000-0000-0000000000a1/1', 'application/pdf', 10, 'PENDIENTE_CARGA', gen_random_uuid())$$,
  '23505', 'ruta de Storage repetida');
SELECT arc_test.debe_fallar($$
  INSERT INTO arc.version_archivo (archivo_id, numero, tenant_id, ruta_storage, mime_declarado, bytes_declarados, estado, hash_sha256, subido_por)
  VALUES ('33000000-0000-0000-0000-0000000000a1', 2, '33000000-0000-0000-0000-00000000000a', 'a/a1/2', 'application/pdf', 10,
          'DISPONIBLE', repeat('A', 64), gen_random_uuid())$$,
  '23514', 'hash en mayúsculas');
SELECT arc_test.debe_fallar($$
  INSERT INTO arc.version_archivo (archivo_id, numero, tenant_id, ruta_storage, mime_declarado, bytes_declarados, estado, subido_por)
  VALUES ('33000000-0000-0000-0000-0000000000a1', 2, '33000000-0000-0000-0000-00000000000a', 'a/a1/2', 'application/pdf', 0, 'PENDIENTE_CARGA', gen_random_uuid())$$,
  '23514', 'tamaño declarado en cero');
SELECT arc_test.debe_fallar($$
  INSERT INTO arc.version_archivo (archivo_id, numero, tenant_id, ruta_storage, mime_declarado, bytes_declarados, estado, subido_por)
  VALUES ('33000000-0000-0000-0000-0000000000a1', 0, '33000000-0000-0000-0000-00000000000a', 'a/a1/0', 'application/pdf', 10, 'PENDIENTE_CARGA', gen_random_uuid())$$,
  '23514', 'versión número cero');
SELECT arc_test.debe_fallar($$
  INSERT INTO arc.version_archivo (archivo_id, numero, tenant_id, ruta_storage, mime_declarado, bytes_declarados, estado, subido_por)
  VALUES (gen_random_uuid(), 1, '33000000-0000-0000-0000-00000000000a', 'a/x/1', 'application/pdf', 10, 'PENDIENTE_CARGA', gen_random_uuid())$$,
  '23503', 'versión de un archivo que no existe');

-- Otro pendiente reciente y uno en análisis antiguo: la limpieza no debe verlos.
INSERT INTO arc.archivo (id, tenant_id, categoria, entidad_tipo, entidad_id, nombre_original, estado, creado_por, creado_en) VALUES
  ('33000000-0000-0000-0000-0000000000a2', '33000000-0000-0000-0000-00000000000a', 'IMAGEN', 'PRODUCTO', 'P-1', 'foto.png',
   'PENDIENTE_CARGA', '33000000-0000-0000-0000-0000000000f1', '2026-11-18 07:00-05'),
  ('33000000-0000-0000-0000-0000000000a3', '33000000-0000-0000-0000-00000000000a', 'IMAGEN', 'PRODUCTO', 'P-2', 'otra.png',
   'EN_ANALISIS', '33000000-0000-0000-0000-0000000000f1', '2026-11-10 07:00-05');

-- ---------------------------------------------------------------------
-- RLS entre dos tenants (TR-CA-205).
-- ---------------------------------------------------------------------
SELECT set_config('app.tenant_id', '33000000-0000-0000-0000-00000000000b', false);
INSERT INTO arc.archivo (id, tenant_id, categoria, entidad_tipo, entidad_id, nombre_original, estado, creado_por, creado_en)
VALUES ('33000000-0000-0000-0000-0000000000b1', '33000000-0000-0000-0000-00000000000b', 'EVIDENCIA', 'CASO', 'C-9',
        'acta.pdf', 'PENDIENTE_CARGA', '33000000-0000-0000-0000-0000000000f2', '2026-11-15 08:00-05');
INSERT INTO arc.version_archivo (archivo_id, numero, tenant_id, ruta_storage, mime_declarado, bytes_declarados, estado, subido_por)
VALUES ('33000000-0000-0000-0000-0000000000b1', 1, '33000000-0000-0000-0000-00000000000b',
        '33000000-0000-0000-0000-00000000000b/33000000-0000-0000-0000-0000000000b1/1', 'application/pdf', 2048,
        'PENDIENTE_CARGA', '33000000-0000-0000-0000-0000000000f2');

DO $$
DECLARE filas int;
BEGIN
  IF (SELECT count(*) FROM arc.archivo) <> 1 THEN RAISE EXCEPTION 'B debía ver solo su archivo'; END IF;
  IF (SELECT count(*) FROM arc.version_archivo) <> 1 THEN RAISE EXCEPTION 'B debía ver solo su versión'; END IF;
  UPDATE arc.archivo SET nombre_original = 'ajeno.pdf' WHERE id = '33000000-0000-0000-0000-0000000000a1';
  GET DIAGNOSTICS filas = ROW_COUNT;
  IF filas <> 0 THEN RAISE EXCEPTION 'B no debía modificar el archivo de A'; END IF;
  UPDATE arc.version_archivo SET mime_real = 'text/plain' WHERE archivo_id = '33000000-0000-0000-0000-0000000000a1';
  GET DIAGNOSTICS filas = ROW_COUNT;
  IF filas <> 0 THEN RAISE EXCEPTION 'B no debía modificar la versión de A'; END IF;
  DELETE FROM arc.archivo WHERE id = '33000000-0000-0000-0000-0000000000a1';
  GET DIAGNOSTICS filas = ROW_COUNT;
  IF filas <> 0 THEN RAISE EXCEPTION 'B no debía borrar el archivo de A'; END IF;
  DELETE FROM arc.version_archivo WHERE archivo_id = '33000000-0000-0000-0000-0000000000a1';
  GET DIAGNOSTICS filas = ROW_COUNT;
  IF filas <> 0 THEN RAISE EXCEPTION 'B no debía borrar la versión de A'; END IF;
END $$;
SELECT arc_test.debe_fallar($$
  INSERT INTO arc.archivo (id, tenant_id, categoria, entidad_tipo, entidad_id, nombre_original, estado, creado_por)
  VALUES (gen_random_uuid(), '33000000-0000-0000-0000-00000000000a', 'IMAGEN', 'PRODUCTO', 'P-1', 'foto.png', 'PENDIENTE_CARGA', gen_random_uuid())$$,
  '42501', 'B inserta un archivo con el tenant de A');
SELECT arc_test.debe_fallar($$
  INSERT INTO arc.version_archivo (archivo_id, numero, tenant_id, ruta_storage, mime_declarado, bytes_declarados, estado, subido_por)
  VALUES ('33000000-0000-0000-0000-0000000000b1', 2, '33000000-0000-0000-0000-00000000000a', 'b/b1/2', 'application/pdf', 10, 'PENDIENTE_CARGA', gen_random_uuid())$$,
  '42501', 'B inserta una versión con el tenant de A');
SELECT arc_test.debe_fallar($$
  UPDATE arc.archivo SET tenant_id = '33000000-0000-0000-0000-00000000000a' WHERE id = '33000000-0000-0000-0000-0000000000b1'$$,
  '42501', 'B pasa su archivo a A');

-- ---------------------------------------------------------------------
-- arc.cargas_pendientes_vencidas corre como org_lector: ve los pendientes de todos los tenants,
-- del más antiguo al más reciente, sin depender del tenant del contexto.
-- ---------------------------------------------------------------------
DO $$ BEGIN
  IF (SELECT array_agg(archivo_id ORDER BY ordinality)
        FROM arc.cargas_pendientes_vencidas('2026-11-17 12:00-05', 200) WITH ORDINALITY)
     <> ARRAY['33000000-0000-0000-0000-0000000000b1', '33000000-0000-0000-0000-0000000000a1']::uuid[] THEN
    RAISE EXCEPTION 'debían salir los dos pendientes vencidos, primero el más antiguo';
  END IF;
  IF (SELECT tenant_id FROM arc.cargas_pendientes_vencidas('2026-11-17 12:00-05', 1))
     <> '33000000-0000-0000-0000-00000000000b' THEN
    RAISE EXCEPTION 'el límite debía dejar solo el más antiguo, con su tenant';
  END IF;
  IF EXISTS (SELECT 1 FROM arc.cargas_pendientes_vencidas('2026-11-15 08:00-05', 200)) THEN
    RAISE EXCEPTION 'una carga creada justo en el corte no está vencida';
  END IF;
  IF (SELECT count(*) FROM arc.cargas_pendientes_vencidas('2026-11-19 00:00-05', 200)) <> 3 THEN
    RAISE EXCEPTION 'solo debían salir los PENDIENTE_CARGA, no el EN_ANALISIS';
  END IF;
END $$;

SELECT set_config('app.tenant_id', '', false);
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM arc.archivo) OR EXISTS (SELECT 1 FROM arc.version_archivo) THEN
    RAISE EXCEPTION 'sin tenant no debía ver filas';
  END IF;
  IF (SELECT count(*) FROM arc.cargas_pendientes_vencidas('2026-11-19 00:00-05', 200)) <> 3 THEN
    RAISE EXCEPTION 'la función no debía depender del tenant del contexto';
  END IF;
END $$;

-- ---------------------------------------------------------------------
-- Limpieza: con el contexto del tenant, borrar el archivo se lleva su versión.
-- ---------------------------------------------------------------------
SELECT set_config('app.tenant_id', '33000000-0000-0000-0000-00000000000a', false);
DELETE FROM arc.archivo WHERE id = '33000000-0000-0000-0000-0000000000a1';
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM arc.archivo WHERE id = '33000000-0000-0000-0000-0000000000a1')
     OR EXISTS (SELECT 1 FROM arc.version_archivo) THEN
    RAISE EXCEPTION 'el borrado debía llevarse el archivo y su versión';
  END IF;
END $$;
SELECT arc_test.debe_fallar($$TRUNCATE arc.archivo CASCADE$$, '42501', 'TRUNCATE de archivo');

-- Solo el rol de la aplicación ejecuta la función y lee las tablas.
SET ROLE arc_test_sin_permiso;
SELECT arc_test.debe_fallar($$SELECT * FROM arc.cargas_pendientes_vencidas(now(), 200)$$, '42501', 'función sin EXECUTE');
SELECT arc_test.debe_fallar($$SELECT 1 FROM arc.archivo$$, '42501', 'lectura de archivo sin privilegio');
SELECT arc_test.debe_fallar($$SELECT 1 FROM arc.categoria$$, '42501', 'lectura de categoría sin privilegio');

RESET ROLE;

-- anon y authenticated sin acceso (solo si existen: PostgreSQL plano no los trae).
DO $$
DECLARE
  rol text;
  tabla text;
BEGIN
  FOREACH rol IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    CONTINUE WHEN NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = rol);
    IF has_schema_privilege(rol, 'arc', 'USAGE') THEN
      RAISE EXCEPTION '% no debía tener USAGE en arc', rol;
    END IF;
    IF has_function_privilege(rol, 'arc.cargas_pendientes_vencidas(timestamptz, integer)', 'EXECUTE') THEN
      RAISE EXCEPTION '% no debía ejecutar arc.cargas_pendientes_vencidas', rol;
    END IF;
    FOREACH tabla IN ARRAY ARRAY['arc.archivo', 'arc.version_archivo', 'arc.categoria'] LOOP
      IF has_table_privilege(rol, tabla, 'SELECT') OR has_table_privilege(rol, tabla, 'INSERT')
         OR has_table_privilege(rol, tabla, 'UPDATE') OR has_table_privilege(rol, tabla, 'DELETE') THEN
        RAISE EXCEPTION '% no debía tener acceso a %', rol, tabla;
      END IF;
    END LOOP;
  END LOOP;
END $$;

ROLLBACK;
