-- ============================================================================
-- 0005_gitlab_provider.sql — custom/self-hosted GitLab per org
--
-- A workspace backs its projects with either github.com (default, unchanged)
-- or one GitLab instance its admin registers with their own OAuth
-- Application — GitLab has no shared OAuth app we can pre-register the way
-- Supabase's GitHub provider does, since we don't control orgs' self-hosted
-- servers (see apps/saas/src/lib/gitlab.ts).
--
-- Milestone: read + create/attach + edit + autosave + push only. Merge
-- request review and the preview->main publish flow stay GitHub-only for
-- now (routes guard on `provider = 'github'` explicitly).
--
-- Postgres treats every NULL as distinct in a unique index, so relaxing the
-- GitHub-only NOT NULL constraints below and adding plain new indexes for
-- the GitLab columns is enough: GitHub rows keep colliding on real values,
-- GitLab rows (which leave the GitHub columns null) never collide with each
-- other. No partial indexes required.
-- ============================================================================

-- ── The org's registered GitLab OAuth Application ───────────────────────────
-- workspace_id starts null: an instance is "registered" before it is
-- "claimed" by a workspace, because unlike GitHub, nothing here tells us
-- which org a GitLab instance belongs to until someone authenticates
-- against it and picks a namespace. See gitlab-discovery.ts / the claim
-- route under app/api/gitlab/instances/[instanceId]/claim.
create table if not exists public.gitlab_instances (
  id                        uuid primary key default gen_random_uuid(),
  workspace_id              uuid references public.workspaces(id) on delete cascade,
  host                      text not null,          -- e.g. https://gitlab.example.com, no trailing slash
  display_name              text not null,
  client_id                 text not null,
  client_secret_ciphertext  text not null,          -- AES-256-GCM, see src/lib/token-crypto.ts
  registered_by             uuid references auth.users(id) on delete set null,
  registered_by_login       text,
  claimed_at                timestamptz,
  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now(),
  check (host ~ '^https?://[^/]')
);

-- One instance per workspace once claimed; unclaimed rows (workspace_id
-- null) never collide with each other under Postgres's NULL-distinct
-- uniqueness.
create unique index if not exists gitlab_instances_workspace_key
  on public.gitlab_instances (workspace_id);

create index if not exists gitlab_instances_unclaimed_idx
  on public.gitlab_instances (registered_by, created_at desc)
  where workspace_id is null;

-- ── Per-user GitLab token for a given instance ──────────────────────────────
-- Unlike GitHub's, GitLab OAuth tokens expire and carry a refresh token, so
-- both ciphertext columns and an expiry are required from day one.
create table if not exists public.gitlab_connections (
  user_id                    uuid not null references auth.users(id) on delete cascade,
  instance_id                uuid not null references public.gitlab_instances(id) on delete cascade,
  gitlab_login               text not null,
  gitlab_user_id             bigint not null,
  access_token_ciphertext    text not null,
  refresh_token_ciphertext   text not null,
  token_expires_at           timestamptz not null,
  scopes                     text not null default 'api',
  created_at                 timestamptz not null default now(),
  updated_at                 timestamptz not null default now(),
  primary key (user_id, instance_id)
);

create index if not exists gitlab_connections_instance_login_idx
  on public.gitlab_connections (instance_id, lower(gitlab_login));

-- ── workspaces: provider discriminator + GitLab identity ────────────────────
alter table public.workspaces
  add column if not exists provider text not null default 'github'
    check (provider in ('github', 'gitlab')),
  add column if not exists gitlab_instance_id    uuid references public.gitlab_instances(id),
  add column if not exists gitlab_namespace_path text,
  add column if not exists gitlab_namespace_id   bigint;

alter table public.workspaces
  alter column github_owner drop not null,
  alter column github_owner_type drop not null,
  alter column github_owner_id drop not null;

alter table public.workspaces
  drop constraint if exists workspaces_provider_identity_check,
  add constraint workspaces_provider_identity_check check (
    (provider = 'github'
      and github_owner is not null and github_owner_type is not null and github_owner_id is not null)
    or
    (provider = 'gitlab'
      and gitlab_instance_id is not null and gitlab_namespace_path is not null and gitlab_namespace_id is not null)
  );

-- A namespace id is unique per instance, not globally (two self-hosted
-- instances can both have namespace id 5).
create unique index if not exists workspaces_gitlab_namespace_key
  on public.workspaces (gitlab_instance_id, gitlab_namespace_id);

-- ── projects: GitLab identity ────────────────────────────────────────────────
alter table public.projects
  add column if not exists gitlab_project_id   bigint,
  add column if not exists gitlab_project_path text;  -- full path incl. namespace, e.g. group/subgroup/project

alter table public.projects
  alter column github_repo drop not null,
  alter column github_repo_id drop not null;

alter table public.projects
  drop constraint if exists projects_provider_identity_check,
  add constraint projects_provider_identity_check check (
    (github_repo is not null and github_repo_id is not null
      and gitlab_project_id is null and gitlab_project_path is null)
    or
    (gitlab_project_id is not null and gitlab_project_path is not null
      and github_repo is null and github_repo_id is null)
  );

create unique index if not exists projects_gitlab_project_key
  on public.projects (workspace_id, gitlab_project_id);

-- ── RLS + updated_at triggers, matching 0002_rls.sql's pattern ──────────────
-- (0004_service_role_grants.sql's `alter default privileges` already grants
-- service_role DML and revokes anon/authenticated on any table created after
-- it, so no explicit grants are needed here.)
alter table public.gitlab_instances   enable row level security;
alter table public.gitlab_connections enable row level security;

revoke all on table public.gitlab_connections from anon, authenticated;

drop trigger if exists gitlab_instances_updated_at on public.gitlab_instances;
create trigger gitlab_instances_updated_at
  before update on public.gitlab_instances
  for each row execute function public.set_updated_at();

drop trigger if exists gitlab_connections_updated_at on public.gitlab_connections;
create trigger gitlab_connections_updated_at
  before update on public.gitlab_connections
  for each row execute function public.set_updated_at();
