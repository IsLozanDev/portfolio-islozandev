-- Prueba de 01f_cat_importacion. La ejecuta tools/migrar/test/db-esquemas.test.mjs después de
-- 01f_cat.test.sql, sobre la misma base. Aplica como superusuario (la app después de comprobar el
-- operador) y evalúa la RLS con cat_test_app (sin BYPASSRLS).

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'cat_test_app') THEN
    CREATE ROLE cat_test_app NOLOGIN;
  END IF;
END $$;
GRANT USAGE ON SCHEMA cat TO cat_test_app;
GRANT SELECT ON cat.catalogo TO cat_test_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON cat.importacion TO cat_test_app;

CREATE SCHEMA cat_imp_test;
CREATE FUNCTION cat_imp_test.debe_fallar(sentencia text, esperado text, caso text) RETURNS void
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
CREATE FUNCTION cat_imp_test.espera(obtenido text, esperado text, caso text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF obtenido IS DISTINCT FROM esperado THEN
    RAISE EXCEPTION '%: se esperaba % y llegó %', caso, esperado, obtenido;
  END IF;
END
$$;
CREATE FUNCTION cat_imp_test.version_catalogo() RETURNS bigint LANGUAGE sql AS $$
  SELECT version FROM cat.catalogo WHERE id = 'a4000000-0000-0000-0000-0000000c0001';
$$;
-- 'codigo:nombre:vigente_desde:vigente_hasta:activo:atributos' del catálogo de prueba, separados por coma.
CREATE FUNCTION cat_imp_test.items() RETURNS text LANGUAGE sql AS $$
  SELECT string_agg(i.codigo || ':' || i.nombre || ':' || i.vigente_desde || ':' || COALESCE(i.vigente_hasta::text, '')
                    || ':' || i.activo || ':' || i.atributos::text, ',' ORDER BY i.codigo)
    FROM cat.catalogo_item i WHERE i.catalogo_id = 'a4000000-0000-0000-0000-0000000c0001';
$$;
GRANT USAGE ON SCHEMA cat_imp_test TO cat_test_app;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA cat_imp_test TO cat_test_app;

-- ---------------------------------------------------------------------
-- Semilla: las 5 tablas oficiales nuevas, GLOBAL, vacías y en versión 1.
-- ---------------------------------------------------------------------
SELECT cat_imp_test.espera(
  (SELECT string_agg(c.codigo || ':' || c.alcance || ':' || c.editable_por_tenant || ':' || c.version || ':' ||
                     (SELECT count(*) FROM cat.catalogo_item i WHERE i.catalogo_id = c.id), ',' ORDER BY c.codigo)
     FROM cat.catalogo c
    WHERE c.codigo IN ('UBIGEO', 'CIE10', 'UNIDAD_MEDIDA', 'AFECTACION_IGV', 'MONEDA')),
  'AFECTACION_IGV:GLOBAL:false:1:0,CIE10:GLOBAL:false:1:0,MONEDA:GLOBAL:false:1:0,'
  || 'UBIGEO:GLOBAL:false:1:0,UNIDAD_MEDIDA:GLOBAL:false:1:0',
  'semilla de tablas oficiales');

-- ---------------------------------------------------------------------
-- Siembra (superusuario): tenants A (operador) y B, un usuario y un catálogo GLOBAL con 4 ítems.
--   X1 con un atributo ajeno al diseño (longitud), X2 vigente, X3 cerrado e inactivo,
--   X4 que empieza el mismo día de la importación (tope de vigente_desde).
-- ---------------------------------------------------------------------
INSERT INTO org.tenant (id, codigo, nombre, estado, version) VALUES
  ('a4000000-0000-0000-0000-000000000001', 'imp-tenant-a', 'Imp tenant A', 'ACTIVO', 1),
  ('b4000000-0000-0000-0000-000000000002', 'imp-tenant-b', 'Imp tenant B', 'ACTIVO', 1);
INSERT INTO seg.usuario (id, email, nombre, tipo, estado) VALUES
  ('a4000000-0000-0000-0000-000000000901', 'ana.imp@gmail.com', 'Ana', 'INTERNO', 'ACTIVO');

SELECT cat.crear_catalogo('a4000000-0000-0000-0000-0000000c0001', 'IMP_PRUEBA', 'Importación de prueba', 'GLOBAL',
                          'Prueba', false, 'a4000000-0000-0000-0000-000000000901');
SELECT cat.guardar_item_global('a4000000-0000-0000-0000-0000000d0001', NULL, 'a4000000-0000-0000-0000-0000000c0001',
  'X1', NULL, 'Uno', NULL, 1, '{"departamento": "LIMA", "longitud": 8}', '2026-01-01', NULL, true,
  'a4000000-0000-0000-0000-000000000901');
SELECT cat.guardar_item_global('a4000000-0000-0000-0000-0000000d0002', NULL, 'a4000000-0000-0000-0000-0000000c0001',
  'X2', NULL, 'Dos', NULL, 2, '{}', '2026-01-01', NULL, true, 'a4000000-0000-0000-0000-000000000901');
SELECT cat.guardar_item_global('a4000000-0000-0000-0000-0000000d0003', NULL, 'a4000000-0000-0000-0000-0000000c0001',
  'X3', NULL, 'Tres', NULL, 3, '{}', '2026-01-01', '2026-03-01', false, 'a4000000-0000-0000-0000-000000000901');
SELECT cat.guardar_item_global('a4000000-0000-0000-0000-0000000d0004', NULL, 'a4000000-0000-0000-0000-0000000c0001',
  'X4', NULL, 'Cuatro', NULL, 4, '{}', '2026-06-01', NULL, true, 'a4000000-0000-0000-0000-000000000901');

-- ---------------------------------------------------------------------
-- La app guarda la importación encolada del tenant A (RLS).
-- ---------------------------------------------------------------------
SET ROLE cat_test_app;
SELECT set_config('app.tenant_id', 'a4000000-0000-0000-0000-000000000001', false);

INSERT INTO cat.importacion (id, tenant_id, catalogo_id, version_oficial, fecha_vigencia, archivo_nombre, archivo_sha256,
                             version_catalogo, estado, altas, cambios, bajas, sin_cambios, operaciones, lanzado_por,
                             aplicado_por)
VALUES ('a4000000-0000-0000-0000-0000000f0001', 'a4000000-0000-0000-0000-000000000001',
        'a4000000-0000-0000-0000-0000000c0001', '2026-06', '2026-06-01', 'prueba.csv', repeat('a', 64),
        cat_imp_test.version_catalogo(), 'EN_COLA', 2, 2, 2, 0,
        '{"altas": [{"codigo": "X5", "codigo_externo": "05", "nombre": "Cinco", "abreviatura": "C5", "orden": 5,
                     "atributos": {"departamento": "PIURA"}},
                    {"codigo": "X6", "codigo_externo": null, "nombre": "Seis", "abreviatura": null, "orden": 6,
                     "atributos": {}}],
          "cambios": [{"item_id": "a4000000-0000-0000-0000-0000000d0001", "codigo_externo": null, "nombre": "Uno nuevo",
                       "abreviatura": null, "orden": 1, "atributos": {"departamento": "CUSCO"}},
                      {"item_id": "a4000000-0000-0000-0000-0000000d0003", "codigo_externo": null, "nombre": "Tres",
                       "abreviatura": null, "orden": 3, "atributos": {}}],
          "bajas": ["a4000000-0000-0000-0000-0000000d0002", "a4000000-0000-0000-0000-0000000d0004"]}',
        'a4000000-0000-0000-0000-000000000901', 'a4000000-0000-0000-0000-000000000901');

