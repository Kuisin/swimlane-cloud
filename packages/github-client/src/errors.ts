/**
 * Error taxonomy shared by all three transports (REST, git protocol, raw CDN).
 *
 * The point of normalising here is that the three transports report the same
 * condition differently. Most importantly: asking anonymously about a private
 * repo yields `404` from `api.github.com` (GitHub deliberately hides existence)
 * but `401 www-authenticate: Basic realm="GitHub"` from `github.com`'s git
 * endpoints. Callers should not have to know which transport ran, so both
 * become `GitHubNotAccessibleError`.
 */

export class GitHubError extends Error {
  readonly status: number | null;
  readonly url: string;

  constructor(message: string, opts: { status?: number | null; url?: string } = {}) {
    super(message);
    this.name = new.target.name;
    this.status = opts.status ?? null;
    this.url = opts.url ?? "";
  }
}

/** Repo/path is private, gone, or never existed — indistinguishable by design. */
export class GitHubNotAccessibleError extends GitHubError {
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

/** Primary (documented, header-reported) or secondary (undocumented) rate limit. */
export class GitHubRateLimitError extends GitHubError {
  readonly resetAt: Date | null;
  readonly remaining: number | null;
  /** Secondary/abuse limits carry no x-ratelimit-* headers, only Retry-After. */
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

/**
 * Org enforces SAML SSO and this token has not been authorised for it. Carries
 * the authorize URL, without which a bare 403 is unexplainable to the user.
 */
export class GitHubSsoError extends GitHubError {
  readonly organizations: string[];
  readonly authorizeUrl: string | null;

  constructor(
    message: string,
    opts: {
      status?: number | null;
      url?: string;
      organizations?: string[];
      authorizeUrl?: string | null;
    } = {},
  ) {
    super(message, opts);
    this.organizations = opts.organizations ?? [];
    this.authorizeUrl = opts.authorizeUrl ?? null;
  }
}

/** Optimistic-concurrency failure: the ref moved under us. */
export class GitHubConflictError extends GitHubError {}

/** Malformed response — truncated pkt-line, unparseable JSON, wrong content type. */
export class GitHubProtocolError extends GitHubError {}
