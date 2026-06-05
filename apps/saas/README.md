# @swimlane-cloud/saas

DSL Management SaaS — a Next.js 15 (App Router) app that embeds the shared
`@swimlane-cloud/editor`, stores diagrams in git via **Gitea**, uses **Supabase**
for auth + Postgres (with RLS for tenant isolation), renders canonical **SVG**
server-side on the "new version" flag, deduplicates SVG blobs in **S3**, and
integrates **Stripe** for billing.

This implements **plan PART B Phase 1 + Phase 2** plus the data/infra foundation.
Phases 3–6 are documented stubs (see "Implemented vs stubbed" below).

## Architecture at a glance

- **Editor** is storage-agnostic; the SaaS provides an `EditorHost`
  (`src/lib/saas-host.ts`) that calls the API routes below. The editor is
  mounted in exactly one client component (`app/(app)/projects/[projectId]/EditorMount.tsx`).
- **Gitea** is the invisible git backbone. One bot service account; SaaS users
  never have Gitea accounts. All Gitea calls go through `src/lib/gitea.ts`.
- **SVG** is rendered **only** when a commit on `test` is flagged as a new
  version (`src/lib/svg-blobs.ts`), deduped by sha256 of the DSL.
- **Branch model:** `main` (production / public sharing), `test` (integration;
  SVG on flag), `tmp-*` (active edits, branched from `test`).

## Environment variables

All env is read **lazily inside request handlers** — `next build` runs with **no
env and no network**. Set these in Vercel → Project → Settings → Environment
Variables. Cross-reference the canonical list in
[`../../.env.vercel.example`](../../.env.vercel.example).

| Var | Used by | Notes |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | server + browser Supabase | |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | browser auth, RLS-scoped reads | |
| `SUPABASE_SERVICE_ROLE_KEY` | privileged server ops (provisioning, writes) | never exposed to browser |
| `GITEA_URL` | Gitea client | base URL, e.g. `https://git.yourco.com` |
| `GITEA_ADMIN_TOKEN` | Gitea client | bot service-account token |
| `AWS_REGION` | S3 + SES | |
| `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` | S3 + SES | dedicated IAM user |
| `S3_SVG_BUCKET` | SVG blob storage | e.g. `swimlane-svg-blobs` |
| `SES_FROM_EMAIL` | transactional email (optional / stub) | |
| `STRIPE_SECRET_KEY` | billing webhook | |
| `STRIPE_WEBHOOK_SECRET` | billing webhook signature verification | |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | client checkout (Phase 5) | |
| `APP_URL` / `NEXTAUTH_URL` | absolute URLs | |

Public SVG sharing assumes the `S3_SVG_BUCKET` objects are readable (or fronted
by a CDN); adjust `svgPublicUrl` in `src/lib/svg-blobs.ts` for private buckets.

## Database migrations

SQL lives in `supabase/migrations/`:

- `0001_init.sql` — full schema (workspaces, members, projects, diagrams,
  drafts, svg_blobs, versions, edit_sessions, merge_requests, audit_log,
  notifications, section templates, template policies) with UNIQUE/CHECK
  constraints; enables RLS on tenant-scoped tables.
- `0002_rls_helpers.sql` — `SECURITY DEFINER` membership helpers + RLS policies
  (membership-keyed; service-role key bypasses RLS for server ops).

Apply with the Supabase CLI:

```bash
supabase db push                      # against a linked project
# or run each file via the SQL editor / psql in order (0001 then 0002)
```

## Run

```bash
# from the repo root
pnpm --filter @swimlane-cloud/saas dev      # next dev
pnpm --filter @swimlane-cloud/saas build    # next build (works with no env)
pnpm --filter @swimlane-cloud/saas test     # vitest

# self-verify
pnpm --filter @swimlane-cloud/saas exec tsc --noEmit
pnpm --filter @swimlane-cloud/saas exec next build
```

Provision a workspace (creates Gitea org + repo + branches + seed tree +
templates) with `POST /api/workspaces` while signed in.

## API routes

| Method | Route | Phase |
|---|---|---|
| POST | `/api/workspaces` | 1.3 onboarding |
| GET | `/api/projects/[projectId]/tree?branch=` | 1.1 listing |
| GET | `/api/projects/[projectId]/file?branch=&path=` | 1.1 read (draft-or-git) |
| POST | `/api/projects/[projectId]/draft` | 1.5 draft save |
| POST | `/api/projects/[projectId]/checkpoint` | 1.5 git commit |
| GET | `/api/projects/[projectId]/commits?branch=` | 1.6 history |
| GET/POST/PATCH/DELETE | `/api/projects/[projectId]/templates?section=` | 1.7 |
| GET/PATCH | `/api/projects/[projectId]/template-policies` | 1.7 force policy |
| GET/POST | `/api/diagrams/[id]/versions` | 2.1 flag new version |
| POST | `/api/diagrams/[id]/versions/[versionId]/promote` | 2.2 promote |
| PATCH | `/api/diagrams/[id]/versions/[versionId]/public` | 2.4 public share |
| GET/POST | `/api/projects/[projectId]/edits` | 3.1 start edit (basic) |
| POST | `/api/projects/[projectId]/edits/[editId]/merge-request` | 3.2 merge to test (basic) |
| POST | `/api/billing/webhook` | 5 stub |

## Pages

- `/` — landing
- `/login` — Supabase magic-link sign-in
- `/dashboard` — workspaces/projects list (server, RLS-scoped)
- `/projects/[projectId]` — embedded editor + branch switcher
- `/projects/[projectId]/history` — commits + flagged-version gallery (server SVG)
- `/projects/[projectId]/settings/templates` — template CRUD + force policy
- `/p/[slug]` — public share page (no auth)

## Implemented vs stubbed

- **Implemented:** Phase 1 (1.1–1.7), Phase 2 (2.1–2.4), full data model + RLS,
  Gitea translation layer, SVG dedup, forced-template validation, plus the basic
  Phase 3 start-edit / open-PR endpoints.
- **Stubbed / documented only:** Phase 3 review UI + conflict handling, Phase 4
  (roles enforcement detail, invites, notifications, activity feed UI), Phase 5
  (full Stripe Checkout / Customer Portal — only the webhook skeleton exists),
  Phase 6 (SSO, self-hosted bundle, audit export, public API). The email lib
  (`src/lib/email.ts`) is a working SES stub that no-ops without config.

## Notes / limitations

- The Stripe webhook maps plan tiers from subscription metadata as a placeholder;
  wire real price-ID → plan mapping in Phase 5.
- `multiPathCommit` prefers Gitea's batch `/contents` endpoint and falls back to
  sequential per-file commits on older Gitea versions.
- No extra dependencies were added beyond those already in `package.json`.
