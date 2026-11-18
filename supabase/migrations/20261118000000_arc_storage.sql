-- Arc · Bucket privado de Supabase Storage para TR-ARC (spec 33). Reversible: rollback/20261118000000_arc_storage.sql.
-- La aplica tools/migrar (pnpm db:up:supabase). Los metadatos están en db/01m_arc.sql.
-- Un solo bucket por ambiente: 25 MB es el máximo de las categorías y la lista de MIME es su unión.
-- El límite por categoría lo aplican la api al pedir la URL y el worker al analizar.
-- Sin políticas en storage.objects para anon ni authenticated: con la RLS de Storage activa, al bucket
-- solo llegan la secret key y las URL firmadas que emite la api.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'archivos', 'archivos', false, 26214400,
  ARRAY[
    'image/jpeg', 'image/png', 'image/webp',
    'application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/xml', 'application/zip', 'text/plain'
  ]
);
