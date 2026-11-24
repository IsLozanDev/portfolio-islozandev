-- Prueba de 01r_fe_prueba (spec 50). La ejecuta tools/migrar/test/db-esquemas.test.mjs sobre una base temporal
-- con db/ aplicado. Siembra como superusuario y evalúa con fe_prueba_test_app, sin BYPASSRLS y con los mismos
-- privilegios que la aplicación. Todo en una transacción que se revierte.

BEGIN;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'fe_prueba_test_app') THEN
    CREATE ROLE fe_prueba_test_app NOLOGIN;
  END IF;
END $$;
GRANT USAGE ON SCHEMA fe TO fe_prueba_test_app;
GRANT SELECT, INSERT, UPDATE ON fe.emisor TO fe_prueba_test_app;

CREATE SCHEMA fe_prueba_test;
CREATE FUNCTION fe_prueba_test.debe_fallar(sentencia text, esperado text, caso text) RETURNS void
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
GRANT USAGE ON SCHEMA fe_prueba_test TO fe_prueba_test_app;

-- ---------------------------------------------------------------------
-- Semilla: NUBEFACT sin certificado con su dominio y serie; SIMULADO con los atributos nuevos.
-- ---------------------------------------------------------------------
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM cat.catalogo c JOIN cat.catalogo_item i ON i.catalogo_id = c.id
     WHERE c.codigo = 'PROVEEDOR_FE' AND i.codigo = 'NUBEFACT' AND i.tenant_id IS NULL AND i.activo
       AND i.atributos = '{"requiere_certificado": false, "soporta_resumen": true, "url_beta": null, "serie_prueba": "BBB1", "dominios_permitidos": ["api.nubefact.com"]}'::jsonb
  ) THEN
    RAISE EXCEPTION 'PROVEEDOR_FE debía tener NUBEFACT con sus atributos';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM cat.catalogo c JOIN cat.catalogo_item i ON i.catalogo_id = c.id
     WHERE c.codigo = 'PROVEEDOR_FE' AND i.codigo = 'SIMULADO'
       AND i.atributos = '{"requiere_certificado": true, "soporta_resumen": true, "url_beta": null, "serie_prueba": "B999", "dominios_permitidos": ["simulador.invalid"]}'::jsonb
  ) THEN
    RAISE EXCEPTION 'SIMULADO debía sumar serie_prueba y dominios_permitidos';
  END IF;
END $$;

-- ---------------------------------------------------------------------
-- Dos tenants con una empresa y un emisor cada uno.
-- ---------------------------------------------------------------------
INSERT INTO org.tenant (id, codigo, nombre, estado, version) VALUES
  ('50000000-0000-0000-0000-00000000000a', 'fe-prueba-a', 'FE prueba A', 'ACTIVO', 1),
  ('50000000-0000-0000-0000-00000000000b', 'fe-prueba-b', 'FE prueba B', 'ACTIVO', 1);
INSERT INTO org.empresa (id, tenant_id, ruc, razon_social, version) VALUES
  ('50000000-0000-0000-0000-0000000000a1', '50000000-0000-0000-0000-00000000000a', '20601234561', 'FE prueba A SAC', 1),
  ('50000000-0000-0000-0000-0000000000b1', '50000000-0000-0000-0000-00000000000b', '20512345678', 'FE prueba B SAC', 1);

SET ROLE fe_prueba_test_app;

SELECT set_config('app.tenant_id', '50000000-0000-0000-0000-00000000000a', false);
INSERT INTO fe.emisor (id, tenant_id, empresa_id, proveedor, creado_por, estado)
VALUES ('50000000-0000-0000-0000-0000000e0a01', '50000000-0000-0000-0000-00000000000a', '50000000-0000-0000-0000-0000000000a1',
        'NUBEFACT', '50000000-0000-0000-0000-0000000000f1', 'CONFIGURADO');

DO $$ BEGIN
  IF (SELECT pruebas_enviadas || '|' || coalesce(prueba_estado, '-') || '|' || coalesce(url_proveedor, '-') FROM fe.emisor) <> '0|-|-' THEN
    RAISE EXCEPTION 'el emisor debía nacer sin pruebas, sin estado de prueba y sin URL';
  END IF;
END $$;

-- PRODUCCION en el estado exige PRODUCCION en el ambiente, y al revés.
SELECT fe_prueba_test.debe_fallar($$ UPDATE fe.emisor SET estado = 'PRODUCCION' $$, '23514', 'PRODUCCION sin ambiente PRODUCCION');
SELECT fe_prueba_test.debe_fallar($$ UPDATE fe.emisor SET ambiente = 'PRODUCCION' $$, '23514', 'ambiente PRODUCCION sin estado PRODUCCION');
-- Solo https; estado de prueba conocido; correlativo no negativo.
SELECT fe_prueba_test.debe_fallar($$ UPDATE fe.emisor SET url_proveedor = 'http://api.nubefact.com/api/v1/x' $$, '23514', 'URL http');
SELECT fe_prueba_test.debe_fallar($$ UPDATE fe.emisor SET prueba_estado = 'PENDIENTE' $$, '23514', 'estado de prueba desconocido');
SELECT fe_prueba_test.debe_fallar($$ UPDATE fe.emisor SET pruebas_enviadas = -1 $$, '23514', 'correlativo negativo');

UPDATE fe.emisor
   SET url_proveedor = 'https://api.nubefact.com/api/v1/ruta-demo', pruebas_enviadas = 1, prueba_estado = 'ACEPTADA',
       prueba_solicitada_en = now(), prueba_resultado_en = now(), prueba_codigo = '0', prueba_descripcion = 'aceptada',
       estado = 'VERIFICADO';
UPDATE fe.emisor
   SET estado = 'PRODUCCION', ambiente = 'PRODUCCION', produccion_habilitada_en = now(),
       produccion_habilitada_por = '50000000-0000-0000-0000-0000000000f1';

-- ---------------------------------------------------------------------
-- Tenant B: no ve ni cambia las columnas nuevas del emisor de A.
-- ---------------------------------------------------------------------
SELECT set_config('app.tenant_id', '50000000-0000-0000-0000-00000000000b', false);
DO $$
DECLARE
  filas integer;
BEGIN
  IF EXISTS (SELECT 1 FROM fe.emisor WHERE id = '50000000-0000-0000-0000-0000000e0a01') THEN
    RAISE EXCEPTION 'el tenant B no debía ver el emisor del tenant A';
  END IF;
  UPDATE fe.emisor SET pruebas_enviadas = 99, prueba_estado = 'EN_PROCESO' WHERE id = '50000000-0000-0000-0000-0000000e0a01';
  GET DIAGNOSTICS filas = ROW_COUNT;
  IF filas <> 0 THEN
    RAISE EXCEPTION 'el tenant B no debía pedir una prueba sobre el emisor del tenant A';
  END IF;
END $$;

SELECT set_config('app.tenant_id', '50000000-0000-0000-0000-00000000000a', false);
DO $$ BEGIN
  IF (SELECT pruebas_enviadas || '|' || prueba_estado || '|' || estado FROM fe.emisor) <> '1|ACEPTADA|PRODUCCION' THEN
    RAISE EXCEPTION 'el emisor del tenant A no debía cambiar desde el tenant B';
  END IF;
END $$;

RESET ROLE;
ROLLBACK;
