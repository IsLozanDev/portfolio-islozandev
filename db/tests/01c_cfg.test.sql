-- Prueba de 01c_cfg. La ejecuta tools/migrar/test/db-esquemas.test.mjs después de
-- 01b_seg_membresias.test.sql, sobre la misma base. Siembra como superusuario y evalúa con
-- cfg_test_app (sin BYPASSRLS).

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'cfg_test_app') THEN
    CREATE ROLE cfg_test_app NOLOGIN;
  END IF;
END $$;
GRANT USAGE ON SCHEMA cfg, org TO cfg_test_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA cfg TO cfg_test_app;
GRANT SELECT ON ALL TABLES IN SCHEMA org TO cfg_test_app;
GRANT EXECUTE ON FUNCTION cfg.valor(varchar, uuid, uuid, uuid), cfg.versiones(uuid) TO cfg_test_app;

CREATE SCHEMA cfg_test;
CREATE FUNCTION cfg_test.debe_fallar(sentencia text, esperado text, caso text) RETURNS void
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
-- Valor efectivo como texto 'valor|origen' para el tenant E, o NULL si no hay fila.
CREATE FUNCTION cfg_test.ef(p_codigo text, p_empresa uuid, p_sucursal uuid) RETURNS text LANGUAGE sql AS $$
  SELECT v.valor::text || '|' || v.origen
    FROM cfg.valor(p_codigo, 'e2000000-0000-0000-0000-000000000001', p_empresa, p_sucursal) v;
