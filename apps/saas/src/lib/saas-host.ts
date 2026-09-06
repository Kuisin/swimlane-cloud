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
 */
import type {
  EditorHost,
  FileRef,
  SectionTemplate,
  TemplatePolicy,
  TemplateSection,
} from "@swimlane-cloud/editor";
import { api } from "./client";
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

export function createSaasHost(opts: SaasHostOptions): EditorHost {
  const { projectId, branch } = opts;
  const base = `/api/projects/${encodeURIComponent(projectId)}`;
  let knownHeadSha: string | null = null;
  // The importing file, so `./` and `../` resolve the way the parser does.
  const activeId = () => opts.activeDocumentId?.() ?? "";

  async function write(files: { id: string; dsl: string }[]) {
    await saveDrafts(projectId, branch, files);
    opts.onDraftSaved?.();
  }

  const host: EditorHost = {
    capabilities: { readOnly: !opts.editable, autosave: opts.editable },

    async root() {
      return `${branch}`;
    },

    async list(): Promise<FileRef[]> {
      const tree = await getTree(projectId, branch);
      if (knownHeadSha && tree.sha !== knownHeadSha) opts.onHeadChange?.(tree.sha);
      knownHeadSha = tree.sha;
      opts.onFileList?.(tree.files);
      return tree.files;
    },

    async read(id) {
      return (await getFile(projectId, branch, id)).dsl;
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

    async create(id, dsl) {
      await write([{ id, dsl }]);
    },

    /** A folder exists once something is in it; the marker is committed with the next checkpoint. */
    async mkdir(dirPath) {
      await write([{ id: `${dirPath.replace(/\/+$/, "")}/.gitkeep`, dsl: "" }]);
    },

    // Deleting and moving are pending like any other edit: the file leaves the
    // tree immediately, and leaves git at the next checkpoint.
    async delete(id) {
      await deleteFile(projectId, branch, id);
      opts.onDraftSaved?.();
    },

    async rmdir(dirPath) {
      await removeFolder(projectId, branch, dirPath.replace(/\/+$/, ""));
      opts.onDraftSaved?.();
    },

    async rename(fromId, toId) {
      await renameFile(projectId, branch, fromId, toId);
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
      knownHeadSha = res.commitSha;
      opts.onCheckpoint?.(res.commitSha);
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
