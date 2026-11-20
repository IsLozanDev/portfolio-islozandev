-- Prueba de 01f_cat_tablas_fe. La ejecuta tools/migrar/test/db-esquemas.test.mjs después de
-- 01f_cat_items_busqueda.test.sql, sobre la misma base.

CREATE SCHEMA cat_fe_test;
CREATE FUNCTION cat_fe_test.espera(obtenido text, esperado text, caso text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF obtenido IS DISTINCT FROM esperado THEN
    RAISE EXCEPTION '%: se esperaba % y llegó %', caso, esperado, obtenido;
  END IF;
END
$$;
-- 'id:codigo:alcance:editable_por_tenant:version:ítems' de las seis definiciones, separadas por coma.
CREATE FUNCTION cat_fe_test.definiciones() RETURNS text LANGUAGE sql AS $$
  SELECT string_agg(right(c.id::text, 2) || ':' || c.codigo || ':' || c.alcance || ':' || c.editable_por_tenant || ':' ||
                    c.version || ':' || (SELECT count(*) FROM cat.catalogo_item i WHERE i.catalogo_id = c.id),
                    ',' ORDER BY c.id)
    FROM cat.catalogo c
   WHERE c.codigo IN ('TRIBUTO', 'TIPO_NOTA_CREDITO', 'TIPO_NOTA_DEBITO', 'TIPO_PRECIO', 'TIPO_OPERACION', 'LEYENDA');
$$;
CREATE FUNCTION cat_fe_test.semilla_esperada() RETURNS text LANGUAGE sql AS $$
  SELECT '10:TRIBUTO:GLOBAL:false:1:0,11:TIPO_NOTA_CREDITO:GLOBAL:false:1:0,12:TIPO_NOTA_DEBITO:GLOBAL:false:1:0,'
         || '13:TIPO_PRECIO:GLOBAL:false:1:0,14:TIPO_OPERACION:GLOBAL:false:1:0,15:LEYENDA:GLOBAL:false:1:0';
$$;

SELECT cat_fe_test.espera(cat_fe_test.definiciones(), cat_fe_test.semilla_esperada(), 'semilla de las tablas de facturación electrónica');

SELECT cat_fe_test.espera(
  (SELECT string_agg(c.codigo || ':' || c.fuente, ',' ORDER BY c.id) FROM cat.catalogo c
    WHERE c.codigo IN ('TRIBUTO', 'LEYENDA')),
  'TRIBUTO:SUNAT catálogo 05,LEYENDA:SUNAT catálogo 52',
  'fuente de cada definición');

-- Reaplicar la semilla no duplica ni pisa: un catálogo que ya existe con ese código se queda como está.
INSERT INTO cat.catalogo (id, codigo, nombre, alcance, fuente, editable_por_tenant) VALUES
  ('ca700000-0000-0000-0000-000000000010', 'TRIBUTO', 'Otro tributo', 'GLOBAL', 'Otra fuente', false),
  ('ca7fffff-0000-0000-0000-000000000015', 'LEYENDA', 'Otra leyenda', 'GLOBAL', 'Otra fuente', false)
ON CONFLICT (codigo) DO NOTHING;
SELECT cat_fe_test.espera(
  (SELECT string_agg(c.codigo || ':' || c.nombre, ',' ORDER BY c.id) FROM cat.catalogo c
    WHERE c.codigo IN ('TRIBUTO', 'LEYENDA')),
  'TRIBUTO:Tipos de tributo,LEYENDA:Leyendas del comprobante',
  'reaplicar no duplica ni pisa');
SELECT cat_fe_test.espera(cat_fe_test.definiciones(), cat_fe_test.semilla_esperada(), 'las seis siguen iguales tras reaplicar');

DROP SCHEMA cat_fe_test CASCADE;
