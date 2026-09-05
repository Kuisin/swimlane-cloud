/**
 * Input guards for anything that becomes part of a GitHub URL or a git ref.
 * Ported from `apps/hub/src/lib/guard.ts`; here they throw `ApiError` so the
 * route wrapper maps them to 400 without a second error class.
 */
import { ApiError } from "./api";

const OWNER_RE = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/;
const REPO_RE = /^[A-Za-z0-9._-]{1,100}$/;
const SHA_RE = /^[0-9a-f]{40}$/;
/** Git forbids these in ref names; the rest of the charset is wide open. */
const REF_RE = /^(?!-)(?!.*\.\.)(?!.*[~^:?*[\\\x00-\x20\x7f])[^/].{0,254}$/;

export function assertOwnerRepo(owner: string, repo: string): void {
  if (!OWNER_RE.test(owner)) throw new ApiError(400, `Invalid owner "${owner}".`);
  if (!REPO_RE.test(repo)) throw new ApiError(400, `Invalid repository "${repo}".`);
}

export function isSha(value: string): boolean {
  return SHA_RE.test(value);
}

export function assertSha(sha: string): void {
  if (!SHA_RE.test(sha)) throw new ApiError(400, "Expected a 40-character commit sha.");
}

export function assertRef(ref: string): void {
  if (!REF_RE.test(ref) || ref.endsWith(".lock")) throw new ApiError(400, `Invalid ref "${ref}".`);
}

/**
 * A repo-relative POSIX path to a `.txt` diagram. The DSL lives in `.txt` by
 * definition, so restricting to it costs nothing and keeps the API from being
 * pointed at arbitrary repository content.
 */
export function assertDiagramPath(path: string): string {
  const segments = path.split("/");
  if (path.length === 0) throw new ApiError(400, "No file path given.");
  if (path.length > 512) throw new ApiError(400, "Path is too long.");
  if (segments.some((s) => s === "" || s === "." || s === ".." || s.includes("\\"))) {
    throw new ApiError(400, `Invalid path "${path}".`);
  }
  if (!path.toLowerCase().endsWith(".txt")) {
    throw new ApiError(400, "Only .txt diagram sources can be edited.");
  }
  return path;
}

/** Any repo-relative path (folders, `.gitkeep`, templates) — traversal-safe, not extension-checked. */
export function assertRepoPath(path: string): string {
  const segments = path.split("/");
  if (path.length === 0) throw new ApiError(400, "No path given.");
  if (path.length > 512) throw new ApiError(400, "Path is too long.");
  if (segments.some((s) => s === "" || s === "." || s === ".." || s.includes("\\"))) {
    throw new ApiError(400, `Invalid path "${path}".`);
  }
  return path;
}

export function parsePullNumber(value: string): number {
  const n = Number(value);
  if (!Number.isInteger(n) || n <= 0) throw new ApiError(400, "Invalid pull request number");
  return n;
}
