# @swimlane-cloud/share

Minimal diagram-sharing site. Drop kai-swimlane `.txt` files into
[`content/`](./content), organize them with folders, and share individual
files or whole folders via unguessable tokened URLs. Anyone with a link can
view the diagram as the rendered SVG or as the mobile card view, with a
switch to change mode (mobile is the default on phones).

## How it works

- `content/**/*.txt` are the diagrams. Folders are just folders.
- Every file gets `/d/<token>`, every folder gets `/f/<token>`, where
  `token = base64url(HMAC-SHA256(SHARE_TOKEN_SECRET, "<kind>:<path>"))`.
  Tokens are stable across deploys (same secret + same path = same link) but
  unpredictable without the secret. Renaming or moving a file changes its link.
- A folder link lists every diagram in that folder (including subfolders) with
  a file picker.
- Nothing is enumerable publicly: the landing page lists nothing and the
  viewer pages are `noindex`.

## Getting your links

- **Deployed:** open `/links?key=<SHARE_TOKEN_SECRET>` — an owner-only index
  of every share URL.
- **Locally:** `pnpm --filter @swimlane-cloud/share links https://your-site.vercel.app`

## Setup

```bash
pnpm install
SHARE_TOKEN_SECRET=some-long-random-string pnpm --filter @swimlane-cloud/share dev
```

Without `SHARE_TOKEN_SECRET` the app falls back to predictable dev tokens
(`/links?key=dev`) and warns; set a real secret before sharing anything.

## Deploy (Vercel)

Create a Vercel project with **Root Directory = `apps/share`** on this repo
(framework auto-detects Next.js; pnpm workspace deps are picked up from the
repo root). Set the `SHARE_TOKEN_SECRET` environment variable. Adding or
changing diagrams is just a git push to `content/`.
