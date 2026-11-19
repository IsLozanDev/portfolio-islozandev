-- Prueba de 01m_arc_versiones (spec 35). La ejecuta tools/migrar/test/db-esquemas.test.mjs sobre una base temporal
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
GRANT EXECUTE ON FUNCTION arc.versiones_pendientes_vencidas(timestamptz, integer) TO arc_test_app;
GRANT EXECUTE ON FUNCTION arc.archivos_en_analisis_atascados(timestamptz, integer) TO arc_test_app;

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
-- Tenant A: un archivo DISPONIBLE con la versión 1 vigente, la 2 en cuarentena y la 3 pendiente de 23 h.
-- ---------------------------------------------------------------------
SELECT set_config('app.tenant_id', '35000000-0000-0000-0000-00000000000a', false);

INSERT INTO arc.archivo (id, tenant_id, categoria, entidad_tipo, entidad_id, nombre_original, estado, version_vigente,
                         creado_por, creado_en, actualizado_en)
VALUES ('35000000-0000-0000-0000-0000000000a1', '35000000-0000-0000-0000-00000000000a', 'DOCUMENTO', 'PRUEBA', 'E-1',
        'contrato.pdf', 'DISPONIBLE', 1, '35000000-0000-0000-0000-0000000000f1', '2026-11-10 08:00-05', '2026-11-16 08:00-05');
INSERT INTO arc.version_archivo (archivo_id, numero, tenant_id, ruta_storage, mime_declarado, bytes_declarados, estado,
                                 hash_sha256, bytes, mime_real, subido_por, subido_en) VALUES
  ('35000000-0000-0000-0000-0000000000a1', 1, '35000000-0000-0000-0000-00000000000a', 'a/a1/1', 'application/pdf', 100, 'DISPONIBLE',
   repeat('1', 64), 100, 'application/pdf', '35000000-0000-0000-0000-0000000000f1', '2026-11-10 08:00-05'),
  ('35000000-0000-0000-0000-0000000000a1', 2, '35000000-0000-0000-0000-00000000000a', 'a/a1/2', 'application/pdf', 100, 'CUARENTENA',
   repeat('2', 64), 100, 'application/pdf', '35000000-0000-0000-0000-0000000000f1', '2026-11-12 08:00-05'),
  ('35000000-0000-0000-0000-0000000000a1', 3, '35000000-0000-0000-0000-00000000000a', 'a/a1/3', 'image/jpeg', 50, 'PENDIENTE_CARGA',
   NULL, NULL, NULL, '35000000-0000-0000-0000-0000000000f1', '2026-11-17 11:00-05');

-- CHECK de estado, rechazo solo en la versión 1, hash solo después del análisis.
SELECT arc_test.debe_fallar($$
  UPDATE arc.version_archivo SET estado = 'BORRADO' WHERE archivo_id = '35000000-0000-0000-0000-0000000000a1' AND numero = 3$$,
  '23514', 'estado de versión fuera de la lista');
SELECT arc_test.debe_fallar($$
  UPDATE arc.version_archivo SET estado = 'RECHAZADO' WHERE archivo_id = '35000000-0000-0000-0000-0000000000a1' AND numero = 3$$,
  '23514', 'una versión nueva rechazada');
SELECT arc_test.debe_fallar($$
  UPDATE arc.version_archivo SET estado = 'DISPONIBLE' WHERE archivo_id = '35000000-0000-0000-0000-0000000000a1' AND numero = 3$$,
  '23514', 'versión disponible sin hash');
SELECT arc_test.debe_fallar($$
  UPDATE arc.version_archivo SET hash_sha256 = repeat('3', 64) WHERE archivo_id = '35000000-0000-0000-0000-0000000000a1' AND numero = 3$$,
  '23514', 'hash en una versión pendiente');
SELECT arc_test.debe_fallar($$
  INSERT INTO arc.version_archivo (archivo_id, numero, tenant_id, ruta_storage, mime_declarado, bytes_declarados, subido_por)
  VALUES ('35000000-0000-0000-0000-0000000000a1', 4, '35000000-0000-0000-0000-00000000000a', 'a/a1/4', 'application/pdf', 10, gen_random_uuid())$$,
  '23502', 'versión sin estado');

