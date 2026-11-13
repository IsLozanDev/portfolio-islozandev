-- 01h · Estado del outbox para métricas técnicas de TR-OBS (spec 21). PostgreSQL 16. Reversible:
-- rollback/01h_obs_estado_outbox.sql. Lo lee el worker cada minuto (TR-RNF-106): pendientes del relay,
-- fallidos y edad del pendiente más antiguo. Agrega entre tenants y no devuelve filas ni datos de nadie.

-- sync_lector (01e_sync_relay) es el dueño: FORCE RLS impide contar entre tenants con el rol de la app.
GRANT SELECT ON sync.relay_cursor, sync.evento_fallido TO sync_lector;

CREATE POLICY evento_fallido_metricas ON sync.evento_fallido FOR SELECT TO sync_lector USING (true);

-- pendientes: lo que el relay principal aún no leyó (incluye lo que está dentro del margen de TR-RN-035).
CREATE FUNCTION sync.estado_outbox()
RETURNS TABLE (pendientes bigint, fallidos bigint, edad_pendiente_seg integer)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  WITH cursor_relay AS (
    SELECT coalesce(max(ultimo_seq), 0) AS ultimo_seq FROM sync.relay_cursor WHERE relay = 'principal'
  ), sin_leer AS (
    SELECT count(*) AS cantidad, min(o.created_at) AS mas_antiguo
      FROM sync.outbox o, cursor_relay c
     WHERE o.seq > c.ultimo_seq
  )
  SELECT s.cantidad,
         (SELECT count(*) FROM sync.evento_fallido f WHERE f.estado = 'FALLIDO'),
         coalesce(floor(extract(epoch FROM now() - s.mas_antiguo))::integer, 0)
    FROM sin_leer s;
$$;

ALTER FUNCTION sync.estado_outbox() OWNER TO sync_lector;
REVOKE EXECUTE ON FUNCTION sync.estado_outbox() FROM PUBLIC;

-- Solo el rol que corre la migración (en cada ambiente, el mismo del worker).
DO $$
BEGIN
  EXECUTE format('GRANT EXECUTE ON FUNCTION sync.estado_outbox() TO %I', current_user);
END
$$;

-- Los esquemas de plataforma no se exponen por la Data API (regla 8).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon')
     AND EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON FUNCTION sync.estado_outbox() FROM anon, authenticated;
  END IF;
END
$$;
