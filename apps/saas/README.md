# @swimlane-cloud/saas

The DSL Management SaaS: a Next.js 15 (App Router) app that embeds the shared
`@swimlane-cloud/editor` and turns the user's **own GitHub repositories** into
diagram projects. Supabase (Tokyo) provides sign-in and the small amount of
state GitHub cannot hold; Vercel (Tokyo) runs the app. Nothing is self-hosted.

## How it works

- **GitHub is the backend.** Sign-in is Supabase Auth's GitHub provider with the
  `repo` scope. The token Supabase hands back on the OAuth callback is encrypted
  (AES-256-GCM, `src/lib/token-crypto.ts`) into `github_connections`, and every
  GitHub call — reads, commits, pull requests, merges, tags — runs with it, via
  `packages/github-client`. There is no bot account and no service token.
- **Projects are discovered.** A repository is a project when it carries the
  GitHub topic `swimlane` (`src/lib/discovery.ts`). `GET /user/repos` returns
  topics and permissions inline, so the dashboard is one paginated call.
  Opening a repository upserts a `workspaces` row (per GitHub owner) and a
  `projects` row (per repository) purely as keys for drafts, versions,
  templates and audit entries. `.swimlane.json` in the repo names the folder
  that holds diagrams.
- **Roles are GitHub permissions.** `requireProjectRole` (`src/lib/projects.ts`)
  reads the repository's permissions with the caller's token on every request:
  `admin` → owner, `push` → editor, `pull` → viewer.
- **Branch model** (`packages/github-client/src/branch-model.ts`): `main` is
  published (公開済み) and never edited in place; `preview` (承認済み) is the
  review line and is **never edited in place either** — it only changes when
  a pull request from an edit branch is approved, so what a reviewer opens on
  it is always approved content. Work happens on edit branches named
  `<login>/<timestamp>/<key>`, cut automatically when someone clicks
  **Start editing** — never named by hand. An edit branch with an open pull
  request is locked until it is merged or closed. Drafts an owner saved on
  `preview` before it became review-only are carried onto that owner's next
  edit branch by **Start editing**, or discarded from the Edit page. A handful of repositories
  seeded before this model existed still carry a legacy `test` branch or
  `tmp-*` edit branches; both are recognised (`isEditBranch`) and left alone
  rather than migrated.
- **Autosave, then an explicit Push.** Every keystroke debounce-saves to a
  `drafts` row in Postgres (`packages/editor`'s `capabilities.autosave`,
  mirrored to `localStorage` too so a closed tab loses nothing). Drafts only
  exist on edit branches; `main` and `preview` are always read as git has
  them. **Push to
  GitHub** turns every draft on the branch into one commit (`commitFiles`,
  blob → tree → commit → ref) guarded by `expectedHeadSha`, so two people
  cannot clobber each other; the loser gets a 409 and a "branch moved"
  banner. The commit message is auto-built from the changed files
  (`src/lib/commit-message.ts`) when the user leaves it blank, and always
  carries a plain-language file list plus machine trailers.
- **Publishing is one step.** **Publish** (`src/lib/versions.ts
publishRelease`) snapshots every diagram on `preview` into `version_files`,
  tags the commit with the version number itself (e.g. `v1.3.0`, suggested
  from the highest existing one), and promotes it straight to `main` via a
  short-lived `release-*` branch, pull request and merge. SVG is rendered on
  request from the snapshot — there is no object storage. The legacy
  two-step flag-then-promote routes still exist for versions created before
  this flow, sharing the same `flagVersion`/`promoteVersion` functions.
- **Reads never trust a branch name.** File text is fetched at the commit
  sha the branch resolves to (`…/file`), because GitHub's Contents API
  answers a branch-name lookup from a cache that lags a fresh commit — long
  enough for a just-pushed file to come back as 404, which the editor used to
  show as a blank starter diagram.
- **Local cache, never stale** (`src/lib/local-cache.ts`). Project state,
  tree listings and the dashboard's project list are painted from
  `localStorage` at once and always re-fetched (stale-while-revalidate).
  File text is cached under a version token — `git:<sha>` or
  `draft:<updated_at>` (`src/lib/file-version.ts`) — that the tree listing
  names for every file, so cached text is served only when a fresh listing
  says it is the current version. Commit-sha snapshots and comparisons are
  immutable and cached outright. The cache is cleared on sign-out and
  whenever the signed-in GitHub account changes.