SELECT cat_imp_test.debe_fallar(
  $q$SELECT cat.iniciar_importacion('a4000000-0000-0000-0000-0000000f0001')$q$,
  '42501', 'la app sin EXECUTE no inicia una importación');

-- ---------------------------------------------------------------------
-- Aplicación completa (superusuario con app.tenant_id del operador), en lotes de 1 alta.
-- ---------------------------------------------------------------------
RESET ROLE;

DO $$
DECLARE
  previa bigint := cat_imp_test.version_catalogo();
BEGIN
  IF NOT cat.iniciar_importacion('a4000000-0000-0000-0000-0000000f0001') THEN
    RAISE EXCEPTION 'iniciar debía dar true';
  END IF;
  IF cat.aplicar_lote_importacion('a4000000-0000-0000-0000-0000000f0001', 'ALTA', 0, 1) <> 1 THEN
    RAISE EXCEPTION 'el primer lote de altas debía escribir 1';
  END IF;
  IF cat.aplicar_lote_importacion('a4000000-0000-0000-0000-0000000f0001', 'ALTA', 1, 2) <> 1 THEN
    RAISE EXCEPTION 'el segundo lote de altas debía escribir 1';
  END IF;
  IF cat.aplicar_lote_importacion('a4000000-0000-0000-0000-0000000f0001', 'CAMBIO', 0, 1000) <> 2 THEN
    RAISE EXCEPTION 'el lote de cambios debía escribir 2';
  END IF;
  IF cat_imp_test.version_catalogo() <> previa THEN
    RAISE EXCEPTION 'la versión no debía subir fila por fila mientras se importa';
  END IF;
  IF cat.cerrar_bajas_importacion('a4000000-0000-0000-0000-0000000f0001') <> 2 THEN
    RAISE EXCEPTION 'debía cerrar 2 bajas';
  END IF;
  IF cat.finalizar_importacion('a4000000-0000-0000-0000-0000000f0001', 'a4000000-0000-0000-0000-000000000901') <> previa + 1 THEN
    RAISE EXCEPTION 'finalizar debía devolver la versión previa + 1';
  END IF;
  IF cat_imp_test.version_catalogo() <> previa + 1 THEN
    RAISE EXCEPTION 'la versión del catálogo debía subir exactamente 1';
  END IF;
