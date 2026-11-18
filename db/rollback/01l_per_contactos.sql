-- Deja la base como la dejó 01l_per.sql: sin direcciones, sin DELETE de contactos y sin el único por valor.
DROP POLICY contacto_delete ON per.contacto;

DO $$
BEGIN
  EXECUTE format('REVOKE DELETE ON per.contacto FROM %I', current_user);
END
$$;

DROP INDEX per.uq_contacto_valor;
DROP TABLE per.direccion;
