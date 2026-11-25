-- Deja ntf como lo dejó 01q_not_plantillas: la tabla de programaciones no existía. Se niega si hay programaciones
-- PROGRAMADA: son recordatorios que el worker aún debe enviar y se perderían.
-- FORCE ROW LEVEL SECURITY se quita para contar las de todos los tenants; la tabla se borra después.
ALTER TABLE ntf.programacion NO FORCE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM ntf.programacion WHERE estado = 'PROGRAMADA') THEN
    RAISE EXCEPTION 'Hay programaciones PROGRAMADA en ntf.programacion: cancélalas o espera su envío antes de revertir 01t_not_programacion'
      USING ERRCODE = 'object_in_use';
  END IF;
END
$$;

DROP FUNCTION ntf.programaciones_atrasadas(timestamptz, integer);
DROP TABLE ntf.programacion;
