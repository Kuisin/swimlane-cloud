-- ============================================================================
-- 0006_file_identities.sql — a stable id for a diagram file, independent of
-- its folder path
--
-- Every other table keys a diagram by (project_id, filepath[, branch]) —
-- `drafts`, `version_files` — so a deep link built from the folder path
-- breaks the moment the file moves to another folder: the old path 404s and
-- the editor silently falls back to opening whatever file sorts first.
--
-- This table gives a file an id that survives a move. It is deliberately
-- scoped per project, not per branch: `drafts` already treats a path as "the
-- same file" across main/test/tmp-*, and a rename is a single mutation (see
-- POST .../files {op:"rename"}) that should move the identity, not fork it.
--
-- Rows are minted lazily (on first tree listing that doesn't already have
-- one for a path) rather than backfilled, so this needs no data migration —
-- see ensureFileIds() in src/lib/file-ids.ts.
-- ============================================================================

create table if not exists public.file_identities (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid not null references public.projects(id) on delete cascade,
  filepath    text not null,          -- current path; rewritten on rename, not reissued
  created_at  timestamptz not null default now(),
  unique (project_id, filepath)
);

create index if not exists file_identities_project_idx
  on public.file_identities (project_id);

alter table public.file_identities enable row level security;
