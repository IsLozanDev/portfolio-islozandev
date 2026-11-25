-- Prueba de 01u_fe_comprobante (spec 51). La ejecuta tools/migrar/test/db-esquemas.test.mjs sobre una base temporal
-- con db/ aplicado. Siembra como superusuario y evalúa con fe_comprobante_test_app, sin BYPASSRLS y con los mismos
-- privilegios que la aplicación. Todo en una transacción que se revierte.

BEGIN;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'fe_comprobante_test_app') THEN
    CREATE ROLE fe_comprobante_test_app NOLOGIN;
  END IF;
END $$;
GRANT USAGE ON SCHEMA fe TO fe_comprobante_test_app;
GRANT SELECT, INSERT, UPDATE ON fe.comprobante TO fe_comprobante_test_app;
GRANT SELECT, INSERT ON fe.comprobante_linea, fe.comprobante_cuota TO fe_comprobante_test_app;

CREATE SCHEMA fe_comprobante_test;
CREATE FUNCTION fe_comprobante_test.debe_fallar(sentencia text, esperado text, caso text) RETURNS void
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
GRANT USAGE ON SCHEMA fe_comprobante_test TO fe_comprobante_test_app;

-- ---------------------------------------------------------------------
-- Semilla: TASA_IGV con sus dos regímenes.
-- ---------------------------------------------------------------------
DO $$ BEGIN
  IF (SELECT string_agg(i.codigo || '=' || (i.atributos ->> 'tasa') || '@' || i.vigente_desde || '..' || coalesce(i.vigente_hasta::text, '-'), ' ' ORDER BY i.orden)
        FROM cat.catalogo c JOIN cat.catalogo_item i ON i.catalogo_id = c.id
       WHERE c.codigo = 'TASA_IGV' AND c.alcance = 'GLOBAL' AND i.tenant_id IS NULL AND i.activo)
     <> 'GENERAL=0.18@2011-03-01..- REDUCIDO_RESTAURANTES=0.105@2026-01-01..2026-12-31' THEN
    RAISE EXCEPTION 'TASA_IGV debía tener GENERAL y REDUCIDO_RESTAURANTES con sus tasas y vigencias';
  END IF;
END $$;

-- ---------------------------------------------------------------------
-- Dos tenants con empresa, sucursal y emisor.
-- ---------------------------------------------------------------------
INSERT INTO org.tenant (id, codigo, nombre, estado, version) VALUES
  ('51000000-0000-0000-0000-00000000000a', 'fe-cpe-a', 'FE comprobante A', 'ACTIVO', 1),
  ('51000000-0000-0000-0000-00000000000b', 'fe-cpe-b', 'FE comprobante B', 'ACTIVO', 1);
INSERT INTO org.empresa (id, tenant_id, ruc, razon_social, version) VALUES
  ('51000000-0000-0000-0000-0000000000a1', '51000000-0000-0000-0000-00000000000a', '20601234561', 'FE comprobante A SAC', 1),
  ('51000000-0000-0000-0000-0000000000b1', '51000000-0000-0000-0000-00000000000b', '20512345678', 'FE comprobante B SAC', 1);
INSERT INTO org.sucursal (id, tenant_id, empresa_id, codigo, nombre, codigo_establecimiento_sunat, es_principal, version) VALUES
  ('51000000-0000-0000-0000-0000000005a1', '51000000-0000-0000-0000-00000000000a', '51000000-0000-0000-0000-0000000000a1', 'PRI', 'Principal A', '0000', true, 1),
  ('51000000-0000-0000-0000-0000000005b1', '51000000-0000-0000-0000-00000000000b', '51000000-0000-0000-0000-0000000000b1', 'PRI', 'Principal B', '0000', true, 1);
INSERT INTO fe.emisor (id, tenant_id, empresa_id, proveedor, creado_por, estado) VALUES
  ('51000000-0000-0000-0000-0000000e0a01', '51000000-0000-0000-0000-00000000000a', '51000000-0000-0000-0000-0000000000a1',
   'SIMULADO', '51000000-0000-0000-0000-0000000000f1', 'CONFIGURADO'),
  ('51000000-0000-0000-0000-0000000e0b01', '51000000-0000-0000-0000-00000000000b', '51000000-0000-0000-0000-0000000000b1',
   'SIMULADO', '51000000-0000-0000-0000-0000000000f1', 'CONFIGURADO');

SET ROLE fe_comprobante_test_app;

-- ---------------------------------------------------------------------
-- Tenant A: una factura F001-00000100 con una línea y una cuota.
-- ---------------------------------------------------------------------
SELECT set_config('app.tenant_id', '51000000-0000-0000-0000-00000000000a', false);

