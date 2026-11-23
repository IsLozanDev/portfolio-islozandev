-- Deja la base como la dejó 01n_sec.sql: el esquema ntf no existía. Se niega si hay mensajes ENCOLADO:
-- son correos que el worker aún debe entregar y se perderían.
-- FORCE ROW LEVEL SECURITY se quita para contar los de todos los tenants y se repone antes de seguir.
-- El rol org_lector no se borra: es del clúster.
ALTER TABLE ntf.mensaje NO FORCE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM ntf.mensaje WHERE estado = 'ENCOLADO') THEN
    RAISE EXCEPTION 'Hay mensajes ENCOLADO en ntf.mensaje: espera a que el worker los entregue antes de revertir 01o_not'
      USING ERRCODE = 'object_in_use';
  END IF;
END
$$;
ALTER TABLE ntf.mensaje FORCE ROW LEVEL SECURITY;

DROP FUNCTION ntf.mensaje_por_id_externo(varchar);
DROP TABLE ntf.intento_entrega;
DROP TABLE ntf.contacto_invalido;
DROP TABLE ntf.mensaje;
DROP TABLE ntf.plantilla;
DROP SCHEMA ntf;