END $$;

-- Altas desde fecha_vigencia; X1 conserva longitud (ajeno al diseño); X3 se reabre sin cambiar
-- vigente_desde; X2 cierra el día anterior y X4 en su vigente_desde (TR-CA-074). Nada se borra.
SELECT cat_imp_test.espera(cat_imp_test.items(),
  'X1:Uno nuevo:2026-01-01::true:{"longitud": 8, "departamento": "CUSCO"},'
  || 'X2:Dos:2026-01-01:2026-05-31:true:{},'
  || 'X3:Tres:2026-01-01::true:{},'
  || 'X4:Cuatro:2026-06-01:2026-06-01:true:{},'
  || 'X5:Cinco:2026-06-01::true:{"departamento": "PIURA"},'
  || 'X6:Seis:2026-06-01::true:{}',
  'altas, cambios, reapertura y bajas');
SELECT cat_imp_test.espera(
  (SELECT codigo_externo || ':' || abreviatura || ':' || orden FROM cat.catalogo_item
    WHERE catalogo_id = 'a4000000-0000-0000-0000-0000000c0001' AND codigo = 'X5'),
  '05:C5:5', 'alta con codigo_externo, abreviatura y orden');
SELECT cat_imp_test.espera(
  (SELECT estado || ':' || (operaciones IS NULL) || ':' || aplicado_por || ':' || (terminado_en IS NOT NULL)
     FROM cat.importacion WHERE id = 'a4000000-0000-0000-0000-0000000f0001'),
  'APLICADA:true:a4000000-0000-0000-0000-000000000901:true', 'importación aplicada y sin operaciones');
