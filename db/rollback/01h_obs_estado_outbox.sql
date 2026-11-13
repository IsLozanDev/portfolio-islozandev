-- Deja sync como lo dejó 01e_sync_traza.sql. El rol sync_lector no se borra: es de 01e_sync_relay.
DROP FUNCTION sync.estado_outbox();
DROP POLICY evento_fallido_metricas ON sync.evento_fallido;
REVOKE SELECT ON sync.relay_cursor, sync.evento_fallido FROM sync_lector;
