/**
 * Barrel export. Branch-naming/merge-guard logic and the generic transport
 * types are `@swimlane-cloud/github-client`'s — reused unchanged rather than
 * duplicated, since both have zero GitHub-specific dependencies (see the
 * plan's "shared types" decision).
 */
export {
  assertCheckpointTarget,
  assertMergeTarget,
  editBranchName,
  EDIT_BRANCH_RE,
  formatEditTimestamp,
  INTEGRATION_BRANCH,
  isEditBranch,
  isIntegrationBranch,
  isProdBranch,
  isWritableBranch,
  MergeTargetError,
  PROD_BRANCH,
  randomEditKey,
  slugify,
} from "@swimlane-cloud/github-client/branch-model";

export type { EtagStore, FetchImpl, RateLimitSnapshot, TokenGetter, TreeEntry } from "./types.ts";

export * from "./errors.ts";
export * from "./rest.ts";
export * from "./repos.ts";
export * from "./write.ts";
export * from "./commits.ts";
export * from "./merge-requests.ts";
