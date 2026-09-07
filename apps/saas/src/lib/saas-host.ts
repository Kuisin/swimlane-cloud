/**
 * The SaaS `EditorHost`: the shared editor's storage contract, implemented
 * over the project API. The editor never sees GitHub or Supabase; it sees a
 * folder of `.txt` files it can read, save, create and checkpoint.
 *
 * Every writable branch is `autosave: true`, so the editor debounce-saves
 * drafts to Postgres itself; the page's own "Push to GitHub" turns every
 * draft on the branch into one commit via `checkpoint`. `expectedHeadSha` is
 * the head we last listed, so two people pushing the same branch cannot
 * clobber each other — the second gets a 409 and a "branch moved" banner.
 *
 * Navigation is made instant by the local cache (`local-cache.ts`), under
 * one rule: nothing stale is ever shown as current.
 *  - `list()` answers from the last listing at once and reconciles when the
 *    fresh one arrives, telling the editor about files added or removed since
 *    through the same `watch` events a filesystem host would send.
 *  - `read()` waits for a fresh listing, which names the exact version of
 *    every file (commit sha, or a draft's timestamp), and serves cached text
 *    only under that version. A cached text is therefore either exactly
 *    current or not used.
 */
import type {
  EditorHost,
  FileRef,
  SectionTemplate,
  TemplatePolicy,
  TemplateSection,
  WatchEvent,
} from "@swimlane-cloud/editor";
import { api } from "./client";
import { fileVersionIn } from "./file-version";
import { CACHE_KEY, localCache } from "./local-cache";
import type { TreeResponse } from "./types";
import {
  checkpoint as checkpointRequest,
  deleteFile,
  getFile,
  getImport,
  getTree,
  removeFolder,
  renameFile,
  saveDrafts,
} from "./workflow";

export interface SaasHostOptions {
  projectId: string;
  branch: string;
  /** Whether the caller may write to this branch (from ProjectState). */
  editable: boolean;
  /** Fired when the branch tip differs from the last one seen. */
  onHeadChange?: (sha: string) => void;
  /** Fired after any draft write, so the page can show "unsaved" without a round trip. */
  onDraftSaved?: () => void;
  /** Fired after a successful checkpoint. */
  onCheckpoint?: (commitSha: string) => void;
  /** The open file's path, so `@use` targets resolve relative to it. */
  activeDocumentId?: () => string;
  /**
   * Fired with the raw tree listing every time `list()` resolves, so the page
   * can keep a path -> fid map for writing `?fid=` into the URL (the editor's
   * own `FileRef` doesn't carry `fid` — that's a SaaS-only concept).
   */
  onFileList?: (files: { id: string; name: string; fid: string }[]) => void;
}

export interface SaasEditorHost extends EditorHost {
  /**
   * Record a branch tip the page moved by itself (its own push), so the next
   * listing is not reported as "moved by someone else", and so the next read
   * validates against the new commit rather than the one before it.
   */
  noteHead(sha: string): void;
}

/** How long a fresh listing is reused before being fetched again. */
const FRESH_LISTING_MS = 3000;

