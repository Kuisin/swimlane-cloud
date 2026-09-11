/**
 * Error taxonomy for the GitLab REST transport. Mirrors
 * `@swimlane-cloud/github-client`'s `errors.ts` shape (status/url fields, an
 * `instanceof`-discriminated hierarchy) so `apps/saas` can catch either
 * provider's errors through one predicate — see `src/lib/repo-errors.ts`.
 *
 * No SAML-SSO analogue: that error exists only because GitHub enforces
 * org-level SSO on top of a token that is otherwise valid. GitLab has no
 * equivalent split for an OAuth-per-instance token.
 */

export class GitLabError extends Error {
  readonly status: number | null;
  readonly url: string;

  constructor(message: string, opts: { status?: number | null; url?: string } = {}) {
    super(message);
    this.name = new.target.name;
    this.status = opts.status ?? null;
    this.url = opts.url ?? "";
  }
}

/** Project/path is private, gone, or never existed — indistinguishable by design. */
export class GitLabNotAccessibleError extends GitLabError {
  /** True when the transport told us auth would help (401 rather than 404). */
  readonly authWouldHelp: boolean;

  constructor(
    message: string,
    opts: { status?: number | null; url?: string; authWouldHelp?: boolean } = {},
  ) {
    super(message, opts);
    this.authWouldHelp = opts.authWouldHelp ?? false;
  }
}

export class GitLabRateLimitError extends GitLabError {
  readonly resetAt: Date | null;
  readonly remaining: number | null;
  readonly retryAfterSeconds: number | null;

  constructor(
    message: string,
    opts: {
      status?: number | null;
      url?: string;
      resetAt?: Date | null;
      remaining?: number | null;
      retryAfterSeconds?: number | null;
    } = {},
  ) {
    super(message, opts);
    this.resetAt = opts.resetAt ?? null;
    this.remaining = opts.remaining ?? null;
    this.retryAfterSeconds = opts.retryAfterSeconds ?? null;
  }
}

/** Optimistic-concurrency failure: the branch moved under us. */
export class GitLabConflictError extends GitLabError {}

/** Malformed response — unparseable JSON, wrong content type, missing header. */
export class GitLabProtocolError extends GitLabError {}

/**
 * A method that phase 1 deliberately does not implement (merge-request
 * creation/review, releases). Distinct from `GitLabProtocolError` so callers
 * — and `apps/saas`'s central error mapper — can turn this into a clear
 * "not available yet" message instead of a generic failure.
 */
export class GitLabNotImplementedError extends GitLabError {}
