-- ============================================================================
-- Swimlane Cloud — DSL Management SaaS
-- 0001_init.sql — data model
--
-- Git history lives in GitHub, in repositories the signed-in user can already
-- reach; a repository is a project when it carries the `swimlane` topic.
-- Postgres holds only what GitHub cannot: who is connected, uncommitted
-- drafts, edit sessions, flagged versions (with a DSL snapshot so the public
-- share page never needs a GitHub call), section templates, and an audit trail.
--
-- Conventions:
--   * UUID primary keys (gen_random_uuid()).
--   * GitHub identities are keyed by numeric id (renames survive) with the
--     login stored for display; logins are unique case-insensitively.
--   * Access is derived from GitHub repository permissions at request time, so
--     there is no membership table. See 0002_rls.sql for what that means for RLS.
-- ============================================================================

create extension if not exists pgcrypto;

-- ── Tenancy: one row per GitHub owner (user or organisation) ─────────────────

create table if not exists public.workspaces (
  id                  uuid primary key default gen_random_uuid(),
  github_owner        text not null,
  github_owner_type   text not null check (github_owner_type in ('user', 'org')),
  github_owner_id     bigint not null unique,
  name                text not null,
  plan                text not null default 'free'
                        check (plan in ('free', 'team', 'enterprise')),
  stripe_customer_id  text,
  created_at          timestamptz not null default now()
);

create unique index if not exists workspaces_github_owner_key
  on public.workspaces (lower(github_owner));

-- ── Per-user GitHub token (encrypted at the application layer) ───────────────

