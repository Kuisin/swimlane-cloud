-- ============================================================================
-- 0004_service_role_grants.sql — let the API actually reach its own tables
--
-- Supabase no longer hands new tables blanket DML to anon / authenticated /
-- service_role: a table created by a migration comes out with REFERENCES,
-- TRIGGER and TRUNCATE only. Every API route here uses the service-role key,
-- so without this it cannot read or write anything — `permission denied for
-- table …` on the first query of every request.
--
-- The access model is unchanged: `service_role` (server-side, behind the
-- GitHub permission check) is the only role with DML; anon and authenticated
-- keep none, so a leaked publishable key still reaches nothing. RLS stays
-- enabled everywhere as the second line of defence.
-- ============================================================================

grant usage on schema public to service_role;

grant select, insert, update, delete on all tables in schema public to service_role;

-- Same treatment for anything a later migration adds.
alter default privileges in schema public
  grant select, insert, update, delete on tables to service_role;

-- Client-facing roles get nothing: these tables are reachable only through the
-- API routes, never straight from PostgREST.
revoke all on all tables in schema public from anon, authenticated;

alter default privileges in schema public
  revoke all on tables from anon, authenticated;
