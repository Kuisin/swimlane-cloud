// Ambient types for the workspace packages, which ship plain JS with no .d.ts.

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

declare module "@swimlane-cloud/mobile-view" {
  import type { ComponentType } from "react";
  export const MobileDiagram: ComponentType<{
    dsl?: string;
    model?: unknown;
    lang?: string;
    editable?: boolean;
  }>;
}

declare module "@swimlane-cloud/editor" {
  import type { ComponentType } from "react";
  export const DslEditor: ComponentType<{
    host: unknown;
    projectId?: string;
    options?: Record<string, unknown>;
    dialogs?: {
      alert?: (msg: string) => Promise<void>;
      confirm?: (msg: string) => Promise<boolean>;
      prompt?: (msg: string, def?: string) => Promise<string | null>;
    };
  }>;
}

declare module "@swimlane-cloud/editor/styles.css";
