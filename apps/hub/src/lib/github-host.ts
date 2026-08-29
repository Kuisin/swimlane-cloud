/**
 * EditorHost over a GitHub repository.
 *
 * Shaped after `apps/saas/src/lib/saas-host.ts` — same factory, same contract
 * (`packages/editor/src/host.js:37-54`) — but with one structural difference
 * that matters: the SaaS keeps drafts in a `diagram_drafts` table, and this app
 * has no database at all. Drafts therefore live in the browser's localStorage
 * and only become git objects at checkpoint.
 *
 * That is also why `writeDraft` cannot follow `apps/web/src/browser-host.js`,
 * which writes straight into its canonical store: here the canonical store is a
 * remote git repo, so drafts must be a genuinely separate layer that survives a
 * reload but never silently becomes a commit.
 */

import type { EditorHost, FileRef } from "@/lib/editor-host";

const DRAFT_PREFIX = "sw-hub:draft";

export interface GitHubHostOptions {
  owner: string;
  repo: string;
  branch: string;
  /** Notified when the tracked branch head moves, so the UI can warn. */
  onHeadChange?: (sha: string) => void;
}

interface ApiError extends Error {
  status?: number;
  needsAuth?: boolean;
  conflict?: boolean;
  authorizeUrl?: string | null;
}

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    const err = new Error((body.error as string) ?? `Request failed (${res.status})`) as ApiError;
    err.status = res.status;
    err.needsAuth = Boolean(body.needsAuth);
    err.conflict = Boolean(body.conflict);
    err.authorizeUrl = (body.authorizeUrl as string | null) ?? null;
    throw err;
  }
  return res.status === 204 ? (undefined as T) : ((await res.json()) as T);
}

export function createGitHubHost(opts: GitHubHostOptions): EditorHost {
  const { owner, repo, branch } = opts;
  const base = `/api/repo/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`;
  const draftKey = (id: string) => `${DRAFT_PREFIX}:${owner}/${repo}/${branch}/${id}`;

  /** The head we last saw, so a checkpoint can detect a concurrent commit. */
  let knownHeadSha: string | null = null;

  function readDraft(id: string): string | null {
    try {
      return localStorage.getItem(draftKey(id));
    } catch {
      return null;
    }
  }

  function saveDraft(id: string, dsl: string): void {
    try {
      localStorage.setItem(draftKey(id), dsl);
    } catch {
      // Quota exhausted or storage disabled. Losing the draft cache is
      // survivable; failing the keystroke that triggered it is not.
    }
  }

  function clearDrafts(ids: string[]): void {
    try {
      for (const id of ids) localStorage.removeItem(draftKey(id));
    } catch {
      /* nothing to clean up */
    }
  }

  function draftIds(): string[] {
    const prefix = `${DRAFT_PREFIX}:${owner}/${repo}/${branch}/`;
    const out: string[] = [];
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key?.startsWith(prefix)) out.push(key.slice(prefix.length));
      }
    } catch {
      /* storage unavailable */
    }
    return out;
  }

  return {
    capabilities: { readOnly: false, versioning: true },

    async root() {
      return `${owner}/${repo}@${branch}`;
    },

    async list(): Promise<FileRef[]> {
      const data = await api<{ files: FileRef[]; sha: string }>(
        `${base}/tree?branch=${encodeURIComponent(branch)}`,
      );
      if (data.sha !== knownHeadSha) {
        knownHeadSha = data.sha;
        opts.onHeadChange?.(data.sha);
      }
      // Locally-created files exist only as drafts until the first checkpoint,
      // so surface them in the tree or the user cannot reopen what they made.
      const known = new Set(data.files.map((f) => f.id));
      const pending = draftIds()
        .filter((id) => !known.has(id))
        .map((id) => ({ id, name: id }));
      return [...data.files, ...pending];
    },

    async read(id: string): Promise<string> {
      const draft = readDraft(id);
      if (draft !== null) return draft;
      const data = await api<{ dsl: string }>(
        `${base}/file?branch=${encodeURIComponent(branch)}&path=${encodeURIComponent(id)}`,
      );
      return data.dsl;
    },

    async writeDraft(id: string, dsl: string) {
      saveDraft(id, dsl);
    },

    async writeDraftMany(updates) {
      for (const u of updates) saveDraft(u.id, u.dsl);
    },

    async create(id: string, dsl: string) {
      // New file = a draft. It lands in git at the next checkpoint, exactly as
      // saas-host.ts:116-122 does.
      saveDraft(id, dsl);
    },

    async mkdir(dirPath: string) {
      // Git has no empty directories; a placeholder gives the folder something
      // to exist as, same as saas-host.ts:124-131.
      saveDraft(`${dirPath.replace(/\/+$/, "")}/.gitkeep`, "");
    },

    async delete(id: string) {
      clearDrafts([id]);
      throw new Error(
        "Deleting a committed file from the browser is not supported yet — delete it on the branch in GitHub.",
      );
    },

    async checkpoint({ message, files } = {}) {
      // The editor only sends dirty documents. Anything else the user created
      // or edited earlier in this session is still sitting in localStorage, and
      // a checkpoint should include it.
      const staged = new Map<string, string>();
      for (const id of draftIds()) {
        const dsl = readDraft(id);
        if (dsl !== null) staged.set(id, dsl);
      }
      for (const f of files ?? []) staged.set(f.id, f.dsl);

      if (staged.size === 0) throw new Error("Nothing to checkpoint.");

      const payload = [...staged].map(([id, dsl]) => ({ id, dsl }));
      const res = await api<{ commitSha: string }>(`${base}/checkpoint`, {
        method: "POST",
        body: JSON.stringify({
          branch,
          message,
          files: payload,
          ...(knownHeadSha ? { expectedHeadSha: knownHeadSha } : {}),
        }),
      });

      knownHeadSha = res.commitSha;
      clearDrafts([...staged.keys()]);
    },

    async flagNewVersion(_commitSha: string, { name }) {
      // The editor passes the literal string "HEAD" (dsl-editor.jsx:288), never
      // a real sha, so the argument is deliberately ignored: the server tags the
      // tip of the production branch, which is the only thing a release may be.
      await api(`${base}/release`, { method: "POST", body: JSON.stringify({ tag: name, name }) });
    },
  };
}
