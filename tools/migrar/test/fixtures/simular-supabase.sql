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
