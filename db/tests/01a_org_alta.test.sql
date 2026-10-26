-- Prueba de avisos y lectura de vencimientos (spec 12). La ejecuta tools/migrar/test/db-esquemas.test.mjs
-- sobre una base temporal con db/ aplicado. Corre como superusuario y cambia a roles sin BYPASSRLS.
-- DELETE se concede al rol para que el resultado sea de la RLS, no de privilegios.

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'org_alta_test_app') THEN
    CREATE ROLE org_alta_test_app NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'org_alta_test_sin_permiso') THEN
    CREATE ROLE org_alta_test_sin_permiso NOLOGIN;
  END IF;
END $$;
GRANT USAGE ON SCHEMA org TO org_alta_test_app, org_alta_test_sin_permiso;
GRANT SELECT, INSERT, UPDATE, DELETE ON org.aviso_vencimiento TO org_alta_test_app;
GRANT SELECT ON org.suscripcion, org.tenant TO org_alta_test_app;
GRANT EXECUTE ON FUNCTION org.suscripciones_a_revisar(date), org.codigo_tenant_existe(varchar) TO org_alta_test_app;

-- Datos como superusuario. Fecha de referencia: 10/10/2026.
-- A (PRUEBA): s1 vence el 13/10 (entra), s2 CANCELADA (fuera), s3 sin vigente_hasta (fuera), s4 vence el 30/10 (fuera, > 7 días).
-- B (ACTIVO): s5 VENCIDA el 05/10 (entra). C (SUSPENDIDO): s6 vence el 11/10 (fuera). D (BAJA): s7 (fuera).
INSERT INTO org.tenant (id, codigo, nombre, estado, version, baja_en) VALUES
  ('12000000-0000-0000-0000-00000000000a', 'alta-prueba-a', 'Alta Prueba A', 'PRUEBA', 1, NULL),
  ('12000000-0000-0000-0000-00000000000b', 'alta-prueba-b', 'Alta Prueba B', 'ACTIVO', 1, NULL),
  ('12000000-0000-0000-0000-00000000000c', 'alta-prueba-c', 'Alta Prueba C', 'SUSPENDIDO', 1, NULL),
  ('12000000-0000-0000-0000-00000000000d', 'alta-prueba-d', 'Alta Prueba D', 'BAJA', 1, now());
INSERT INTO org.suscripcion (id, tenant_id, producto_codigo, plan, estado, vigente_hasta, version) VALUES
  ('12000000-0000-0000-0000-000000000001', '12000000-0000-0000-0000-00000000000a', 'PSI', 'BASICO', 'PRUEBA',    '2026-10-13', 1),
  ('12000000-0000-0000-0000-000000000002', '12000000-0000-0000-0000-00000000000a', 'GYM', 'BASICO', 'CANCELADA', '2026-10-11', 1),
  ('12000000-0000-0000-0000-000000000003', '12000000-0000-0000-0000-00000000000a', 'LEX', 'BASICO', 'ACTIVA',    NULL,         1),
  ('12000000-0000-0000-0000-000000000004', '12000000-0000-0000-0000-00000000000a', 'DOC', 'BASICO', 'ACTIVA',    '2026-10-30', 1),
  ('12000000-0000-0000-0000-000000000005', '12000000-0000-0000-0000-00000000000b', 'REST', 'PRO',   'VENCIDA',   '2026-10-05', 1),
  ('12000000-0000-0000-0000-000000000006', '12000000-0000-0000-0000-00000000000c', 'CLI', 'BASICO', 'ACTIVA',    '2026-10-11', 1),
  ('12000000-0000-0000-0000-000000000007', '12000000-0000-0000-0000-00000000000d', 'COL', 'BASICO', 'ACTIVA',    '2026-10-11', 1);

SET ROLE org_alta_test_app;
SELECT set_config('app.tenant_id', '12000000-0000-0000-0000-00000000000a', false);