-- Una sola versión en curso por archivo (PENDIENTE_CARGA o EN_ANALISIS).
SELECT arc_test.debe_fallar($$
  INSERT INTO arc.version_archivo (archivo_id, numero, tenant_id, ruta_storage, mime_declarado, bytes_declarados, estado, subido_por)
  VALUES ('35000000-0000-0000-0000-0000000000a1', 4, '35000000-0000-0000-0000-00000000000a', 'a/a1/4', 'application/pdf', 10,
          'EN_ANALISIS', gen_random_uuid())$$,
  '23505', 'segunda versión en curso');
UPDATE arc.version_archivo SET estado = 'EN_ANALISIS' WHERE archivo_id = '35000000-0000-0000-0000-0000000000a1' AND numero = 3;
SELECT arc_test.debe_fallar($$
  INSERT INTO arc.version_archivo (archivo_id, numero, tenant_id, ruta_storage, mime_declarado, bytes_declarados, estado, subido_por)
  VALUES ('35000000-0000-0000-0000-0000000000a1', 4, '35000000-0000-0000-0000-00000000000a', 'a/a1/4', 'application/pdf', 10,
          'PENDIENTE_CARGA', gen_random_uuid())$$,
  '23505', 'versión pendiente con otra en análisis');
UPDATE arc.version_archivo SET estado = 'PENDIENTE_CARGA' WHERE archivo_id = '35000000-0000-0000-0000-0000000000a1' AND numero = 3;

-- El hash sigue siendo único por archivo, también contra la versión en cuarentena.
SELECT arc_test.debe_fallar($$
  UPDATE arc.version_archivo SET estado = 'DISPONIBLE', hash_sha256 = repeat('2', 64), bytes = 50, mime_real = 'image/jpeg'
   WHERE archivo_id = '35000000-0000-0000-0000-0000000000a1' AND numero = 3$$,
  '23505', 'hash igual al de la versión en cuarentena');

-- Rechazo de versión: solo en un archivo DISPONIBLE, y version_coincidente solo con IDENTICA.
UPDATE arc.archivo SET motivo_rechazo_version = 'IDENTICA', version_coincidente = 2 WHERE id = '35000000-0000-0000-0000-0000000000a1';
UPDATE arc.archivo SET motivo_rechazo_version = 'TIPO_NO_PERMITIDO', version_coincidente = NULL
 WHERE id = '35000000-0000-0000-0000-0000000000a1';
SELECT arc_test.debe_fallar($$
  UPDATE arc.archivo SET motivo_rechazo_version = 'INFECTADO' WHERE id = '35000000-0000-0000-0000-0000000000a1'$$,
  '23514', 'motivo de rechazo de versión fuera de la lista');
SELECT arc_test.debe_fallar($$
  UPDATE arc.archivo SET motivo_rechazo_version = 'IDENTICA', version_coincidente = NULL WHERE id = '35000000-0000-0000-0000-0000000000a1'$$,
  '23514', 'IDENTICA sin versión coincidente');
SELECT arc_test.debe_fallar($$
  UPDATE arc.archivo SET version_coincidente = 1 WHERE id = '35000000-0000-0000-0000-0000000000a1'$$,
  '23514', 'versión coincidente sin IDENTICA');
SELECT arc_test.debe_fallar($$
  UPDATE arc.archivo SET motivo_rechazo_version = 'IDENTICA', version_coincidente = 0 WHERE id = '35000000-0000-0000-0000-0000000000a1'$$,
  '23514', 'versión coincidente cero');
SELECT arc_test.debe_fallar($$
  INSERT INTO arc.archivo (id, tenant_id, categoria, entidad_tipo, entidad_id, nombre_original, estado, motivo_rechazo_version, creado_por)
  VALUES (gen_random_uuid(), '35000000-0000-0000-0000-00000000000a', 'IMAGEN', 'PRODUCTO', 'P-1', 'foto.png', 'PENDIENTE_CARGA',
          'TAMANO_NO_COINCIDE', gen_random_uuid())$$,
  '23514', 'rechazo de versión en un archivo pendiente');
