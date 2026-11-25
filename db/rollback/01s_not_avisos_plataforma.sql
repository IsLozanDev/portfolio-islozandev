-- Deja ntf.plantilla como la dejó 01r_fe_prueba: sin las cuatro bases de los avisos de plataforma (spec 44).
-- Se niega si alguna tiene personalizaciones de un tenant o mensajes: borrarla dejaría referencias colgadas.
-- FORCE ROW LEVEL SECURITY se quita para ver las filas de todos los tenants y borrar las base; se repone al final.
ALTER TABLE ntf.plantilla NO FORCE ROW LEVEL SECURITY;
ALTER TABLE ntf.mensaje NO FORCE ROW LEVEL SECURITY;
DO $$
DECLARE
  bases constant uuid[] := ARRAY[
    '44000000-0000-0000-0000-000000000001', '44000000-0000-0000-0000-000000000002',
    '44000000-0000-0000-0000-000000000003', '44000000-0000-0000-0000-000000000004'
  ]::uuid[];
BEGIN
  IF EXISTS (SELECT 1 FROM ntf.plantilla WHERE plantilla_base_id = ANY (bases))
     OR EXISTS (SELECT 1 FROM ntf.mensaje WHERE plantilla_id = ANY (bases)) THEN
    RAISE EXCEPTION 'Hay personalizaciones o mensajes de los avisos de plataforma: revertir 01s_not_avisos_plataforma los dejaría sin plantilla'
      USING ERRCODE = 'object_in_use';
  END IF;
  DELETE FROM ntf.plantilla WHERE id = ANY (bases);
END
$$;
ALTER TABLE ntf.mensaje FORCE ROW LEVEL SECURITY;
ALTER TABLE ntf.plantilla FORCE ROW LEVEL SECURITY;
