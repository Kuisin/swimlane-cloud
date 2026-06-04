/**
 * Typed client over the Gitea REST API (`${GITEA_URL}/api/v1`).
 *
 * All calls authenticate with the bot service-account token
 * (`Authorization: token ${GITEA_ADMIN_TOKEN}`). There is exactly one Gitea
 * account (the bot); SaaS users never have Gitea accounts.
 *
 * The client is constructed lazily inside request handlers (never at module
 * top-level) so `next build` with no env / no network does not fail.
 */
import { ApiError } from "./api";

export interface GiteaConfig {
  url: string;
  token: string;
}

function loadConfig(): GiteaConfig {
  const url = process.env.GITEA_URL;
  const token = process.env.GITEA_ADMIN_TOKEN;
  if (!url || !token) {
    throw new ApiError(
      500,
      "Gitea is not configured (GITEA_URL / GITEA_ADMIN_TOKEN missing).",
    );
  }
  return { url: url.replace(/\/+$/, ""), token };
}

export interface TreeEntry {
  path: string;
  type: "blob" | "tree" | "commit";
  sha: string;
  size?: number;
}

export interface ContentFile {
  content: string; // base64
  sha: string;
  path: string;
  encoding: string;
}

export interface CommitListItem {
  sha: string;
  message: string;
  author: string;
  authorEmail?: string;
  date: string;
}

export interface GitActor {
  name: string;
  email: string;
}

function encodeBase64(text: string): string {
  return Buffer.from(text, "utf8").toString("base64");
}

export function decodeBase64(b64: string): string {
  return Buffer.from(b64, "base64").toString("utf8");
}

export class GiteaClient {
  private cfg: GiteaConfig;

  constructor(cfg?: GiteaConfig) {
    this.cfg = cfg ?? loadConfig();
  }

  private async request<T>(
    path: string,
    init: RequestInit & { rawBody?: unknown } = {},
  ): Promise<T> {
    const { rawBody, ...rest } = init;
    const res = await fetch(`${this.cfg.url}/api/v1${path}`, {
      ...rest,
      headers: {
        Authorization: `token ${this.cfg.token}`,
        "Content-Type": "application/json",
        Accept: "application/json",
        ...(rest.headers ?? {}),
      },
      body: rawBody !== undefined ? JSON.stringify(rawBody) : rest.body,
      // Gitea is a self-hosted server; never cache.
      cache: "no-store",
    });

    if (!res.ok) {
      let detail = "";
      try {
        detail = await res.text();
      } catch {
        /* ignore */
      }
      // Bubble up conflicts so callers can prompt "Reload latest?".
      throw new ApiError(
        res.status === 409 ? 409 : res.status >= 500 ? 502 : res.status,
        `Gitea ${rest.method ?? "GET"} ${path} failed (${res.status}): ${detail.slice(0, 500)}`,
      );
    }

    if (res.status === 204) return undefined as T;
    const text = await res.text();
    return (text ? JSON.parse(text) : undefined) as T;
  }

  // ── Org + repo ────────────────────────────────────────────────────────────

  async createOrg(username: string): Promise<void> {
    await this.request("/orgs", {
      method: "POST",
      rawBody: { username, visibility: "private" },
    });
  }

  async createRepo(org: string, name: string): Promise<void> {
    await this.request(`/orgs/${encodeURIComponent(org)}/repos`, {
      method: "POST",
      rawBody: { name, private: true, auto_init: true },
    });
  }

  // ── Branches ────────────────────────────────────────────────────────────────

  async createBranch(
    owner: string,
    repo: string,
    newBranch: string,
    oldBranch: string,
  ): Promise<void> {
    await this.request(`/repos/${owner}/${repo}/branches`, {
      method: "POST",
      rawBody: { new_branch_name: newBranch, old_branch_name: oldBranch },
    });
  }