UPDATE arc.archivo SET motivo_rechazo_version = NULL WHERE id = '35000000-0000-0000-0000-0000000000a1';

-- Versión 1 rechazada del spec 33: sigue valiendo.
INSERT INTO arc.archivo (id, tenant_id, categoria, entidad_tipo, entidad_id, nombre_original, estado, motivo_rechazo, creado_por)
VALUES ('35000000-0000-0000-0000-0000000000a2', '35000000-0000-0000-0000-00000000000a', 'IMAGEN', 'PRODUCTO', 'P-2', 'virus.png',
        'RECHAZADO', 'TIPO_NO_PERMITIDO', '35000000-0000-0000-0000-0000000000f1');
INSERT INTO arc.version_archivo (archivo_id, numero, tenant_id, ruta_storage, mime_declarado, bytes_declarados, estado, subido_por)
VALUES ('35000000-0000-0000-0000-0000000000a2', 1, '35000000-0000-0000-0000-00000000000a', 'a/a2/1', 'image/png', 64, 'RECHAZADO',
        '35000000-0000-0000-0000-0000000000f1');

-- ---------------------------------------------------------------------
-- Tenant B: un archivo con la versión 2 EN_ANALISIS desde hace 20 minutos (atascada) y otro con su versión 2
-- pendiente de 30 h.
-- ---------------------------------------------------------------------
SELECT set_config('app.tenant_id', '35000000-0000-0000-0000-00000000000b', false);
INSERT INTO arc.archivo (id, tenant_id, categoria, entidad_tipo, entidad_id, nombre_original, estado, version_vigente,
                         creado_por, creado_en, actualizado_en) VALUES
  ('35000000-0000-0000-0000-0000000000b1', '35000000-0000-0000-0000-00000000000b', 'EVIDENCIA', 'CASO', 'C-1', 'acta.pdf',
   'DISPONIBLE', 1, '35000000-0000-0000-0000-0000000000f2', '2026-11-10 08:00-05', '2026-11-18 09:40-05'),
  ('35000000-0000-0000-0000-0000000000b2', '35000000-0000-0000-0000-00000000000b', 'EVIDENCIA', 'CASO', 'C-2', 'foto.jpg',
   'DISPONIBLE', 1, '35000000-0000-0000-0000-0000000000f2', '2026-11-10 08:00-05', '2026-11-17 04:00-05');
INSERT INTO arc.version_archivo (archivo_id, numero, tenant_id, ruta_storage, mime_declarado, bytes_declarados, estado,
                                 hash_sha256, bytes, mime_real, subido_por, subido_en) VALUES
  ('35000000-0000-0000-0000-0000000000b1', 1, '35000000-0000-0000-0000-00000000000b', 'b/b1/1', 'application/pdf', 100, 'DISPONIBLE',
   repeat('1', 64), 100, 'application/pdf', '35000000-0000-0000-0000-0000000000f2', '2026-11-10 08:00-05'),
  ('35000000-0000-0000-0000-0000000000b1', 2, '35000000-0000-0000-0000-00000000000b', 'b/b1/2', 'application/pdf', 100, 'EN_ANALISIS',
   NULL, NULL, NULL, '35000000-0000-0000-0000-0000000000f2', '2026-11-16 08:00-05'),
  ('35000000-0000-0000-0000-0000000000b2', 1, '35000000-0000-0000-0000-00000000000b', 'b/b2/1', 'image/jpeg', 100, 'DISPONIBLE',
   repeat('1', 64), 100, 'image/jpeg', '35000000-0000-0000-0000-0000000000f2', '2026-11-10 08:00-05'),
  ('35000000-0000-0000-0000-0000000000b2', 2, '35000000-0000-0000-0000-00000000000b', 'b/b2/2', 'image/jpeg', 100, 'PENDIENTE_CARGA',
   NULL, NULL, NULL, '35000000-0000-0000-0000-0000000000f2', '2026-11-17 04:00-05');

