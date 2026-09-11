// Ambient types for the workspace packages, which ship plain JS with no .d.ts.

declare module "@swimlane-cloud/diagram-converter" {
  /** A frontmatter value: a scalar, a sequence, or a nested map. */
  type MetaValue = string | string[] | { [key: string]: MetaValue };
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
      /**
       * Drawn top-right for a printed image: the file's path and metadata.
       * A `.md` file's frontmatter is structured — a value may be a list or a
       * nested map — and the panel flattens each for display.
       */
      documentInfo?: { path?: string; meta?: Record<string, MetaValue> };
      linkHref?: (link: string) => string | null;
    },
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
