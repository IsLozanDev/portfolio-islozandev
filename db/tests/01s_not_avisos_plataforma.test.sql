-- Prueba de 01s_not_avisos_plataforma (spec 44). La ejecuta tools/migrar/test/db-esquemas.test.mjs sobre una base
-- temporal con db/ aplicado. Corre como superusuario y evalúa con not_avisos_test_app, sin BYPASSRLS y con los mismos
-- privilegios que la aplicación. Todo en una transacción que se revierte.

BEGIN;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'not_avisos_test_app') THEN
    CREATE ROLE not_avisos_test_app NOLOGIN;
  END IF;
END $$;
GRANT USAGE ON SCHEMA ntf TO not_avisos_test_app;
GRANT SELECT, INSERT, UPDATE ON ntf.plantilla TO not_avisos_test_app;

-- Las cuatro bases: sin tenant, versión 1, activas, en español y con un ejemplo por variable.
DO $$ BEGIN
  IF (SELECT count(*) FROM ntf.plantilla
       WHERE tenant_id IS NULL AND version = 1 AND activa AND idioma = 'es' AND canal = 'CORREO' AND creado_por IS NULL
         AND codigo IN ('SUSCRIPCION_POR_VENCER', 'TENANT_SUSPENDIDO', 'SOPORTE_SOLICITADO', 'INTEGRIDAD_ROTA')) <> 4 THEN
    RAISE EXCEPTION 'debían existir las cuatro plantillas base de los avisos de plataforma';
  END IF;
  IF EXISTS (SELECT 1 FROM ntf.plantilla, jsonb_array_elements(variables) variable
              WHERE id::text LIKE '44000000-%' AND NOT variable ? 'ejemplo') THEN
    RAISE EXCEPTION 'cada variable de los avisos debía declarar su ejemplo';
  END IF;
  IF (SELECT jsonb_agg(variable->>'nombre' ORDER BY variable->>'nombre') FROM ntf.plantilla, jsonb_array_elements(variables) variable
       WHERE codigo = 'SUSCRIPCION_POR_VENCER' AND tenant_id IS NULL) <> '["dias","producto","tenant","vigente_hasta"]'::jsonb THEN
    RAISE EXCEPTION 'SUSCRIPCION_POR_VENCER debía declarar tenant, producto, vigente_hasta y dias';
  END IF;
END $$;

SET ROLE not_avisos_test_app;

-- Visibles desde cualquier tenant.
SELECT set_config('app.tenant_id', '44000000-0000-0000-0000-00000000000a', false);
DO $$ BEGIN
  IF (SELECT count(*) FROM ntf.plantilla WHERE id::text LIKE '44000000-%') <> 4 THEN
    RAISE EXCEPTION 'el tenant A debía ver las cuatro bases';
  END IF;
END $$;

-- El tenant no puede modificarlas.
DO $$
DECLARE filas int;
BEGIN
  UPDATE ntf.plantilla SET activa = false, asunto = 'cambiada' WHERE id::text LIKE '44000000-%';
  GET DIAGNOSTICS filas = ROW_COUNT;
  IF filas <> 0 THEN RAISE EXCEPTION 'un tenant no debía modificar las bases de los avisos'; END IF;
END $$;

SELECT set_config('app.tenant_id', '44000000-0000-0000-0000-00000000000b', false);
DO $$ BEGIN
  IF (SELECT count(*) FROM ntf.plantilla WHERE id::text LIKE '44000000-%' AND activa AND asunto <> 'cambiada') <> 4 THEN
    RAISE EXCEPTION 'el tenant B debía ver las cuatro bases sin cambios';
  END IF;
END $$;

RESET ROLE;

ROLLBACK;
