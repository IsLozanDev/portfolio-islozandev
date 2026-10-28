-- Prueba de la lectura de tenants de la consola (spec 17a). La ejecuta tools/migrar/test/db-esquemas.test.mjs
-- sobre una base temporal con db/ aplicado. Corre como superusuario y cambia a roles sin BYPASSRLS.

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'org_consola_test_app') THEN
    CREATE ROLE org_consola_test_app NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'org_consola_test_sin_permiso') THEN
    CREATE ROLE org_consola_test_sin_permiso NOLOGIN;
  END IF;
END $$;
GRANT USAGE ON SCHEMA org TO org_consola_test_app, org_consola_test_sin_permiso;
GRANT SELECT ON org.tenant, org.empresa TO org_consola_test_app;
GRANT EXECUTE ON FUNCTION org.tenants_listar(varchar, varchar, varchar, int, int), org.tenant_detalle(uuid) TO org_consola_test_app;

-- Datos como superusuario. consola-dona-rosa (PRUEBA, REST) con empresa, principal e historial;
-- consola-fuerza-total (SUSPENDIDO, GYM y PSI) sin empresa.
INSERT INTO org.tenant (id, codigo, nombre, estado, version) VALUES
  ('17a00000-0000-0000-0000-00000000000a', 'consola-dona-rosa', 'Pollería Doña Rosa', 'PRUEBA', 1),
  ('17a00000-0000-0000-0000-00000000000b', 'consola-fuerza-total', 'Gym Fuerza Total', 'SUSPENDIDO', 3);
INSERT INTO org.suscripcion (id, tenant_id, producto_codigo, plan, estado, vigente_hasta, version) VALUES
  ('17a00000-0000-0000-0000-000000000001', '17a00000-0000-0000-0000-00000000000a', 'REST', 'BASICO', 'PRUEBA',  '2026-11-11', 1),
  ('17a00000-0000-0000-0000-000000000002', '17a00000-0000-0000-0000-00000000000b', 'GYM',  'PRO',    'VENCIDA', '2026-10-01', 1),
  ('17a00000-0000-0000-0000-000000000003', '17a00000-0000-0000-0000-00000000000b', 'PSI',  'BASICO', 'ACTIVA',  '2026-12-31', 1);
INSERT INTO org.empresa (id, tenant_id, ruc, razon_social, version) VALUES
  ('17a00000-0000-0000-0000-0000000000e1', '17a00000-0000-0000-0000-00000000000a', '20512345671', 'Pollería Doña Rosa S.A.C.', 1);
INSERT INTO org.sucursal (id, tenant_id, empresa_id, codigo, nombre, codigo_establecimiento_sunat, es_principal, version) VALUES
  ('17a00000-0000-0000-0000-0000000000f1', '17a00000-0000-0000-0000-00000000000a', '17a00000-0000-0000-0000-0000000000e1',
   'PRINCIPAL', 'Sede principal', '0000', true, 1);
INSERT INTO org.tenant_estado_historial (id, tenant_id, estado_anterior, estado_nuevo, motivo, fecha_efectiva, registrado_en) VALUES
  ('17a00000-0000-0000-0000-0000000000c1', '17a00000-0000-0000-0000-00000000000b', 'PRUEBA', 'ACTIVO',
   'Pago del primer mes recibido', '2026-09-01', '2026-09-01'),
  ('17a00000-0000-0000-0000-0000000000c2', '17a00000-0000-0000-0000-00000000000b', 'ACTIVO', 'SUSPENDIDO',
   'Fin del periodo de gracia de la suscripción', '2026-10-06', '2026-10-06');

SET ROLE org_consola_test_app;
SELECT set_config('app.tenant_id', '17a00000-0000-0000-0000-00000000000a', false);

-- Filtro por estado: solo consola-fuerza-total, con sus dos suscripciones.
DO $$
DECLARE fila record;
BEGIN
  SELECT * INTO STRICT fila FROM org.tenants_listar(NULL, 'SUSPENDIDO', NULL, 20, 0) WHERE id::text LIKE '17a00000-%';
  IF fila.codigo <> 'consola-fuerza-total' OR fila.total < 1 THEN
    RAISE EXCEPTION 'el filtro SUSPENDIDO debía devolver solo consola-fuerza-total: % (total %)', fila.codigo, fila.total;
  END IF;
  IF jsonb_array_length(fila.suscripciones) <> 2 OR fila.suscripciones -> 0 ->> 'producto_codigo' <> 'GYM' THEN
    RAISE EXCEPTION 'consola-fuerza-total debía traer GYM y PSI: %', fila.suscripciones;
  END IF;
END $$;

-- q por código o nombre (sin distinguir mayúsculas), producto, límite, desplazamiento y total.
DO $$ BEGIN
  IF (SELECT array_agg(codigo) FROM org.tenants_listar('POLLER', NULL, NULL, 20, 0) WHERE id::text LIKE '17a00000-%') IS DISTINCT FROM ARRAY['consola-dona-rosa']::varchar[] THEN
    RAISE EXCEPTION 'q debía buscar en el nombre sin distinguir mayúsculas';
  END IF;
  IF (SELECT array_agg(codigo) FROM org.tenants_listar('fuerza', NULL, NULL, 20, 0)) IS DISTINCT FROM ARRAY['consola-fuerza-total']::varchar[] THEN
    RAISE EXCEPTION 'q debía buscar en el código';
  END IF;
  IF (SELECT array_agg(codigo) FROM org.tenants_listar(NULL, NULL, 'PSI', 20, 0) WHERE id::text LIKE '17a00000-%') IS DISTINCT FROM ARRAY['consola-fuerza-total']::varchar[] THEN
    RAISE EXCEPTION 'el filtro de producto debía devolver solo consola-fuerza-total';
  END IF;
  IF (SELECT count(*) FROM org.tenants_listar('o', NULL, NULL, 1, 0)) <> 1
     OR (SELECT total FROM org.tenants_listar('o', NULL, NULL, 1, 0)) < 2 THEN
    RAISE EXCEPTION 'el límite corta la página y total cuenta todas las filas';
  END IF;
  IF (SELECT codigo FROM org.tenants_listar('o', NULL, NULL, 1, 0)) = (SELECT codigo FROM org.tenants_listar('o', NULL, NULL, 1, 1)) THEN
    RAISE EXCEPTION 'el desplazamiento debía avanzar de página';
  END IF;