- **The app's own writes to `preview` go through a pull request too**
  (`src/lib/preview-commit.ts`): the `templates/` mirror lands as a
  short-lived branch + pull request + merge by the owner who changed the
  template, never as a direct commit. Marking an existing repository writes
  `.swimlane.json` to `main` and cuts `preview` from it. Leftover preview
  drafts never block publishing — they are not part of what is published.
- **Public sharing** (`/p/[slug]`) reads Postgres only. `svg_only` links never
  send the DSL to the browser.
- **Database access.** RLS is enabled on every table with no policies; the
  service-role client in API routes is the only path in, always after the
  GitHub permission check. `github_connections` additionally revokes the
  ciphertext column from client keys.

## GitLab (self-hosted, or gitlab.com) — per-org, opt-in

A workspace can be backed by a self-hosted GitLab instance (or gitlab.com)
instead of GitHub, chosen per org. This is a separate, opt-in setting, not a
replacement for GitHub — most workspaces stay GitHub-backed.

- **No shared OAuth App.** GitHub sign-in works because everyone shares one
  OAuth App registered by us; that model doesn't fit "an org's own self-hosted
  server we don't control". Instead, an org admin registers **their own**
  OAuth Application (created on their GitLab instance's admin settings, scope
  `api`) with Swimlane Cloud at `/workspaces/new-gitlab`, then connects and
  picks the GitLab group the workspace represents. See `src/lib/gitlab.ts`
  (per-user client + transparent token refresh — GitLab's OAuth tokens expire,
  unlike GitHub's), `src/lib/gitlab-instances.ts` (register/claim), and
  `src/lib/gitlab-discovery.ts` (create/attach a project, the workspace-scoped
  analogue of `discovery.ts`).
- **Needs zero new environment variables.** Every instance's host and OAuth
  credentials are stored per org in Postgres (`gitlab_instances`,
  `gitlab_connections`, both AES-256-GCM sealed), never in env — deliberate,
  to keep `next build`'s no-env guarantee intact.
- **Phase 1 scope: read + create/attach + edit + autosave + push.** Merge
  request review and the one-step Publish flow are GitHub-only for now; a
  GitLab project's `…/pulls/*` and `…/versions/publish`|`…/versions`(flag)|
  `…/versions/[id]/promote` routes return a clear 400 instead of running
  (`provider !== "github"` guards in each route). `packages/gitlab-client`
  mirrors `packages/github-client`'s shape so both providers satisfy one
  `RepoApis` contract (`src/lib/repo-apis.ts`) — `requireProjectRole`
  (`src/lib/projects.ts`) is the only place that knows which provider a
  project uses.

## Environment variables

All env is read **at request time** — `next build` runs with no environment.
Canonical list with notes: [`../../.env.vercel.example`](../../.env.vercel.example).

| Var                             | Used by                                             |
| ------------------------------- | --------------------------------------------------- |
| `NEXT_PUBLIC_SUPABASE_URL`      | middleware, server + browser Supabase clients       |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | middleware, browser sign-in, cookie-bound sessions  |
| `SUPABASE_SERVICE_ROLE_KEY`     | every API route (service-role client)               |
| `TOKEN_ENCRYPTION_KEY`          | sealing / opening stored GitHub tokens (≥ 32 chars) |
| `NEXT_PUBLIC_APP_URL`           | absolute URLs                                       |
| `GITHUB_API_ORIGIN` (optional)  | GitHub Enterprise Server                            |
| `STRIPE_*` (optional)           | billing webhook (deferred)                          |

## Database

`supabase/migrations/`:

- `0001_init.sql` — `workspaces`, `github_connections`, `projects`, `drafts`,
  `edit_sessions`, `versions`, `version_files`, `merge_requests`, `audit_log`,
  `project_section_templates`, `project_template_policies`.
- `0002_rls.sql` — RLS on with no policies; `updated_at` triggers.
- `0005_gitlab_provider.sql` — `gitlab_instances` (a registered OAuth
  Application, unclaimed until a workspace picks it), `gitlab_connections`
  (per-user token + refresh token + expiry + email), a `provider` column plus
  GitLab identity columns on `workspaces`/`projects` (GitHub's own columns
  become nullable rather than partial-indexed — Postgres already treats every
  `NULL` as distinct in a unique index, so GitHub rows are unaffected).

`supabase/config.toml` configures the local stack (GitHub provider via
`SUPABASE_AUTH_EXTERNAL_GITHUB_CLIENT_ID` / `_SECRET`).

## Run

```bash
pnpm --filter @swimlane-cloud/saas dev        # next dev
pnpm --filter @swimlane-cloud/saas test       # vitest (offline)
pnpm --filter @swimlane-cloud/saas typecheck
pnpm --filter @swimlane-cloud/saas build      # works with no env
```

Deployment (Supabase restore/link/push, GitHub OAuth App, Vercel link/env/deploy)
is documented in the root [`README.md`](../../README.md#deploying-appssaas).

## API routes

Every project route runs `requireProjectRole(projectId, role)` first.

| Method                | Route                                                    | Role            | Purpose                                                                                                        |
| --------------------- | -------------------------------------------------------- | --------------- | -------------------------------------------------------------------------------------------------------------- |
| GET                   | `/api/me`                                                | user            | who is signed in, GitHub connected?                                                                            |
| POST                  | `/api/auth/signout`                                      | user            | sign out                                                                                                       |
| GET                   | `/api/github/projects`                                   | user            | accessible repos with the `swimlane` topic                                                                     |
| GET                   | `/api/github/owners`                                     | user            | self + organisations (for create)                                                                              |
| GET                   | `/api/github/repos`                                      | user            | administered repos not yet marked                                                                              |
| POST                  | `/api/projects` `{mode:"create"\|"mark"}`                | user            | create a seeded repo / mark an existing one                                                                    |
| POST                  | `/api/projects/open` `{owner, repo}`                     | user            | register a marked repo → `projectId`; best-effort creates `preview`                                            |
| GET                   | `…/state`                                                | viewer          | branches, pulls, versions, my role — the UI's feed                                                             |
| GET                   | `…/tree?ref=` · `…/file?branch=&path=`                   | viewer          | listing / read (draft first)                                                                                   |
| GET                   | `…/snapshot?ref=&withDrafts=1` · `…/compare?base=&head=` | viewer          | all diagrams at a ref / changed diagrams with text                                                             |
| GET                   | `…/commits?branch=&page=`                                | viewer          | history                                                                                                        |
| POST · GET · DELETE   | `…/draft`                                                | editor / viewer | autosave writes drafts; GET lists pending changes; DELETE discards (owners may discard leftovers on `preview`) |
| POST                  | `…/checkpoint` `{branch, message?, expectedHeadSha?}`    | editor          | "Push to GitHub" — one commit from drafts, auto file list                                                      |
| POST · GET            | `…/edits` · DELETE `…/edits/[editId]`                    | editor          | cut (server-named) / list / abandon an edit branch                                                             |
| POST · GET            | `…/pulls`                                                | editor          | request review: open (reuse) a PR edit branch → `preview`                                                      |
| GET                   | `…/pulls/[n]`                                            | viewer          | PR + GitHub conversation + changed files                                                                       |
| POST                  | `…/pulls/[n]/comments`                                   | viewer          | comment (as the GitHub user)                                                                                   |
| POST                  | `…/pulls/[n]/merge` · `…/pulls/[n]/close`                | owner / author  | approve (deletes the edit branch) / reject                                                                     |
| POST · GET            | `…/versions`                                             | owner           | legacy: flag the tip of `preview` (or a sha on it)                                                             |
| POST                  | `…/versions/publish` `{name, note?}`                     | owner           | one-step Publish: flag `name` as the tag and promote to `main`                                                 |
| GET                   | `…/versions/[id]/svg?path=`                              | viewer          | one file rendered                                                                                              |
| POST                  | `…/versions/[id]/promote`                                | owner           | legacy: land an already-flagged commit on `main`                                                               |
| PATCH                 | `…/versions/[id]/public` `{public, share_mode?}`         | owner           | share a promoted version's public link on / off                                                                |
| GET/POST/PATCH/DELETE | `…/templates?section=` · GET/PATCH `…/template-policies` | viewer / owner  | section template library + force policy                                                                        |
| GET                   | `…/activity`                                             | viewer          | audit trail                                                                                                    |
| POST                  | `/api/billing/webhook`                                   | Stripe          | updates `workspaces.plan` (deferred)                                                                           |

`…` = `/api/projects/[projectId]`. `GET`/`POST /api/mcp` is the one route with
no signed-in caller — see [MCP server](#mcp-server-apimcp-public-unauthenticated).

GitLab (see the section above; unauthenticated routes below are the OAuth
round trip itself, so they redirect rather than requiring a signed-in caller
via `requireProjectRole`):

| Method     | Route                                | Purpose                                                    |
| ---------- | ------------------------------------ | ---------------------------------------------------------- |
| POST       | `/api/gitlab/instances`              | register an org's instance + OAuth Application (unclaimed) |
| GET        | `/api/gitlab/connect?instanceId=`    | redirect into the instance's OAuth authorize screen        |
| GET        | `/api/gitlab/callback`               | exchange the code, upsert `gitlab_connections`             |
| GET        | `/api/gitlab/namespaces?instanceId=` | the caller's Owner-level groups (claim/create picker)      |
| POST       | `/api/gitlab/instances/[id]/claim`   | bind an unclaimed instance to a new workspace              |
| GET · POST | `/api/gitlab/projects`               | discover `swimlane`-topic projects / create or attach one  |

## MCP server (`/api/mcp`, public, unauthenticated)

`app/api/mcp/route.ts` is an MCP server (`mcp-handler`) whose single purpose is
**letting an LLM write correct kai-swimlane DSL**: learn the grammar, copy a
worked document, check the draft, look at the picture, canonicalise it, and
bring an old file across. It sits outside `middleware.ts`'s auth matcher on
purpose — every tool is a pure function of the text it is handed plus two
read-only bundles, so nothing here reads a secret, opens a connection, or
touches a user's repository. Keep it that way: a tool that would need a token
does not belong on this route.

| Tool              | What it is for                                                                                                                                                                                        |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `get_dsl_syntax`  | The grammar spec by `##` section. No argument → table of contents + "Design invariants" + "Example".                                                                                                  |
| `get_dsl_example` | A complete, parse-clean document. No argument → the catalogue (title, what it is, which constructs it shows); `name` → the full text.                                                                 |
| `validate_dsl`    | Every error and warning, with line numbers. A document with any error does not render.                                                                                                                |
| `render_dsl`      | The SVG, preceded by its pixel size and byte count — "is the picture sane", not "is the text legal". `theme` (`basic`\|`washi`\|`ink`\|`mono`) and `maxBytes` (default 60 000) are optional.          |
| `format_dsl`      | Parse + re-serialise into exactly the layout the editor writes, so a model's output is not a diff the moment a human opens it. Doubles as a round-trip check. Refuses a document that does not parse. |
| `migrate_dsl`     | An older spelling (`@kai-swimlane-v2`, bare `else`, `endif`, `case` under an `if`, a fork's `and`, `[loop]`, `merge:`, `section-start`, `***`, `props:`/`arrow:`/`link:`) rewritten, then validated.  |

Notes:

- **The SVG is returned whole or not at all.** A truncated SVG will not
  display, so past `maxBytes` only the dimensions and diagnostics come back,
  naming the number to pass to get the markup. The largest bundled example
  renders to ~51 kB, which the default covers.
- **`content/` is generated, and gitignored.** `scripts/sync-dsl-rule.mjs`
  (`prebuild`/`predev`) copies the repo-root `dsl-rule.md` and the curated
  examples out of `examples/kai-swimlane/diagrams/` into `content/`, because
  Vercel only traces a function's own app directory into its bundle — reading
  the repo-root originals at request time works in `next dev` and 404s in
  production. `next.config.ts`'s `outputFileTracingIncludes` pins both. The
  script **parses every example and throws** if one stopped being clean: an
  example a model will copy must never ship broken. Edit the originals.
- **`brand/asset-showcase.txt` is deliberately not offered** — its
  `@use ../../assets/…` images only resolve inside a repository, and this
  route has none.
- **The diff renderer (`textDiffToSvg`) is deliberately not exposed.** It
  answers "what changed between two versions", which is a reviewer's question,
  not an author's: a model holding both texts already has better tools for
  that, and it would double the response-size problem for no authoring gain.
- Tool bodies live in `src/lib/dsl-mcp.ts` (unit-tested in
  `dsl-mcp.test.ts`); the route is registration, descriptions and the MCP
  content envelope. `format_dsl` imports the serializer through
  `@swimlane-cloud/editor/serialize` rather than the package barrel — the
  barrel re-exports React components, which Next refuses to pull into a route
  handler's server layer.

## Pages

- `/` landing · `/login` (GitHub only) · `/dashboard` (discovered projects) · `/new`
  (create / mark)
- `/workspaces/new-gitlab` — connect a self-hosted (or gitlab.com) GitLab
  instance: register its OAuth Application, connect, pick a group, then
  create or attach the first project
- `/projects/[id]/edit` — three branch chips (承認済み / 公開済み / 自分の編集)
  instead of a raw branch picker; one primary action at a time (Start
  editing, Push to GitHub, Request review); autosave replaces Save/Save all;
  mobile view
- `/projects/[id]/branches` · `/pulls` (Approve/Reject) · `/versions`
  (Publish) · `/activity` · `/settings/templates` (owners)
- `/billing/[workspaceId]` — plan limits (billing itself is deferred)
- `/p/[slug]` — public share page, no sign-in
