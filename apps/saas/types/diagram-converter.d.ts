// Ambient types for the workspace engine package, which ships plain JS with no
// bundled .d.ts. These mirror the documented contract (plan §"Engine API").

declare module "@swimlane-cloud/diagram-converter" {
  export interface TextToSvgResult {
    svg: string | null;
    model: unknown;
    errors: Array<{ line?: number; text?: string; msg?: string }>;
  }
  export function textToSvg(
    src: string,
    options?: {
      theme?: object;
      themeKey?: string;
      lang?: string;
      filename?: string;
      resolveImport?: (path: string) => string | null;
      resolveAsset?: (path: string) => string | null;
      /** Render options the file inherits; its own `/option/` wins. */
      diagramDefaults?: object;
      /** Drawn top-right for a printed image: the file's path and metadata. */
      documentInfo?: { path?: string; meta?: Record<string, string> | null } | null;
      /** A linked step's ↗ becomes an <a href> when this names a URL for it. */
      linkHref?: ((link: string, row: unknown) => string | null) | null;
    },
  ): TextToSvgResult;
  /** How a row of the "after" model differs from the model it is compared against. */
  export type RowDiffStatus = "added" | "changed" | "removed";
  export interface RowDiffEntry {
    status: RowDiffStatus;
    /** The matching row of the "before" model, for `changed` and `removed`. */
    oldRow?: unknown;
    /** That row's caption, which the renderer shows as inline tracked changes. */
    oldText?: string;
  }
  export interface TextDiffToSvgResult extends TextToSvgResult {
    /** Row index (into the rendered model) -> what happened to that row. */
    diffRows: Map<number, RowDiffEntry>;
  }
  /**
   * `afterSrc` rendered with the change from `beforeSrc` drawn on it. Pass ""
   * for a side that does not exist (a file added, or deleted). A host reverts
   * the picture to a plain render by putting the class `diff-hidden` on the
   * `<svg>` or any ancestor.
   */
  export function textDiffToSvg(
    beforeSrc: string,
    afterSrc: string,
    options?: Parameters<typeof textToSvg>[1],
  ): TextDiffToSvgResult;
  /** Aligns two models' rows into the `diffRows` map, splicing in ghosts for removed steps. */
  export function diffModelRows(
    oldRows: unknown[],
    newRows: unknown[],
  ): { rows: unknown[]; diffRows: Map<number, RowDiffEntry> };
  /** `diffModelRows` at the model level: the model to render, and the map to render it with. */
  export function diffModels(
    oldModel: unknown,
    newModel: unknown,
  ): { model: unknown; diffRows: Map<number, RowDiffEntry> };
  /** The caption a row shows — a step's text, a case's label, a branch's question. */
  export function rowCaption(row: unknown): string;
  /** The repository id a step's link points at from `fromFile`; null when it leaves the repo. */
  export function resolveLinkPath(link: string, fromFile: string): string | null;
  /** The shortest relative link from `fromFile` to `targetFile`. */
  export function relativeLinkPath(targetFile: string, fromFile: string): string;
  /** Rewrite a document written in the earlier grammar into the current one; `changed` counts lines. */
  export function migrateLegacyDsl(text: string): { text: string; changed: number };
  /** @deprecated Alias of `migrateLegacyDsl`, kept for callers written before the rename. */
  export function migrateLegacySpellings(text: string): { text: string; changed: number };
  /** One conflicted unit: a keyed definition, or a run of rows in an ordered section. */
  export interface DslMergeConflict {
    /** The section marker it sits in, or `"@"` for a preamble directive. */
    section: string;
    /** The definition or property key; null in an ordered section, where position is the key. */
    key: string | null;
    base: string | null;
    ours: string | null;
    theirs: string | null;
  }
  export interface DslMergeResult {
    text: string;
    clean: boolean;
    conflicts: DslMergeConflict[];
    /** Which inputs were only brought across a grammar change. */
    migrated: { base: boolean; ours: boolean; theirs: boolean };
  }
  /** Three-way merge of two edits to one document, per section rather than per line. */
  export function mergeDsl(base: string, ours: string, theirs: string): DslMergeResult;
  /** Render conflicts as git-style markers, for a caller handing the user a text editor. */
  export function conflictMarkers(
    conflicts: DslMergeConflict[],
    oursLabel?: string,
    theirsLabel?: string,
  ): string;
  export function renderPartsPreviewHtml(
    code: string,
    theme: unknown,
    options?: { compact?: boolean },
  ): string;
  export const ARROW_LINE_TYPES: string[];
  export function normalizeArrowLine(value: string): string | null;
  export function arrowLineDasharray(lineType: string): string | null;
  export function arrowLineStrokeProps(lineType: string): { strokeDasharray?: string };
  export const BRANCH_COLOR_STYLES: Record<string, { stroke: string; bg: string }>;
}

