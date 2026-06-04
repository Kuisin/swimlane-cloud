-- ============================================================================
-- Swimlane Cloud — DSL Management SaaS
-- 0001_init.sql — full data model (plan PART B, §B1)
--
-- Conventions:
--   * UUID primary keys (gen_random_uuid()).
--   * Tenant-scoped tables carry workspace_id and have RLS enabled.
--   * Membership-based access via the helper public.is_workspace_member()
--     (defined in 0002_rls_helpers.sql; SECURITY DEFINER to avoid recursion).
-- ============================================================================

create extension if not exists pgcrypto;

-- ── Tenancy ─────────────────────────────────────────────────────────────────

create table if not exists public.workspaces (
  id                  uuid primary key default gen_random_uuid(),
  name                text not null,
  slug                text not null unique,
  gitea_org_name      text not null,
  plan                text not null default 'free'
                        check (plan in ('free', 'team', 'enterprise')),
  stripe_customer_id  text,
  created_at          timestamptz not null default now()
);

create table if not exists public.workspace_members (
  workspace_id  uuid not null references public.workspaces(id) on delete cascade,
  user_id       uuid not null references auth.users(id) on delete cascade,
  role          text not null default 'viewer'
                  check (role in ('owner', 'editor', 'viewer')),
  created_at    timestamptz not null default now(),
  primary key (workspace_id, user_id)
);

-- ── Content (folder-first: project = repo = directory tree of .txt) ──────────

create table if not exists public.projects (
  id               uuid primary key default gen_random_uuid(),
  workspace_id     uuid not null references public.workspaces(id) on delete cascade,
  name             text not null,
  gitea_repo_name  text not null,
  created_at       timestamptz not null default now(),
  unique (workspace_id, gitea_repo_name)
);

create table if not exists public.diagrams (
  id                 uuid primary key default gen_random_uuid(),
  project_id         uuid not null references public.projects(id) on delete cascade,
  name               text not null,
  filepath_in_repo   text not null,           -- POSIX path within the repo tree
  theme_key          text not null default 'basic',
  created_by         uuid references auth.users(id),
  created_at         timestamptz not null default now(),
  deleted_at         timestamptz,             -- soft-delete when removed on main
  unique (project_id, filepath_in_repo)
);

create table if not exists public.diagram_drafts (
  id                uuid primary key default gen_random_uuid(),
  project_id        uuid not null references public.projects(id) on delete cascade,
  filepath_in_repo  text not null,
  branch            text not null,            -- main | test | tmp-*
  dsl_text          text not null,
  updated_by        uuid references auth.users(id),
  updated_at        timestamptz not null default now(),
  unique (project_id, filepath_in_repo, branch)
);

-- ── SVG storage (deduped; created ONLY on new-version flag) ──────────────────

create table if not exists public.svg_blobs (
  id                uuid primary key default gen_random_uuid(),
  dsl_content_hash  text not null unique,     -- sha256 of DSL text
  svg_storage_path  text not null,            -- S3 object key
  theme_key         text not null,
  rendered_at       timestamptz not null default now()
);

-- ── Versions (explicit "new version" flag on a commit; typically on test) ────

create table if not exists public.versions (
  id                uuid primary key default gen_random_uuid(),
  diagram_id        uuid not null references public.diagrams(id) on delete cascade,
  name              text not null,
  commit_sha        text not null,
  branch            text not null,            -- branch where flagged
  svg_blob_id       uuid references public.svg_blobs(id),
  is_new_version    boolean not null default true,
  promoted_to_main  boolean not null default false,
  public            boolean not null default false,  -- only meaningful on main
  share_mode        text check (share_mode in ('svg_only', 'svg_and_dsl')),
  public_slug       text unique,
  note              text,
  created_by        uuid references auth.users(id),
  created_at        timestamptz not null default now(),
  -- public may only be true when promoted to main (enforced again in API)
  check (public = false or promoted_to_main = true),
  -- share_mode only present when public
  check (share_mode is null or public = true)
);

-- ── Edit sessions (tmp-* branches; base branch is test) ──────────────────────

