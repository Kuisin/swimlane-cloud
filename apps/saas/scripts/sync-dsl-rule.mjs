// dsl-rule.md at the repo root is the one grammar spec, and
// examples/kai-swimlane/diagrams/ holds the worked documents; the public
// /api/mcp route serves both, so they need their own copies inside content/ —
// Vercel only traces a serverless function's own app directory into its
// bundle, not files reached by climbing out of it — rather than reading the
// repo-root originals at request time. Run before dev/build so the copies
// never go stale silently.
//
// The copies are gitignored (apps/saas/.gitignore): edit the originals.
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseDSL } from "@swimlane-cloud/diagram-converter/parser";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, "../../..");
const contentDir = join(here, "../content");

/**
 * Loud on purpose: anything this route hands a model must parse. A stale
 * document here is not a broken build later, it is a model faithfully copying
 * grammar that no longer exists.
 */
function assertParses(label, text, lineOffset = 0) {
  const { errors } = parseDSL(text);
  const real = (errors ?? []).filter((e) => e.severity !== "warning");
  if (real.length) {
    throw new Error(
      `${label} no longer parses cleanly, so it cannot be served by /api/mcp:\n` +
        real.map((e) => `  line ${e.line + lineOffset}: ${e.msg}`).join("\n"),
    );
  }
}

/**
 * Every fenced block in the spec that is a whole document — first line
 * `@kai-swimlane`, last non-space `@end`. Today that is the `## Example`
 * section, which `get_dsl_syntax` returns *by default, with no arguments*, so
 * it is the very first DSL an authoring model ever sees; and the squashed
 * one-liner below it, whose `if[manager](...)` spelling has no spaces and so
 * survives a grep for the expanded form. The spec's other fences are grammar
 * productions and fragments, which are not documents and are skipped.
 */
function fullDocumentFences(md) {
  const lines = md.split("\n");
  const fences = lines.flatMap((l, i) => (l.startsWith("```") ? [i] : []));
  const out = [];
  for (let k = 0; k + 1 < fences.length; k += 2) {
    const [open, close] = [fences[k], fences[k + 1]];
    const text = lines.slice(open + 1, close).join("\n");
    if (!text.trimStart().startsWith("@kai-swimlane")) continue;
    if (!text.trimEnd().endsWith("@end")) continue;
    // `open` is the 0-based index of the ``` line, so the fence's own line 1
    // is file line open + 2 — report the file's numbering, not the fence's.
    out.push({ label: `dsl-rule.md fence at line ${open + 1}`, text, lineOffset: open + 1 });
  }
  return out;
}

mkdirSync(contentDir, { recursive: true });
const spec = readFileSync(join(repoRoot, "dsl-rule.md"), "utf8");
const fences = fullDocumentFences(spec);
for (const { label, text, lineOffset } of fences) assertParses(label, text, lineOffset);
writeFileSync(join(contentDir, "dsl-rule.md"), spec);
console.log(
  `synced dsl-rule.md -> apps/saas/content/dsl-rule.md (${fences.length} worked documents checked)`,
);

/**
 * The documents `get_dsl_example` offers, chosen to cover the constructs an
 * authoring model gets wrong most often — and deliberately curated rather
 * than globbed, because a tool that hands a model a broken document is worse
 * than one that hands it nothing. `examples/kai-swimlane/diagrams/brand/
 * asset-showcase.txt` is the one diagram left out: its `@use ../../assets/…`
 * images only resolve inside a repository, and the MCP route has none, so it
 * does not parse cleanly on its own.
 *
 * The directory is flattened here; the cross-document links (`=> ./…`) still
 * point at their targets because the linked files are in this set too.
 */
const EXAMPLES = [
  {
    name: "order-to-cash",
    src: "examples/kai-swimlane/diagrams/sales/order-to-cash.txt",
    summary:
      "The reference document: six lanes carry an order from either intake channel " +
      "through credit, approval, shipping, billing and closing.",
    teaches: [
      "/meta/, /page/ and /option/ headers",
      "/role/, /block/ and /prop/ definitions",
      "phase / section grouping",
      "nested if … is … than / else-if / end-if",
      "a labelled three-path fork with case()",
      "branch for a side note",
      "loop and loop @id",
      "[goto: id] and id:",
      "desc / remark, fenced multi-line values",
      "arrow glyphs (~> ..> -.> -->) and a => sub-process link",
      "two-language captions with |",
    ],
  },
  {
    name: "incident-response",
    src: "examples/kai-swimlane/diagrams/support/incident-response.txt",
    summary:
      "An SRE runbook: detection splits by source, response splits by severity, and the " +
      "retrospective loops until the prevention plan is accepted.",
    teaches: [
      "a fork nested inside an if branch",
      "severity fan-out with else-if",
      "loop @id back to a named step",
      "branch for an audit trail",
      "=> link to another diagram",
      "fenced desc: over several lines",
    ],
  },
  {
    name: "onboarding",
    src: "examples/kai-swimlane/diagrams/hr/onboarding.txt",
    summary:
      "HR onboarding across four lanes, with a three-way parallel fork for accounts, " +
      "equipment and paperwork.",
    teaches: [
      "section and phase side by side",
      "fork / case / end-fork",
      "[goto: id] to skip to the closing step",
      "skip; on a step",
      "+prop attachments",
    ],
  },
  {
    name: "shipping-prep",
    src: "examples/kai-swimlane/diagrams/sales/shipping-prep.txt",
    summary:
      "A short single-lane procedure — the smallest realistic document, and the target of " +
      "order-to-cash's sub-process link.",
    teaches: ["a one-lane diagram", "a single if with a loop", "the minimum header set"],
  },
  {
    name: "rollback",
    src: "examples/kai-swimlane/diagrams/support/rollback.txt",
    summary:
      "A single-lane rollback runbook that retries until the health check passes — the " +
      "target of incident-response's sub-process link.",
    teaches: ["a one-lane diagram", "if with a retry loop", "the minimum header set"],
  },
];

const examplesDir = join(contentDir, "examples");
rmSync(examplesDir, { recursive: true, force: true });
mkdirSync(examplesDir, { recursive: true });

/** The `/title/` line, so the catalogue can name a document without a parse. */
function titleOf(text) {
  const m = /^\s*\/title\/\s*\n\s*(.+?);?\s*$/m.exec(text);
  return m ? m[1].trim() : "";
}

const index = EXAMPLES.map(({ name, src, summary, teaches }) => {
  const text = readFileSync(join(repoRoot, src), "utf8");
  assertParses(src, text);
  writeFileSync(join(examplesDir, `${name}.txt`), text);
  return { name, title: titleOf(text), summary, teaches, lines: text.split("\n").length };
});

writeFileSync(join(examplesDir, "index.json"), `${JSON.stringify(index, null, 2)}\n`);
console.log(`synced ${index.length} examples -> apps/saas/content/examples/`);
