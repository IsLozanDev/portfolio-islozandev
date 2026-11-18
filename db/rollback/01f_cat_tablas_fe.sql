-- Deja la base como estaba antes de 01f_cat_tablas_fe.sql.
-- Las definiciones con ítems o con importaciones se quedan: borrarlas perdería datos oficiales o su traza.
DELETE FROM cat.catalogo c
 WHERE c.id IN ('ca700000-0000-0000-0000-000000000010', 'ca700000-0000-0000-0000-000000000011',
                'ca700000-0000-0000-0000-000000000012', 'ca700000-0000-0000-0000-000000000013',
                'ca700000-0000-0000-0000-000000000014', 'ca700000-0000-0000-0000-000000000015')
   AND NOT EXISTS (SELECT 1 FROM cat.catalogo_item i WHERE i.catalogo_id = c.id)
   AND NOT EXISTS (SELECT 1 FROM cat.importacion m WHERE m.catalogo_id = c.id);
