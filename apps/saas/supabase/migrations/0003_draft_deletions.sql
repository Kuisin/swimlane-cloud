-- ============================================================================
-- 0003_draft_deletions.sql — deleting and moving files in the editor
--
-- Edits only reach git at checkpoint, so a deletion has to be pending in the
-- same way an edit is. A `drafts` row with `deleted = true` means "remove this
-- path from the branch at the next checkpoint"; `dsl_text` is unused for it.
-- A rename is a write at the new path plus a pending deletion at the old one,
-- so both halves land in a single commit.
-- ============================================================================

alter table public.drafts
  add column if not exists deleted boolean not null default false;

-- Listing a branch's files reads the non-deleted rows on nearly every request.
create index if not exists drafts_project_branch_live_idx
  on public.drafts (project_id, branch)
  where not deleted;
