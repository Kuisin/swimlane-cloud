/**
 * Reading diagram files out of a repository at a ref.
 *
 * The diagram tree is whatever `.swimlane.json` says it is (`diagramsRoot`),
 * minus the `templates/` mirror. Everything goes through the Contents API
 * with the raw accept header, so a file over 1 MB does not fall foul of the
 * base64-JSON limit.
 */
import {
  isEditBranch,
  isWithinRoot,
  parseRepoConfig,
  REPO_CONFIG_PATH,
  REPO_SETTINGS_PATH,
  type RepoConfig,
} from "@swimlane-cloud/github-client";
import { ApiError } from "./api";
import { isDiagramFile } from "./diagram-file";
import { isSha } from "./guard";
import { isRepoNotAccessible } from "./repo-errors";
import type { RepoApis } from "./repo-apis";
import { getServiceSupabase } from "./supabase/server";

const TEMPLATES_PREFIX = "templates/";

/** Paths the editor may keep drafts for: diagrams and folder markers. */
export function isDraftablePath(path: string): boolean {
  if (path.startsWith(TEMPLATES_PREFIX)) return false;
  return isDiagramFile(path) || path.endsWith("/.gitkeep") || path === ".gitkeep";
}

/**
 * The repository-wide settings file.
 *
 * Deliberately kept out of `isDraftablePath`, which also gates
 * `files/route.ts` (delete / rmdir / rename): every reader resolves the
 * settings by that exact path, so it must not be renameable or removable from
 * the file tree. Only the draft write path opts it in.
 */
export function isSettingsPath(path: string): boolean {
  return path === REPO_SETTINGS_PATH;
}

/** A folder marker, which `isDraftablePath` admits but nothing renders. */
export function isFolderMarker(path: string): boolean {
  return path.endsWith("/.gitkeep") || path === ".gitkeep";
}

/**
 * Bring a path inside the repository's diagram root.
 *
 * The editor suggests a bare name (`new-1.txt`) when no folder is selected,
 * but the tree only shows what `.swimlane.json` scopes it to. Without this a
 * new file would be committed to the repository root and then filtered out of
 * the very tree that created it — present in git, invisible in the app.
 */
export function withinDiagramsRoot(path: string, config: RepoConfig): string {
  if (!config.diagramsRoot || isWithinRoot(config, path)) return path;
  return `${config.diagramsRoot}/${path.replace(/^\/+/, "")}`;
}

export function isDiagramPath(path: string, config: RepoConfig): boolean {
  return isDiagramFile(path) && !path.startsWith(TEMPLATES_PREFIX) && isWithinRoot(config, path);
}

/**
 * Whether drafts overlay the committed text when reading `ref`.
 *
 * Only an edit branch is ever written, so only an edit branch has drafts
 * worth showing. `main` and `preview` are read exactly as git has them — a
 * reviewer opening preview must see what was approved, not a draft that
 * happens to be parked there — and a commit sha has no drafts at all.
 */
export function draftsApplyTo(ref: string): boolean {
  return !isSha(ref) && isEditBranch(ref);
}

/** Text of a file at a ref, or null when it does not exist there. */
export async function readTextAt(ctx: RepoApis, path: string, ref: string): Promise<string | null> {
  return ctx.write.readFile(path, ref);
}

export async function readConfigAt(ctx: RepoApis, ref: string): Promise<RepoConfig> {
  return parseRepoConfig(await readTextAt(ctx, REPO_CONFIG_PATH, ref));
}

/** Resolve a branch name or sha to a commit sha. */
export async function resolveSha(ctx: RepoApis, ref: string): Promise<string> {
  if (isSha(ref)) return ref;
  try {
    return await ctx.write.refSha(ref);
  } catch (err) {
    if (isRepoNotAccessible(err)) {
      throw new ApiError(404, `Branch "${ref}" does not exist.`);
    }
    throw err;
  }
}

/** The directory a folder marker stands for. */
export function folderOfMarker(path: string): string {
  return path.slice(0, -"/.gitkeep".length);
}

/**
 * Diagram paths at a commit, honouring `.swimlane.json`, plus the directories
 * that exist without holding one.
 *
 * Git has no way to store an empty directory, so the editor marks one with a
 * `.gitkeep`. The marker is not a file anybody edits, so it stays out of
 * `files` — but the folder it stands for still has to be listed, or creating a
 * folder appears to do nothing.
 */
