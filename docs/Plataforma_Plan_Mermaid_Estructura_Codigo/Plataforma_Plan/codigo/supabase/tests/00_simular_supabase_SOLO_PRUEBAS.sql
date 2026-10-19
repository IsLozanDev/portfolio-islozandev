-- Simula lo mínimo de un proyecto Supabase para probar fuera de Supabase:
-- roles anon, authenticated, supabase_auth_admin y la tabla auth.users.
-- NO ejecutar en Supabase (allí ya existen).
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN CREATE ROLE anon NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'supabase_auth_admin') THEN CREATE ROLE supabase_auth_admin NOLOGIN; END IF;
END $$;
CREATE SCHEMA IF NOT EXISTS auth;
CREATE TABLE IF NOT EXISTS auth.users (
  id                  uuid PRIMARY KEY,
  email               varchar(255),
  encrypted_password  varchar(255),
  raw_app_meta_data   jsonb DEFAULT '{}'::jsonb,
  raw_user_meta_data  jsonb DEFAULT '{}'::jsonb,
  created_at          timestamptz DEFAULT now()
);
GRANT USAGE ON SCHEMA auth TO supabase_auth_admin;
GRANT ALL ON auth.users TO supabase_auth_admin;
