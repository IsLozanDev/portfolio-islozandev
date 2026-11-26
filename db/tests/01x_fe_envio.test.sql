-- Prueba de 01x_fe_envio (spec 52). La ejecuta tools/migrar/test/db-esquemas.test.mjs sobre una base temporal con db/
-- aplicado. Siembra como superusuario y evalúa con fe_envio_test_app, sin BYPASSRLS y con los mismos privilegios que
-- la aplicación. Todo en una transacción que se revierte.

BEGIN;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'fe_envio_test_app') THEN
    CREATE ROLE fe_envio_test_app NOLOGIN;
  END IF;
END $$;
GRANT USAGE ON SCHEMA fe TO fe_envio_test_app;
GRANT SELECT, INSERT, UPDATE ON fe.comprobante TO fe_envio_test_app;
GRANT SELECT, INSERT ON fe.envio TO fe_envio_test_app;

CREATE SCHEMA fe_envio_test;
CREATE FUNCTION fe_envio_test.debe_fallar(sentencia text, esperado text, caso text) RETURNS void
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
GRANT USAGE ON SCHEMA fe_envio_test TO fe_envio_test_app;

-- ---------------------------------------------------------------------
-- Dos tenants con empresa, sucursal y emisor.
-- ---------------------------------------------------------------------
INSERT INTO org.tenant (id, codigo, nombre, estado, version) VALUES
  ('52000000-0000-0000-0000-00000000000a', 'fe-envio-a', 'FE envío A', 'ACTIVO', 1),
  ('52000000-0000-0000-0000-00000000000b', 'fe-envio-b', 'FE envío B', 'ACTIVO', 1);
INSERT INTO org.empresa (id, tenant_id, ruc, razon_social, version) VALUES
  ('52000000-0000-0000-0000-0000000000a1', '52000000-0000-0000-0000-00000000000a', '20601234561', 'FE envío A SAC', 1),
  ('52000000-0000-0000-0000-0000000000b1', '52000000-0000-0000-0000-00000000000b', '20512345678', 'FE envío B SAC', 1);
INSERT INTO org.sucursal (id, tenant_id, empresa_id, codigo, nombre, codigo_establecimiento_sunat, es_principal, version) VALUES
  ('52000000-0000-0000-0000-0000000005a1', '52000000-0000-0000-0000-00000000000a', '52000000-0000-0000-0000-0000000000a1', 'PRI', 'Principal A', '0000', true, 1),
  ('52000000-0000-0000-0000-0000000005b1', '52000000-0000-0000-0000-00000000000b', '52000000-0000-0000-0000-0000000000b1', 'PRI', 'Principal B', '0000', true, 1);
INSERT INTO fe.emisor (id, tenant_id, empresa_id, proveedor, creado_por, estado) VALUES
  ('52000000-0000-0000-0000-0000000e0a01', '52000000-0000-0000-0000-00000000000a', '52000000-0000-0000-0000-0000000000a1',
   'SIMULADO', '52000000-0000-0000-0000-0000000000f1', 'CONFIGURADO'),
  ('52000000-0000-0000-0000-0000000e0b01', '52000000-0000-0000-0000-00000000000b', '52000000-0000-0000-0000-0000000000b1',
   'SIMULADO', '52000000-0000-0000-0000-0000000000f1', 'CONFIGURADO');

SET ROLE fe_envio_test_app;

-- ---------------------------------------------------------------------
-- Tenant A: una boleta que se acepta y una que se rechaza.
-- ---------------------------------------------------------------------
SELECT set_config('app.tenant_id', '52000000-0000-0000-0000-00000000000a', false);

INSERT INTO fe.comprobante (id, tenant_id, empresa_id, sucursal_id, emisor_id, tipo, serie, numero, fecha_emision, moneda, forma_pago,
                            adquirente_tipo_doc, adquirente_numero, adquirente_nombre, regimen_igv, tasa_igv, total_gravado,
                            total_exonerado, total_inafecto, igv, total, estado, clave_idempotencia, huella_solicitud)
