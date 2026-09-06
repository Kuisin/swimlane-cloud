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
}

declare module "@swimlane-cloud/diagram-converter/parser" {
  export interface ParseResult {
    errors: Array<{ line?: number; text?: string; msg?: string }>;
    [key: string]: unknown;
  }
  export function parseDSL(src: string): ParseResult;
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
    insertStepLabel?: string;
    addStepLabel?: string;
  }>;
  export function buildMobileTree(model: unknown): unknown;
  export function dslToMobile(dsl: string): { model: unknown; tree: unknown };
  export function roleColor(lane: unknown): string;
  export function toColor(value: unknown): string | null;
}
