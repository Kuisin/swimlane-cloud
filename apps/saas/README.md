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
  published (公開済み) and never edited in place; `preview` is the integration
  line, owners only; work happens on edit branches named
  `<login>/<timestamp>/<key>`, cut automatically when someone clicks
  **Start editing** — never named by hand. An edit branch with an open pull
  request is locked until it is merged or closed. A handful of repositories
  seeded before this model existed still carry a legacy `test` branch or
  `tmp-*` edit branches; both are recognised (`isEditBranch`) and left alone
  rather than migrated.
- **Autosave, then an explicit Push.** Every keystroke debounce-saves to a
  `drafts` row in Postgres (`packages/editor`'s `capabilities.autosave`,
  mirrored to `localStorage` too so a closed tab loses nothing). **Push to
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
- **Public sharing** (`/p/[slug]`) reads Postgres only. `svg_only` links never
  send the DSL to the browser.
- **Database access.** RLS is enabled on every table with no policies; the
  service-role client in API routes is the only path in, always after the
  GitHub permission check. `github_connections` additionally revokes the
  ciphertext column from client keys.

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

| Method                | Route                                                    | Role            | Purpose                                                             |
| --------------------- | -------------------------------------------------------- | --------------- | ------------------------------------------------------------------- |
| GET                   | `/api/me`                                                | user            | who is signed in, GitHub connected?                                 |
| POST                  | `/api/auth/signout`                                      | user            | sign out                                                            |
| GET                   | `/api/github/projects`                                   | user            | accessible repos with the `swimlane` topic                          |
| GET                   | `/api/github/owners`                                     | user            | self + organisations (for create)                                   |
| GET                   | `/api/github/repos`                                      | user            | administered repos not yet marked                                   |
| POST                  | `/api/projects` `{mode:"create"\|"mark"}`                | user            | create a seeded repo / mark an existing one                         |
| POST                  | `/api/projects/open` `{owner, repo}`                     | user            | register a marked repo → `projectId`; best-effort creates `preview` |
| GET                   | `…/state`                                                | viewer          | branches, pulls, versions, my role — the UI's feed                  |
| GET                   | `…/tree?ref=` · `…/file?branch=&path=`                   | viewer          | listing / read (draft first)                                        |
| GET                   | `…/snapshot?ref=&withDrafts=1` · `…/compare?base=&head=` | viewer          | all diagrams at a ref / changed diagrams with text                  |
| GET                   | `…/commits?branch=&page=`                                | viewer          | history                                                             |
| POST · GET · DELETE   | `…/draft`                                                | editor / viewer | autosave writes drafts; GET lists pending changes; DELETE discards  |
| POST                  | `…/checkpoint` `{branch, message?, expectedHeadSha?}`    | editor          | "Push to GitHub" — one commit from drafts, auto file list           |
| POST · GET            | `…/edits` · DELETE `…/edits/[editId]`                    | editor          | cut (server-named) / list / abandon an edit branch                  |
| POST · GET            | `…/pulls`                                                | editor          | request review: open (reuse) a PR edit branch → `preview`           |
| GET                   | `…/pulls/[n]`                                            | viewer          | PR + GitHub conversation + changed files                            |
| POST                  | `…/pulls/[n]/comments`                                   | viewer          | comment (as the GitHub user)                                        |
| POST                  | `…/pulls/[n]/merge` · `…/pulls/[n]/close`                | owner / author  | approve (deletes the edit branch) / reject                          |
| POST · GET            | `…/versions`                                             | owner           | legacy: flag the tip of `preview` (or a sha on it)                  |
| POST                  | `…/versions/publish` `{name, note?}`                     | owner           | one-step Publish: flag `name` as the tag and promote to `main`      |
| GET                   | `…/versions/[id]/svg?path=`                              | viewer          | one file rendered                                                   |
| POST                  | `…/versions/[id]/promote`                                | owner           | legacy: land an already-flagged commit on `main`                    |
| PATCH                 | `…/versions/[id]/public` `{public, share_mode?}`         | owner           | share a promoted version's public link on / off                     |
| GET/POST/PATCH/DELETE | `…/templates?section=` · GET/PATCH `…/template-policies` | viewer / owner  | section template library + force policy                             |
| GET                   | `…/activity`                                             | viewer          | audit trail                                                         |
| POST                  | `/api/billing/webhook`                                   | Stripe          | updates `workspaces.plan` (deferred)                                |

`…` = `/api/projects/[projectId]`.

## Pages

- `/` landing · `/login` (GitHub only) · `/dashboard` (discovered projects) · `/new`
  (create / mark)
- `/projects/[id]/edit` — three branch chips (承認済み / 公開済み / 自分の編集)
  instead of a raw branch picker; one primary action at a time (Start
  editing, Push to GitHub, Request review); autosave replaces Save/Save all;
  mobile view
- `/projects/[id]/branches` · `/pulls` (Approve/Reject) · `/versions`
  (Publish) · `/activity` · `/settings/templates` (owners)
- `/billing/[workspaceId]` — plan limits (billing itself is deferred)
- `/p/[slug]` — public share page, no sign-in