declare module "@swimlane-cloud/diagram-converter/parser" {
  export interface ParseResult {
    errors: Array<{ line?: number; text?: string; msg?: string }>;
    /** Diagnostics dsl-rule.md classifies `impact: none` — these block nothing. */
    warnings: Array<{ line?: number; text?: string; msg?: string }>;
    [key: string]: unknown;
  }
  export function parseDSL(
    src: string,
    options?: {
      lang?: string;
      filename?: string;
      resolveImport?: (path: string) => string | null;
      resolveAsset?: (path: string) => string | null;
    },
  ): ParseResult;
  export function parseDSLParts(src: string): {
    blocks: Record<string, unknown>;
    props: Record<string, unknown>;
    errors: Array<{ line?: number; text?: string; msg?: string }>;
    warnings: Array<{ line?: number; text?: string; msg?: string }>;
  };
  export const ASSET_EXTENSIONS: Record<string, string>;
  export function checkImportPath(path: string, fromDir?: string): string | null;
  export function dirOf(filename: string): string;
  export function dslVersion(src: string): number | null;
  export function scanImports(
    src: string,
    filename?: string,
  ): Array<{ path: string; alias: string | null; kind: "fragment" | "asset" }>;
}

declare module "@swimlane-cloud/diagram-converter/themes" {
  export const THEMES: Record<string, unknown>;
}

declare module "@swimlane-cloud/editor/styles.css";

/**
 * The serializer on its own, reached without the package barrel. The barrel
 * (`@swimlane-cloud/editor`) re-exports React components, so importing it from
 * a route handler drags `createContext`/`useState` into Next's server layer
 * and fails the build; `lib/serialize-dsl.js` has a React-free import graph
 * (→ `serialize-dsl-v2.js` → `diagram-options` + `row-depths.js`) and is what
 * `/api/mcp`'s `format_dsl` uses.
 */
declare module "@swimlane-cloud/editor/serialize" {
  export function serializeDSL(model: { rows: unknown[]; [key: string]: unknown }): string;
}

// Mobile-view package (separate, JSX, no bundled types).
declare module "@swimlane-cloud/diagram-converter/markdown-doc" {
  /** A diagram stored as markdown: frontmatter + prose + a ```kai-swimlane fence. */
  /** How a key was written, so it can be written back the same way. */
  export type FrontmatterShape = Map<
    string,
    { kind: "scalar" | "list" | "flowList" } | { kind: "verbatim"; lines: string[] }
  >;
  export function splitFrontmatter(md: string): {
    meta: Record<string, string>;
    body: string;
    hadFrontmatter: boolean;
    shape: FrontmatterShape;
  };
  export function serializeFrontmatter(
    meta: Record<string, string> | undefined,
    shape?: FrontmatterShape,
  ): string;
  export function orderedMetaKeys(meta: Record<string, string> | undefined): string[];
  export function extractDiagramFence(
    body: string,
  ): { dsl: string; start: number; end: number; fence: string } | null;
  export function replaceDiagramFence(body: string, dsl: string): string;
  export function isMarkdownDiagram(md: string): boolean;
  export function storedMarkdown(dsl: string, previousMd?: string | null): string;
  export function readMetaSection(dsl: string): { meta: Record<string, string>; dsl: string };
  export function writeMetaSection(dsl: string, meta: Record<string, string>): string;
  /** The DSL a markdown document holds, or null when it is only prose. */
  export function dslFromMarkdown(md: string): string | null;
  /** `dsl` written back out as markdown, preserving `previousMd`'s prose. */
  export function markdownFromDsl(dsl: string, previousMd?: string): string;
}

declare module "@swimlane-cloud/mobile-view" {
  import type { ComponentType } from "react";
  export const MobileDiagram: ComponentType<{
    dsl?: string;
    model?: unknown;
    lang?: string;
    editable?: boolean;
    onEditStep?: (stepIndex: number) => void;
    onDeleteStep?: (stepIndex: number) => void;
    onInsertStep?: (afterStepIndex: number) => void;
    onMoveStep?: (fromRow: number, toRow: number) => void;
    onAddStep?: () => void;
    onAddBlock?: () => void;
    onEditBranch?: (rowIndex: number) => void;
    onEditGroup?: (rowIndex: number) => void;
    onEditMerge?: (rowIndex: number) => void;
    /** A branch's first case has no row of its own — it lives as `firstCase`
     * on the branchStart at `branchRow`, so `rowIndex` is null for it. */
    onEditCase?: (target: { rowIndex: number | null; branchRow: number; isFirst: boolean }) => void;
    insertStepLabel?: string;
    addStepLabel?: string;
  }>;
  export function buildMobileTree(model: unknown): unknown;
  export function dslToMobile(dsl: string): { model: unknown; tree: unknown };
  export function roleColor(lane: unknown): string;
  export function toColor(value: unknown): string | null;
}
