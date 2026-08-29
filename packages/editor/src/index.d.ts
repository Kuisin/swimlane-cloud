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
export declare function hostIsReadOnly(host: EditorHost): boolean;
