# @swimlane-cloud/github-client

A GitHub client with two hard rules:

1. **It never imports Next.** `apps/saas`'s Gitea client cannot be reused here — `gitea.ts:11`
   imports `ApiError` from `./api`, and `api.ts:1` imports `next/server`, so every error path drags
   Next in. That is fatal in a VS Code extension host.
2. **It never acquires a token.** The caller injects `getToken`, and injects the `fetch` that carries
   its own caching policy. Caching lives in a ~10-line adapter per app, never in this package.

Those two rules are what let one package serve a Next server (`apps/hub`) and an extension host
(`apps/vscode`). Verified: the esbuild CJS bundle is 28.5 KB with **zero `require()` calls**.

## The rate-limit problem this exists to solve

Unauthenticated GitHub REST allows **60 requests/hour per source IP**. On a server that IP is
_yours_, shared across every anonymous visitor of every repo — a single `revalidate: 60` on one ref
would consume the entire global budget. Anonymous REST is not viable on a hot path at any traffic
level.

Two off-REST transports avoid it entirely. Measured against `facebook/react`:

| Transport                              | Used for                                   | REST quota |
| -------------------------------------- | ------------------------------------------ | ---------- |
| `refs.ts` — git protocol v2 `ls-refs`  | ref discovery, default branch, peeled tags | **0**      |
| `raw.ts` — `raw.githubusercontent.com` | blob reads (public repos only)             | **0**      |
| `rest.ts` — `api.github.com`           | everything authenticated, all writes       | 1/call     |

`pnpm smoke` reproduces the measurement live.

## Choosing a transport

`createRepoReader()` picks one for you, by whether a token is available:

```ts
import { createRepoReader } from "@swimlane-cloud/github-client";

const reader = await createRepoReader({ owner: "facebook", repo: "react" });
const branch = await reader.defaultBranch(); // from HEAD's symref — never hardcoded "main"
const { sha } = await reader.resolveRef(branch);
const blob = await reader.readFile("diagrams/flow.txt", sha);
```

- **No token → `refs` + `raw`.** Zero REST quota. Public repos only.
- **Token → `rest`.** 5,000/hr per user token, and the only path that works for private repos, since
  `raw.githubusercontent.com` accepts no credentials.

The `RepoReader` interface is deliberately four methods wide. Each strategy implements it in ~80
lines; widening it means writing everything twice. Callers needing transport-specific behaviour
(Git Data writes, releases) import `./rest` directly and skip the facade.

## Why protocol v2 rather than `info/refs`

The v1 advertisement is unfiltered. For `facebook/react` it is **1.6 MB / 24,615 pkt-line records**
downloaded to learn one sha. A v2 `ls-refs` with `ref-prefix` filters returns the same information in
**~1-3 KB**, and two capabilities pay for themselves immediately:

- `symrefs` → `HEAD symref-target:refs/heads/main`, so the default branch costs no REST call.
- `peel` → `refs/tags/v19.0.1 peeled:bbed0b0e…`, the commit an annotated tag points at. A tag
  object's own sha is not a commit and cannot be read as a tree, so `/t/{tag}` URLs depend on this.

## Things that are not what they look like

- **`raw.githubusercontent.com` is not immutably cached.** Even at a full 40-char commit sha it
  answers `cache-control: max-age=300`, no `immutable`. The content genuinely cannot change; the CDN
  just won't promise it. Callers wanting long-term caching must do it themselves.
- **`api.github.com/repos/{o}/{r}/…` 301-redirects** to `/repositories/{id}/…`. Per the fetch spec a
  301 on POST is rewritten to GET, so writes use `redirect: "manual"` and re-issue explicitly —
  otherwise "create ref" would silently become a read.
- **404 vs 401.** REST returns `404` for a private repo you cannot see; the git protocol returns
  `401 www-authenticate: Basic`. Both normalise to `GitHubNotAccessibleError`, with `authWouldHelp`
  telling you whether signing in is worth offering.
- **A `304` costs no quota.** Pass an `etagStore` and conditional requests become the largest single
  lever on the authenticated budget. The extension backs it with `context.globalState`; the stateless
  hub passes nothing.

## `branch-model.ts`

The branch rules already exist in `apps/saas`, but only as string literals across
`src/lib/projects.ts:54,66`, `src/lib/demo-workflow.ts`, `edits/route.ts:25` and the guard in
`checkpoint/route.ts:32-34`. With two more apps encoding the same rules, that drift becomes a
correctness problem. This module is the one definition new code imports.

`main` is published (公開済み) and never a direct edit target; `preview` is the integration line
(承認済み); an edit branch is named `<login>/<timestamp>/<key>` (`editBranchName`), never chosen by
hand. `assertMergeTarget` refuses an edit branch → `main` at the client layer, so no app can express
the illegal merge that would put unreviewed work into production and into a public release URL.
A repository seeded before this naming existed may still carry a `test` branch or `tmp-*` edit
branches; `isEditBranch` still recognises the latter, and neither is migrated automatically.

## Development

```
pnpm test        # 82 tests, fully offline — every suite drives an injected fetchImpl
pnpm typecheck   # tsc --noEmit; covers sources AND tests
pnpm smoke       # live, hits real GitHub, asserts zero REST quota consumed
```

`src/__fixtures__/ls-refs-react.bin` is a byte-for-byte capture of a real protocol-v2 response, so
the suite exercises GitHub's actual wire output without touching the network in CI.
