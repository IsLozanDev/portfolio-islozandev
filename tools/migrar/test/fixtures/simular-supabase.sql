-- Simula lo mínimo de un proyecto Supabase para probar supabase/migrations en PostgreSQL plano.
-- NO ejecutar en Supabase. auth.users copia nombre, tipo y nulabilidad de las columnas que usa
-- el espejo (consultadas en dev): email y phone nulos, is_anonymous NOT NULL.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN CREATE ROLE anon NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'supabase_auth_admin') THEN CREATE ROLE supabase_auth_admin NOLOGIN; END IF;
END $$;

CREATE SCHEMA IF NOT EXISTS auth;
CREATE TABLE IF NOT EXISTS auth.users (
  id                 uuid         PRIMARY KEY,
  email              varchar(255) NULL,
  phone              text         NULL,
  is_anonymous       boolean      NOT NULL DEFAULT false,
  raw_app_meta_data  jsonb        NULL,
  raw_user_meta_data jsonb        NULL,
  created_at         timestamptz  NULL DEFAULT now()
);
GRANT USAGE ON SCHEMA auth TO supabase_auth_admin;
GRANT ALL ON auth.users TO supabase_auth_admin;

-- Storage: solo las columnas que usa supabase/migrations, y el trigger que en Supabase bloquea el
-- DELETE directo (consultado en dev).
CREATE SCHEMA IF NOT EXISTS storage;
CREATE TABLE IF NOT EXISTS storage.buckets (
  id                 text    PRIMARY KEY,
  name               text    NOT NULL,
  public             boolean NULL DEFAULT false,
  file_size_limit    bigint  NULL,
  allowed_mime_types text[]  NULL
);
CREATE TABLE IF NOT EXISTS storage.objects (
  id        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bucket_id text NULL REFERENCES storage.buckets(id),
  name      text NULL
);
CREATE OR REPLACE FUNCTION storage.protect_delete() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF COALESCE(current_setting('storage.allow_delete_query', true), 'false') != 'true' THEN
    RAISE EXCEPTION 'Direct deletion from storage tables is not allowed. Use the Storage API instead.'
      USING ERRCODE = '42501';
  END IF;
  RETURN NULL;
END $$;
DROP TRIGGER IF EXISTS protect_buckets_delete ON storage.buckets;
CREATE TRIGGER protect_buckets_delete BEFORE DELETE ON storage.buckets
  FOR EACH STATEMENT EXECUTE FUNCTION storage.protect_delete();
