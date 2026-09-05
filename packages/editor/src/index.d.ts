/**
 * Public types for @swimlane-cloud/editor.
 *
 * The package ships plain JSX, so every TypeScript consumer used to restate the
 * contract by hand — `apps/saas/src/lib/saas-host.ts:13-42` is one such copy,
 * and `apps/hub` and `apps/vscode` would have been the third and fourth. This
 * file is the single declaration all of them can import instead.
 *
 * The runtime contract itself is documented as JSDoc on `src/host.js:37-54`;
 * this mirrors it, including the parts the README omits (`delete`, `rmdir`,
 * `rename`).
 */

import type { ComponentType, ReactNode } from "react";

export interface FileRef {
  id: string;
  name: string;
  mtime?: number;
}

export interface WatchEvent {
  id: string;
  dsl: string | null;
  type: "add" | "change" | "unlink";
}

export type TemplateSection = "page" | "option" | "role" | "block" | "prop";

export interface SectionTemplate {
  slug: string;
  name: string;
  body: string;
  isDefault?: boolean;
}

export interface TemplatePolicy {
  mode: "optional" | "default" | "forced";
  forcedTemplateId?: string;
  forcedBody?: string;
}

export interface EditorCapabilities {
  readOnly?: boolean;
  versioning?: boolean;
  /**
   * Debounce-save every change instead of requiring Save / Save all; hides
   * those buttons and Checkpoint / Version in the action bar in favour of a
   * small "saved" status.
   */
  autosave?: boolean;
}

/**
 * Only `list`, `read`, `writeDraft` and `create` are required; everything else
 * is feature-detected at the call site via `hostHas` / `hostSupportsVersioning`.
 */
export interface EditorHost {
  root?(): Promise<string | null>;
  list(): Promise<FileRef[]>;
  read(id: string): Promise<string>;
  writeDraft(id: string, dsl: string): Promise<void>;
  writeDraftMany?(updates: { id: string; dsl: string }[]): Promise<void>;
  checkpoint?(opts: { message?: string; files?: { id: string; dsl: string }[] }): Promise<void>;
  create(id: string, dsl: string): Promise<void>;
  mkdir?(dirPath: string): Promise<void>;
  delete?(id: string): Promise<void>;
  rmdir?(dirPath: string): Promise<void>;
  rename?(fromId: string, toId: string): Promise<void>;
  watch?(cb: (e: WatchEvent) => void): () => void;
  flagNewVersion?(commitSha: string, opts: { name: string; note?: string }): Promise<void>;
  listSectionTemplates?(section: TemplateSection): Promise<SectionTemplate[]>;
  getTemplatePolicies?(): Promise<Record<TemplateSection, TemplatePolicy>>;
  capabilities?: EditorCapabilities;
}

/**
 * Overrides for the window-based dialog defaults. Required in any shell where
 * `window.alert`/`confirm`/`prompt` are unavailable — a VS Code webview, for
 * instance — because without them New file, New folder, Delete, Checkpoint and
 * Flag version all silently do nothing.
 */
export interface EditorDialogs {
  alert?(message: string): Promise<void>;
  confirm?(message: string): Promise<boolean>;
  prompt?(message: string, defaultValue?: string): Promise<string | null>;
}

export interface EditorOptions {
  lang?: string;
  initialMode?: "gui" | "text";
  initialSplit?: number;
  /** Debounce delay in ms before an autosave host flushes dirty documents. Default 1500. */
  autosaveDelayMs?: number;
  /**
   * Scope key for the localStorage mirror kept while `capabilities.autosave`
   * is set (e.g. `${projectId}:${branch}`). Omit to disable the mirror.
   */
  localMirrorKey?: string;
  /** Fired whenever there is (or stops being) an unflushed autosave. */
  onPendingChange?(pending: boolean): void;
  /** Fired when a background autosave flush fails. */
  onAutosaveError?(message: string): void;
  [key: string]: unknown;
}

export interface DslEditorProps {
  host: EditorHost;
  projectId?: string;
  options?: EditorOptions;
  dialogs?: EditorDialogs;
}

export declare const DslEditor: ComponentType<DslEditorProps>;

export declare const FileEditorProvider: ComponentType<DslEditorProps & { children?: ReactNode }>;

export declare function useEditor(): Record<string, unknown>;

export declare const TEMPLATE_SECTIONS: readonly TemplateSection[];
export declare function hostHas(host: EditorHost, method: string): boolean;
export declare function hostSupportsVersioning(host: EditorHost): boolean;
export declare function hostAutosaves(host: EditorHost): boolean;
export declare function hostIsReadOnly(host: EditorHost): boolean;

/** Clears every localStorage-mirrored document under `scope` (e.g. after a successful push). */
export declare function clearLocalMirror(scope: string): void;

// ── Document model helpers (used by the SaaS mobile view and share pages) ────

export interface GuiRow {
  kind: string;
  empty?: boolean;
  role?: string | null;
  text?: string;
  name?: string;
  description?: string;
  remark?: string;
  arrowLine?: string;
  blockRef?: string | null;
  mergeId?: string;
  props?: string[];
  [key: string]: unknown;
}

export interface GuiModel {
  rows: GuiRow[];
  lanes: Array<{ id: string; label?: string }>;
  blocks: Record<string, { id: string; label?: string }>;
  props: Record<string, { id: string; label?: string }>;
  [key: string]: unknown;
}

export declare function parseGuiModel(src: string): GuiModel;
export declare function applyModelEdit(
  src: string,
  edit: (draft: { rows: GuiRow[]; [k: string]: unknown }) => void,
): string;
export declare function serializeDSL(model: { rows: GuiRow[]; [key: string]: unknown }): string;
export declare function formatDsl(src: string): string;
export declare function extractPartsCode(
  src: string,
  section?: "block" | "prop" | "both",
  onlyId?: string | null,
): string;

export interface FolderTreeNode {
  name: string;
  path: string;
  folders: FolderTreeNode[];
  files: { id: string; name: string }[];
}
export declare function buildFolderTree(files: { id: string; name?: string }[]): FolderTreeNode;

export declare function findAdjacentStepIndex(
  rows: GuiRow[],
  rowIndex: number,
  direction: "up" | "down",
): number;
export declare function moveRow(
  rows: GuiRow[],
  from: number,
  to: number,
): { rows: GuiRow[]; index: number };
export declare function sameReorderFrame(rows: GuiRow[], a: number, b: number): boolean;
export declare function getFrameStepIndices(rows: GuiRow[], rowIndex: number): number[];