SELECT cat_imp_test.espera(COALESCE(current_setting('cat.importando', true), ''), '', 'finalizar quita la marca');

-- Fuera de una importación el trigger vuelve a subir la versión por fila.
DO $$
DECLARE
  previa bigint := cat_imp_test.version_catalogo();
BEGIN
  PERFORM cat.guardar_item_global('a4000000-0000-0000-0000-0000000d0007', NULL, 'a4000000-0000-0000-0000-0000000c0001',
    'X7', NULL, 'Siete', NULL, 7, '{}', '2026-01-01', NULL, true, 'a4000000-0000-0000-0000-000000000901');
  IF cat_imp_test.version_catalogo() <> previa + 1 THEN
    RAISE EXCEPTION 'un global fuera de una importación debía subir la versión';
  END IF;
END $$;

-- ---------------------------------------------------------------------
-- iniciar da false: estado final, versión cambiada, inexistente y de otro tenant.
-- ---------------------------------------------------------------------
SELECT cat_imp_test.espera(cat.iniciar_importacion('a4000000-0000-0000-0000-0000000f0001')::text, 'false',
  'iniciar una importación ya APLICADA');

INSERT INTO cat.importacion (id, tenant_id, catalogo_id, version_oficial, fecha_vigencia, archivo_nombre, archivo_sha256,
                             version_catalogo, estado, altas, cambios, bajas, sin_cambios, operaciones, lanzado_por)
VALUES ('a4000000-0000-0000-0000-0000000f0002', 'a4000000-0000-0000-0000-000000000001',
        'a4000000-0000-0000-0000-0000000c0001', '2026-07', '2026-07-01', 'obsoleta.csv', repeat('b', 64),
        1, 'EN_COLA', 0, 0, 0, 0, '{"altas": [], "cambios": [], "bajas": []}', 'a4000000-0000-0000-0000-000000000901');
SELECT cat_imp_test.espera(cat.iniciar_importacion('a4000000-0000-0000-0000-0000000f0002')::text, 'false',
  'iniciar con la versión del catálogo cambiada');
SELECT cat_imp_test.espera(cat.iniciar_importacion('a4000000-0000-0000-0000-0000000f00ff')::text, 'false',
  'iniciar una importación inexistente');
SELECT cat_imp_test.espera(COALESCE(current_setting('cat.importando', true), ''), '', 'iniciar en false no marca');

SELECT cat_imp_test.debe_fallar(
  $q$SELECT cat.aplicar_lote_importacion('a4000000-0000-0000-0000-0000000f0002', 'ALTA', 0, 1)$q$,
  '55000', 'aplicar un lote sin iniciar');
SELECT cat_imp_test.debe_fallar(
  $q$SELECT cat.cerrar_bajas_importacion('a4000000-0000-0000-0000-0000000f0002')$q$,
  '55000', 'cerrar bajas sin iniciar');
SELECT cat_imp_test.debe_fallar(
  $q$SELECT cat.finalizar_importacion('a4000000-0000-0000-0000-0000000f0002', 'a4000000-0000-0000-0000-000000000901')$q$,
  '55000', 'finalizar sin iniciar');

-- Una sola importación encolada por catálogo.
SELECT cat_imp_test.debe_fallar(
  $q$INSERT INTO cat.importacion (id, tenant_id, catalogo_id, version_oficial, fecha_vigencia, archivo_nombre,
       archivo_sha256, version_catalogo, estado, altas, cambios, bajas, sin_cambios, lanzado_por)
     VALUES ('a4000000-0000-0000-0000-0000000f0003', 'a4000000-0000-0000-0000-000000000001',
       'a4000000-0000-0000-0000-0000000c0001', '2026-07', '2026-07-01', 'otra.csv', repeat('c', 64),
       1, 'EN_COLA', 0, 0, 0, 0, 'a4000000-0000-0000-0000-000000000901')$q$,
  '23505', 'ux_importacion_activa');

