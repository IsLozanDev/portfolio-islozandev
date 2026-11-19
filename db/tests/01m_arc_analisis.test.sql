-- Prueba de 01m_arc_analisis (spec 34). La ejecuta tools/migrar/test/db-esquemas.test.mjs sobre una base temporal
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
GRANT SELECT, INSERT, UPDATE, DELETE ON arc.archivo TO arc_test_app;
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
-- El corte de la prueba es 2026-11-18 10:00 (hora de Lima) menos 15 minutos: 09:45.
-- Tenant A: uno en análisis de 16 minutos (atascado), uno de 14 (no) y uno por cada otro estado, todos viejos.
-- ---------------------------------------------------------------------
SELECT set_config('app.tenant_id', '34000000-0000-0000-0000-00000000000a', false);
INSERT INTO arc.archivo (id, tenant_id, categoria, entidad_tipo, entidad_id, nombre_original, estado, motivo_rechazo, version_vigente,
                         creado_por, creado_en, actualizado_en) VALUES
  ('34000000-0000-0000-0000-0000000000a1', '34000000-0000-0000-0000-00000000000a', 'DOCUMENTO', 'PRUEBA', 'E-1', 'atascado.pdf',
   'EN_ANALISIS', NULL, NULL, '34000000-0000-0000-0000-0000000000f1', '2026-11-18 09:00-05', '2026-11-18 09:44-05'),
  ('34000000-0000-0000-0000-0000000000a2', '34000000-0000-0000-0000-00000000000a', 'DOCUMENTO', 'PRUEBA', 'E-2', 'reciente.pdf',
   'EN_ANALISIS', NULL, NULL, '34000000-0000-0000-0000-0000000000f1', '2026-11-10 09:00-05', '2026-11-18 09:46-05'),
  ('34000000-0000-0000-0000-0000000000a3', '34000000-0000-0000-0000-00000000000a', 'DOCUMENTO', 'PRUEBA', 'E-3', 'pendiente.pdf',
   'PENDIENTE_CARGA', NULL, NULL, '34000000-0000-0000-0000-0000000000f1', '2026-11-10 09:00-05', '2026-11-10 09:00-05'),
  ('34000000-0000-0000-0000-0000000000a4', '34000000-0000-0000-0000-00000000000a', 'DOCUMENTO', 'PRUEBA', 'E-4', 'disponible.pdf',
   'DISPONIBLE', NULL, 1, '34000000-0000-0000-0000-0000000000f1', '2026-11-10 09:00-05', '2026-11-10 09:00-05'),
  ('34000000-0000-0000-0000-0000000000a5', '34000000-0000-0000-0000-00000000000a', 'DOCUMENTO', 'PRUEBA', 'E-5', 'cuarentena.pdf',
   'CUARENTENA', NULL, NULL, '34000000-0000-0000-0000-0000000000f1', '2026-11-10 09:00-05', '2026-11-10 09:00-05'),
  ('34000000-0000-0000-0000-0000000000a6', '34000000-0000-0000-0000-00000000000a', 'DOCUMENTO', 'PRUEBA', 'E-6', 'rechazado.pdf',
   'RECHAZADO', 'TIPO_NO_PERMITIDO', NULL, '34000000-0000-0000-0000-0000000000f1', '2026-11-10 09:00-05', '2026-11-10 09:00-05');

-- Tenant B: uno en análisis más antiguo que el de A, y otro justo en el corte.
SELECT set_config('app.tenant_id', '34000000-0000-0000-0000-00000000000b', false);
INSERT INTO arc.archivo (id, tenant_id, categoria, entidad_tipo, entidad_id, nombre_original, estado, creado_por, creado_en, actualizado_en) VALUES
  ('34000000-0000-0000-0000-0000000000b1', '34000000-0000-0000-0000-00000000000b', 'EVIDENCIA', 'CASO', 'C-1', 'acta.pdf',
   'EN_ANALISIS', '34000000-0000-0000-0000-0000000000f2', '2026-11-18 08:00-05', '2026-11-18 08:30-05'),
  ('34000000-0000-0000-0000-0000000000b2', '34000000-0000-0000-0000-00000000000b', 'EVIDENCIA', 'CASO', 'C-2', 'corte.pdf',
   'EN_ANALISIS', '34000000-0000-0000-0000-0000000000f2', '2026-11-18 08:00-05', '2026-11-18 09:45-05');

