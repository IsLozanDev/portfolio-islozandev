-- 01f · Tablas SUNAT de facturación electrónica de TR-CAT (spec 48). PostgreSQL 16. Reversible: rollback/01f_cat_tablas_fe.sql.
-- Solo siembra las definiciones GLOBAL vacías; los ítems llegan con el importador (01f_cat_importacion.sql).

INSERT INTO cat.catalogo (id, codigo, nombre, alcance, fuente, editable_por_tenant) VALUES
  ('ca700000-0000-0000-0000-000000000010', 'TRIBUTO', 'Tipos de tributo', 'GLOBAL', 'SUNAT catálogo 05', false),
  ('ca700000-0000-0000-0000-000000000011', 'TIPO_NOTA_CREDITO', 'Tipos de nota de crédito', 'GLOBAL', 'SUNAT catálogo 09', false),
  ('ca700000-0000-0000-0000-000000000012', 'TIPO_NOTA_DEBITO', 'Tipos de nota de débito', 'GLOBAL', 'SUNAT catálogo 10', false),
  ('ca700000-0000-0000-0000-000000000013', 'TIPO_PRECIO', 'Tipos de precio de venta unitario', 'GLOBAL', 'SUNAT catálogo 16', false),
  ('ca700000-0000-0000-0000-000000000014', 'TIPO_OPERACION', 'Tipos de operación', 'GLOBAL', 'SUNAT catálogo 51', false),
  ('ca700000-0000-0000-0000-000000000015', 'LEYENDA', 'Leyendas del comprobante', 'GLOBAL', 'SUNAT catálogo 52', false)
ON CONFLICT (codigo) DO NOTHING;