END $$;

-- La lista devuelve solo las columnas declaradas: nada de empresa, sucursal ni membresía.
DO $$ BEGIN
  IF (SELECT array_agg(a.nombre ORDER BY a.orden) FROM pg_proc p,
              unnest(p.proargnames, p.proargmodes::text[]) WITH ORDINALITY AS a(nombre, modo, orden)
       WHERE p.oid = 'org.tenants_listar(varchar, varchar, varchar, int, int)'::regprocedure AND a.modo = 't')
     IS DISTINCT FROM ARRAY['id', 'codigo', 'nombre', 'estado', 'creado_en', 'suscripciones', 'total'] THEN
    RAISE EXCEPTION 'tenants_listar debe devolver solo cabecera, suscripciones y total';
  END IF;
END $$;

-- Detalle: suscripciones, empresa principal e historial del más reciente al más antiguo.
DO $$
DECLARE fila record;
BEGIN
  SELECT * INTO STRICT fila FROM org.tenant_detalle('17a00000-0000-0000-0000-00000000000b');
  IF fila.version <> 3 OR jsonb_array_length(fila.suscripciones) <> 2 OR fila.empresa_principal IS NOT NULL THEN
    RAISE EXCEPTION 'detalle de B incorrecto: %', fila;
  END IF;
  IF jsonb_array_length(fila.historial) <> 2 OR fila.historial -> 0 ->> 'estado_nuevo' <> 'SUSPENDIDO' THEN
    RAISE EXCEPTION 'el historial debía ir del más reciente al más antiguo: %', fila.historial;
  END IF;

  SELECT * INTO STRICT fila FROM org.tenant_detalle('17a00000-0000-0000-0000-00000000000a');
  IF fila.empresa_principal ->> 'ruc' <> '20512345671' OR fila.historial <> '[]'::jsonb THEN
    RAISE EXCEPTION 'detalle de A incorrecto: %', fila;
  END IF;

  IF EXISTS (SELECT 1 FROM org.tenant_detalle('17a00000-0000-0000-0000-0000000000ff')) THEN
    RAISE EXCEPTION 'un id inexistente no debía devolver filas';
  END IF;
  IF EXISTS (SELECT 1 FROM org.tenant_detalle(NULL)) THEN
    RAISE EXCEPTION 'con NULL no debía devolver filas';
  END IF;
END $$;

-- El SELECT directo sigue aislado por tenant.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM org.tenant WHERE codigo = 'consola-fuerza-total') THEN RAISE EXCEPTION 'el SELECT directo no debía ver a B'; END IF;
  IF (SELECT count(*) FROM org.empresa) <> 1 THEN RAISE EXCEPTION 'A debía ver solo su empresa'; END IF;
END $$;
SELECT set_config('app.tenant_id', '17a00000-0000-0000-0000-00000000000b', false);
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM org.empresa WHERE tenant_id = '17a00000-0000-0000-0000-00000000000a') THEN
    RAISE EXCEPTION 'B no debía ver la empresa de A';
  END IF;
END $$;

RESET ROLE;

-- Un rol sin EXECUTE no puede leer entre tenants.
SET ROLE org_consola_test_sin_permiso;
DO $$ BEGIN
  PERFORM * FROM org.tenants_listar(NULL, NULL, NULL, 20, 0);
  RAISE EXCEPTION 'sin EXECUTE tenants_listar debía fallar';
EXCEPTION WHEN insufficient_privilege THEN NULL;
END $$;
DO $$ BEGIN
  PERFORM * FROM org.tenant_detalle('17a00000-0000-0000-0000-00000000000a');
  RAISE EXCEPTION 'sin EXECUTE tenant_detalle debía fallar';
EXCEPTION WHEN insufficient_privilege THEN NULL;
END $$;
RESET ROLE;

-- Dueño org_lector, SECURITY DEFINER y search_path vacío.
DO $$ BEGIN
  IF (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = 'org' AND p.proname IN ('tenants_listar', 'tenant_detalle')
         AND p.prosecdef AND pg_get_userbyid(p.proowner) = 'org_lector'
         AND p.proconfig @> ARRAY['search_path=""']) <> 2 THEN
    RAISE EXCEPTION 'tenants_listar y tenant_detalle deben ser SECURITY DEFINER de org_lector con search_path vacío';
  END IF;
END $$;

-- anon y authenticated no tienen acceso (solo si existen: PostgreSQL plano no los trae).
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    IF has_function_privilege('anon', 'org.tenants_listar(varchar, varchar, varchar, int, int)', 'EXECUTE')
       OR has_function_privilege('authenticated', 'org.tenants_listar(varchar, varchar, varchar, int, int)', 'EXECUTE')
       OR has_function_privilege('anon', 'org.tenant_detalle(uuid)', 'EXECUTE')
       OR has_function_privilege('authenticated', 'org.tenant_detalle(uuid)', 'EXECUTE') THEN
      RAISE EXCEPTION 'anon/authenticated no deben ejecutar las funciones de la consola';
    END IF;
  END IF;
END $$;
