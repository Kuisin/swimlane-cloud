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
}

declare module "@swimlane-cloud/diagram-converter/themes" {
  export const THEMES: Record<string, unknown>;
}

// The shared editor package is built concurrently and may not ship types yet.
declare module "@swimlane-cloud/editor" {
  import type { ComponentType } from "react";
  // Storage-agnostic host contract (plan §A4); kept loose to match the editor.
  export const DslEditor: ComponentType<{
    host: unknown;
    projectId?: string;
    [key: string]: unknown;
  }>;
  // GUI-model helpers used by the mobile edit modal.
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
  export function parseGuiModel(src: string): GuiModel;
  export function applyModelEdit(
    src: string,
    edit: (draft: { rows: GuiRow[]; [k: string]: unknown }) => void,
  ): string;
}

declare module "@swimlane-cloud/editor/styles.css";

// Mobile-view package (separate, JSX, no bundled types).
declare module "@swimlane-cloud/mobile-view" {
  import type { ComponentType } from "react";
  export const MobileDiagram: ComponentType<{
    dsl?: string;
    model?: unknown;
    editable?: boolean;
    onEditStep?: (stepIndex: number) => void;
  }>;
  export function buildMobileTree(model: unknown): unknown;
  export function dslToMobile(dsl: string): { model: unknown; tree: unknown };
  export function roleColor(lane: unknown): string;
  export function toColor(value: unknown): string | null;
}

declare module "@swimlane-cloud/mobile-view/styles.css";
