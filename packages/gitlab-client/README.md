# @swimlane-cloud/gitlab-client

A GitLab client for one org's self-hosted (or gitlab.com) instance, mirroring
`@swimlane-cloud/github-client`'s shape closely enough that `apps/saas` can
dispatch between the two providers behind one `RepoApis` contract
(`apps/saas/src/lib/repo-apis.ts`). Same two hard rules as the GitHub package:
it never imports Next, and it never acquires a token — the caller injects
`getToken`, `fetchImpl`, and (unlike GitHub) the instance's own `origin`,
since there is no single well-known GitLab host the way `api.github.com` is
for every GitHub repository.

`branch-model.ts` and the generic transport types (`RepoRef`, `TokenGetter`,
`FetchImpl`, `EtagStore`, `TreeEntry`) are re-exported from
`@swimlane-cloud/github-client` rather than duplicated — both have zero
GitHub-specific dependencies, so a fork would only drift.

## Where this differs from the GitHub port

- **Writes are one call, not four.** GitHub's Git Data API forces a
  blob → tree → commit → ref dance; GitLab's `POST /repository/commits`
  takes an `actions` array and applies them all in one commit — including on
  a project with no branches yet, so a brand-new project's seed commit both
  creates the default branch and adds the files in the same request. The
  cost: no atomic, server-enforced fast-forward-only ref update the way
  GitHub's `PATCH /git/refs/*` gives — `commitFiles` checks the branch tip
  immediately before building the commit instead (check-then-act, not a true
  compare-and-swap).
- **`compare()` costs two calls, not one.** GitLab's `/repository/compare`
  returns the commit list and diff between two refs but not `ahead_by`/
  `behind_by`/`status` the way GitHub's `/compare/{base}...{head}` does;
  these are reconstructed from the same call run in both directions.
- **Auth is OAuth-only.** GitLab also supports a `PRIVATE-TOKEN` header for
  personal access tokens; this package deliberately never sends it, since
  `apps/saas`'s GitLab auth model is exclusively "each org registers its own
  OAuth Application" (see `apps/saas/src/lib/gitlab.ts`), never a pasted PAT.
- **Merge requests are listable, not yet actionable.** `listPullRequests` is
  a real implementation — `apps/saas`'s branch-lock logic needs to see an
  open merge request even before this app can create or review one — but
  every write method (`createPullRequest`, `mergePullRequest`, …) throws
  `GitLabNotImplementedError`. Same treatment for `write.createTag`/
  `createRelease` and `commits.isAncestor`: these only matter to the
  GitHub-only publish flow, reached in `apps/saas` only behind an explicit
  `provider !== "github"` guard, but the shared `RepoApis` type still
  requires them to exist, so they exist — as stubs that should be
  unreachable in practice.
- **Discovery is two-tier**, matching how a workspace is scoped: `getRepo`
  accepts a numeric project id or a URL-encoded `namespace/path` (both work
  on every GitLab endpoint; the numeric id is what `apps/saas` stores, since
  it survives a rename or move between groups); `listNamespaceProjects` scopes
  to one specific group (`GET /groups/:id/projects`) for workspace-scoped
  discovery, while `listAccessibleRepos` spans every namespace the token can
  reach, mirroring GitHub's global `listAccessibleRepos`.

## Development

```
pnpm test        # fully offline — every suite drives an injected fetchImpl
pnpm typecheck   # tsc --noEmit; covers sources AND tests
```
