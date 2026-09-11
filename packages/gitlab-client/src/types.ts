/**
 * Re-exports of `@swimlane-cloud/github-client`'s provider-agnostic types.
 * `FetchImpl`/`TokenGetter`/`EtagStore`/`RateLimitSnapshot`/`TreeEntry` have
 * zero GitHub-specific fields (verified by reading `github-client/src/types.ts`
 * in full), so this package depends on `github-client` purely for these
 * rather than duplicating ~30 lines of interface — see the plan's "shared
 * types" decision. `RepoRef` (owner/repo strings) is NOT re-exported: a
 * GitLab project is addressed by numeric id or `namespace/path`, which is a
 * different enough shape that `repos.ts`/`write.ts` here take a project id
 * directly instead.
 */
export type {
  EtagStore,
  FetchImpl,
  RateLimitSnapshot,
  TokenGetter,
  TreeEntry,
} from "@swimlane-cloud/github-client";