export async function listDiagramFiles(
  ctx: RepoApis,
  sha: string,
  config?: RepoConfig,
): Promise<{ files: string[]; folders: string[]; truncated: boolean; config: RepoConfig }> {
  const cfg = config ?? (await readConfigAt(ctx, sha));
  const { entries, truncated } = await ctx.write.listTree(sha, true);
  const blobs = entries.filter((e) => e.type === "blob");
  const files = blobs
    .filter((e) => isDiagramPath(e.path, cfg))
    .map((e) => e.path)
    .sort();
  const folders = blobs
    .filter(
      (e) =>
        e.path.endsWith("/.gitkeep") &&
        !e.path.startsWith(TEMPLATES_PREFIX) &&
        isWithinRoot(cfg, e.path),
    )
    .map((e) => folderOfMarker(e.path))
    .sort();
  return { files, folders, truncated, config: cfg };
}

/** Run `fn` over `items` with at most `concurrency` in flight. */
export async function mapLimit<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i]!);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, worker));
  return out;
}

export const SNAPSHOT_LIMIT = 300;

/** Every diagram's text at a commit. Capped: a folder of hundreds of files is a 413, not a timeout. */
export async function snapshotAt(
  ctx: RepoApis,
  sha: string,
  config?: RepoConfig,
): Promise<{ sha: string; files: Record<string, string>; truncated: boolean }> {
  const { files, truncated } = await listDiagramFiles(ctx, sha, config);
  if (files.length > SNAPSHOT_LIMIT) {
    throw new ApiError(413, `Too many diagrams to snapshot (${files.length} > ${SNAPSHOT_LIMIT}).`);
  }
  const texts = await mapLimit(files, 8, (p) => readTextAt(ctx, p, sha));
  const out: Record<string, string> = {};
  files.forEach((p, i) => {
    if (texts[i] !== null && texts[i] !== undefined) out[p] = texts[i] as string;
  });
  return { sha, files: out, truncated };
}

export interface DraftState {
  /** Pending edits, path → text. */
  writes: Record<string, string>;
  /** Paths pending removal at the next checkpoint. */
  deletions: string[];
  /** `updated_at` per pending edit — the version token the browser caches file text under. */
  updatedAt: Record<string, string>;
  /**
   * The newest `updated_at` across every row loaded (edits and tombstones),
   * or null when there were none. A checkpoint deletes only rows up to this
   * moment, so a draft saved while the commit was in flight survives it.
   */
  latestUpdatedAt: string | null;
}

/** Everything uncommitted on a branch: edits and pending deletions. */
export async function loadDraftState(projectId: string, branch: string): Promise<DraftState> {
  const supabase = getServiceSupabase();
  const { data, error } = await supabase
    .from("drafts")
    .select("filepath, dsl_text, deleted, updated_at")
    .eq("project_id", projectId)
    .eq("branch", branch);
  if (error) throw new ApiError(500, `draft load failed: ${error.message}`);
  const writes: Record<string, string> = {};
  const deletions: string[] = [];
  const updatedAt: Record<string, string> = {};
  let latestUpdatedAt: string | null = null;
  for (const row of data ?? []) {
    const path = row.filepath as string;
    const at = row.updated_at as string;
    if (row.deleted) deletions.push(path);
    else {
      writes[path] = row.dsl_text as string;
      updatedAt[path] = at;
    }
    if (at && (!latestUpdatedAt || at > latestUpdatedAt)) latestUpdatedAt = at;
  }
  return { writes, deletions, updatedAt, latestUpdatedAt };
}

/** Pending edits only, path → text. Deleted paths are excluded. */
export async function loadDrafts(
  projectId: string,
  branch: string,
): Promise<Record<string, string>> {
  return (await loadDraftState(projectId, branch)).writes;
}

/** Whether anything at all is uncommitted on a branch — an edit or a deletion. */
export async function hasPendingDrafts(projectId: string, branch: string): Promise<boolean> {
  const supabase = getServiceSupabase();
  const { count, error } = await supabase
    .from("drafts")
    .select("id", { count: "exact", head: true })
    .eq("project_id", projectId)
    .eq("branch", branch);
  if (error) throw new ApiError(500, `draft load failed: ${error.message}`);
  return (count ?? 0) > 0;
}
