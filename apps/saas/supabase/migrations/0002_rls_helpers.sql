-- ============================================================================
-- 0002_rls_helpers.sql — RLS helper functions + tenant policies
--
-- All cross-table membership checks go through SECURITY DEFINER helpers so the
-- policies on workspace_members itself do not recurse, and so a member can see
-- co-members without a policy that references the same table circularly.
-- ============================================================================

-- Is the current auth user a member of the given workspace?
create or replace function public.is_workspace_member(ws uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.workspace_members m
    where m.workspace_id = ws
      and m.user_id = auth.uid()
  );
$$;

-- Does the current auth user hold one of the given roles in the workspace?
create or replace function public.has_workspace_role(ws uuid, roles text[])
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.workspace_members m
    where m.workspace_id = ws
      and m.user_id = auth.uid()
      and m.role = any(roles)
  );
$$;

-- Workspace id that owns a given project.
create or replace function public.workspace_of_project(pid uuid)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select p.workspace_id from public.projects p where p.id = pid;
$$;

-- Is the current user a member of the workspace owning the project?
create or replace function public.is_project_member(pid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_workspace_member(public.workspace_of_project(pid));
$$;

-- ── Policies ─────────────────────────────────────────────────────────────────

-- workspaces: members can read; owners can update.
drop policy if exists workspaces_select on public.workspaces;
create policy workspaces_select on public.workspaces
  for select using (public.is_workspace_member(id));

drop policy if exists workspaces_update on public.workspaces;
create policy workspaces_update on public.workspaces
  for update using (public.has_workspace_role(id, array['owner']));

-- workspace_members: a user can always see their own row; members see co-members
-- (via helper, no recursion). Owners manage membership.
drop policy if exists members_select on public.workspace_members;
create policy members_select on public.workspace_members
  for select using (
    user_id = auth.uid() or public.is_workspace_member(workspace_id)
  );

drop policy if exists members_write on public.workspace_members;
create policy members_write on public.workspace_members
  for all using (public.has_workspace_role(workspace_id, array['owner']))
  with check (public.has_workspace_role(workspace_id, array['owner']));

-- projects: members read; owners/editors write.
drop policy if exists projects_select on public.projects;
create policy projects_select on public.projects
  for select using (public.is_workspace_member(workspace_id));

drop policy if exists projects_write on public.projects;
create policy projects_write on public.projects
  for all using (public.has_workspace_role(workspace_id, array['owner', 'editor']))
  with check (public.has_workspace_role(workspace_id, array['owner', 'editor']));

-- Generic project-scoped tables: members read, members write (role nuance is
-- enforced in the API; RLS guarantees tenant isolation).
do $$
declare t text;
begin
  foreach t in array array[
    'diagrams',
    'diagram_drafts',
    'edit_sessions',
    'merge_requests',
    'project_section_templates'
  ]
  loop
    execute format('drop policy if exists %1$s_select on public.%1$s', t);
    execute format(
      'create policy %1$s_select on public.%1$s for select using (public.is_project_member(project_id))',
      t
    );
    execute format('drop policy if exists %1$s_write on public.%1$s', t);
    execute format(
      'create policy %1$s_write on public.%1$s for all using (public.is_project_member(project_id)) with check (public.is_project_member(project_id))',
      t
    );
  end loop;
end $$;

-- project_template_policies (same project_id key, no extra columns).
drop policy if exists template_policies_select on public.project_template_policies;
create policy template_policies_select on public.project_template_policies
  for select using (public.is_project_member(project_id));

drop policy if exists template_policies_write on public.project_template_policies;
create policy template_policies_write on public.project_template_policies
  for all using (public.is_project_member(project_id))
  with check (public.is_project_member(project_id));

-- versions: readable by project members; also publicly readable when public.
drop policy if exists versions_select on public.versions;
create policy versions_select on public.versions
  for select using (
    public.is_project_member(
      (select d.project_id from public.diagrams d where d.id = diagram_id)
    )
    or public = true
  );

drop policy if exists versions_write on public.versions;
create policy versions_write on public.versions
  for all using (
    public.is_project_member(
      (select d.project_id from public.diagrams d where d.id = diagram_id)
    )
  )
  with check (
    public.is_project_member(
      (select d.project_id from public.diagrams d where d.id = diagram_id)
    )
  );

-- svg_blobs: readable when referenced by a public version, else members only.
drop policy if exists svg_blobs_select on public.svg_blobs;
create policy svg_blobs_select on public.svg_blobs
  for select using (
    exists (
      select 1 from public.versions v
      where v.svg_blob_id = svg_blobs.id
        and (
          v.public = true
          or public.is_project_member(
            (select d.project_id from public.diagrams d where d.id = v.diagram_id)
          )
        )
    )
  );

-- audit_log: workspace members read.
drop policy if exists audit_select on public.audit_log;
create policy audit_select on public.audit_log
  for select using (public.is_workspace_member(workspace_id));

-- notifications: a user only sees their own.
drop policy if exists notifications_own on public.notifications;
create policy notifications_own on public.notifications
  for all using (user_id = auth.uid())
  with check (user_id = auth.uid());
