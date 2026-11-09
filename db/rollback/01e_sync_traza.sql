-- Deja sync.outbox como lo dejó 01e_sync_outbox.sql.
ALTER TABLE sync.outbox
  DROP COLUMN trace_id,
  DROP COLUMN ip,
  DROP COLUMN actor_id;