-- ---------------------------------------------------------------------
-- RLS entre dos tenants con varias versiones.
-- ---------------------------------------------------------------------
DO $$
DECLARE filas int;
BEGIN
  IF (SELECT count(*) FROM arc.version_archivo) <> 4 THEN RAISE EXCEPTION 'B debía ver solo sus cuatro versiones'; END IF;
  UPDATE arc.version_archivo SET estado = 'EN_ANALISIS' WHERE archivo_id = '35000000-0000-0000-0000-0000000000a1' AND numero = 3;
  GET DIAGNOSTICS filas = ROW_COUNT;
  IF filas <> 0 THEN RAISE EXCEPTION 'B no debía cambiar una versión de A'; END IF;
  DELETE FROM arc.version_archivo WHERE archivo_id = '35000000-0000-0000-0000-0000000000a1';
  GET DIAGNOSTICS filas = ROW_COUNT;
  IF filas <> 0 THEN RAISE EXCEPTION 'B no debía borrar versiones de A'; END IF;
END $$;
SELECT arc_test.debe_fallar($$
  INSERT INTO arc.version_archivo (archivo_id, numero, tenant_id, ruta_storage, mime_declarado, bytes_declarados, estado, subido_por)
  VALUES ('35000000-0000-0000-0000-0000000000b2', 3, '35000000-0000-0000-0000-00000000000a', 'b/b2/3', 'image/jpeg', 10,
          'DISPONIBLE', gen_random_uuid())$$,
  '42501', 'B inserta una versión con el tenant de A');

SELECT set_config('app.tenant_id', '35000000-0000-0000-0000-00000000000a', false);
DO $$ BEGIN
  IF (SELECT array_agg(numero ORDER BY numero) FROM arc.version_archivo WHERE archivo_id = '35000000-0000-0000-0000-0000000000a1')
     IS DISTINCT FROM ARRAY[1, 2, 3] THEN
    RAISE EXCEPTION 'A debía conservar sus tres versiones';
  END IF;
  IF (SELECT count(*) FROM arc.version_archivo) <> 4 THEN RAISE EXCEPTION 'A debía ver solo sus cuatro versiones'; END IF;
END $$;

-- ---------------------------------------------------------------------
-- arc.versiones_pendientes_vencidas corre como org_lector: ve todos los tenants, sin la versión 1, de la más
-- antigua a la más reciente. El corte de la prueba es 2026-11-18 10:00 menos 24 h.
-- ---------------------------------------------------------------------
-- Una versión 1 pendiente (carga del spec 33) muy antigua: la limpia arc.cargas_pendientes_vencidas, no esta función.
INSERT INTO arc.archivo (id, tenant_id, categoria, entidad_tipo, entidad_id, nombre_original, estado, creado_por, creado_en)
VALUES ('35000000-0000-0000-0000-0000000000a3', '35000000-0000-0000-0000-00000000000a', 'IMAGEN', 'PRODUCTO', 'P-3', 'nueva.png',
        'PENDIENTE_CARGA', '35000000-0000-0000-0000-0000000000f1', '2026-11-01 08:00-05');
INSERT INTO arc.version_archivo (archivo_id, numero, tenant_id, ruta_storage, mime_declarado, bytes_declarados, estado, subido_por, subido_en)
VALUES ('35000000-0000-0000-0000-0000000000a3', 1, '35000000-0000-0000-0000-00000000000a', 'a/a3/1', 'image/png', 64, 'PENDIENTE_CARGA',
        '35000000-0000-0000-0000-0000000000f1', '2026-11-01 08:00-05');

