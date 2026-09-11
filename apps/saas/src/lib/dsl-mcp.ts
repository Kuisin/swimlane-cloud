/**
 * The bodies of the /api/mcp tools, as pure functions.
 *
 * The route itself is then only tool registration + descriptions, and
 * everything with a decision in it — what counts as an error, how big an SVG
 * is allowed to be, which example files exist — is unit-testable without
 * standing up an MCP server.
 *
 * Nothing here reads a secret, opens a connection or writes a file: every
 * function takes text and returns text, which is what keeps the route safe to
 * leave outside middleware.ts's auth matcher.
 */
import { readFileSync } from "node:fs";
import { join, resolve, sep } from "node:path";
import { textToSvg, migrateLegacyDsl } from "@swimlane-cloud/diagram-converter";
import { parseDSL } from "@swimlane-cloud/diagram-converter/parser";
import { serializeDSL } from "@swimlane-cloud/editor/serialize";

export type Issue = { line?: number; text?: string; msg?: string; severity?: string };

/** Every theme `render_dsl` will accept, in the order the picker shows them. */
export const THEME_KEYS = ["basic", "washi", "ink", "mono"] as const;
export type ThemeKey = (typeof THEME_KEYS)[number];

/**
 * How much SVG `render_dsl` returns without being asked twice. The largest
 * bundled example renders to ~50 KB, so the default covers a real diagram;
 * anything past it is a document big enough that the caller should opt in
 * deliberately rather than have ~30k tokens of markup appear unannounced.
 */
export const DEFAULT_MAX_SVG_BYTES = 60_000;

/** A tool result before it is wrapped in MCP's content envelope. */
export interface ToolReport {
  /** Human/model-readable summary. Always present. */
  summary: string;
  /** A second content block — the SVG, the formatted document — when there is one. */
  payload?: string;
  isError?: boolean;
}

const formatIssue = (e: Issue) => (e.line ? `line ${e.line}: ${e.msg}` : (e.msg ?? String(e)));

function splitIssues(all: Issue[] | undefined): { errors: Issue[]; warnings: Issue[] } {
  const errors: Issue[] = [];
  const warnings: Issue[] = [];
  for (const e of all ?? []) (e.severity === "warning" ? warnings : errors).push(e);
  return { errors, warnings };
}

function issueLines(errors: Issue[], warnings: Issue[]): string[] {
  const lines: string[] = [];
  if (errors.length) lines.push("", "Errors:", ...errors.map((e) => `- ${formatIssue(e)}`));
  if (warnings.length) lines.push("", "Warnings:", ...warnings.map((e) => `- ${formatIssue(e)}`));
  return lines;
}

// ---------------------------------------------------------------------------
// validate_dsl
// ---------------------------------------------------------------------------

export function validateReport(dsl: string): ToolReport {
  let errors: Issue[];
  let warnings: Issue[];
  try {
    const model = parseDSL(dsl) as { errors?: Issue[]; warnings?: Issue[] };
    errors = model.errors ?? [];
    warnings = model.warnings ?? [];
  } catch (err) {
    return { summary: `Parser crashed: ${(err as Error).message}`, isError: true };
  }
  if (errors.length === 0 && warnings.length === 0) {
    return { summary: "No errors or warnings — this document parses cleanly." };
  }
  const lines = [
    `${errors.length} error${errors.length === 1 ? "" : "s"}, ${warnings.length} warning${
      warnings.length === 1 ? "" : "s"
    }.`,
    ...issueLines(errors, warnings),
  ];
  return { summary: lines.join("\n"), isError: errors.length > 0 };
}

// ---------------------------------------------------------------------------
// render_dsl
// ---------------------------------------------------------------------------

/** The drawing's pixel size, read off the `<svg viewBox>` the renderer writes. */
export function svgDimensions(svg: string): { width: number; height: number } | null {
  const m = /viewBox="\s*[-\d.]+\s+[-\d.]+\s+([\d.]+)\s+([\d.]+)\s*"/.exec(svg);
  if (!m) return null;
  return { width: Math.round(Number(m[1])), height: Math.round(Number(m[2])) };
}

export function renderReport(
  dsl: string,
  options: { theme?: string; maxBytes?: number } = {},
): ToolReport {
  const themeKey = (THEME_KEYS as readonly string[]).includes(options.theme ?? "")
    ? (options.theme as ThemeKey)
    : "basic";
  const maxBytes =
    typeof options.maxBytes === "number" && options.maxBytes > 0
      ? options.maxBytes
      : DEFAULT_MAX_SVG_BYTES;

  let svg: string | null;
  let all: Issue[];
  try {
    const result = textToSvg(dsl, { themeKey });
    svg = result.svg;
    all = (result.errors ?? []) as Issue[];
  } catch (err) {
    return { summary: `Renderer crashed: ${(err as Error).message}`, isError: true };
  }
  const { errors, warnings } = splitIssues(all);

  if (!svg) {
    return {
      summary: [
        "Nothing was drawn — this document does not render.",
        ...issueLines(errors, warnings),
      ]
        .join("\n")
        .trim(),
      isError: true,
    };
  }

  const size = svgDimensions(svg);
  const bytes = Buffer.byteLength(svg, "utf8");
  const head = [
    `Rendered with the "${themeKey}" theme: ${size ? `${size.width}x${size.height} px, ` : ""}` +
      `${bytes} bytes of SVG.`,
  ];
  if (errors.length) {
    head.push("The document has errors, so this is not the picture the app would publish.");
  }
  head.push(...issueLines(errors, warnings));

  if (bytes > maxBytes) {
    head.push(
      "",
      `The SVG is larger than maxBytes (${maxBytes}) and is omitted rather than truncated — ` +
        `half an SVG is not viewable. Call again with maxBytes at least ${bytes} if you want it.`,
    );
    return { summary: head.join("\n").trim(), isError: errors.length > 0 };
  }
  return { summary: head.join("\n").trim(), payload: svg, isError: errors.length > 0 };
}