-- La función lee los dos tenants vigentes y excluye lo demás.
DO $$
DECLARE ids uuid[];
BEGIN
  SELECT array_agg(suscripcion_id ORDER BY suscripcion_id) INTO ids
    FROM org.suscripciones_a_revisar('2026-10-10') WHERE tenant_id::text LIKE '12000000-%';
  IF ids IS DISTINCT FROM ARRAY['12000000-0000-0000-0000-000000000001', '12000000-0000-0000-0000-000000000005']::uuid[] THEN
    RAISE EXCEPTION 'suscripciones_a_revisar debía devolver s1 (A) y s5 (B): %', ids;
  END IF;
  IF EXISTS (SELECT 1 FROM org.suscripciones_a_revisar(NULL)) THEN
    RAISE EXCEPTION 'con fecha NULL no debía devolver filas';
  END IF;
END $$;

-- El límite de 7 días es inclusivo: el 23/10 entra s4 (vence el 30/10).
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM org.suscripciones_a_revisar('2026-10-23') WHERE suscripcion_id = '12000000-0000-0000-0000-000000000004') THEN
    RAISE EXCEPTION 's4 debía entrar a 7 días de su vencimiento';
  END IF;
END $$;

-- codigo_tenant_existe ve códigos de otros tenants sin exponer sus filas.
DO $$ BEGIN
  IF NOT org.codigo_tenant_existe('alta-prueba-b') THEN RAISE EXCEPTION 'debía ver el código de B'; END IF;
  IF org.codigo_tenant_existe('alta-prueba-z') THEN RAISE EXCEPTION 'alta-prueba-z no existe'; END IF;
  IF org.codigo_tenant_existe(NULL) IS NOT NULL THEN RAISE EXCEPTION 'con NULL debía devolver NULL'; END IF;
  IF EXISTS (SELECT 1 FROM org.tenant WHERE codigo = 'alta-prueba-b') THEN RAISE EXCEPTION 'el SELECT directo no debía ver a B'; END IF;
END $$;

-- El SELECT directo sigue aislado por tenant.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM org.suscripcion WHERE tenant_id <> '12000000-0000-0000-0000-00000000000a') THEN
    RAISE EXCEPTION 'el SELECT directo no debía ver suscripciones de otro tenant';
  END IF;
END $$;

-- Avisos: alta propia, CHECK y unicidad.
INSERT INTO org.aviso_vencimiento (id, tenant_id, suscripcion_id, dias_antes, vigente_hasta, fecha_ejecucion)
VALUES ('12000000-0000-0000-0000-0000000000f1', '12000000-0000-0000-0000-00000000000a',
        '12000000-0000-0000-0000-000000000001', 3, '2026-10-13', '2026-10-10');
DO $$ BEGIN
  INSERT INTO org.aviso_vencimiento (id, tenant_id, suscripcion_id, dias_antes, vigente_hasta, fecha_ejecucion)
  VALUES (gen_random_uuid(), '12000000-0000-0000-0000-00000000000a',
          '12000000-0000-0000-0000-000000000001', 3, '2026-10-13', '2026-10-10');
  RAISE EXCEPTION 'ux_aviso debía impedir el duplicado';
EXCEPTION WHEN unique_violation THEN NULL;
END $$;
DO $$ BEGIN
  INSERT INTO org.aviso_vencimiento (id, tenant_id, suscripcion_id, dias_antes, vigente_hasta, fecha_ejecucion)
  VALUES (gen_random_uuid(), '12000000-0000-0000-0000-00000000000a',
          '12000000-0000-0000-0000-000000000001', 2, '2026-10-13', '2026-10-11');
  RAISE EXCEPTION 'dias_antes = 2 debía fallar';
EXCEPTION WHEN check_violation THEN NULL;
END $$;
-- Una renovación (vigente_hasta nuevo) vuelve a avisar.
INSERT INTO org.aviso_vencimiento (id, tenant_id, suscripcion_id, dias_antes, vigente_hasta, fecha_ejecucion)
VALUES (gen_random_uuid(), '12000000-0000-0000-0000-00000000000a',
        '12000000-0000-0000-0000-000000000001', 3, '2026-11-13', '2026-11-10');
