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
    options?: { theme?: object; themeKey?: string },
  ): TextToSvgResult;
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

// Mobile-view package (separate, JSX, no bundled types).
declare module "@swimlane-cloud/diagram-converter/markdown-doc" {
  /** A diagram stored as markdown: frontmatter + prose + a ```kai-swimlane fence. */
  export function splitFrontmatter(md: string): {
    meta: Record<string, string>;
    body: string;
    hadFrontmatter: boolean;
  };
  export function serializeFrontmatter(meta: Record<string, string> | undefined): string;
  export function orderedMetaKeys(meta: Record<string, string> | undefined): string[];
  export function extractDiagramFence(
    body: string,
  ): { dsl: string; start: number; end: number; fence: string } | null;
  export function replaceDiagramFence(body: string, dsl: string): string;
  export function isMarkdownDiagram(md: string): boolean;
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