INSERT INTO fe.comprobante (id, tenant_id, empresa_id, sucursal_id, emisor_id, tipo, serie, numero, fecha_emision, moneda, forma_pago,
                            adquirente_tipo_doc, adquirente_numero, adquirente_nombre, regimen_igv, tasa_igv, total_gravado,
                            total_exonerado, total_inafecto, igv, total, estado, clave_idempotencia, huella_solicitud)
VALUES ('51000000-0000-0000-0000-0000000c0a01', '51000000-0000-0000-0000-00000000000a', '51000000-0000-0000-0000-0000000000a1',
        '51000000-0000-0000-0000-0000000005a1', '51000000-0000-0000-0000-0000000e0a01', '01', 'F001', 100, '2026-11-24', 'PEN', 'CREDITO',
        'RUC', '20512345678', 'CLIENTE SAC', 'GENERAL', 0.18, 100.00, 0, 0, 18.00, 118.00, 'PENDIENTE_ENVIO',
        '51000000-0000-0000-0000-0000000001d1', repeat('a', 64));
INSERT INTO fe.comprobante_linea (comprobante_id, tenant_id, orden, descripcion, unidad, cantidad, valor_unitario, afectacion_igv,
                                  valor_venta, igv, precio_unitario)
VALUES ('51000000-0000-0000-0000-0000000c0a01', '51000000-0000-0000-0000-00000000000a', 1, 'Servicio', 'ZZ', 1, 100, '10', 100, 18, 118);
INSERT INTO fe.comprobante_cuota (comprobante_id, tenant_id, numero, monto, fecha_vencimiento)
VALUES ('51000000-0000-0000-0000-0000000c0a01', '51000000-0000-0000-0000-00000000000a', 1, 118.00, '2026-12-24');

DO $$ BEGIN
  IF (SELECT modo_envio || '|' || advertencias::text || '|' || version FROM fe.comprobante) <> 'INDIVIDUAL|[]|1' THEN
    RAISE EXCEPTION 'el comprobante debía nacer INDIVIDUAL, sin advertencias y en la versión 1';
  END IF;
END $$;

-- Número duplicado y clave repetida.
SELECT fe_comprobante_test.debe_fallar($$
  INSERT INTO fe.comprobante (id, tenant_id, empresa_id, sucursal_id, emisor_id, tipo, serie, numero, fecha_emision, moneda, forma_pago,
                              adquirente_tipo_doc, adquirente_numero, adquirente_nombre, regimen_igv, tasa_igv, total_gravado,
                              total_exonerado, total_inafecto, igv, total, estado, clave_idempotencia, huella_solicitud)
  VALUES (gen_random_uuid(), '51000000-0000-0000-0000-00000000000a', '51000000-0000-0000-0000-0000000000a1',
          '51000000-0000-0000-0000-0000000005a1', '51000000-0000-0000-0000-0000000e0a01', '01', 'F001', 100, '2026-11-24', 'PEN', 'CONTADO',
          'RUC', '20512345678', 'CLIENTE SAC', 'GENERAL', 0.18, 1, 0, 0, 0.18, 1.18, 'PENDIENTE_ENVIO', gen_random_uuid(), repeat('b', 64))
$$, '23505', 'número duplicado');
SELECT fe_comprobante_test.debe_fallar($$
  INSERT INTO fe.comprobante (id, tenant_id, empresa_id, sucursal_id, emisor_id, tipo, serie, numero, fecha_emision, moneda, forma_pago,
                              adquirente_tipo_doc, adquirente_numero, adquirente_nombre, regimen_igv, tasa_igv, total_gravado,
                              total_exonerado, total_inafecto, igv, total, estado, clave_idempotencia, huella_solicitud)
  VALUES (gen_random_uuid(), '51000000-0000-0000-0000-00000000000a', '51000000-0000-0000-0000-0000000000a1',
          '51000000-0000-0000-0000-0000000005a1', '51000000-0000-0000-0000-0000000e0a01', '01', 'F001', 101, '2026-11-24', 'PEN', 'CONTADO',
          'RUC', '20512345678', 'CLIENTE SAC', 'GENERAL', 0.18, 1, 0, 0, 0.18, 1.18, 'PENDIENTE_ENVIO',
          '51000000-0000-0000-0000-0000000001d1', repeat('b', 64))
$$, '23505', 'clave de idempotencia repetida');
-- Serie de boleta en una factura.
SELECT fe_comprobante_test.debe_fallar($$
  INSERT INTO fe.comprobante (id, tenant_id, empresa_id, sucursal_id, emisor_id, tipo, serie, numero, fecha_emision, moneda, forma_pago,
                              adquirente_tipo_doc, adquirente_numero, adquirente_nombre, regimen_igv, tasa_igv, total_gravado,
                              total_exonerado, total_inafecto, igv, total, estado, clave_idempotencia, huella_solicitud)
  VALUES (gen_random_uuid(), '51000000-0000-0000-0000-00000000000a', '51000000-0000-0000-0000-0000000000a1',
          '51000000-0000-0000-0000-0000000005a1', '51000000-0000-0000-0000-0000000e0a01', '01', 'B001', 1, '2026-11-24', 'PEN', 'CONTADO',
          'RUC', '20512345678', 'CLIENTE SAC', 'GENERAL', 0.18, 1, 0, 0, 0.18, 1.18, 'PENDIENTE_ENVIO', gen_random_uuid(), repeat('b', 64))
$$, '23514', 'serie B001 con tipo 01');