DO $$ BEGIN
  INSERT INTO org.aviso_vencimiento (id, tenant_id, suscripcion_id, dias_antes, vigente_hasta, fecha_ejecucion)
  VALUES (gen_random_uuid(), '12000000-0000-0000-0000-00000000000b',
          '12000000-0000-0000-0000-000000000005', 7, '2026-10-05', '2026-09-28');
  RAISE EXCEPTION 'insertar aviso con otro tenant debía fallar';
EXCEPTION WHEN insufficient_privilege THEN NULL;
END $$;

-- UPDATE y DELETE no tocan filas: no hay políticas.
DO $$
DECLARE afectadas integer;
BEGIN
  UPDATE org.aviso_vencimiento SET fecha_ejecucion = '2026-10-11';
  GET DIAGNOSTICS afectadas = ROW_COUNT;
  IF afectadas <> 0 THEN RAISE EXCEPTION 'el UPDATE no debía modificar avisos'; END IF;
  DELETE FROM org.aviso_vencimiento;
  IF (SELECT count(*) FROM org.aviso_vencimiento) <> 2 THEN RAISE EXCEPTION 'el DELETE no debía borrar avisos'; END IF;
END $$;

-- Tenant B no ve los avisos de A.
SELECT set_config('app.tenant_id', '12000000-0000-0000-0000-00000000000b', false);
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM org.aviso_vencimiento) THEN RAISE EXCEPTION 'B no debía ver avisos de A'; END IF;
END $$;

RESET ROLE;

-- Un rol sin EXECUTE no puede leer entre tenants.
SET ROLE org_alta_test_sin_permiso;
DO $$ BEGIN
  PERFORM * FROM org.suscripciones_a_revisar('2026-10-10');
  RAISE EXCEPTION 'sin EXECUTE suscripciones_a_revisar debía fallar';
EXCEPTION WHEN insufficient_privilege THEN NULL;
END $$;
DO $$ BEGIN
  PERFORM org.codigo_tenant_existe('alta-prueba-a');
  RAISE EXCEPTION 'sin EXECUTE codigo_tenant_existe debía fallar';
EXCEPTION WHEN insufficient_privilege THEN NULL;
END $$;
RESET ROLE;

-- org_lector: sin login ni BYPASSRLS, dueño de la función SECURITY DEFINER con search_path fijo.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'org_lector' AND (rolcanlogin OR rolbypassrls OR rolsuper)) THEN
    RAISE EXCEPTION 'org_lector debe ser NOLOGIN sin BYPASSRLS';
  END IF;
  IF (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = 'org' AND p.proname IN ('suscripciones_a_revisar', 'codigo_tenant_existe')
         AND p.prosecdef AND pg_get_userbyid(p.proowner) = 'org_lector'
         AND p.proconfig @> ARRAY['search_path=""']) <> 2 THEN
    RAISE EXCEPTION 'suscripciones_a_revisar y codigo_tenant_existe deben ser SECURITY DEFINER de org_lector con search_path vacío';
  END IF;
END $$;

-- anon y authenticated no tienen acceso (solo si existen: PostgreSQL plano no los trae).
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    IF has_function_privilege('anon', 'org.suscripciones_a_revisar(date)', 'EXECUTE')
       OR has_function_privilege('authenticated', 'org.suscripciones_a_revisar(date)', 'EXECUTE')
       OR has_function_privilege('anon', 'org.codigo_tenant_existe(varchar)', 'EXECUTE')
       OR has_function_privilege('authenticated', 'org.codigo_tenant_existe(varchar)', 'EXECUTE') THEN
      RAISE EXCEPTION 'anon/authenticated no deben ejecutar las funciones de org';
    END IF;
    IF has_table_privilege('anon', 'org.aviso_vencimiento', 'SELECT')
       OR has_table_privilege('authenticated', 'org.aviso_vencimiento', 'INSERT') THEN
      RAISE EXCEPTION 'anon/authenticated no deben tener privilegios sobre org.aviso_vencimiento';
    END IF;
  END IF;
END $$;
