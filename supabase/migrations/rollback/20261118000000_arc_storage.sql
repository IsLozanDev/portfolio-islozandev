-- Borra el bucket solo si está vacío: con objetos quedarían huérfanos en el almacenamiento.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM storage.objects WHERE bucket_id = 'archivos') THEN
    RAISE EXCEPTION 'el bucket archivos tiene objetos: se vacía por la Storage API antes de revertir'
      USING ERRCODE = '55006';
  END IF;
END
$$;

-- Supabase bloquea el DELETE directo sobre storage.buckets (trigger protect_delete) salvo con este
-- ajuste, que dura lo que la transacción de la migración.
SELECT set_config('storage.allow_delete_query', 'true', true);
DELETE FROM storage.buckets WHERE id = 'archivos';
