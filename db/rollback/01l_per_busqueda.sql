-- Deja per como la dejaron 01l_per y 01l_per_contactos: sin columnas, índices ni funciones de búsqueda.
-- unaccent, pg_trgm y btree_gin se quedan: son de la base y otros esquemas pueden usarlas.
DROP INDEX per.ix_contacto_valor_prefijo;
DROP INDEX per.ix_persona_documento_prefijo;
DROP INDEX per.ix_persona_busqueda_fonetica;
DROP INDEX per.ix_persona_busqueda_texto;

ALTER TABLE per.persona
  DROP COLUMN busqueda_fonetica,
  DROP COLUMN busqueda_texto;

DROP FUNCTION per.clave_fonetica(text);
DROP FUNCTION per.normalizar_busqueda(text);