-- ---------------------------------------------------------------------
-- arc.archivos_en_analisis_atascados corre como org_lector: ve los de todos los tenants, del más antiguo
-- al más reciente, sin depender del tenant del contexto. Solo EN_ANALISIS y solo antes del corte.
-- ---------------------------------------------------------------------
DO $$ BEGIN
  IF (SELECT count(*) FROM arc.archivo) <> 2 THEN RAISE EXCEPTION 'B debía ver solo sus dos archivos'; END IF;
  IF (SELECT array_agg(archivo_id ORDER BY ordinality)
        FROM arc.archivos_en_analisis_atascados('2026-11-18 09:45-05', 200) WITH ORDINALITY)
     IS DISTINCT FROM ARRAY['34000000-0000-0000-0000-0000000000b1', '34000000-0000-0000-0000-0000000000a1']::uuid[] THEN
    RAISE EXCEPTION 'debían salir los dos atascados de A y de B, primero el más antiguo';
  END IF;
  IF (SELECT array_agg(tenant_id ORDER BY ordinality)
        FROM arc.archivos_en_analisis_atascados('2026-11-18 09:45-05', 200) WITH ORDINALITY)
     IS DISTINCT FROM ARRAY['34000000-0000-0000-0000-00000000000b', '34000000-0000-0000-0000-00000000000a']::uuid[] THEN
    RAISE EXCEPTION 'cada atascado debía salir con su tenant';
  END IF;
  IF (SELECT archivo_id FROM arc.archivos_en_analisis_atascados('2026-11-18 09:45-05', 1))
     <> '34000000-0000-0000-0000-0000000000b1' THEN
    RAISE EXCEPTION 'el límite debía dejar solo el más antiguo';
  END IF;
  IF (SELECT count(*) FROM arc.archivos_en_analisis_atascados('2026-11-19 00:00-05', 200)) <> 4 THEN
    RAISE EXCEPTION 'con un corte posterior debían salir los cuatro EN_ANALISIS y ningún otro estado';
  END IF;
  IF EXISTS (SELECT 1 FROM arc.archivos_en_analisis_atascados('2026-11-18 08:30-05', 200)) THEN
    RAISE EXCEPTION 'un archivo actualizado justo en el corte no está atascado';
  END IF;
END $$;

SELECT set_config('app.tenant_id', '', false);
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM arc.archivo) THEN RAISE EXCEPTION 'sin tenant no debía ver filas'; END IF;
  IF (SELECT count(*) FROM arc.archivos_en_analisis_atascados('2026-11-18 09:45-05', 200)) <> 2 THEN
    RAISE EXCEPTION 'la función no debía depender del tenant del contexto';
  END IF;
END $$;

-- Solo el rol de la aplicación ejecuta la función.
SET ROLE arc_test_sin_permiso;
SELECT arc_test.debe_fallar($$SELECT * FROM arc.archivos_en_analisis_atascados(now(), 200)$$, '42501', 'función sin EXECUTE');

RESET ROLE;

DO $$
DECLARE rol text;
BEGIN
  IF has_function_privilege('public', 'arc.archivos_en_analisis_atascados(timestamptz, integer)', 'EXECUTE') THEN
    RAISE EXCEPTION 'PUBLIC no debía ejecutar arc.archivos_en_analisis_atascados';
  END IF;
  -- anon y authenticated solo existen en Supabase: PostgreSQL plano no los trae.
  FOREACH rol IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    CONTINUE WHEN NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = rol);
    IF has_function_privilege(rol, 'arc.archivos_en_analisis_atascados(timestamptz, integer)', 'EXECUTE') THEN
      RAISE EXCEPTION '% no debía ejecutar arc.archivos_en_analisis_atascados', rol;
    END IF;
  END LOOP;
  IF (SELECT pg_get_userbyid(proowner) FROM pg_proc
       WHERE oid = 'arc.archivos_en_analisis_atascados(timestamptz, integer)'::regprocedure) <> 'org_lector' THEN
    RAISE EXCEPTION 'el dueño de la función debía ser org_lector';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = 'arc' AND indexname = 'ix_archivo_en_analisis'
                    AND indexdef LIKE '%(actualizado_en)%' AND indexdef LIKE '%EN_ANALISIS%') THEN
    RAISE EXCEPTION 'debía existir el índice parcial ix_archivo_en_analisis sobre actualizado_en';
  END IF;
END $$;

ROLLBACK;
