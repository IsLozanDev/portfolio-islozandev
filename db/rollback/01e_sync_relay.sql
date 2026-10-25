-- Deja sync como lo dejó 01e_sync_outbox.sql. El rol sync_lector no se borra: es del clúster y en CI
-- lo comparten las bases temporales.
DROP FUNCTION sync.read_events_ventana(bigint, interval, integer);
DROP FUNCTION sync.read_events(bigint, interval, integer);
DROP FUNCTION sync.validar_lectura_relay(interval, integer);
DROP TABLE sync.evento_fallido;
DROP TABLE sync.evento_procesado;
DROP TABLE sync.relay_cursor;
DROP POLICY outbox_relay_lectura ON sync.outbox;
REVOKE ALL ON sync.outbox FROM sync_lector;
REVOKE ALL ON SCHEMA sync FROM sync_lector;
