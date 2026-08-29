/**
 * Input guards.
 *
 * A stateless app that fetches any path of any repo is, without these, an
 * unauthenticated raw.githubusercontent proxy running on our bandwidth. None of
 * this is about trusting GitHub; it is about bounding what a stranger can make
 * this deployment do.
 */

const OWNER_RE = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/;
const REPO_RE = /^[A-Za-z0-9._-]{1,100}$/;
const SHA_RE = /^[0-9a-f]{40}$/;
/** Git forbids these in ref names; the rest of the charset is wide open. */
const REF_RE = /^(?!-)(?!.*\.\.)(?!.*[~^:?*[\\\x00-\x20\x7f])[^/].{0,254}$/;

export class BadRequestError extends Error {}

export function assertOwnerRepo(owner: string, repo: string): void {
  if (!OWNER_RE.test(owner)) throw new BadRequestError(`Invalid owner "${owner}".`);
  if (!REPO_RE.test(repo)) throw new BadRequestError(`Invalid repository "${repo}".`);
}

export function assertSha(sha: string): void {
  if (!SHA_RE.test(sha)) throw new BadRequestError("Expected a 40-character commit sha.");
}

export function assertRef(ref: string): void {
  if (!REF_RE.test(ref) || ref.endsWith(".lock"))
    throw new BadRequestError(`Invalid ref "${ref}".`);
}

/**
 * Only `.txt` is servable. The DSL lives in `.txt` files by definition, so this
 * costs nothing and stops the app being pointed at arbitrary repo content.
 */
export function assertDiagramPath(segments: string[]): string {
  if (segments.length === 0) throw new BadRequestError("No file path given.");
  const path = segments.join("/");
  if (path.length > 512) throw new BadRequestError("Path is too long.");
  if (segments.some((s) => s === "" || s === "." || s === ".." || s.includes("\\"))) {
    throw new BadRequestError(`Invalid path "${path}".`);
  }
  if (!path.toLowerCase().endsWith(".txt")) {
    throw new BadRequestError("Only .txt diagram sources can be viewed.");
  }
  return path;
}

/**
 * Optional owner allowlist. Unset means open, which is the intended public
 * behaviour; set it on a deployment that should only serve its own org.
 */
export function assertOwnerAllowed(owner: string): void {
  const allow = process.env.HUB_ALLOWED_OWNERS;
  if (!allow) return;
  const allowed = allow
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  if (!allowed.includes(owner.toLowerCase())) {
    throw new BadRequestError(`This deployment does not serve diagrams from "${owner}".`);
  }
}
