-- 01e · Quién hizo la operación que publicó el evento (spec 20a). PostgreSQL 16. Reversible:
-- rollback/01e_sync_traza.sql. Columnas NULL sin defecto: el cambio es solo de catálogo.
-- actor_id NULL = sistema. Sin FK a seg.usuario: sync no depende de seg.

ALTER TABLE sync.outbox
  ADD COLUMN actor_id uuid        NULL,
  ADD COLUMN ip       inet        NULL,
  ADD COLUMN trace_id varchar(32) NULL CONSTRAINT ck_outbox_trace_id CHECK (trace_id ~ '^[0-9a-f]{32}$');

-- sync.read_events y sync.read_events_ventana devuelven SETOF sync.outbox con SELECT o.* en
-- plpgsql: el tipo de fila sigue a la tabla y las columnas nuevas salen sin recrearlas.