create table if not exists public.github_connections (
  user_id           uuid primary key references auth.users(id) on delete cascade,
  github_login      text not null,
  github_user_id    bigint not null,
  token_ciphertext  text not null,            -- AES-256-GCM, see src/lib/token-crypto.ts
  scopes            text not null default 'repo',
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index if not exists github_connections_login_idx
  on public.github_connections (lower(github_login));

-- ── Projects: one row per GitHub repository that has been opened here ────────

create table if not exists public.projects (
  id               uuid primary key default gen_random_uuid(),
  workspace_id     uuid not null references public.workspaces(id) on delete cascade,
  github_repo      text not null,             -- repository name (not full_name)
  github_repo_id   bigint not null unique,
  name             text not null,
  created_at       timestamptz not null default now()
);

create unique index if not exists projects_workspace_repo_key
  on public.projects (workspace_id, lower(github_repo));

-- ── Drafts: working copies per (path, branch); in git only after a checkpoint ─

create table if not exists public.drafts (
  id                uuid primary key default gen_random_uuid(),
  project_id        uuid not null references public.projects(id) on delete cascade,
  filepath          text not null,            -- POSIX path within the repo tree
  branch            text not null,            -- main | test | tmp-*
  dsl_text          text not null,
  updated_by        uuid references auth.users(id) on delete set null,
  updated_by_login  text,
  updated_at        timestamptz not null default now(),
  unique (project_id, filepath, branch)
);

create index if not exists drafts_project_branch_idx
  on public.drafts (project_id, branch);

-- ── Edit sessions: tmp-* branches cut from test ──────────────────────────────

create table if not exists public.edit_sessions (
  id                uuid primary key default gen_random_uuid(),
  project_id        uuid not null references public.projects(id) on delete cascade,
  branch_name       text not null,            -- always tmp-*
  base_sha          text,                     -- test tip when the branch was cut
  created_by        uuid references auth.users(id) on delete set null,
  created_by_login  text,
  status            text not null default 'active'
                      check (status in ('active', 'merged', 'abandoned')),
  created_at        timestamptz not null default now(),
  closed_at         timestamptz
);

create index if not exists edit_sessions_project_idx
  on public.edit_sessions (project_id, status);

-- One live session per branch; a merged or abandoned one may be recreated.
create unique index if not exists edit_sessions_active_branch_key
  on public.edit_sessions (project_id, branch_name)
  where status = 'active';

-- ── Versions: a release of the whole folder at one commit on test ────────────

create table if not exists public.versions (
  id                uuid primary key default gen_random_uuid(),
  project_id        uuid not null references public.projects(id) on delete cascade,
  name              text not null,
  note              text,
  commit_sha        text not null,
  branch            text not null default 'test',   -- branch where flagged
  tag_name          text,                           -- lightweight git tag on GitHub
  promoted_to_main  boolean not null default false,
  promoted_sha      text,                           -- the commit on main that carries it
  public            boolean not null default false, -- only meaningful once promoted
  share_mode        text check (share_mode in ('svg_only', 'svg_and_dsl')),
  public_slug       text unique,
  created_by        uuid references auth.users(id) on delete set null,
  created_by_login  text,
  created_at        timestamptz not null default now(),
  -- public may only be true once promoted to main (enforced again in the API)
  check (public = false or promoted_to_main = true),
  -- share_mode only present when public
  check (share_mode is null or public = true)
);

create index if not exists versions_project_idx
  on public.versions (project_id, created_at desc);

-- The DSL of every .txt at the flagged commit. SVG is rendered from this on
-- request, so the public share page never touches GitHub.
create table if not exists public.version_files (
  id          uuid primary key default gen_random_uuid(),
  version_id  uuid not null references public.versions(id) on delete cascade,
  filepath    text not null,
  dsl_text    text not null,
  sort_order  integer not null default 0,
  unique (version_id, filepath)
);

-- ── Pull requests opened from here (GitHub is the source of truth) ───────────

create table if not exists public.merge_requests (
  id              uuid primary key default gen_random_uuid(),
  project_id      uuid not null references public.projects(id) on delete cascade,
  pr_number       integer not null,
  head_branch     text not null,
  base_branch     text not null,
  version_id      uuid references public.versions(id) on delete set null,  -- required when base = main
  title           text not null,
  status          text not null default 'open'
                    check (status in ('open', 'merged', 'closed')),
  author_id       uuid references auth.users(id) on delete set null,
  author_login    text,
  merged_by_login text,
  created_at      timestamptz not null default now(),
  closed_at       timestamptz,
  unique (project_id, pr_number),
  -- promotions to main must reference a flagged version
  check (base_branch <> 'main' or version_id is not null)
);

create index if not exists merge_requests_project_idx
  on public.merge_requests (project_id, status);

-- ── Audit ────────────────────────────────────────────────────────────────────

create table if not exists public.audit_log (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references public.workspaces(id) on delete cascade,
  project_id    uuid references public.projects(id) on delete cascade,
  user_id       uuid references auth.users(id) on delete set null,
  actor_login   text,
  action        text not null,
  entity_type   text,
  entity_id     text,
  commit_sha    text,
  created_at    timestamptz not null default now()
);

create index if not exists audit_log_project_idx
  on public.audit_log (project_id, created_at desc);
create index if not exists audit_log_workspace_idx
  on public.audit_log (workspace_id, created_at desc);

-- ── Section templates (per project) ──────────────────────────────────────────

create table if not exists public.project_section_templates (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid not null references public.projects(id) on delete cascade,
  section     text not null
                check (section in ('page', 'option', 'role', 'block', 'prop')),
  name        text not null,
  slug        text not null,
  body        text not null,                  -- DSL fragment for that section
  is_default  boolean not null default false,
  sort_order  integer not null default 0,
  created_by  uuid references auth.users(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (project_id, section, slug)
);

-- At most one default per (project_id, section).
create unique index if not exists project_section_templates_one_default
  on public.project_section_templates (project_id, section)
  where is_default;

create index if not exists section_templates_project_section_idx
  on public.project_section_templates (project_id, section);

-- ── Template enforcement per section ─────────────────────────────────────────

create table if not exists public.project_template_policies (
  project_id          uuid not null references public.projects(id) on delete cascade,
  section             text not null
                        check (section in ('page', 'option', 'role', 'block', 'prop')),
  mode                text not null default 'optional'
                        check (mode in ('optional', 'default', 'forced')),
  forced_template_id  uuid references public.project_section_templates(id),
  updated_by          uuid references auth.users(id) on delete set null,
  updated_at          timestamptz not null default now(),
  primary key (project_id, section),
  -- forced requires a pinned template
  check (mode <> 'forced' or forced_template_id is not null)
);