-- Con la versión al día, A la inicia y B no.
UPDATE cat.importacion SET version_catalogo = cat_imp_test.version_catalogo()
 WHERE id = 'a4000000-0000-0000-0000-0000000f0002';
SELECT set_config('app.tenant_id', 'b4000000-0000-0000-0000-000000000002', false);
SELECT cat_imp_test.espera(cat.iniciar_importacion('a4000000-0000-0000-0000-0000000f0002')::text, 'false',
  'iniciar la importación de otro tenant');
SELECT set_config('app.tenant_id', 'a4000000-0000-0000-0000-000000000001', false);
DO $$
BEGIN
  IF NOT cat.iniciar_importacion('a4000000-0000-0000-0000-0000000f0002') THEN
    RAISE EXCEPTION 'A debía poder iniciar su importación con la versión al día';
  END IF;
  PERFORM set_config('cat.importando', '', true);
END $$;
UPDATE cat.importacion SET estado = 'FALLIDA' WHERE id = 'a4000000-0000-0000-0000-0000000f0002';

-- ---------------------------------------------------------------------
-- RLS entre tenants con cat_test_app.
-- ---------------------------------------------------------------------
SET ROLE cat_test_app;
SELECT set_config('app.tenant_id', 'b4000000-0000-0000-0000-000000000002', false);
INSERT INTO cat.importacion (id, tenant_id, catalogo_id, version_oficial, fecha_vigencia, archivo_nombre, archivo_sha256,
                             version_catalogo, estado, altas, cambios, bajas, sin_cambios, lanzado_por)
VALUES ('b4000000-0000-0000-0000-0000000f0001', 'b4000000-0000-0000-0000-000000000002',
        'a4000000-0000-0000-0000-0000000c0001', '2026-07', '2026-07-01', 'de-b.csv', repeat('d', 64),
        1, 'PREVISUALIZADA', 0, 0, 0, 0, 'a4000000-0000-0000-0000-000000000901');
SELECT cat_imp_test.debe_fallar(
  $q$INSERT INTO cat.importacion (id, tenant_id, catalogo_id, version_oficial, fecha_vigencia, archivo_nombre,
       archivo_sha256, version_catalogo, estado, altas, cambios, bajas, sin_cambios, lanzado_por)
     VALUES ('b4000000-0000-0000-0000-0000000f00f1', 'a4000000-0000-0000-0000-000000000001',
       'a4000000-0000-0000-0000-0000000c0001', '2026-07', '2026-07-01', 'en-a.csv', repeat('e', 64),
       1, 'PREVISUALIZADA', 0, 0, 0, 0, 'a4000000-0000-0000-0000-000000000901')$q$,
  '42501', 'B no inserta importaciones de A');

SELECT set_config('app.tenant_id', 'a4000000-0000-0000-0000-000000000001', false);
DO $$
DECLARE
  n int;
BEGIN
  IF EXISTS (SELECT 1 FROM cat.importacion WHERE tenant_id = 'b4000000-0000-0000-0000-000000000002') THEN
    RAISE EXCEPTION 'A no debía ver importaciones de B';
  END IF;
  IF (SELECT count(*) FROM cat.importacion) <> 2 THEN
    RAISE EXCEPTION 'A debía ver sus 2 importaciones';
  END IF;
  UPDATE cat.importacion SET motivo_fallo = 'De A' WHERE id = 'b4000000-0000-0000-0000-0000000f0001';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 0 THEN RAISE EXCEPTION 'A no debía modificar importaciones de B'; END IF;
  DELETE FROM cat.importacion WHERE id = 'a4000000-0000-0000-0000-0000000f0001';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 0 THEN RAISE EXCEPTION 'la app no debía borrar importaciones'; END IF;
END $$;

RESET ROLE;
SELECT set_config('app.tenant_id', '', false);
DROP SCHEMA cat_imp_test CASCADE;