VALUES
  ('52000000-0000-0000-0000-0000000c0a01', '52000000-0000-0000-0000-00000000000a', '52000000-0000-0000-0000-0000000000a1',
   '52000000-0000-0000-0000-0000000005a1', '52000000-0000-0000-0000-0000000e0a01', '03', 'B002', 125, '2026-11-25', 'PEN', 'CONTADO',
   'DOC_0', '0', 'CLIENTES VARIOS', 'GENERAL', 0.18, 10.00, 0, 0, 1.80, 11.80, 'PENDIENTE_ENVIO', gen_random_uuid(), repeat('a', 64)),
  ('52000000-0000-0000-0000-0000000c0a02', '52000000-0000-0000-0000-00000000000a', '52000000-0000-0000-0000-0000000000a1',
   '52000000-0000-0000-0000-0000000005a1', '52000000-0000-0000-0000-0000000e0a01', '03', 'B002', 126, '2026-11-25', 'PEN', 'CONTADO',
   'DOC_0', '0', 'CLIENTES VARIOS', 'GENERAL', 0.18, 10.00, 0, 0, 1.80, 11.80, 'PENDIENTE_ENVIO', gen_random_uuid(), repeat('b', 64));

DO $$ BEGIN
  IF (SELECT observaciones::text FROM fe.comprobante WHERE id = '52000000-0000-0000-0000-0000000c0a01') <> '[]'
     OR (SELECT respondido_en FROM fe.comprobante WHERE id = '52000000-0000-0000-0000-0000000c0a01') IS NOT NULL THEN
    RAISE EXCEPTION 'el comprobante debía nacer sin observaciones ni respuesta';
  END IF;
END $$;

-- observaciones es una lista.
SELECT fe_envio_test.debe_fallar($$
  UPDATE fe.comprobante SET observaciones = '{"codigo": "4252"}' WHERE id = '52000000-0000-0000-0000-0000000c0a01'$$,
  '23514', 'observaciones que no son lista');

-- Los intentos se registran; el número de intento no se repite y el resultado está en la lista.
INSERT INTO fe.envio (id, tenant_id, comprobante_id, intento, proveedor, resultado, codigo, descripcion, enviado_en, duracion_ms) VALUES
  (gen_random_uuid(), '52000000-0000-0000-0000-00000000000a', '52000000-0000-0000-0000-0000000c0a01', 1, 'SUNAT', 'ERROR_TECNICO',
   '0109', 'Servicio no disponible', now(), 15000),
  (gen_random_uuid(), '52000000-0000-0000-0000-00000000000a', '52000000-0000-0000-0000-0000000c0a01', 2, 'SUNAT', 'ACEPTADO',
   '0', 'La Boleta numero B002-125, ha sido aceptada', now(), 820);
SELECT fe_envio_test.debe_fallar($$
  INSERT INTO fe.envio (id, tenant_id, comprobante_id, intento, proveedor, resultado, enviado_en)
  VALUES (gen_random_uuid(), '52000000-0000-0000-0000-00000000000a', '52000000-0000-0000-0000-0000000c0a01', 2, 'SUNAT', 'ACEPTADO', now())$$,
  '23505', 'intento repetido');
SELECT fe_envio_test.debe_fallar($$
  INSERT INTO fe.envio (id, tenant_id, comprobante_id, intento, proveedor, resultado, enviado_en)
  VALUES (gen_random_uuid(), '52000000-0000-0000-0000-00000000000a', '52000000-0000-0000-0000-0000000c0a01', 3, 'SUNAT', 'EN_PROCESO', now())$$,
  '23514', 'resultado fuera de la lista');
SELECT fe_envio_test.debe_fallar($$ UPDATE fe.envio SET resultado = 'RECHAZADO' $$, '42501', 'cambiar un intento sin privilegio');
SELECT fe_envio_test.debe_fallar($$ DELETE FROM fe.envio $$, '42501', 'borrar un intento sin privilegio');

-- Con la respuesta pasa de PENDIENTE_ENVIO a ACEPTADO con sus columnas; los montos siguen sin cambiar.
SELECT fe_envio_test.debe_fallar($$
  UPDATE fe.comprobante SET estado = 'ACEPTADO', total = 1 WHERE id = '52000000-0000-0000-0000-0000000c0a01'$$,
  '23001', 'estado junto con un monto');
