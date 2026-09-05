-- ============================================================================
-- 0002_rls.sql — row level security
--
-- Access to every project is decided by GitHub: the role a user holds is read
-- from the repository's permissions (admin → owner, push → editor, pull →
-- viewer) with that user's own token, on every request. Postgres cannot ask
-- GitHub, so a membership-based policy set is impossible here by design.
--
-- The model is therefore: RLS enabled on every table, with NO policies. The
-- anon and authenticated roles can reach nothing through PostgREST; the only
-- path to application data is an API route, which runs the GitHub permission
-- check first and then uses the service-role client (which bypasses RLS).
--
-- github_connections goes one step further: even the service role should
-- never see a token by accident through a broad `select *`, and no client key
-- should be able to read ciphertext at all.
-- ============================================================================

alter table public.workspaces                enable row level security;
alter table public.github_connections        enable row level security;
alter table public.projects                  enable row level security;
alter table public.drafts                    enable row level security;
alter table public.edit_sessions             enable row level security;
alter table public.versions                  enable row level security;
alter table public.version_files             enable row level security;
alter table public.merge_requests            enable row level security;
alter table public.audit_log                 enable row level security;
alter table public.project_section_templates enable row level security;
alter table public.project_template_policies enable row level security;

revoke all on table public.github_connections from anon, authenticated;

-- Keep updated_at honest on the two tables that are updated in place.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists github_connections_updated_at on public.github_connections;
create trigger github_connections_updated_at
  before update on public.github_connections
  for each row execute function public.set_updated_at();

drop trigger if exists project_section_templates_updated_at on public.project_section_templates;
create trigger project_section_templates_updated_at
  before update on public.project_section_templates
  for each row execute function public.set_updated_at();