-- TR-RN-022: montos, número, adquirente, líneas y cuotas no cambian; nada se borra.
SELECT fe_comprobante_test.debe_fallar($$ UPDATE fe.comprobante SET total = 1 $$, '23001', 'cambiar el total');
SELECT fe_comprobante_test.debe_fallar($$ UPDATE fe.comprobante SET numero = 99 $$, '23001', 'cambiar el número');
SELECT fe_comprobante_test.debe_fallar($$ UPDATE fe.comprobante SET adquirente_nombre = 'OTRO' $$, '23001', 'cambiar el adquirente');
SELECT fe_comprobante_test.debe_fallar($$ UPDATE fe.comprobante SET estado = 'ENVIADO', igv = 0 $$, '23001', 'estado junto con un monto');
SELECT fe_comprobante_test.debe_fallar($$ DELETE FROM fe.comprobante $$, '42501', 'borrar el comprobante sin privilegio');
SELECT fe_comprobante_test.debe_fallar($$ UPDATE fe.comprobante_linea SET valor_venta = 1 $$, '42501', 'cambiar una línea sin privilegio');
SELECT fe_comprobante_test.debe_fallar($$ DELETE FROM fe.comprobante_cuota $$, '42501', 'borrar una cuota sin privilegio');

-- El estado, la versión y la fecha de modificación sí cambian (spec 52).
UPDATE fe.comprobante SET estado = 'ENVIADO', version = 2, modificado_en = now();

RESET ROLE;
-- Aunque el rol tuviera el privilegio, el trigger impide borrar o cambiar líneas, cuotas y comprobante.
SELECT fe_comprobante_test.debe_fallar($$ DELETE FROM fe.comprobante_linea $$, '23001', 'borrar una línea');
SELECT fe_comprobante_test.debe_fallar($$ UPDATE fe.comprobante_cuota SET monto = 1 $$, '23001', 'cambiar una cuota');
SELECT fe_comprobante_test.debe_fallar($$ DELETE FROM fe.comprobante $$, '23001', 'borrar el comprobante');
SET ROLE fe_comprobante_test_app;

-- ---------------------------------------------------------------------
-- Tenant B: no ve, no cambia ni cuelga líneas del comprobante de A.
-- ---------------------------------------------------------------------
SELECT set_config('app.tenant_id', '51000000-0000-0000-0000-00000000000b', false);
DO $$
DECLARE
  filas integer;
BEGIN
  IF EXISTS (SELECT 1 FROM fe.comprobante) OR EXISTS (SELECT 1 FROM fe.comprobante_linea) OR EXISTS (SELECT 1 FROM fe.comprobante_cuota) THEN
    RAISE EXCEPTION 'el tenant B no debía ver el comprobante, las líneas ni las cuotas del tenant A';
  END IF;
  UPDATE fe.comprobante SET estado = 'ANULADO' WHERE id = '51000000-0000-0000-0000-0000000c0a01';
  GET DIAGNOSTICS filas = ROW_COUNT;
  IF filas <> 0 THEN
    RAISE EXCEPTION 'el tenant B no debía cambiar el estado del comprobante del tenant A';
  END IF;
END $$;
SELECT fe_comprobante_test.debe_fallar($$
  INSERT INTO fe.comprobante_linea (comprobante_id, tenant_id, orden, descripcion, unidad, cantidad, valor_unitario, afectacion_igv,
                                    valor_venta, igv, precio_unitario)
  VALUES ('51000000-0000-0000-0000-0000000c0a01', '51000000-0000-0000-0000-00000000000a', 2, 'Intruso', 'ZZ', 1, 1, '10', 1, 0.18, 1.18)
$$, '42501', 'línea con el tenant de A desde B');

SELECT set_config('app.tenant_id', '51000000-0000-0000-0000-00000000000a', false);
DO $$ BEGIN
  IF (SELECT estado || '|' || version || '|' || total FROM fe.comprobante) <> 'ENVIADO|2|118.00' THEN
    RAISE EXCEPTION 'el comprobante del tenant A debía quedar ENVIADO en la versión 2 con su total';
  END IF;
END $$;

RESET ROLE;
ROLLBACK;
