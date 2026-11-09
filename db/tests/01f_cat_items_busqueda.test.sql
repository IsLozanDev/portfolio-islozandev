-- Prueba de 01f_cat_items_busqueda. La ejecuta tools/migrar/test/db-esquemas.test.mjs después de
-- 01f_cat_feriado.test.sql, sobre la misma base: reutiliza su tenant A, su usuario y el rol cat_test_app.

CREATE SCHEMA cat_bus_test;
CREATE FUNCTION cat_bus_test.espera(obtenido text, esperado text, caso text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF obtenido IS DISTINCT FROM esperado THEN
    RAISE EXCEPTION '%: se esperaba % y llegó %', caso, esperado, obtenido;
  END IF;
END
$$;
-- Códigos que devuelve la búsqueda en el catálogo de prueba, separados por coma, con el total al final.
CREATE FUNCTION cat_bus_test.buscar(p_texto varchar) RETURNS text LANGUAGE sql AS $$
  SELECT string_agg(t.codigo, ',' ORDER BY t.ordinality) || ':' || max(t.total)
    FROM cat.items_administracion('BUSQUEDA_TEST', 'a5000000-0000-0000-0000-000000000001', '2026-10-10',
                                  p_texto, NULL, NULL, 25, 0) WITH ORDINALITY AS t;
$$;
GRANT USAGE ON SCHEMA cat_bus_test TO cat_test_app;

-- Un catálogo GLOBAL con tres distritos de dos departamentos.
SELECT cat.crear_catalogo('a5000000-0000-0000-0000-0000000c0002', 'BUSQUEDA_TEST', 'Ubigeo de prueba', 'GLOBAL',
                          NULL, false, 'a5000000-0000-0000-0000-000000000901');
SELECT cat.guardar_item_global(id, NULL, 'a5000000-0000-0000-0000-0000000c0002', codigo, NULL, nombre, NULL, orden,
                               atributos, '2026-01-01', NULL, true, 'a5000000-0000-0000-0000-000000000901')
  FROM (VALUES
    ('a5000000-0000-0000-0000-0000000d0101'::uuid, '010101', 'CHACHAPOYAS', 1, '{"departamento": "AMAZONAS", "provincia": "CHACHAPOYAS"}'::jsonb),
    ('a5000000-0000-0000-0000-0000000d0102'::uuid, '010102', 'ASUNCION', 2, '{"departamento": "AMAZONAS", "provincia": "CHACHAPOYAS"}'::jsonb),
    ('a5000000-0000-0000-0000-0000000d0103'::uuid, '150101', 'LIMA', 3, '{"departamento": "LIMA", "provincia": "LIMA"}'::jsonb)
  ) AS item (id, codigo, nombre, orden, atributos);

SET ROLE cat_test_app;
SELECT set_config('app.tenant_id', 'a5000000-0000-0000-0000-000000000001', false);

SELECT cat_bus_test.espera(cat_bus_test.buscar('amazonas'), '010101,010102:2', 'texto en el valor del atributo departamento');
SELECT cat_bus_test.espera(cat_bus_test.buscar('chachap'), '010101,010102:2', 'texto en el nombre o en la provincia, sin repetir el ítem');
SELECT cat_bus_test.espera(cat_bus_test.buscar('lima'), '150101:1', 'texto en el nombre y en los atributos del mismo ítem');
SELECT cat_bus_test.espera(cat_bus_test.buscar('0101'), '010101,010102,150101:3', 'el código sigue funcionando');
SELECT cat_bus_test.espera(cat_bus_test.buscar('departamento'), NULL, 'la clave del atributo no cuenta, solo su valor');
SELECT cat_bus_test.espera(cat_bus_test.buscar('%'), NULL, 'el comodín del texto es literal también en los atributos');

RESET ROLE;
SELECT set_config('app.tenant_id', '', false);
DROP SCHEMA cat_bus_test CASCADE;
