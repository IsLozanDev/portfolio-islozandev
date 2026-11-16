-- Prueba de 01i_seg_vigencia_peru. La ejecuta tools/migrar/test/db-esquemas.test.mjs sobre la base temporal.
-- Las tres funciones que comparan vigencias calculan current_date en la zona de Perú, sin importar la de la sesión.

DO $$
DECLARE
  sin_zona text;
BEGIN
  SELECT string_agg(p.oid::regprocedure::text, ', ') INTO sin_zona
    FROM pg_proc p
   WHERE p.oid IN ('seg.asignaciones_aplicables(uuid, uuid, uuid, uuid)'::regprocedure,
                   'seg.sucursales_accesibles(uuid, uuid)'::regprocedure,
                   'seg.permisos_efectivos(uuid, uuid, uuid, uuid)'::regprocedure)
     AND NOT coalesce('TimeZone=America/Lima' = ANY (p.proconfig), false);
  IF sin_zona IS NOT NULL THEN
    RAISE EXCEPTION 'Funciones sin timezone America/Lima: %', sin_zona;
  END IF;
END $$;
