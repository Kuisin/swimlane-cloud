# Working in this repository

## Git flow — never commit to `main` or `dev` directly

`main` is production: Vercel deploys it, and the release workflow tags from it. It is only ever
updated by **the repository owner merging the automated `dev` → `main` pull request**. Nothing else
writes to it.

`dev` is the integration branch. All work lands there, and only through a pull request:

1. **Branch** off `dev` (`git switch -c feat/<slug> dev`). Never work on `dev` or `main` itself.
2. **Commit** to that branch.
3. **Open a pull request into `dev`** (`gh pr create --base dev`), never into `main`.
4. **Merge that pull request into `dev`** once CI is green — this part the agent may do.
5. **Stop there.** `.github/workflows/dev-to-main-pr.yml` opens the `dev` → `main` pull request
   automatically; leave it for the owner to review and merge. Do not merge it, and do not open a
   pull request targeting `main` by hand.

If you are asked to "push" or "ship" a change, that means steps 1–4. Promotion to production is the
owner's decision, not the agent's.

> Not to be confused with the **product's** branch model (`main` / `test` / `tmp-*`), which is what
> `apps/saas` creates inside a _user's_ diagram repository. That is application behaviour, defined in
> `packages/github-client/src/branch-model.ts`; this section is about this repository's own history.

## Checks

CI (`.github/workflows/ci.yml`) runs on every pull request and on pushes to `main` and `dev`:

```bash
pnpm -r test && pnpm -r typecheck && pnpm format:check && pnpm build
```

Run all four locally before opening a pull request. `pnpm build` must pass **with no environment
variables set** — every `process.env` read stays inside a function, so a missing secret is a runtime
error with a clear message, never a failed deploy.
