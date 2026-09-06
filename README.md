# Swimlane Cloud

DSL Editor + DSL Management SaaS — two independently shippable products sharing one open-source engine.

See [`plan.md`](plan.md) for full architecture and build order.

---

## Downloads

Built artifacts are published to a **separate public repository**,
[Kuisin/swimlane-downloads](https://github.com/Kuisin/swimlane-downloads). They cannot live here:
release assets from a private repository always require authentication, so a download link from this
repo would 404 for everyone.

**<https://kuisin.github.io/swimlane-downloads/>**

| URL                   | What it is                                                 |
| --------------------- | ---------------------------------------------------------- |
| `/`                   | Latest version, with the visitor's platform surfaced first |
| `/v/<version>/`       | A permanent page for one release                           |
| `/latest/<platform>/` | Stable redirect to the newest build for that platform      |
| `/versions.json`      | Machine-readable manifest                                  |

Download URLs embed their version, so there is no stable filename to hard-code. Scripts should
resolve one from the manifest:

```bash
curl -fsSL https://kuisin.github.io/swimlane-downloads/versions.json \
  | jq -r '.versions[0].assets["mac-arm64"].url'
```

Platform keys: `mac-arm64`, `mac-x64`, `win-x64`, `vsix`.

### Cutting a release

Tag this repository and CI does the rest:

```bash
git tag v0.2.0 && git push origin v0.2.0
```

`.github/workflows/release.yml` builds the macOS dmgs, the Windows installer and the `.vsix`, creates
the release in the downloads repo, and regenerates the Pages site from `versions.json` so every
previous version keeps its page. It needs a `RELEASES_TOKEN` secret — a PAT with `repo` scope on the
downloads repo, since `GITHUB_TOKEN` cannot write across repositories.

To publish from a workstation instead:

```bash
node tools/release/publish.mjs --version 0.2.0 --assets <dir-of-artifacts> [--dry-run]
```

**Desktop builds are ad-hoc signed, not notarized.** `apps/desktop/build/adhoc-sign.cjs` runs as an
`afterPack` hook and re-signs the repackaged bundle. This is not cosmetic: electron-builder rewrites
the app bundle, which invalidates the linker signature Electron's binaries ship with, and a bundle
whose signature no longer matches its contents is reported by macOS as **"the application is damaged
and can't be opened"** — a dialog that right-click → Open cannot bypass. The hook fails the build if
`codesign --verify` does not pass.

Users still see an unidentified-developer prompt (right-click → Open on macOS, More info → Run anyway
on Windows) until the app is signed with an Apple Developer ID and notarized.

## Repository layout

```
packages/
  diagram-converter/   # @swimlane-cloud/diagram-converter (open-source engine, MIT)
  editor/              # @swimlane-cloud/editor — the shared GUI/text editor surface
  github-client/       # zero-dependency GitHub client (REST, git protocol v2, raw CDN)
  gitlab-client/       # zero-dependency GitLab client, for a self-hosted (or gitlab.com) org instance
  mobile-view/         # card-based mobile rendering of a parsed diagram
dsl-rule.md            # kai-swimlane 2 — the DSL specification (version 2 only)
dsl-proposals.md       # the grammar candidates it was chosen from, plus the shared i18n / squash rules
examples/kai-swimlane-2/ # a complete worked example of the DSL and the fragments it imports
apps/
  saas/                # Next.js SaaS: edit diagrams in your GitHub repos (Supabase + GitHub + Vercel);
                       #   a workspace can opt into a self-hosted GitLab instance instead, per org
  hub/                 # stateless viewer/editor for diagrams in any GitHub repo
  share/               # static tokened sharing of a folder of diagrams
  web/                 # standalone editor over browser storage (no backend)
  desktop/             # Electron shell over a local folder
  vscode/              # VS Code extension
.env.vercel.example    # Vercel environment variables for apps/saas
```

---

## Infrastructure overview (apps/saas)

Everything runs in Japan and nothing is self-hosted.

| What                          | Where                                | Region           | Est. cost      |
| ----------------------------- | ------------------------------------ | ---------------- | -------------- |
| Next.js app + API routes      | Vercel (`swimlane-cloud-saas`)       | `hnd1` (Tokyo)   | free → ~$20/mo |
| Auth, Postgres                | Supabase project `swimlane-cloud`    | `ap-northeast-1` | free tier      |
| Git history, PRs, permissions | GitHub — the user's own repositories | —                | free           |
| Billing                       | Stripe (deferred; plan gates only)   | —                | % of revenue   |

How it fits together:

- **Sign-in is GitHub only.** Supabase Auth's GitHub provider asks for the `repo` scope; the
  resulting token is stored AES-256-GCM encrypted in Postgres and every GitHub call runs as that
  user. There is no bot account.
- **Projects are discovered, not registered.** A repository is a project when it carries the
  GitHub topic **`swimlane`**; `.swimlane.json` in the repo says where the diagrams live. The
  dashboard lists every repository the user can access that has the topic.
- **Roles are GitHub permissions.** `admin` → owner, `push` → editor, `pull` → viewer. Nothing to
  invite or manage in the app — add people on GitHub.
- **Postgres holds only what GitHub cannot:** drafts, edit sessions, flagged versions (with a
  DSL snapshot so the public share page never touches GitHub), section templates and an audit
  trail. RLS is enabled with no policies: the API routes are the only way in.
- **No object storage.** SVG is rendered on request from the DSL snapshot; the engine is pure JS.

---

## Deploying apps/saas

### 1 — Supabase (Tokyo)

The project `swimlane-cloud` (`okrcmywyekqwvgdgoexj`, `ap-northeast-1`) already exists. If it is
paused, restore it from the dashboard first.

```bash
supabase login
cd apps/saas
supabase link --project-ref okrcmywyekqwvgdgoexj
supabase migration list        # remote column must be empty the first time
supabase db push               # applies supabase/migrations/0001_init.sql, 0002_rls.sql
```

Then in the dashboard:

1. **Authentication → Providers → GitHub**: enable it with a GitHub OAuth App whose
   _Authorization callback URL_ is `https://okrcmywyekqwvgdgoexj.supabase.co/auth/v1/callback`
   (GitHub → Settings → Developer settings → OAuth Apps → New).
2. **Authentication → URL Configuration**: Site URL = your Vercel production URL; Redirect URLs =
   `https://<prod>/auth/callback`, `https://*-<team>.vercel.app/auth/callback`,
   `http://localhost:3000/auth/callback`.
3. **Project Settings → API**: copy the URL, anon key and service-role key for the next step.

### 2 — Vercel (Tokyo)

`apps/saas/vercel.json` pins functions to `hnd1`. From the repository root:

```bash
vercel link                                   # create project "swimlane-cloud-saas"
# Dashboard → Settings → General → Root Directory = apps/saas
for v in NEXT_PUBLIC_SUPABASE_URL NEXT_PUBLIC_SUPABASE_ANON_KEY SUPABASE_SERVICE_ROLE_KEY \
         TOKEN_ENCRYPTION_KEY NEXT_PUBLIC_APP_URL; do
  vercel env add "$v" production               # repeat with `preview` as needed
done
vercel --prod
```

`TOKEN_ENCRYPTION_KEY` is `openssl rand -hex 32`. See [`.env.vercel.example`](.env.vercel.example)
for every variable. `next build` reads no environment at all, so a missing secret is a runtime
error with a clear message, never a failed deploy.

### 3 — Smoke test

Open the production URL → **Continue with GitHub** → the dashboard lists repositories tagged
`swimlane` → **New project** creates a private repository with `main` and `preview`, a sample
diagram and `.swimlane.json`, or **Mark an existing repository** adds the topic to one you administer.

---

## Local development

```bash
# Requires Node 20+ and pnpm 10
pnpm install
pnpm -r test && pnpm -r typecheck && pnpm format:check && pnpm build   # what CI runs

# SaaS against a local Supabase (needs Docker)
cd apps/saas
supabase start && supabase db reset
# .env.local: NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321, keys from `supabase status`,
# TOKEN_ENCRYPTION_KEY, and a second GitHub OAuth App (callback
# http://127.0.0.1:54321/auth/v1/callback) in SUPABASE_AUTH_EXTERNAL_GITHUB_CLIENT_ID / _SECRET.
pnpm dev:saas
```