$$;
CREATE FUNCTION cfg_test.espera(obtenido text, esperado text, caso text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF obtenido IS DISTINCT FROM esperado THEN
    RAISE EXCEPTION '%: se esperaba % y llegó %', caso, esperado, obtenido;
  END IF;
END
$$;
CREATE FUNCTION cfg_test.vt() RETURNS bigint LANGUAGE sql AS $$
  SELECT vt FROM cfg.versiones('e2000000-0000-0000-0000-000000000001');
$$;
GRANT USAGE ON SCHEMA cfg_test TO cfg_test_app;

-- ---------------------------------------------------------------------
-- Siembra (superusuario). Tenant E con dos empresas y tres sucursales; tenant F con una sucursal.
-- ---------------------------------------------------------------------
INSERT INTO org.tenant (id, codigo, nombre, estado, version) VALUES
  ('e2000000-0000-0000-0000-000000000001', 'cfg-tenant-e', 'Cfg tenant E', 'ACTIVO', 1),
  ('f2000000-0000-0000-0000-000000000002', 'cfg-tenant-f', 'Cfg tenant F', 'ACTIVO', 1);
INSERT INTO org.empresa (id, tenant_id, ruc, razon_social, version) VALUES
  ('e2000000-0000-0000-0000-000000000011', 'e2000000-0000-0000-0000-000000000001', '20300000001', 'Cfg Lima SAC', 1),
  ('e2000000-0000-0000-0000-000000000012', 'e2000000-0000-0000-0000-000000000001', '20300000002', 'Cfg Arequipa SAC', 1),
  ('f2000000-0000-0000-0000-000000000011', 'f2000000-0000-0000-0000-000000000002', '20300000003', 'Cfg F SAC', 1);
INSERT INTO org.sucursal (id, tenant_id, empresa_id, codigo, nombre, codigo_establecimiento_sunat, es_principal, version) VALUES
  ('e2000000-0000-0000-0000-000000000101', 'e2000000-0000-0000-0000-000000000001', 'e2000000-0000-0000-0000-000000000011',
   'JOCK', 'Food court Jockey', '0000', true, 1),
  ('e2000000-0000-0000-0000-000000000102', 'e2000000-0000-0000-0000-000000000001', 'e2000000-0000-0000-0000-000000000011',
   'MIRA', 'Miraflores', '0001', false, 1),
  ('e2000000-0000-0000-0000-000000000201', 'e2000000-0000-0000-0000-000000000001', 'e2000000-0000-0000-0000-000000000012',
   'CAYM', 'Cayma', '0000', true, 1),
  ('f2000000-0000-0000-0000-000000000101', 'f2000000-0000-0000-0000-000000000002', 'f2000000-0000-0000-0000-000000000011',
   'FSUC', 'Sucursal F', '0000', true, 1);

INSERT INTO seg.producto (codigo, nombre) VALUES ('REST', 'Restaurantes'), ('PLAT', 'Plataforma')
  ON CONFLICT (codigo) DO NOTHING;
INSERT INTO seg.usuario (id, email, nombre, tipo, estado) VALUES
  ('e2000000-0000-0000-0000-000000000901', 'ana.cfg@gmail.com', 'Ana', 'INTERNO', 'ACTIVO');

INSERT INTO cfg.parametro_def (codigo, producto_codigo, descripcion, tipo, valor_defecto, alcance_maximo, esquema) VALUES
  ('rest.propina.porcentaje', 'REST', 'Porcentaje de propina sugerida', 'NUMERO', '10', 'SUCURSAL', '{"minimum":0,"maximum":20}'),
  ('plat.sesion.minutos_inactividad', 'PLAT', 'Minutos de inactividad', 'NUMERO', '30', 'TENANT', NULL),
  ('plat.factura.moneda_defecto', 'PLAT', 'Moneda por defecto', 'TEXTO', '"PEN"', 'EMPRESA', NULL);
INSERT INTO cfg.definiciones_aplicadas (producto_codigo, cambios) VALUES ('REST', '{"insertadas":3}');

-- Un valor de F para probar el aislamiento.
INSERT INTO cfg.parametro_valor (id, tenant_id, codigo, alcance, valor, modificado_por) VALUES
  ('f2000000-0000-0000-0000-00000000a001', 'f2000000-0000-0000-0000-000000000002', 'rest.propina.porcentaje',
   'TENANT', '15', 'e2000000-0000-0000-0000-000000000901');

SET ROLE cfg_test_app;
SELECT set_config('app.tenant_id', 'e2000000-0000-0000-0000-000000000001', false);

-- ---------------------------------------------------------------------
-- Herencia (TR-RN-014, TR-CA-080, 083, 084, 086).
-- ---------------------------------------------------------------------
SELECT cfg_test.espera(cfg_test.ef('plat.sesion.minutos_inactividad', NULL, NULL), '30|DEFECTO', 'sin valores da el defecto');
SELECT cfg_test.espera(cfg_test.ef('rest.mesa.color', NULL, NULL), NULL, 'código inexistente sin filas');

DO $$
DECLARE
  previa bigint := cfg_test.vt();
BEGIN
  INSERT INTO cfg.parametro_valor (id, tenant_id, codigo, alcance, valor, modificado_por) VALUES
    ('e2000000-0000-0000-0000-00000000a001', 'e2000000-0000-0000-0000-000000000001', 'rest.propina.porcentaje',
     'TENANT', '10', 'e2000000-0000-0000-0000-000000000901');
  IF cfg_test.vt() <> previa + 1 THEN
    RAISE EXCEPTION 'insertar un valor debía subir la versión';
  END IF;
END $$;
SELECT cfg_test.espera(cfg_test.ef('rest.propina.porcentaje', NULL, 'e2000000-0000-0000-0000-000000000101'), '10|TENANT', 'hereda del tenant');

INSERT INTO cfg.parametro_valor (id, tenant_id, codigo, alcance, sucursal_id, valor, modificado_por) VALUES
  ('e2000000-0000-0000-0000-00000000a002', 'e2000000-0000-0000-0000-000000000001', 'rest.propina.porcentaje',
   'SUCURSAL', 'e2000000-0000-0000-0000-000000000101', '0', 'e2000000-0000-0000-0000-000000000901');
SELECT cfg_test.espera(cfg_test.ef('rest.propina.porcentaje', NULL, 'e2000000-0000-0000-0000-000000000101'), '0|SUCURSAL', 'TR-CA-080 Jockey');
SELECT cfg_test.espera(cfg_test.ef('rest.propina.porcentaje', NULL, 'e2000000-0000-0000-0000-000000000102'), '10|TENANT', 'TR-CA-080 Miraflores');

INSERT INTO cfg.parametro_valor (id, tenant_id, codigo, alcance, empresa_id, valor, modificado_por) VALUES
  ('e2000000-0000-0000-0000-00000000a003', 'e2000000-0000-0000-0000-000000000001', 'rest.propina.porcentaje',
   'EMPRESA', 'e2000000-0000-0000-0000-000000000012', '12', 'e2000000-0000-0000-0000-000000000901');
SELECT cfg_test.espera(cfg_test.ef('rest.propina.porcentaje', NULL, 'e2000000-0000-0000-0000-000000000201'), '12|EMPRESA', 'TR-CA-083 Cayma, empresa derivada');
SELECT cfg_test.espera(cfg_test.ef('rest.propina.porcentaje', 'e2000000-0000-0000-0000-000000000012', NULL), '12|EMPRESA', 'empresa explícita');

-- Nivel más específico que el alcance máximo: se ignora.
INSERT INTO cfg.parametro_valor (id, tenant_id, codigo, alcance, sucursal_id, valor, modificado_por) VALUES
  ('e2000000-0000-0000-0000-00000000a004', 'e2000000-0000-0000-0000-000000000001', 'plat.factura.moneda_defecto',
   'SUCURSAL', 'e2000000-0000-0000-0000-000000000101', '"USD"', 'e2000000-0000-0000-0000-000000000901');
SELECT cfg_test.espera(cfg_test.ef('plat.factura.moneda_defecto', NULL, 'e2000000-0000-0000-0000-000000000101'), '"PEN"|DEFECTO', 'sucursal fuera de alcance');

-- Una sucursal de otro tenant se resuelve como si no se hubiera pasado.
SELECT cfg_test.espera(cfg_test.ef('rest.propina.porcentaje', NULL, 'f2000000-0000-0000-0000-000000000101'), '10|TENANT', 'sucursal ajena');

-- Restablecer la sucursal vuelve a heredar del tenant (TR-CA-086) y sube la versión.
DO $$
DECLARE
  previa bigint := cfg_test.vt();
BEGIN
  DELETE FROM cfg.parametro_valor WHERE id = 'e2000000-0000-0000-0000-00000000a002';
  IF cfg_test.vt() <> previa + 1 THEN
    RAISE EXCEPTION 'borrar un valor debía subir la versión';
  END IF;
END $$;
SELECT cfg_test.espera(cfg_test.ef('rest.propina.porcentaje', NULL, 'e2000000-0000-0000-0000-000000000101'), '10|TENANT', 'TR-CA-086');

-- Un obsoleto sigue resolviendo.
RESET ROLE;
UPDATE cfg.parametro_def SET obsoleto = true WHERE codigo = 'rest.propina.porcentaje';
SET ROLE cfg_test_app;
SELECT cfg_test.espera(cfg_test.ef('rest.propina.porcentaje', NULL, 'e2000000-0000-0000-0000-000000000102'), '10|TENANT', 'obsoleto resuelve');

-- ---------------------------------------------------------------------
-- Restricciones.
-- ---------------------------------------------------------------------
SELECT cfg_test.debe_fallar(
  $q$INSERT INTO cfg.parametro_valor (id, tenant_id, codigo, alcance, empresa_id, valor, modificado_por) VALUES
     ('e2000000-0000-0000-0000-00000000a0f1', 'e2000000-0000-0000-0000-000000000001', 'plat.sesion.minutos_inactividad',
      'TENANT', 'e2000000-0000-0000-0000-000000000011', '20', 'e2000000-0000-0000-0000-000000000901')$q$,
  '23514', 'TENANT con empresa');
SELECT cfg_test.debe_fallar(
  $q$INSERT INTO cfg.parametro_valor (id, tenant_id, codigo, alcance, valor, modificado_por) VALUES
     ('e2000000-0000-0000-0000-00000000a0f2', 'e2000000-0000-0000-0000-000000000001', 'rest.propina.porcentaje',
      'TENANT', '11', 'e2000000-0000-0000-0000-000000000901')$q$,
  '23505', 'segundo valor TENANT (nulos no distintos)');
SELECT cfg_test.debe_fallar(
  $q$INSERT INTO cfg.parametro_valor (id, tenant_id, codigo, alcance, sucursal_id, valor, modificado_por) VALUES
     ('e2000000-0000-0000-0000-00000000a0f3', 'e2000000-0000-0000-0000-000000000001', 'rest.propina.porcentaje',
      'SUCURSAL', 'f2000000-0000-0000-0000-000000000101', '5', 'e2000000-0000-0000-0000-000000000901')$q$,
  '23503', 'sucursal de otro tenant');
SELECT cfg_test.debe_fallar(
  $q$INSERT INTO cfg.parametro_valor (id, tenant_id, codigo, alcance, valor, modificado_por) VALUES
     ('f2000000-0000-0000-0000-00000000a0f4', 'f2000000-0000-0000-0000-000000000002', 'plat.sesion.minutos_inactividad',
      'TENANT', '20', 'e2000000-0000-0000-0000-000000000901')$q$,
  '42501', 'valor en otro tenant');
SELECT cfg_test.debe_fallar(
  $q$INSERT INTO cfg.version_tenant (tenant_id) VALUES ('e2000000-0000-0000-0000-000000000001')$q$,
  '42501', 'escribir la versión a mano');

-- ---------------------------------------------------------------------
-- Aislamiento: E no ve ni toca lo de F; cfg.valor con otro tenant no devuelve filas.
-- ---------------------------------------------------------------------
DO $$
DECLARE
  n int;
BEGIN
  IF EXISTS (SELECT 1 FROM cfg.parametro_valor WHERE tenant_id <> 'e2000000-0000-0000-0000-000000000001') THEN
    RAISE EXCEPTION 'E no debía ver valores de F';
  END IF;
  UPDATE cfg.parametro_valor SET valor = '1' WHERE id = 'f2000000-0000-0000-0000-00000000a001';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 0 THEN RAISE EXCEPTION 'E no debía actualizar valores de F'; END IF;
  DELETE FROM cfg.parametro_valor WHERE id = 'f2000000-0000-0000-0000-00000000a001';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 0 THEN RAISE EXCEPTION 'E no debía borrar valores de F'; END IF;
  IF EXISTS (SELECT 1 FROM cfg.valor('rest.propina.porcentaje', 'f2000000-0000-0000-0000-000000000002')) THEN
    RAISE EXCEPTION 'cfg.valor con el tenant de F debía dar 0 filas';
  END IF;
  IF EXISTS (SELECT 1 FROM cfg.versiones('f2000000-0000-0000-0000-000000000002')) THEN
    RAISE EXCEPTION 'cfg.versiones con el tenant de F debía dar 0 filas';
  END IF;
  IF EXISTS (SELECT 1 FROM cfg.version_tenant WHERE tenant_id <> 'e2000000-0000-0000-0000-000000000001') THEN
    RAISE EXCEPTION 'E no debía ver la versión de F';
  END IF;
END $$;

-- ---------------------------------------------------------------------
-- vd sube con cada registro de definiciones.
-- ---------------------------------------------------------------------
CREATE TEMP TABLE vd_previa AS SELECT vd FROM cfg.versiones('e2000000-0000-0000-0000-000000000001');
RESET ROLE;
INSERT INTO cfg.definiciones_aplicadas (producto_codigo, cambios) VALUES ('REST', '{"actualizadas":1}');
SET ROLE cfg_test_app;
DO $$ BEGIN
  IF (SELECT vd FROM cfg.versiones('e2000000-0000-0000-0000-000000000001')) <= (SELECT vd FROM vd_previa) THEN
    RAISE EXCEPTION 'registrar definiciones debía subir vd';
  END IF;
END $$;

RESET ROLE;
SELECT set_config('app.tenant_id', '', false);
DROP TABLE vd_previa;
DROP SCHEMA cfg_test CASCADE;