UPDATE fe.comprobante
   SET estado = 'ACEPTADO', version = 2, modificado_en = now(), hash = 'qZyB0E1Yx3cH4kq0xU1n8Yp3m6Q=',
       xml_archivo_id = gen_random_uuid(), cdr_archivo_id = gen_random_uuid(), codigo_respuesta = '0',
       descripcion_respuesta = 'La Boleta numero B002-125, ha sido aceptada', observaciones = '[]', respondido_en = now()
 WHERE id = '52000000-0000-0000-0000-0000000c0a01';
UPDATE fe.comprobante
   SET estado = 'RECHAZADO', version = 2, modificado_en = now(), codigo_respuesta = '2105',
       descripcion_respuesta = 'Unidad de medida no existe', respondido_en = now()
 WHERE id = '52000000-0000-0000-0000-0000000c0a02';

-- TR-RN-022: desde un estado final nada cambia, ni el estado ni la respuesta.
SELECT fe_envio_test.debe_fallar($$
  UPDATE fe.comprobante SET estado = 'RECHAZADO' WHERE id = '52000000-0000-0000-0000-0000000c0a01'$$,
  '23001', 'cambiar el estado de un ACEPTADO');
SELECT fe_envio_test.debe_fallar($$
  UPDATE fe.comprobante SET observaciones = '["4252 - observación"]' WHERE id = '52000000-0000-0000-0000-0000000c0a01'$$,
  '23001', 'cambiar la respuesta de un ACEPTADO');
SELECT fe_envio_test.debe_fallar($$
  UPDATE fe.comprobante SET estado = 'PENDIENTE_ENVIO' WHERE id = '52000000-0000-0000-0000-0000000c0a02'$$,
  '23001', 'devolver a pendiente un RECHAZADO');
SELECT fe_envio_test.debe_fallar($$
  UPDATE fe.comprobante SET version = 3 WHERE id = '52000000-0000-0000-0000-0000000c0a02'$$,
  '23001', 'cambiar la versión de un RECHAZADO');

RESET ROLE;
-- Aunque el rol tuviera el privilegio, el trigger impide cambiar o borrar un intento.
SELECT fe_envio_test.debe_fallar($$ UPDATE fe.envio SET duracion_ms = 1 $$, '23001', 'cambiar un intento');
SELECT fe_envio_test.debe_fallar($$ DELETE FROM fe.envio $$, '23001', 'borrar un intento');
SET ROLE fe_envio_test_app;

-- ---------------------------------------------------------------------
-- Tenant B: no ve los intentos de A ni registra intentos a nombre de A.
-- ---------------------------------------------------------------------
SELECT set_config('app.tenant_id', '52000000-0000-0000-0000-00000000000b', false);
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM fe.envio) THEN
    RAISE EXCEPTION 'el tenant B no debía ver los intentos del tenant A';
  END IF;
END $$;
SELECT fe_envio_test.debe_fallar($$
  INSERT INTO fe.envio (id, tenant_id, comprobante_id, intento, proveedor, resultado, enviado_en)
  VALUES (gen_random_uuid(), '52000000-0000-0000-0000-00000000000a', '52000000-0000-0000-0000-0000000c0a01', 9, 'SUNAT', 'ACEPTADO', now())$$,
  '42501', 'intento con el tenant de otro');

RESET ROLE;

-- Regla 8 y privilegios: anon y authenticated (solo en Supabase) no tocan fe.envio; PUBLIC no ejecuta el trigger.
DO $$
DECLARE
  rol text;
BEGIN
  IF has_function_privilege('public', 'fe.proteger_envio()', 'EXECUTE') THEN RAISE EXCEPTION 'PUBLIC no debía ejecutar fe.proteger_envio'; END IF;
  FOREACH rol IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    CONTINUE WHEN NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = rol);
    IF has_table_privilege(rol, 'fe.envio', 'SELECT') THEN RAISE EXCEPTION '% no debía leer fe.envio', rol; END IF;
  END LOOP;
END $$;

ROLLBACK;
