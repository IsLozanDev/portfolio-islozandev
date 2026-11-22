-- 01m · Archivos TR-ARC: la FK hacia arc.categoria en Supabase (hallazgo del spec 36). PostgreSQL 16.
-- Reversible: rollback/01m_arc_categoria_fk.sql.
--
-- El chequeo de la FK arc.archivo.categoria corre `SELECT ... FOR KEY SHARE` sobre arc.categoria como su dueño,
-- y ese bloqueo exige UPDATE en al menos una columna. 01m_arc.sql le quitó UPDATE al rol que migra, que en
-- Supabase es el dueño y no es superusuario: todo INSERT en arc.archivo fallaba con 42501. En CI no se veía
-- porque la base temporal migra como superusuario.
--
-- Se devuelve UPDATE solo sobre `codigo`: alcanza para el bloqueo y deja sin poder cambiar los MIME, el tamaño
-- máximo y `sensible`. Cambiar el código de una categoría en uso lo impide la propia FK.
DO $$
BEGIN
  EXECUTE format('GRANT UPDATE (codigo) ON arc.categoria TO %I', current_user);
END
$$;