export function createSaasHost(opts: SaasHostOptions): SaasEditorHost {
  const { projectId, branch } = opts;
  const base = `/api/projects/${encodeURIComponent(projectId)}`;
  const treeKey = CACHE_KEY.tree(projectId, branch);
  let knownHeadSha: string | null = null;
  // The importing file, so `./` and `../` resolve the way the parser does.
  const activeId = () => opts.activeDocumentId?.() ?? "";

  const watchers = new Set<(e: WatchEvent) => void>();
  const emit = (e: WatchEvent) => {
    for (const w of watchers) w(e);
  };

  // The most recent listing straight from the server, reused briefly so a
  // read right after a listing does not fetch the tree a second time.
  let fresh: { tree: TreeResponse; at: number } | null = null;
  let inflight: Promise<TreeResponse> | null = null;

  function fetchTree(): Promise<TreeResponse> {
    if (inflight) return inflight;
    const p = getTree(projectId, branch)
      .then((tree) => {
        fresh = { tree, at: Date.now() };
        localCache.set(treeKey, tree);
        if (knownHeadSha && tree.sha !== knownHeadSha) opts.onHeadChange?.(tree.sha);
        knownHeadSha = tree.sha;
        opts.onFileList?.(tree.files);
        return tree;
      })
      .finally(() => {
        if (inflight === p) inflight = null;
      });
    inflight = p;
    return p;
  }

  /** A listing known to be current: fetched moments ago and nothing written since, else a new one. */
  function currentTree(): Promise<TreeResponse> {
    if (fresh && Date.now() - fresh.at < FRESH_LISTING_MS) return Promise.resolve(fresh.tree);
    return fetchTree();
  }

  /** Anything that changes what a listing would say. */
  function invalidateListing() {
    fresh = null;
  }

  /** Tell the editor which files appeared or disappeared between two listings. */
  function reconcile(before: FileRef[], after: FileRef[]) {
    const was = new Set(before.map((f) => f.id));
    const now = new Set(after.map((f) => f.id));
    for (const id of now) if (!was.has(id)) emit({ id, type: "add", dsl: null });
    for (const id of was) if (!now.has(id)) emit({ id, type: "unlink", dsl: null });
  }

  async function write(files: { id: string; dsl: string }[]) {
    const res = await saveDrafts(projectId, branch, files);
    invalidateListing();
    opts.onDraftSaved?.();
    return res;
  }

  const host: SaasEditorHost = {
    capabilities: { readOnly: !opts.editable, autosave: opts.editable },

    async root() {
      return `${branch}`;
    },

    async list(): Promise<FileRef[]> {
      if (fresh && Date.now() - fresh.at < FRESH_LISTING_MS) return fresh.tree.files;
      const next = fetchTree();
      const cached = localCache.get<TreeResponse>(treeKey);
      if (cached) {
        // Paint the last listing now; when the real one lands, any difference
        // reaches the editor as add/unlink events and it re-lists itself.
        void next.then((tree) => reconcile(cached.value.files, tree.files)).catch(() => {});
        return cached.value.files;
      }
      return (await next).files;
    },

    async read(id) {
      const tree = await currentTree();
      const version = fileVersionIn(tree, id);
      if (version) {
        const hit = localCache.get<string>(CACHE_KEY.file(projectId, id, version));
        if (hit) return hit.value;
      }
      const res = await getFile(projectId, branch, id);
      localCache.set(CACHE_KEY.file(projectId, id, res.version), res.dsl);
      return res.dsl;
    },

    // `@use` targets. The editor reads them here because parsing is
    // synchronous; a failure is null, so a diagram renders without its
    // imports rather than not at all.
    async readImport(path) {
      try {
        return (await getImport(projectId, branch, activeId(), path)).text ?? null;
      } catch {
        return null;
      }
    },

    async readAsset(path) {
      try {
        return (await getImport(projectId, branch, activeId(), path)).dataUri ?? null;
      } catch {
        return null;
      }
    },

    async writeDraft(id, dsl) {
      await write([{ id, dsl }]);
    },

    async writeDraftMany(updates) {
      await write(updates);
    },

    /**
     * Returns the path the file was actually created at. The editor suggests a
     * bare name when no folder is selected, and the server moves it inside the
     * diagram root; handing that path back lets the editor open the real file
     * rather than an in-memory one the tree will never list.
     */
    async create(id, dsl) {
      const res = await write([{ id, dsl }]);
      return res.paths[0] ?? id;
    },

    /** A folder exists once something is in it; the marker is committed with the next checkpoint. */
    async mkdir(dirPath) {
      await write([{ id: `${dirPath.replace(/\/+$/, "")}/.gitkeep`, dsl: "" }]);
    },

    // Deleting and moving are pending like any other edit: the file leaves the
    // tree immediately, and leaves git at the next checkpoint.
    async delete(id) {
      await deleteFile(projectId, branch, id);
      invalidateListing();
      opts.onDraftSaved?.();
    },

    async rmdir(dirPath) {
      await removeFolder(projectId, branch, dirPath.replace(/\/+$/, ""));
      invalidateListing();
      opts.onDraftSaved?.();
    },

    async rename(fromId, toId) {
      await renameFile(projectId, branch, fromId, toId);
      invalidateListing();
      opts.onDraftSaved?.();
    },

    async checkpoint({ message, files }) {
      const res = await checkpointRequest(
        projectId,
        branch,
        message,
        files,
        knownHeadSha ?? undefined,
      );
      host.noteHead(res.commitSha);
      opts.onCheckpoint?.(res.commitSha);
    },

    watch(cb) {
      watchers.add(cb);
      return () => {
        watchers.delete(cb);
      };
    },

    noteHead(sha) {
      knownHeadSha = sha;
      invalidateListing();
    },

    async listSectionTemplates(section: TemplateSection): Promise<SectionTemplate[]> {
      const res = await api<{
        templates: { slug: string; name: string; body: string; is_default: boolean }[];
      }>(`${base}/templates?section=${section}`);
      return res.templates.map((t) => ({
        slug: t.slug,
        name: t.name,
        body: t.body,
        isDefault: t.is_default,
      }));
    },

    async getTemplatePolicies(): Promise<Record<TemplateSection, TemplatePolicy>> {
      const res = await api<{ policies: Record<TemplateSection, TemplatePolicy> }>(
        `${base}/template-policies`,
      );
      return res.policies;
    },
  };

  return host;
}
