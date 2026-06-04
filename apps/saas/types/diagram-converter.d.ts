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
}

declare module "@swimlane-cloud/editor/styles.css";
