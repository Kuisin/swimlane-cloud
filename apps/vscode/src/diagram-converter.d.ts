// Ambient types for the engine package, which ships plain JS with no bundled
// .d.ts. Only the part this extension uses — the same approach as
// `apps/saas/types/diagram-converter.d.ts`.

declare module "@swimlane-cloud/diagram-converter/markdown-doc" {
  /** The DSL a `.md` holds, or null when it holds no diagram at all. */
  export function dslFromMarkdown(md: string): string | null;
  /** True when `md` carries a diagram fence. */
  export function isMarkdownDiagram(md: string): boolean;
  /** The markdown to store for `dsl`, given what the file held before. */
  export function storedMarkdown(dsl: string, previousMd?: string | null): string;
}
