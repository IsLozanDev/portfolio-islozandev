-- Deja ntf como lo dejó 01t_not_programacion: la tabla de bajas no existía. Se niega si hay bajas: son la evidencia
-- de que el titular pidió no recibir correos y se perderían (TR-RNF-016).
-- FORCE ROW LEVEL SECURITY se quita para contar las de todos los tenants; la tabla se borra después.
ALTER TABLE ntf.baja NO FORCE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM ntf.baja) THEN
    RAISE EXCEPTION 'Hay bajas en ntf.baja: son evidencia de la decisión del titular y no se revierte 02a_not_bajas con ellas'
      USING ERRCODE = 'object_in_use';
  END IF;
END
$$;

DROP TABLE ntf.baja;
DROP FUNCTION ntf.baja_solo_insercion();