// ---------------------------------------------------------------------------
// format_dsl
// ---------------------------------------------------------------------------

/**
 * Parse and re-serialise, which is exactly what `@swimlane-cloud/editor`'s
 * `formatDsl` does — its extra `normalizeBranchRows` pass only matters for a
 * model the GUI has edited, and is provably a no-op on a freshly parsed one
 * (asserted in dsl-mcp.test.ts against every bundled example). Spelled out
 * here rather than imported because `formatDsl` is only reachable through the
 * package barrel, which pulls React into Next's server layer.
 */
export function formatReport(dsl: string): ToolReport {
  let canonical: string;
  try {
    const model = parseDSL(dsl) as { errors?: Issue[]; warnings?: Issue[]; rows?: unknown[] };
    const { errors, warnings } = {
      errors: model.errors ?? [],
      warnings: model.warnings ?? [],
    };
    if (errors.length) {
      return {
        summary: [
          "Not formatted: this document does not parse, and reformatting text the reader " +
            "cannot understand would lose content. Fix these first.",
          ...issueLines(errors, warnings),
        ]
          .join("\n")
          .trim(),
        isError: true,
      };
    }
    canonical = serializeDSL(model as { rows: unknown[] });
  } catch (err) {
    return { summary: `Formatter crashed: ${(err as Error).message}`, isError: true };
  }
  const same = canonical.trim() === dsl.trim();
  return {
    summary: same
      ? "Already canonical — the app would write this document exactly as you sent it."
      : "Reformatted. The canonical text follows; use it verbatim. Anything missing from it " +
        "is something the reader did not understand and silently dropped.",
    payload: same ? undefined : canonical,
  };
}

// ---------------------------------------------------------------------------
// migrate_dsl
// ---------------------------------------------------------------------------

export function migrateReport(dsl: string): ToolReport {
  let migrated: { text: string; changed: number };
  try {
    migrated = migrateLegacyDsl(dsl);
  } catch (err) {
    return { summary: `Migration crashed: ${(err as Error).message}`, isError: true };
  }
  const after = validateReport(migrated.text);
  if (migrated.changed === 0) {
    return {
      summary: [
        "Nothing to migrate — no line used an older spelling.",
        `Validation of the document as sent: ${after.summary}`,
      ].join("\n"),
      isError: after.isError,
    };
  }
  const lines = [
    `Rewrote ${migrated.changed} line${migrated.changed === 1 ? "" : "s"} into the current grammar.`,
    `Validation of the result: ${after.summary}`,
  ];
  if (after.isError) {
    lines.push(
      "",
      "Constructs with no automatic mapping are left as they were — most often a bare " +
        "`merge;` / `[merge]`, which needs a real target: give the intended landing step an " +
        "`id:` and jump to it with `[goto: id]`.",
    );
  }
  return { summary: lines.join("\n"), payload: migrated.text, isError: after.isError };
}

// ---------------------------------------------------------------------------
// get_dsl_example
// ---------------------------------------------------------------------------

export interface DslExample {
  name: string;
  title: string;
  summary: string;
  teaches: string[];
  lines: number;
}

/**
 * The catalogue written by `scripts/sync-dsl-rule.mjs`. Like `dsl-rule.md`,
 * the files live under `content/` because Vercel only traces a function's own
 * app directory into its bundle — climbing out to `examples/` at request time
 * works in `next dev` and 404s in production.
 */
const examplesDir = () => join(process.cwd(), "content/examples");

export function readExampleIndex(): DslExample[] {
  try {
    return JSON.parse(readFileSync(join(examplesDir(), "index.json"), "utf8")) as DslExample[];
  } catch {
    return [];
  }
}

/** The full text of one example, or null when the name is not in the catalogue. */
export function readExample(name: string): { meta: DslExample; text: string } | null {
  const meta = readExampleIndex().find((e) => e.name === name.toLowerCase());
  if (!meta) return null;
  // The name came out of the catalogue, so it cannot traverse; assert it anyway
  // rather than rely on that as the only thing between a query and the disk.
  const dir = examplesDir();
  const path = resolve(dir, `${meta.name}.txt`);
  if (!path.startsWith(dir + sep)) return null;
  return { meta, text: readFileSync(path, "utf8") };
}

export function exampleCatalogue(examples: DslExample[]): string {
  if (examples.length === 0) {
    return "No examples are bundled with this deployment.";
  }
  const rows = examples.map(
    (e) =>
      `- \`${e.name}\` — ${e.title} (${e.lines} lines)\n  ${e.summary}\n  Shows: ${e.teaches.join(", ")}`,
  );
  return [
    "Worked kai-swimlane documents, every one of them parse-clean. Call again with `name` " +
      "set to one of these for the full text:",
    "",
    ...rows,
  ].join("\n");
}
