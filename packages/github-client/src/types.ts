/**
 * Shared types. Deliberately free of any `next` or `vscode` import: this
 * package is consumed by a Next server and by a VS Code extension host, and
 * must not drag either one's types into the other's build.
 */

/** A `fetch` the caller supplies. The only injection point for caching, proxies and auth transport. */
export type FetchImpl = (input: string, init?: RequestInit) => Promise<Response>;

export type TokenGetter = (opts?: {
  forceRefresh?: boolean;
}) => string | null | Promise<string | null>;

/**
 * Conditional-request store. A `304` costs no REST quota, which makes this the
 * single biggest lever on the 5,000/hr authenticated budget. The VS Code
 * extension backs it with `context.globalState`; the stateless hub passes
 * nothing and relies on its own HTTP cache instead.
 */
export interface EtagStore {
  get(key: string): string | null | undefined | Promise<string | null | undefined>;
  set(key: string, etag: string): void | Promise<void>;
}

export interface RepoRef {
  owner: string;
  repo: string;
}

export type RefKind = "branch" | "tag" | "sha";

export interface ResolvedRef {
  /** Always a 40-char commit sha. Annotated tags are peeled to their commit. */
  sha: string;
  kind: RefKind;
  /** The name as given (`main`, `v1.2.0`), or the sha when the input was one. */
  name: string;
}

export interface RefEntry {
  /** Full ref name, e.g. `refs/heads/main`. */
  ref: string;
  /** Short name, e.g. `main`. */
  name: string;
  /** Object the ref points at — a tag object for annotated tags. */
  sha: string;
  /** For annotated tags, the commit the tag object peels to. */
  peeled?: string;
}

export interface FileBlob {
  text: string;
  /** The commit sha the content was read at, not the blob sha. */
  at: string;
  path: string;
}

export interface TreeEntry {
  path: string;
  type: "blob" | "tree" | "commit";
  sha: string;
  size?: number;
}

export interface RateLimitSnapshot {
  limit: number | null;
  remaining: number | null;
  used: number | null;
  resetAt: Date | null;
  /** Set when the last call went somewhere that reports no quota headers. */
  offQuota: boolean;
}

/**
 * The narrow surface both read strategies implement. Kept to four methods on
 * purpose: anonymous reads go over the git protocol plus the raw CDN (zero REST
 * quota, measured), authenticated reads go over REST. Widening this interface
 * means implementing every method twice, so callers needing transport-specific
 * behaviour import `./rest` directly instead.
 */
export interface RepoReader {
  /** Resolved from `HEAD`'s symref target — never hardcoded to `main`. */
  defaultBranch(): Promise<string>;
  resolveRef(ref: string): Promise<ResolvedRef>;
  readFile(path: string, at: string): Promise<FileBlob | null>;
  listTags(): Promise<RefEntry[]>;
}
