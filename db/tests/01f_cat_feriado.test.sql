-- Prueba de 01f_cat_feriado. La ejecuta tools/migrar/test/db-esquemas.test.mjs después de
-- 01f_cat.test.sql, sobre la misma base. Siembra y escribe globales como superusuario
-- y evalúa la RLS con cat_test_app (sin BYPASSRLS).

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'cat_test_app') THEN
    CREATE ROLE cat_test_app NOLOGIN;
  END IF;
END $$;
GRANT USAGE ON SCHEMA cat TO cat_test_app;
GRANT SELECT ON cat.catalogo TO cat_test_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON cat.feriado, cat.catalogo_item, cat.catalogo_item_tenant TO cat_test_app;

CREATE SCHEMA cat_fer_test;
CREATE FUNCTION cat_fer_test.debe_fallar(sentencia text, esperado text, caso text) RETURNS void
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
CREATE FUNCTION cat_fer_test.espera(obtenido text, esperado text, caso text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF obtenido IS DISTINCT FROM esperado THEN
    RAISE EXCEPTION '%: se esperaba % y llegó %', caso, esperado, obtenido;
  END IF;
END
$$;
-- Fechas de feriado separadas por coma (NULL si no hay).
CREATE FUNCTION cat_fer_test.fechas(p_desde date, p_hasta date, p_sucursal uuid) RETURNS text LANGUAGE sql AS $$
  SELECT string_agg(f::text, ',' ORDER BY f) FROM cat.fechas_feriado(p_desde, p_hasta, p_sucursal) f;
$$;
-- Lista de administración del catálogo de prueba para el tenant A el 2026-10-10:
-- 'codigo:estado:propio:ajuste_visible:total' separados por coma, en el orden de la función.
CREATE FUNCTION cat_fer_test.administracion(p_texto varchar, p_estado varchar, p_origen varchar,
                                            p_limite int, p_desplazamiento int) RETURNS text LANGUAGE sql AS $$
  SELECT string_agg(t.codigo || ':' || t.estado || ':' || t.propio || ':' || COALESCE(t.ajuste_visible::text, '-')
                    || ':' || t.total, ',' ORDER BY t.ordinality)
    FROM cat.items_administracion('FERIADO_TEST_MP', 'a5000000-0000-0000-0000-000000000001', '2026-10-10',
                                  p_texto, p_estado, p_origen, p_limite, p_desplazamiento) WITH ORDINALITY AS t;
$$;
GRANT USAGE ON SCHEMA cat_fer_test TO cat_test_app;

-- ---------------------------------------------------------------------
-- Semilla: 18 feriados nacionales globales.
-- ---------------------------------------------------------------------
SELECT cat_fer_test.espera(
  (SELECT count(*)::text FROM cat.feriado WHERE alcance = 'GLOBAL' AND creado_por IS NULL), '18', 'semilla');

-- ---------------------------------------------------------------------
-- Siembra (superusuario). Tenants A y B, sus empresas y sucursales, y un usuario.
-- ---------------------------------------------------------------------
INSERT INTO org.tenant (id, codigo, nombre, estado, version) VALUES
  ('a5000000-0000-0000-0000-000000000001', 'fer-tenant-a', 'Feriados tenant A', 'ACTIVO', 1),
  ('b5000000-0000-0000-0000-000000000002', 'fer-tenant-b', 'Feriados tenant B', 'ACTIVO', 1);
INSERT INTO org.empresa (id, tenant_id, ruc, razon_social, version) VALUES
  ('a5000000-0000-0000-0000-0000000e0001', 'a5000000-0000-0000-0000-000000000001', '20500000001', 'Empresa A', 1),
  ('b5000000-0000-0000-0000-0000000e0002', 'b5000000-0000-0000-0000-000000000002', '20500000002', 'Empresa B', 1);
INSERT INTO org.sucursal (id, tenant_id, empresa_id, codigo, nombre, version) VALUES
  ('a5000000-0000-0000-0000-0000000a0001', 'a5000000-0000-0000-0000-000000000001', 'a5000000-0000-0000-0000-0000000e0001',
   'CUS', 'Cusco', 1),
  ('a5000000-0000-0000-0000-0000000a0002', 'a5000000-0000-0000-0000-000000000001', 'a5000000-0000-0000-0000-0000000e0001',
   'LIM', 'Lima', 1),
  ('b5000000-0000-0000-0000-0000000b0001', 'b5000000-0000-0000-0000-000000000002', 'b5000000-0000-0000-0000-0000000e0002',
   'ARE', 'Arequipa', 1);
INSERT INTO seg.usuario (id, email, nombre, tipo, estado) VALUES
  ('a5000000-0000-0000-0000-000000000901', 'ana.feriados@gmail.com', 'Ana', 'INTERNO', 'ACTIVO');

-- ---------------------------------------------------------------------
-- ck_feriado_alcance y FK compuesta con la sucursal.
-- ---------------------------------------------------------------------
INSERT INTO cat.feriado (id, alcance, tenant_id, sucursal_id, fecha, nombre, recurrente_anual) VALUES
  ('a5000000-0000-0000-0000-0000000f0002', 'TENANT', 'a5000000-0000-0000-0000-000000000001', NULL,
   '2026-05-15', 'Aniversario de A', false),
  ('a5000000-0000-0000-0000-0000000f0003', 'TENANT', 'a5000000-0000-0000-0000-000000000001', NULL,
   '2026-08-15', 'Fundación de A', true),
  ('a5000000-0000-0000-0000-0000000f0004', 'SUCURSAL', 'a5000000-0000-0000-0000-000000000001', 'a5000000-0000-0000-0000-0000000a0001',
   '2026-09-20', 'Fiesta de Cusco', false),
  ('a5000000-0000-0000-0000-0000000f0005', 'SUCURSAL', 'a5000000-0000-0000-0000-000000000001', 'a5000000-0000-0000-0000-0000000a0002',
   '2026-09-21', 'Fiesta de Lima', false),
  -- Redundante con Fiestas Patrias: en el cálculo la fecha cuenta una vez.
  ('a5000000-0000-0000-0000-0000000f0006', 'SUCURSAL', 'a5000000-0000-0000-0000-000000000001', 'a5000000-0000-0000-0000-0000000a0001',
   '2026-07-28', 'Fiestas en Cusco', false),
  ('a5000000-0000-0000-0000-0000000f0009', 'TENANT', 'a5000000-0000-0000-0000-000000000001', NULL,
   '2028-02-29', 'Bisiesto de A', true),
  ('b5000000-0000-0000-0000-0000000f0007', 'TENANT', 'b5000000-0000-0000-0000-000000000002', NULL,
   '2026-06-15', 'Aniversario de B', false),
  ('b5000000-0000-0000-0000-0000000f0008', 'SUCURSAL', 'b5000000-0000-0000-0000-000000000002', 'b5000000-0000-0000-0000-0000000b0001',
   '2026-09-20', 'Fiesta de Arequipa', false);

SELECT cat_fer_test.debe_fallar(
  $q$INSERT INTO cat.feriado (id, alcance, tenant_id, fecha, nombre) VALUES
     ('a5000000-0000-0000-0000-0000000f00f1', 'GLOBAL', 'a5000000-0000-0000-0000-000000000001', '2026-03-01', 'Global con tenant')$q$,
  '23514', 'ck_feriado_alcance GLOBAL con tenant');
SELECT cat_fer_test.debe_fallar(
  $q$INSERT INTO cat.feriado (id, alcance, tenant_id, sucursal_id, fecha, nombre) VALUES
     ('a5000000-0000-0000-0000-0000000f00f2', 'TENANT', 'a5000000-0000-0000-0000-000000000001',
      'a5000000-0000-0000-0000-0000000a0001', '2026-03-01', 'Tenant con sucursal')$q$,
  '23514', 'ck_feriado_alcance TENANT con sucursal');
SELECT cat_fer_test.debe_fallar(
  $q$INSERT INTO cat.feriado (id, alcance, tenant_id, fecha, nombre) VALUES
     ('a5000000-0000-0000-0000-0000000f00f3', 'SUCURSAL', 'a5000000-0000-0000-0000-000000000001', '2026-03-01', 'Sucursal sin sucursal')$q$,
  '23514', 'ck_feriado_alcance SUCURSAL sin sucursal');
SELECT cat_fer_test.debe_fallar(
  $q$INSERT INTO cat.feriado (id, alcance, tenant_id, sucursal_id, fecha, nombre) VALUES
     ('a5000000-0000-0000-0000-0000000f00f4', 'SUCURSAL', 'a5000000-0000-0000-0000-000000000001',
      'b5000000-0000-0000-0000-0000000b0001', '2026-03-01', 'Sucursal de B')$q$,
  '23503', 'FK compuesta: sucursal de otro tenant');

-- ---------------------------------------------------------------------
-- Escritura de globales (superusuario, como la app después de comprobar el operador).
-- ---------------------------------------------------------------------
SELECT cat_fer_test.espera(
  cat.guardar_feriado_global('a5000000-0000-0000-0000-0000000f0001', NULL, '2026-03-10', 'Global de prueba', false,
                             'a5000000-0000-0000-0000-000000000901')::text,
  '0', 'crear un global lo deja en versión 0');
SELECT cat_fer_test.espera(
  cat.guardar_feriado_global('a5000000-0000-0000-0000-0000000f0001', 5, '2026-03-10', 'Global editado', false,
                             'a5000000-0000-0000-0000-000000000901')::text,
  NULL, 'global con versión obsoleta');
SELECT cat_fer_test.espera(
  cat.guardar_feriado_global('a5000000-0000-0000-0000-0000000f0001', 0, '2026-03-11', 'Global editado', false,
                             'a5000000-0000-0000-0000-000000000901')::text,
  '1', 'editar un global sube la versión');
SELECT cat_fer_test.espera(
  cat.guardar_feriado_global('a5000000-0000-0000-0000-0000000f0002', 0, '2026-05-16', 'Tenant por la función', false,
                             'a5000000-0000-0000-0000-000000000901')::text,
  NULL, 'la función no edita un feriado del tenant');
SELECT cat_fer_test.espera(
  cat.eliminar_feriado_global('a5000000-0000-0000-0000-0000000f0001', 0)::text, 'false', 'eliminar con versión obsoleta');
SELECT cat_fer_test.espera(
  cat.eliminar_feriado_global('a5000000-0000-0000-0000-0000000f0002', 0)::text, 'false', 'la función no borra un feriado del tenant');
SELECT cat.guardar_feriado_global('a5000000-0000-0000-0000-0000000f0010', NULL, '2026-03-12', 'Global a borrar', false,
                                  'a5000000-0000-0000-0000-000000000901');
SELECT cat_fer_test.espera(
  cat.eliminar_feriado_global('a5000000-0000-0000-0000-0000000f0010', 0)::text, 'true', 'eliminar un global');

-- ---------------------------------------------------------------------
-- Desde el tenant A, con la RLS.
-- ---------------------------------------------------------------------
SET ROLE cat_test_app;
SELECT set_config('app.tenant_id', 'a5000000-0000-0000-0000-000000000001', false);

SELECT cat_fer_test.debe_fallar(
  $q$SELECT cat.guardar_feriado_global('a5000000-0000-0000-0000-0000000f00f5', NULL, '2026-03-13', 'Global de la app', false,
       'a5000000-0000-0000-0000-000000000901')$q$,
  '42501', 'la app no llama a guardar_feriado_global');

-- cat.fechas_feriado: globales, del tenant y de la sucursal pedida, sin repetir.
SELECT cat_fer_test.espera(
  cat_fer_test.fechas('2026-05-01', '2026-09-30', 'a5000000-0000-0000-0000-0000000a0001'),
  '2026-05-01,2026-05-15,2026-06-07,2026-06-29,2026-07-23,2026-07-28,2026-07-29,2026-08-06,2026-08-15,2026-08-30,2026-09-20',
  'fechas de Cusco: sin Lima ni B y Fiestas Patrias una vez');
SELECT cat_fer_test.espera(
  cat_fer_test.fechas('2026-05-01', '2026-09-30', NULL),
  '2026-05-01,2026-05-15,2026-06-07,2026-06-29,2026-07-23,2026-07-28,2026-07-29,2026-08-06,2026-08-15,2026-08-30',
  'fechas sin sucursal: solo globales y del tenant');
SELECT cat_fer_test.espera(
  cat_fer_test.fechas('2026-10-07', '2026-10-12', NULL), '2026-10-08', 'TR-CA-075 Combate de Angamos');
SELECT cat_fer_test.espera(
  cat_fer_test.fechas('2027-07-01', '2027-07-31', NULL), '2027-07-23,2027-07-28,2027-07-29', 'recurrentes proyectados a 2027');
SELECT cat_fer_test.espera(
  cat_fer_test.fechas('2025-01-01', '2025-12-31', NULL), NULL, 'los recurrentes de 2026 no aplican en 2025');
SELECT cat_fer_test.espera(
  cat_fer_test.fechas('2026-12-31', '2027-01-02', NULL), '2027-01-01', 'rango que cruza el año');
SELECT cat_fer_test.espera(
  cat_fer_test.fechas('2027-02-27', '2027-03-01', NULL), NULL, '29 de febrero antes de su año');
SELECT cat_fer_test.espera(
  cat_fer_test.fechas('2028-02-27', '2028-03-01', NULL), '2028-02-29', '29 de febrero en su año');
SELECT cat_fer_test.espera(
  cat_fer_test.fechas('2029-02-27', '2029-03-01', NULL), NULL, '29 de febrero en año no bisiesto');
SELECT cat_fer_test.espera(
  cat_fer_test.fechas('2032-02-27', '2032-03-01', NULL), '2032-02-29', '29 de febrero en el siguiente bisiesto');

-- cat.feriado_choca, nivel contra nivel.
SELECT cat_fer_test.espera(cat.feriado_choca('GLOBAL', NULL, '2026-04-02', false, NULL)::text, 'true', 'GLOBAL con GLOBAL');
SELECT cat_fer_test.espera(cat.feriado_choca('GLOBAL', NULL, '2026-05-15', false, NULL)::text, 'false', 'GLOBAL no revisa TENANT');
SELECT cat_fer_test.espera(cat.feriado_choca('TENANT', NULL, '2026-04-02', false, NULL)::text, 'true', 'TENANT con GLOBAL');
SELECT cat_fer_test.espera(cat.feriado_choca('TENANT', NULL, '2026-05-15', false, NULL)::text, 'true', 'TENANT con TENANT');
SELECT cat_fer_test.espera(cat.feriado_choca('TENANT', NULL, '2026-06-15', false, NULL)::text, 'false', 'TENANT no ve el de B');
SELECT cat_fer_test.espera(cat.feriado_choca('TENANT', NULL, '2026-09-20', false, NULL)::text, 'false', 'TENANT no revisa SUCURSAL');
SELECT cat_fer_test.espera(
  cat.feriado_choca('SUCURSAL', 'a5000000-0000-0000-0000-0000000a0001', '2026-04-02', false, NULL)::text, 'true', 'SUCURSAL con GLOBAL');
SELECT cat_fer_test.espera(
  cat.feriado_choca('SUCURSAL', 'a5000000-0000-0000-0000-0000000a0001', '2026-05-15', false, NULL)::text, 'true', 'SUCURSAL con TENANT');
SELECT cat_fer_test.espera(
  cat.feriado_choca('SUCURSAL', 'a5000000-0000-0000-0000-0000000a0001', '2026-09-20', false, NULL)::text, 'true',
  'SUCURSAL con la misma SUCURSAL');
SELECT cat_fer_test.espera(
  cat.feriado_choca('SUCURSAL', 'a5000000-0000-0000-0000-0000000a0002', '2026-09-20', false, NULL)::text, 'false',
  'SUCURSAL no revisa otra sucursal');
SELECT cat_fer_test.espera(
  cat.feriado_choca('SUCURSAL', 'a5000000-0000-0000-0000-0000000a0001', '2026-09-20', false,
                    'a5000000-0000-0000-0000-0000000f0004')::text, 'false', 'excluye el que se edita');

-- cat.feriado_choca, recurrencia (nivel TENANT).
SELECT cat_fer_test.espera(cat.feriado_choca('TENANT', NULL, '2027-05-15', false, NULL)::text, 'false',
  'dos no recurrentes de distinto año');
SELECT cat_fer_test.espera(cat.feriado_choca('TENANT', NULL, '2027-08-15', false, NULL)::text, 'true',
  'no recurrente posterior a un recurrente');
SELECT cat_fer_test.espera(cat.feriado_choca('TENANT', NULL, '2025-08-15', false, NULL)::text, 'false',
  'no recurrente anterior a un recurrente');
SELECT cat_fer_test.espera(cat.feriado_choca('TENANT', NULL, '2025-05-15', true, NULL)::text, 'true',
  'recurrente desde antes de un no recurrente');
SELECT cat_fer_test.espera(cat.feriado_choca('TENANT', NULL, '2027-05-15', true, NULL)::text, 'false',
  'recurrente desde después de un no recurrente');
SELECT cat_fer_test.espera(cat.feriado_choca('TENANT', NULL, '2030-08-15', true, NULL)::text, 'true', 'dos recurrentes');
SELECT cat_fer_test.espera(cat.feriado_choca('TENANT', NULL, '2020-10-08', true, NULL)::text, 'true',
  'TR-CA-077 recurrente con un global recurrente');

-- RLS: A escribe solo lo suyo y no ve lo de B.
INSERT INTO cat.feriado (id, alcance, tenant_id, fecha, nombre, creado_por, modificado_por) VALUES
  ('a5000000-0000-0000-0000-0000000f0011', 'TENANT', 'a5000000-0000-0000-0000-000000000001', '2026-11-20', 'Propio de A',
   'a5000000-0000-0000-0000-000000000901', 'a5000000-0000-0000-0000-000000000901');
SELECT cat_fer_test.debe_fallar(
  $q$INSERT INTO cat.feriado (id, alcance, tenant_id, fecha, nombre) VALUES
     ('a5000000-0000-0000-0000-0000000f00f6', 'TENANT', 'b5000000-0000-0000-0000-000000000002', '2026-11-21', 'En B')$q$,
  '42501', 'A no inserta feriados de B');
SELECT cat_fer_test.debe_fallar(
  $q$INSERT INTO cat.feriado (id, alcance, fecha, nombre) VALUES
     ('a5000000-0000-0000-0000-0000000f00f7', 'GLOBAL', '2026-11-22', 'Global de A')$q$,
  '42501', 'la app no inserta globales');
DO $$
DECLARE
  n int;
BEGIN
  IF EXISTS (SELECT 1 FROM cat.feriado WHERE tenant_id = 'b5000000-0000-0000-0000-000000000002') THEN
    RAISE EXCEPTION 'A no debía ver feriados de B';
  END IF;
  IF (SELECT count(*) FROM cat.feriado WHERE alcance = 'GLOBAL') <> 19 THEN
    RAISE EXCEPTION 'A debía ver los 18 globales de la semilla y el de prueba';
  END IF;
  UPDATE cat.feriado SET nombre = 'De A' WHERE id = 'b5000000-0000-0000-0000-0000000f0007';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 0 THEN RAISE EXCEPTION 'A no debía modificar feriados de B'; END IF;
  DELETE FROM cat.feriado WHERE id = 'b5000000-0000-0000-0000-0000000f0007';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 0 THEN RAISE EXCEPTION 'A no debía borrar feriados de B'; END IF;
  UPDATE cat.feriado SET nombre = 'Hackeado' WHERE id = 'ca700000-0000-0000-00fe-000000000001';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 0 THEN RAISE EXCEPTION 'la app no debía modificar un global'; END IF;
  DELETE FROM cat.feriado WHERE id = 'ca700000-0000-0000-00fe-000000000001';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 0 THEN RAISE EXCEPTION 'la app no debía borrar un global'; END IF;
  UPDATE cat.feriado SET tenant_id = 'b5000000-0000-0000-0000-000000000002' WHERE id = 'a5000000-0000-0000-0000-0000000f0011';
  RAISE EXCEPTION 'A no debía pasar un feriado a B';
EXCEPTION WHEN insufficient_privilege THEN
  NULL;
END $$;

SELECT set_config('app.tenant_id', 'b5000000-0000-0000-0000-000000000002', false);
SELECT cat_fer_test.espera(
  (SELECT count(*)::text FROM cat.feriado WHERE tenant_id = 'a5000000-0000-0000-0000-000000000001'), '0', 'B no ve feriados de A');
SELECT cat_fer_test.espera(
  cat_fer_test.fechas('2026-09-01', '2026-09-30', 'a5000000-0000-0000-0000-0000000a0001'), NULL,
  'B con una sucursal de A solo calcula con globales');
SELECT cat_fer_test.espera(
  cat_fer_test.fechas('2026-09-01', '2026-09-30', 'b5000000-0000-0000-0000-0000000b0001'), '2026-09-20', 'B con su sucursal');

-- ---------------------------------------------------------------------
-- cat.items_administracion. Catálogo MIXTO propio de la prueba.
-- ---------------------------------------------------------------------
RESET ROLE;
SELECT cat.crear_catalogo('a5000000-0000-0000-0000-0000000c0001', 'FERIADO_TEST_MP', 'Medios de pago de prueba', 'MIXTO',
                          NULL, true, 'a5000000-0000-0000-0000-000000000901');
SELECT cat.guardar_item_global(id, NULL, 'a5000000-0000-0000-0000-0000000c0001', codigo, NULL, nombre, NULL, orden, '{}',
                               desde, NULL, activo, 'a5000000-0000-0000-0000-000000000901')
  FROM (VALUES
    ('a5000000-0000-0000-0000-0000000d0001'::uuid, 'EFECTIVO', 'Efectivo', 1, '2026-01-01'::date, true),
    ('a5000000-0000-0000-0000-0000000d0002'::uuid, 'PLIN', 'Plin', 2, '2026-01-01'::date, true),
    ('a5000000-0000-0000-0000-0000000d0003'::uuid, 'CHEQUE', 'Cheque', 3, '2026-01-01'::date, false),
    ('a5000000-0000-0000-0000-0000000d0004'::uuid, 'FUTURO', 'Pago futuro', 4, '2027-01-01'::date, true)
  ) AS item (id, codigo, nombre, orden, desde, activo);

SET ROLE cat_test_app;
SELECT set_config('app.tenant_id', 'a5000000-0000-0000-0000-000000000001', false);
INSERT INTO cat.catalogo_item_tenant (item_id, tenant_id, visible, orden, alias, modificado_por) VALUES
  ('a5000000-0000-0000-0000-0000000d0002', 'a5000000-0000-0000-0000-000000000001', false, 9, 'Plin QR',
   'a5000000-0000-0000-0000-000000000901');
INSERT INTO cat.catalogo_item (id, catalogo_id, tenant_id, codigo, nombre, orden, vigente_desde, creado_por, modificado_por) VALUES
  ('a5000000-0000-0000-0000-0000000d0005', 'a5000000-0000-0000-0000-0000000c0001', 'a5000000-0000-0000-0000-000000000001',
   'DINERS', 'Tarjeta Diners', 5, '2026-01-01', 'a5000000-0000-0000-0000-000000000901', 'a5000000-0000-0000-0000-000000000901');

SELECT cat_fer_test.espera(cat_fer_test.administracion(NULL, NULL, NULL, 25, 0),
  'EFECTIVO:VISIBLE:false:-:5,CHEQUE:INACTIVO:false:-:5,FUTURO:FUERA_DE_VIGENCIA:false:-:5,DINERS:VISIBLE:true:-:5,'
  || 'PLIN:OCULTO:false:false:5',
  'lista completa con estados, propios y ajuste');
SELECT cat_fer_test.espera(
  (SELECT t.nombre || ':' || t.orden || ':' || t.ajuste_orden || ':' || t.ajuste_alias || ':' || t.version || ':' || t.ajuste_version
     FROM cat.items_administracion('FERIADO_TEST_MP', 'a5000000-0000-0000-0000-000000000001', '2026-10-10',
                                   NULL, 'OCULTO', NULL, 25, 0) t),
  'Plin:2:9:Plin QR:0:0', 'el ajuste de Plin con el nombre y el orden del global');
SELECT cat_fer_test.espera(cat_fer_test.administracion(NULL, 'OCULTO', NULL, 25, 0), 'PLIN:OCULTO:false:false:1', 'filtro estado');
SELECT cat_fer_test.espera(cat_fer_test.administracion(NULL, NULL, 'PROPIO', 25, 0), 'DINERS:VISIBLE:true:-:1', 'filtro origen PROPIO');
SELECT cat_fer_test.espera(cat_fer_test.administracion(NULL, NULL, 'GLOBAL', 25, 0),
  'EFECTIVO:VISIBLE:false:-:4,CHEQUE:INACTIVO:false:-:4,FUTURO:FUERA_DE_VIGENCIA:false:-:4,PLIN:OCULTO:false:false:4',
  'filtro origen GLOBAL');
SELECT cat_fer_test.espera(cat_fer_test.administracion('efec', NULL, NULL, 25, 0), 'EFECTIVO:VISIBLE:false:-:1', 'texto en el código');
SELECT cat_fer_test.espera(cat_fer_test.administracion('tarjeta', NULL, NULL, 25, 0), 'DINERS:VISIBLE:true:-:1', 'texto en el nombre');
SELECT cat_fer_test.espera(cat_fer_test.administracion('_', NULL, NULL, 25, 0), NULL, 'el comodín del texto es literal');
SELECT cat_fer_test.espera(cat_fer_test.administracion(NULL, NULL, NULL, 2, 2),
  'FUTURO:FUERA_DE_VIGENCIA:false:-:5,DINERS:VISIBLE:true:-:5', 'paginación con el total sin paginar');
SELECT cat_fer_test.espera(
  (SELECT count(*)::text FROM cat.items_administracion('FERIADO_TEST_MP', 'b5000000-0000-0000-0000-000000000002', '2026-10-10',
                                                       NULL, NULL, NULL, 25, 0)),
  '0', 'con el tenant de B no hay filas');
SELECT cat_fer_test.espera(
  (SELECT count(*)::text FROM cat.items_administracion('NO_EXISTE', 'a5000000-0000-0000-0000-000000000001', '2026-10-10',
                                                       NULL, NULL, NULL, 25, 0)),
  '0', 'catálogo inexistente sin filas');

RESET ROLE;
SELECT set_config('app.tenant_id', '', false);
DROP SCHEMA cat_fer_test CASCADE;
