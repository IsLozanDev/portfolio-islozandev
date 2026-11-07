-- Prueba de 01f_cat. La ejecuta tools/migrar/test/db-esquemas.test.mjs después de
-- 01e_sync_relay.test.sql, sobre la misma base. Siembra y escribe globales como superusuario
-- y evalúa la RLS con cat_test_app (sin BYPASSRLS).

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'cat_test_app') THEN
    CREATE ROLE cat_test_app NOLOGIN;
  END IF;
END $$;
GRANT USAGE ON SCHEMA cat TO cat_test_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA cat TO cat_test_app;
GRANT EXECUTE ON FUNCTION cat.versiones(varchar, uuid), cat.items(varchar, uuid, date) TO cat_test_app;

CREATE SCHEMA cat_test;
CREATE FUNCTION cat_test.debe_fallar(sentencia text, esperado text, caso text) RETURNS void
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
CREATE FUNCTION cat_test.espera(obtenido text, esperado text, caso text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF obtenido IS DISTINCT FROM esperado THEN
    RAISE EXCEPTION '%: se esperaba % y llegó %', caso, esperado, obtenido;
  END IF;
END
$$;
-- Ítems de un catálogo para el tenant A en una fecha: 'codigo:nombre:orden:estado' separados por coma.
CREATE FUNCTION cat_test.items(p_codigo text, p_fecha date) RETURNS text LANGUAGE sql AS $$
  SELECT string_agg(i.codigo || ':' || i.nombre || ':' || i.orden || ':' || i.estado, ',')
    FROM cat.items(p_codigo, 'a3000000-0000-0000-0000-000000000001', p_fecha) i;
$$;
CREATE FUNCTION cat_test.vg(p_codigo text) RETURNS bigint LANGUAGE sql AS $$
  SELECT version_global FROM cat.versiones(p_codigo, 'a3000000-0000-0000-0000-000000000001');
$$;
CREATE FUNCTION cat_test.vt(p_codigo text) RETURNS bigint LANGUAGE sql AS $$
  SELECT version_tenant FROM cat.versiones(p_codigo, 'a3000000-0000-0000-0000-000000000001');
$$;
GRANT USAGE ON SCHEMA cat_test TO cat_test_app;

-- ---------------------------------------------------------------------
-- Semilla en versión 1 y con sus ítems.
-- ---------------------------------------------------------------------
SELECT cat_test.espera(
  (SELECT string_agg(c.codigo || ':' || c.alcance || ':' || c.version || ':' ||
                     (SELECT count(*) FROM cat.catalogo_item i WHERE i.catalogo_id = c.id), ',' ORDER BY c.codigo)
     FROM cat.catalogo c),
  'ESPECIALIDAD:MIXTO:1:1,MEDIO_PAGO:MIXTO:1:4,TIPO_COMPROBANTE:GLOBAL:1:4,TIPO_DOC_IDENTIDAD:GLOBAL:1:4',
  'semilla');
SELECT cat_test.espera(
  (SELECT atributos::text FROM cat.catalogo_item WHERE codigo = 'DNI'),
  '{"regex": "^[0-9]{8}$", "longitud": 8}', 'TR-CA-060 atributos del DNI');

-- ---------------------------------------------------------------------
-- Siembra (superusuario). Tenants A y B y un usuario.
-- ---------------------------------------------------------------------
INSERT INTO org.tenant (id, codigo, nombre, estado, version) VALUES
  ('a3000000-0000-0000-0000-000000000001', 'cat-tenant-a', 'Cat tenant A', 'ACTIVO', 1),
  ('b3000000-0000-0000-0000-000000000002', 'cat-tenant-b', 'Cat tenant B', 'ACTIVO', 1);
INSERT INTO seg.usuario (id, email, nombre, tipo, estado) VALUES
  ('a3000000-0000-0000-0000-000000000901', 'ana.cat@gmail.com', 'Ana', 'INTERNO', 'ACTIVO');

-- ---------------------------------------------------------------------
-- Restricciones de la definición (TR-CA-059).
-- ---------------------------------------------------------------------
SELECT cat_test.debe_fallar(
  $q$SELECT cat.crear_catalogo('a3000000-0000-0000-0000-0000000c0001', 'NORMA_X', 'Norma X', 'GLOBAL', NULL, true,
       'a3000000-0000-0000-0000-000000000901')$q$,
  '23514', 'TR-CA-059 GLOBAL editable');
SELECT cat_test.debe_fallar(
  $q$SELECT cat.crear_catalogo('a3000000-0000-0000-0000-0000000c0002', 'MIXTO_X', 'Mixto X', 'MIXTO', NULL, false,
       'a3000000-0000-0000-0000-000000000901')$q$,
  '23514', 'MIXTO no editable');
SELECT cat_test.debe_fallar(
  $q$SELECT cat.crear_catalogo('a3000000-0000-0000-0000-0000000c0003', 'MEDIO_PAGO', 'Otro', 'MIXTO', NULL, true,
       'a3000000-0000-0000-0000-000000000901')$q$,
  '23505', 'catálogo duplicado');
SELECT cat_test.espera(
  cat.crear_catalogo('a3000000-0000-0000-0000-0000000c0004', 'AREA_CLINICA', 'Áreas de la clínica', 'TENANT', NULL, true,
                     'a3000000-0000-0000-0000-000000000901')::text,
  '1', 'crear un catálogo lo deja en versión 1');

-- Bloqueo optimista de la definición.
SELECT cat_test.espera(
  cat.actualizar_catalogo('a3000000-0000-0000-0000-0000000c0004', 7, 'Áreas', NULL, true,
                          'a3000000-0000-0000-0000-000000000901')::text,
  NULL, 'actualizar catálogo con versión obsoleta');
SELECT cat_test.espera(
  cat.actualizar_catalogo('a3000000-0000-0000-0000-0000000c0004', 1, 'Áreas', NULL, true,
                          'a3000000-0000-0000-0000-000000000901')::text,
  '2', 'actualizar catálogo sube la versión');

-- Un global en un catálogo TENANT falla por coherencia.
SELECT cat_test.debe_fallar(
  $q$SELECT cat.guardar_item_global('a3000000-0000-0000-0000-0000000d0001', NULL, 'a3000000-0000-0000-0000-0000000c0004',
       'URG', NULL, 'Urgencias', NULL, 0, '{}', '2026-01-01', NULL, true, 'a3000000-0000-0000-0000-000000000901')$q$,
  '23514', 'global en catálogo TENANT');

-- ---------------------------------------------------------------------
-- Desde el tenant A, con la RLS.
-- ---------------------------------------------------------------------
SET ROLE cat_test_app;
SELECT set_config('app.tenant_id', 'a3000000-0000-0000-0000-000000000001', false);

SELECT cat_test.espera(cat_test.vt('MEDIO_PAGO')::text, '0', 'sin propios la versión del tenant es 0');

-- Propio en MIXTO sube solo la versión del tenant (TR-CA-063, Tarjeta Diners).
DO $$
DECLARE
  global_previa bigint := cat_test.vg('MEDIO_PAGO');
BEGIN
  INSERT INTO cat.catalogo_item (id, catalogo_id, tenant_id, codigo, nombre, orden, vigente_desde, creado_por, modificado_por) VALUES
    ('a3000000-0000-0000-0000-0000000e0001', 'ca700000-0000-0000-0000-000000000001', 'a3000000-0000-0000-0000-000000000001',
     'DINERS', 'Tarjeta Diners', 5, '2026-01-01', 'a3000000-0000-0000-0000-000000000901', 'a3000000-0000-0000-0000-000000000901');
  IF cat_test.vt('MEDIO_PAGO') <> 1 THEN RAISE EXCEPTION 'el propio debía dejar la versión del tenant en 1'; END IF;
  IF cat_test.vg('MEDIO_PAGO') <> global_previa THEN RAISE EXCEPTION 'el propio no debía subir la versión global'; END IF;
END $$;

SELECT cat_test.debe_fallar(
  $q$INSERT INTO cat.catalogo_item (id, catalogo_id, tenant_id, codigo, nombre, vigente_desde) VALUES
     ('a3000000-0000-0000-0000-0000000e00f1', 'ca700000-0000-0000-0000-000000000001', 'a3000000-0000-0000-0000-000000000001',
      'DINERS', 'Otra Diners', '2026-01-01')$q$,
  '23505', 'TR-RN-013 propio repetido en el mismo tenant');
SELECT cat_test.debe_fallar(
  $q$INSERT INTO cat.catalogo_item (id, catalogo_id, tenant_id, codigo, nombre, vigente_desde) VALUES
     ('a3000000-0000-0000-0000-0000000e00f2', 'ca700000-0000-0000-0000-000000000003', 'a3000000-0000-0000-0000-000000000001',
      '99', 'Comprobante propio', '2026-01-01')$q$,
  '23514', 'propio en catálogo GLOBAL');
SELECT cat_test.debe_fallar(
  $q$INSERT INTO cat.catalogo_item (id, catalogo_id, tenant_id, codigo, nombre, vigente_desde) VALUES
     ('a3000000-0000-0000-0000-0000000e00f3', 'ca700000-0000-0000-0000-000000000001', NULL,
      'CHEQUE', 'Cheque', '2026-01-01')$q$,
  '42501', 'la app no inserta ítems globales');
SELECT cat_test.debe_fallar(
  $q$INSERT INTO cat.catalogo_item (id, catalogo_id, tenant_id, codigo, nombre, vigente_desde) VALUES
     ('a3000000-0000-0000-0000-0000000e00f4', 'ca700000-0000-0000-0000-000000000001', 'b3000000-0000-0000-0000-000000000002',
      'VALE', 'Vale', '2026-01-01')$q$,
  '42501', 'propio en otro tenant');
SELECT cat_test.debe_fallar(
  $q$INSERT INTO cat.catalogo (id, codigo, nombre, alcance, editable_por_tenant) VALUES
     ('a3000000-0000-0000-0000-0000000c00f1', 'DE_LA_APP', 'De la app', 'TENANT', true)$q$,
  '42501', 'la app no escribe catálogos');
SELECT cat_test.debe_fallar(
  $q$INSERT INTO cat.version_tenant (catalogo_id, tenant_id) VALUES
     ('ca700000-0000-0000-0000-000000000004', 'a3000000-0000-0000-0000-000000000001')$q$,
  '42501', 'escribir la versión a mano');

-- Ajustes: Plin oculto, Yape con alias y orden. Cada uno sube la versión del tenant.
DO $$
DECLARE
  previa bigint := cat_test.vt('MEDIO_PAGO');
BEGIN
  INSERT INTO cat.catalogo_item_tenant (item_id, tenant_id, visible, modificado_por) VALUES
    ('ca700000-0000-0000-0001-000000000003', 'a3000000-0000-0000-0000-000000000001', false, 'a3000000-0000-0000-0000-000000000901');
  INSERT INTO cat.catalogo_item_tenant (item_id, tenant_id, visible, orden, alias, modificado_por) VALUES
    ('ca700000-0000-0000-0001-000000000002', 'a3000000-0000-0000-0000-000000000001', true, 0, 'Yape QR', 'a3000000-0000-0000-0000-000000000901');
  IF cat_test.vt('MEDIO_PAGO') <> previa + 2 THEN RAISE EXCEPTION 'cada ajuste debía subir la versión del tenant'; END IF;
END $$;

SELECT cat_test.debe_fallar(
  $q$INSERT INTO cat.catalogo_item_tenant (item_id, tenant_id, visible, modificado_por) VALUES
     ('a3000000-0000-0000-0000-0000000e0001', 'a3000000-0000-0000-0000-000000000001', false, 'a3000000-0000-0000-0000-000000000901')$q$,
  '23514', 'ajuste sobre un ítem propio');
SELECT cat_test.debe_fallar(
  $q$INSERT INTO cat.catalogo_item_tenant (item_id, tenant_id, visible, modificado_por) VALUES
     ('ca700000-0000-0000-0003-000000000001', 'a3000000-0000-0000-0000-000000000001', false, 'a3000000-0000-0000-0000-000000000901')$q$,
  '23514', 'TR-CA-067 ajuste en catálogo GLOBAL');
SELECT cat_test.debe_fallar(
  $q$INSERT INTO cat.catalogo_item_tenant (item_id, tenant_id, visible, modificado_por) VALUES
     ('ca700000-0000-0000-0001-000000000001', 'b3000000-0000-0000-0000-000000000002', false, 'a3000000-0000-0000-0000-000000000901')$q$,
  '42501', 'ajuste en otro tenant');

-- Lista con alias, orden del ajuste y estados.
SELECT cat_test.espera(cat_test.items('MEDIO_PAGO', '2026-10-10'),
  'YAPE:Yape QR:0:VISIBLE,EFECTIVO:Efectivo:1:VISIBLE,PLIN:Plin:3:OCULTO,TARJETA:Tarjeta:4:VISIBLE,DINERS:Tarjeta Diners:5:VISIBLE',
  'TR-CA-063 y TR-CA-066 lista del tenant A');

-- ---------------------------------------------------------------------
-- Escrituras globales (superusuario, como la app después de comprobar el operador).
-- ---------------------------------------------------------------------
RESET ROLE;

-- Ítem futuro, ítem inactivo y la versión global.
DO $$
DECLARE
  global_previa bigint := cat_test.vg('MEDIO_PAGO');
BEGIN
  IF cat.guardar_item_global('a3000000-0000-0000-0000-0000000d0002', NULL, 'ca700000-0000-0000-0000-000000000001',
       'CRIPTO', NULL, 'Cripto', NULL, 6, '{}', '2027-01-01', NULL, true, 'a3000000-0000-0000-0000-000000000901') <> 0 THEN
    RAISE EXCEPTION 'un ítem nuevo nace en versión 0';
  END IF;
  IF cat_test.vg('MEDIO_PAGO') <> global_previa + 1 THEN RAISE EXCEPTION 'un global nuevo debía subir la versión global'; END IF;
END $$;
SELECT cat_test.espera(
  cat.guardar_item_global('a3000000-0000-0000-0000-0000000d0003', NULL, 'ca700000-0000-0000-0000-000000000001',
    'CHEQUE', NULL, 'Cheque', NULL, 7, '{}', '2026-01-01', NULL, false, 'a3000000-0000-0000-0000-000000000901')::text,
  '0', 'global inactivo');

-- Versión obsoleta, actualización y código ocupado por un propio.
SELECT cat_test.espera(
  cat.guardar_item_global('a3000000-0000-0000-0000-0000000d0003', 9, 'ca700000-0000-0000-0000-000000000001',
    'CHEQUE', NULL, 'Cheque', NULL, 7, '{}', '2026-01-01', NULL, true, 'a3000000-0000-0000-0000-000000000901')::text,
  NULL, 'item global con versión obsoleta');
SELECT cat_test.debe_fallar(
  $q$SELECT cat.guardar_item_global('a3000000-0000-0000-0000-0000000d00f1', NULL, 'ca700000-0000-0000-0000-000000000001',
       'DINERS', NULL, 'Diners', NULL, 8, '{}', '2026-01-01', NULL, true, 'a3000000-0000-0000-0000-000000000901')$q$,
  '23505', 'global con el código de un propio');
SELECT cat_test.debe_fallar(
  $q$SELECT cat.guardar_item_global('a3000000-0000-0000-0000-0000000d00f2', NULL, 'ca700000-0000-0000-0000-000000000001',
       'YAPE', NULL, 'Yape', NULL, 8, '{}', '2026-01-01', NULL, true, 'a3000000-0000-0000-0000-000000000901')$q$,
  '23505', 'global repetido');

SET ROLE cat_test_app;
SELECT set_config('app.tenant_id', 'a3000000-0000-0000-0000-000000000001', false);
SELECT cat_test.espera(cat_test.items('MEDIO_PAGO', '2026-10-10'),
  'YAPE:Yape QR:0:VISIBLE,EFECTIVO:Efectivo:1:VISIBLE,PLIN:Plin:3:OCULTO,TARJETA:Tarjeta:4:VISIBLE,DINERS:Tarjeta Diners:5:VISIBLE,'
  || 'CRIPTO:Cripto:6:FUERA_DE_VIGENCIA,CHEQUE:Cheque:7:INACTIVO',
  'TR-CA-062 futuro fuera de vigencia el 2026-10-10');
SELECT cat_test.espera(
  (SELECT i.estado FROM cat.items('MEDIO_PAGO', 'a3000000-0000-0000-0000-000000000001', '2027-01-01') i WHERE i.codigo = 'CRIPTO'),
  'VISIBLE', 'TR-CA-062 visible desde el 2027-01-01');

-- La app no modifica ni borra globales.
DO $$
DECLARE
  n int;
BEGIN
  UPDATE cat.catalogo_item SET nombre = 'Hackeado' WHERE id = 'ca700000-0000-0000-0001-000000000001';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 0 THEN RAISE EXCEPTION 'la app no debía modificar un global'; END IF;
  DELETE FROM cat.catalogo_item WHERE id = 'ca700000-0000-0000-0001-000000000001';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 0 THEN RAISE EXCEPTION 'la app no debía borrar un global'; END IF;
END $$;

-- ---------------------------------------------------------------------
-- Tenant B: el mismo código propio se admite y no ve nada de A.
-- ---------------------------------------------------------------------
SELECT set_config('app.tenant_id', 'b3000000-0000-0000-0000-000000000002', false);
INSERT INTO cat.catalogo_item (id, catalogo_id, tenant_id, codigo, nombre, vigente_desde) VALUES
  ('b3000000-0000-0000-0000-0000000e0001', 'ca700000-0000-0000-0000-000000000001', 'b3000000-0000-0000-0000-000000000002',
   'DINERS', 'Diners de B', '2026-01-01');
INSERT INTO cat.catalogo_item (id, catalogo_id, tenant_id, codigo, nombre, vigente_desde) VALUES
  ('b3000000-0000-0000-0000-0000000e0002', 'ca700000-0000-0000-0000-000000000004', 'b3000000-0000-0000-0000-000000000002',
   'CARDIO', 'Cardiología', '2026-01-01');
INSERT INTO cat.catalogo_item_tenant (item_id, tenant_id, visible, modificado_por) VALUES
  ('ca700000-0000-0000-0001-000000000001', 'b3000000-0000-0000-0000-000000000002', false, 'a3000000-0000-0000-0000-000000000901');

SELECT cat_test.espera(
  (SELECT string_agg(i.codigo || ':' || i.estado, ',')
     FROM cat.items('MEDIO_PAGO', 'b3000000-0000-0000-0000-000000000002', '2026-10-10') i),
  'DINERS:VISIBLE,EFECTIVO:OCULTO,YAPE:VISIBLE,PLIN:VISIBLE,TARJETA:VISIBLE,CRIPTO:FUERA_DE_VIGENCIA,CHEQUE:INACTIVO',
  'TR-CA-066 el ajuste de A no afecta a B');

SELECT set_config('app.tenant_id', 'a3000000-0000-0000-0000-000000000001', false);
DO $$
DECLARE
  n int;
BEGIN
  IF EXISTS (SELECT 1 FROM cat.catalogo_item WHERE tenant_id = 'b3000000-0000-0000-0000-000000000002') THEN
    RAISE EXCEPTION 'A no debía ver propios de B';
  END IF;
  IF EXISTS (SELECT 1 FROM cat.catalogo_item_tenant WHERE tenant_id = 'b3000000-0000-0000-0000-000000000002') THEN
    RAISE EXCEPTION 'A no debía ver ajustes de B';
  END IF;
  IF EXISTS (SELECT 1 FROM cat.version_tenant WHERE tenant_id = 'b3000000-0000-0000-0000-000000000002') THEN
    RAISE EXCEPTION 'A no debía ver versiones de B';
  END IF;
  UPDATE cat.catalogo_item SET nombre = 'De A' WHERE id = 'b3000000-0000-0000-0000-0000000e0001';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 0 THEN RAISE EXCEPTION 'A no debía modificar propios de B'; END IF;
  DELETE FROM cat.catalogo_item WHERE id = 'b3000000-0000-0000-0000-0000000e0001';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 0 THEN RAISE EXCEPTION 'A no debía borrar propios de B'; END IF;
  UPDATE cat.catalogo_item_tenant SET visible = true WHERE tenant_id = 'b3000000-0000-0000-0000-000000000002';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 0 THEN RAISE EXCEPTION 'A no debía modificar ajustes de B'; END IF;
  DELETE FROM cat.catalogo_item_tenant WHERE tenant_id = 'b3000000-0000-0000-0000-000000000002';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 0 THEN RAISE EXCEPTION 'A no debía borrar ajustes de B'; END IF;
  IF EXISTS (SELECT 1 FROM cat.items('MEDIO_PAGO', 'b3000000-0000-0000-0000-000000000002', '2026-10-10')) THEN
    RAISE EXCEPTION 'cat.items con el tenant de B debía dar 0 filas';
  END IF;
  IF EXISTS (SELECT 1 FROM cat.versiones('MEDIO_PAGO', 'b3000000-0000-0000-0000-000000000002')) THEN
    RAISE EXCEPTION 'cat.versiones con el tenant de B debía dar 0 filas';
  END IF;
END $$;

-- TR-CA-068: la especialidad propia de B no aparece para A.
SELECT cat_test.espera(cat_test.items('ESPECIALIDAD', '2026-10-10'), 'MED_GEN:Medicina general:1:VISIBLE', 'TR-CA-068');
SELECT cat_test.espera(
  (SELECT count(*)::text FROM cat.versiones('NO_EXISTE', 'a3000000-0000-0000-0000-000000000001')),
  '0', 'catálogo inexistente sin filas');

-- ---------------------------------------------------------------------
-- Eliminar un global con ajustes borra antes los ajustes.
-- ---------------------------------------------------------------------
RESET ROLE;
SELECT cat_test.espera(cat.eliminar_item_global('ca700000-0000-0000-0001-000000000003', 5)::text, 'false', 'eliminar con versión obsoleta');
SELECT cat_test.espera(cat.eliminar_item_global('ca700000-0000-0000-0001-000000000003', 0)::text, 'true', 'eliminar Plin');
SELECT cat_test.espera(
  (SELECT count(*)::text FROM cat.catalogo_item_tenant WHERE item_id = 'ca700000-0000-0000-0001-000000000003'),
  '0', 'los ajustes de Plin se borran');

SELECT set_config('app.tenant_id', '', false);
DROP SCHEMA cat_test CASCADE;