SELECT set_config('app.tenant_id', '', false);
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM arc.version_archivo) THEN RAISE EXCEPTION 'sin tenant no debía ver versiones'; END IF;
  IF (SELECT array_agg(archivo_id::text || '/' || numero ORDER BY ordinality)
        FROM arc.versiones_pendientes_vencidas('2026-11-17 10:00-05', 200) WITH ORDINALITY)
     IS DISTINCT FROM ARRAY['35000000-0000-0000-0000-0000000000b2/2'] THEN
    RAISE EXCEPTION 'con el corte de 24 h solo debía vencer la versión 2 de B (la de A tiene 23 h y la 1 no cuenta)';
  END IF;
  IF (SELECT array_agg(archivo_id::text || '/' || numero ORDER BY ordinality)
        FROM arc.versiones_pendientes_vencidas('2026-11-19 00:00-05', 200) WITH ORDINALITY)
     IS DISTINCT FROM ARRAY['35000000-0000-0000-0000-0000000000b2/2', '35000000-0000-0000-0000-0000000000a1/3'] THEN
    RAISE EXCEPTION 'debían salir las dos versiones pendientes, primero la más antigua, sin la versión 1 ni la EN_ANALISIS';
  END IF;
  IF (SELECT tenant_id FROM arc.versiones_pendientes_vencidas('2026-11-19 00:00-05', 1)) <> '35000000-0000-0000-0000-00000000000b' THEN
    RAISE EXCEPTION 'el límite debía dejar solo la más antigua, con su tenant';
  END IF;
  IF EXISTS (SELECT 1 FROM arc.versiones_pendientes_vencidas('2026-11-17 04:00-05', 200)) THEN
    RAISE EXCEPTION 'una versión subida justo en el corte no está vencida';
  END IF;

  -- El barrido de análisis atascados (spec 34) ve también la versión 2 de B, con su número.
  IF (SELECT array_agg(archivo_id::text || '/' || numero ORDER BY ordinality)
        FROM arc.archivos_en_analisis_atascados('2026-11-18 09:45-05', 200) WITH ORDINALITY)
     IS DISTINCT FROM ARRAY['35000000-0000-0000-0000-0000000000b1/2'] THEN
    RAISE EXCEPTION 'el barrido debía ver la versión 2 de B en análisis, y no las pendientes ni las disponibles';
  END IF;
  IF EXISTS (SELECT 1 FROM arc.archivos_en_analisis_atascados('2026-11-18 09:40-05', 200)) THEN
    RAISE EXCEPTION 'una versión cuyo archivo se actualizó justo en el corte no está atascada';
  END IF;
END $$;

-- Solo el rol de la aplicación ejecuta las funciones.
SET ROLE arc_test_sin_permiso;
SELECT arc_test.debe_fallar($$SELECT * FROM arc.versiones_pendientes_vencidas(now(), 200)$$, '42501', 'función sin EXECUTE');
SELECT arc_test.debe_fallar($$SELECT 1 FROM arc.version_archivo$$, '42501', 'lectura de versiones sin privilegio');

RESET ROLE;

DO $$
DECLARE
  rol text;
  funcion text;
BEGIN
  FOREACH funcion IN ARRAY ARRAY['arc.versiones_pendientes_vencidas(timestamptz, integer)', 'arc.archivos_en_analisis_atascados(timestamptz, integer)'] LOOP
    IF has_function_privilege('public', funcion, 'EXECUTE') THEN RAISE EXCEPTION 'PUBLIC no debía ejecutar %', funcion; END IF;
    IF (SELECT pg_get_userbyid(proowner) FROM pg_proc WHERE oid = funcion::regprocedure) <> 'org_lector' THEN
      RAISE EXCEPTION 'el dueño de % debía ser org_lector', funcion;
    END IF;
    -- anon y authenticated solo existen en Supabase: PostgreSQL plano no los trae.
    FOREACH rol IN ARRAY ARRAY['anon', 'authenticated'] LOOP
      CONTINUE WHEN NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = rol);
      IF has_function_privilege(rol, funcion, 'EXECUTE') THEN RAISE EXCEPTION '% no debía ejecutar %', rol, funcion; END IF;
    END LOOP;
  END LOOP;
END $$;

ROLLBACK;
