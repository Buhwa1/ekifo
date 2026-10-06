-- Supabase exposes every table in the "public" schema through its auto-generated REST API
-- (PostgREST), reachable with the project's public anon key. FindEkifo never uses that API —
-- the Next.js server talks to Postgres directly as the table owner — so we shut it off:
--
--   1. Enable Row Level Security on every table with NO policies → anon/authenticated see nothing.
--      The owner role the app connects as bypasses RLS, so the app is unaffected.
--   2. Revoke table privileges from the API roles as a second layer.
--
-- Safe on plain Postgres too: the role checks skip step 2 when those roles don't exist.

DO $$
DECLARE t text;
BEGIN
  FOR t IN SELECT tablename FROM pg_tables WHERE schemaname = 'public' LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
  END LOOP;

  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    EXECUTE 'REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon';
    EXECUTE 'REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon';
    EXECUTE 'ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM anon';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    EXECUTE 'REVOKE ALL ON ALL TABLES IN SCHEMA public FROM authenticated';
    EXECUTE 'REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM authenticated';
    EXECUTE 'ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM authenticated';
  END IF;
END $$;