create table if not exists public.edit_sessions (
  id           uuid primary key default gen_random_uuid(),
  project_id   uuid not null references public.projects(id) on delete cascade,
  branch_name  text not null,                 -- always tmp-*
  created_by   uuid references auth.users(id),
  status       text not null default 'active'
                 check (status in ('active', 'merged', 'abandoned')),
  created_at   timestamptz not null default now()
);

create table if not exists public.merge_requests (
  id              uuid primary key default gen_random_uuid(),
  project_id      uuid not null references public.projects(id) on delete cascade,
  gitea_pr_index  integer not null,
  head_branch     text not null,
  base_branch     text not null,
  version_id      uuid references public.versions(id),  -- required when base = main
  title           text not null,
  status          text not null default 'open'
                    check (status in ('open', 'merged', 'closed')),
  author_id       uuid references auth.users(id),
  reviewer_id     uuid references auth.users(id),
  created_at      timestamptz not null default now(),
  -- promotions to main must reference a flagged version
  check (base_branch <> 'main' or version_id is not null)
);

-- ── Audit & notifications ────────────────────────────────────────────────────

create table if not exists public.audit_log (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references public.workspaces(id) on delete cascade,
  user_id       uuid references auth.users(id),
  action        text not null,
  entity_type   text,
  entity_id     text,
  commit_sha    text,
  created_at    timestamptz not null default now()
);

create table if not exists public.notifications (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  type        text not null,
  payload     jsonb not null default '{}'::jsonb,
  read        boolean not null default false,
  created_at  timestamptz not null default now()
);

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
  created_by  uuid references auth.users(id),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (project_id, section, slug)
);

-- At most one default per (project_id, section).
create unique index if not exists project_section_templates_one_default
  on public.project_section_templates (project_id, section)
  where is_default;

-- ── Template enforcement per section ─────────────────────────────────────────

create table if not exists public.project_template_policies (
  project_id          uuid not null references public.projects(id) on delete cascade,
  section             text not null
                        check (section in ('page', 'option', 'role', 'block', 'prop')),
  mode                text not null default 'optional'
                        check (mode in ('optional', 'default', 'forced')),
  forced_template_id  uuid references public.project_section_templates(id),
  updated_by          uuid references auth.users(id),
  updated_at          timestamptz not null default now(),
  primary key (project_id, section),
  -- forced requires a pinned template
  check (mode <> 'forced' or forced_template_id is not null)
);

-- At most one forced template per (project_id, section) is implied by the PK
-- (one policy row per (project, section)); the pinned template is validated in
-- the API to belong to the same project + section.

-- ── Helpful indexes ──────────────────────────────────────────────────────────

create index if not exists projects_workspace_idx
  on public.projects (workspace_id);
create index if not exists diagrams_project_idx
  on public.diagrams (project_id);
create index if not exists diagram_drafts_project_branch_idx
  on public.diagram_drafts (project_id, branch);
create index if not exists versions_diagram_idx
  on public.versions (diagram_id);
create index if not exists edit_sessions_project_idx
  on public.edit_sessions (project_id, status);
create index if not exists merge_requests_project_idx
  on public.merge_requests (project_id, status);
create index if not exists audit_log_workspace_idx
  on public.audit_log (workspace_id, created_at desc);
create index if not exists notifications_user_idx
  on public.notifications (user_id, read);
create index if not exists section_templates_project_section_idx
  on public.project_section_templates (project_id, section);

-- ── Row Level Security ───────────────────────────────────────────────────────
-- Enabled here; policies are created in 0002_rls_helpers.sql once the helper
-- functions exist. Service-role key (used by API route handlers) bypasses RLS.

alter table public.workspaces                enable row level security;
alter table public.workspace_members         enable row level security;
alter table public.projects                  enable row level security;
alter table public.diagrams                  enable row level security;
alter table public.diagram_drafts            enable row level security;
alter table public.versions                  enable row level security;
alter table public.edit_sessions             enable row level security;
alter table public.merge_requests            enable row level security;
alter table public.audit_log                 enable row level security;
alter table public.notifications             enable row level security;
alter table public.project_section_templates enable row level security;
alter table public.project_template_policies enable row level security;
-- svg_blobs is content-addressed and not tenant-scoped; left without RLS
-- (only reachable via service role / joined version rows).
alter table public.svg_blobs enable row level security;