  async branchExists(
    owner: string,
    repo: string,
    branch: string,
  ): Promise<boolean> {
    try {
      await this.request(
        `/repos/${owner}/${repo}/branches/${encodeURIComponent(branch)}`,
      );
      return true;
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) return false;
      throw err;
    }
  }

  /** Ensure a branch exists, creating it from `from` if absent. */
  async ensureBranch(
    owner: string,
    repo: string,
    branch: string,
    from: string,
  ): Promise<void> {
    if (!(await this.branchExists(owner, repo, branch))) {
      await this.createBranch(owner, repo, branch, from);
    }
  }

  // ── Tree / file reads ────────────────────────────────────────────────────────

  /** Recursive tree at a ref (branch or sha); optionally filter by extension. */
  async listTree(
    owner: string,
    repo: string,
    ref: string,
    opts: { ext?: string } = {},
  ): Promise<TreeEntry[]> {
    const data = await this.request<{ tree?: TreeEntry[] }>(
      `/repos/${owner}/${repo}/git/trees/${encodeURIComponent(ref)}?recursive=1`,
    );
    const entries = (data.tree ?? []).filter((e) => e.type === "blob");
    if (opts.ext) {
      return entries.filter((e) => e.path.endsWith(opts.ext!));
    }
    return entries;
  }

  /** Read a single file's metadata + base64 content at a ref. */
  async readFile(
    owner: string,
    repo: string,
    path: string,
    ref: string,
  ): Promise<ContentFile> {
    return this.request<ContentFile>(
      `/repos/${owner}/${repo}/contents/${encodePath(path)}?ref=${encodeURIComponent(ref)}`,
    );
  }

  /** Read a file's decoded UTF-8 text at a ref. */
  async readFileText(
    owner: string,
    repo: string,
    path: string,
    ref: string,
  ): Promise<string> {
    const file = await this.readFile(owner, repo, path, ref);
    return decodeBase64(file.content);
  }

  /** Returns the blob sha for a path on a branch, or null if not present. */
  private async getFileSha(
    owner: string,
    repo: string,
    path: string,
    ref: string,
  ): Promise<string | null> {
    try {
      const file = await this.readFile(owner, repo, path, ref);
      return file.sha;
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) return null;
      throw err;
    }
  }

  // ── File writes ──────────────────────────────────────────────────────────────

  /**
   * Create or update one file on a branch. Looks up the current sha when
   * absent so the same call handles both create and update.
   */
  async upsertFile(
    owner: string,
    repo: string,
    path: string,
    text: string,
    branch: string,
    opts: { message: string; sha?: string | null; author?: GitActor } = {
      message: "Update",
    },
  ): Promise<{ commitSha: string }> {
    const sha =
      opts.sha === undefined
        ? await this.getFileSha(owner, repo, path, branch)
        : opts.sha;

    const body: Record<string, unknown> = {
      message: opts.message,
      content: encodeBase64(text),
      branch,
    };
    if (sha) body.sha = sha;
    if (opts.author) {
      body.author = opts.author;
      body.committer = opts.author;
    }

    const result = await this.request<{ commit?: { sha?: string } }>(
      `/repos/${owner}/${repo}/contents/${encodePath(path)}`,
      { method: sha ? "PUT" : "POST", rawBody: body },
    );
    return { commitSha: result.commit?.sha ?? "" };
  }

  /**
   * Commit several paths sharing one message (folder-level checkpoint). Uses
   * the Gitea "change files" batch endpoint when available, otherwise falls
   * back to sequential per-file commits with the same message.
   */
  async multiPathCommit(
    owner: string,
    repo: string,
    files: { path: string; text: string }[],
    branch: string,
    message: string,
    author?: GitActor,
  ): Promise<{ commitSha: string }> {
    if (files.length === 0) return { commitSha: "" };

    // Preferred: single atomic commit via /contents (batch) endpoint.
    try {
      const operations = await Promise.all(
        files.map(async (f) => {
          const sha = await this.getFileSha(owner, repo, f.path, branch);
          return {
            operation: sha ? "update" : "create",
            path: f.path,
            content: encodeBase64(f.text),
            sha: sha ?? undefined,
          };
        }),
      );
      const body: Record<string, unknown> = { branch, message, files: operations };
      if (author) {
        body.author = author;
        body.committer = author;
      }
      const result = await this.request<{ commit?: { sha?: string } }>(
        `/repos/${owner}/${repo}/contents`,
        { method: "POST", rawBody: body },
      );
      return { commitSha: result.commit?.sha ?? "" };
    } catch (err) {
      // Older Gitea may lack the batch endpoint — fall back to sequential.
      if (err instanceof ApiError && (err.status === 404 || err.status === 405)) {
        let last = "";
        for (const f of files) {
          const { commitSha } = await this.upsertFile(
            owner,
            repo,
            f.path,
            f.text,
            branch,
            { message, author },
          );
          last = commitSha;
        }
        return { commitSha: last };
      }
      throw err;
    }
  }

  // ── Tags / PRs / merge / history ──────────────────────────────────────────────

  async createTag(
    owner: string,
    repo: string,
    tagName: string,
    target: string,
    message?: string,
  ): Promise<void> {
    await this.request(`/repos/${owner}/${repo}/tags`, {
      method: "POST",
      rawBody: { tag_name: tagName, target, message: message ?? "" },
    });
  }

  async createPullRequest(
    owner: string,
    repo: string,
    opts: { title: string; body?: string; head: string; base: string },
  ): Promise<{ number: number }> {
    const pr = await this.request<{ number: number }>(
      `/repos/${owner}/${repo}/pulls`,
      {
        method: "POST",
        rawBody: {
          title: opts.title,
          body: opts.body ?? "",
          head: opts.head,
          base: opts.base,
        },
      },
    );
    return { number: pr.number };
  }

  async mergePullRequest(
    owner: string,
    repo: string,
    index: number,
    style: "merge" | "rebase" | "squash" = "merge",
  ): Promise<void> {
    await this.request(`/repos/${owner}/${repo}/pulls/${index}/merge`, {
      method: "POST",
      rawBody: { Do: style },
    });
  }

  async listCommits(
    owner: string,
    repo: string,
    branch: string,
    opts: { limit?: number; page?: number } = {},
  ): Promise<CommitListItem[]> {
    const limit = opts.limit ?? 30;
    const page = opts.page ?? 1;
    const raw = await this.request<
      Array<{
        sha: string;
        commit?: {
          message?: string;
          author?: { name?: string; email?: string; date?: string };
        };
      }>
    >(
      `/repos/${owner}/${repo}/commits?sha=${encodeURIComponent(branch)}&limit=${limit}&page=${page}`,
    );
    return raw.map((c) => ({
      sha: c.sha,
      message: c.commit?.message ?? "",
      author: c.commit?.author?.name ?? "unknown",
      authorEmail: c.commit?.author?.email,
      date: c.commit?.author?.date ?? "",
    }));
  }

  /** Which branches currently contain a given commit (used to verify on-main). */
  async commitOnBranch(
    owner: string,
    repo: string,
    branch: string,
    sha: string,
  ): Promise<boolean> {
    try {
      const commits = await this.listCommits(owner, repo, branch, { limit: 50 });
      return commits.some((c) => c.sha === sha);
    } catch {
      return false;
    }
  }
}

/** Encode a repo path while preserving "/" separators. */
function encodePath(p: string): string {
  return p
    .split("/")
    .map((seg) => encodeURIComponent(seg))
    .join("/");
}

/** Factory used by route handlers (lazy config). */
export function getGitea(): GiteaClient {
  return new GiteaClient();
}
