import { describe, expect, it } from "vitest";
import { parseDSL } from "@swimlane-cloud/diagram-converter/parser";
import { formatDsl } from "./format-dsl.js";

/**
 * Format is parse → serialize, so it is the one operation that can silently
 * rewrite a document. For jumps that matters more than anywhere else. There
 * are now four spellings — `[goto: id]`, the `id: …;` line that names the step
 * it lands on, `loop`, and `loop @id` — and two of them are a pair where one
 * is bare and the other names a node. The grammar is explicit that no tool
 * converts one into another: a bare `loop` must never acquire a generated id,
 * and `loop @id` must never collapse to a bare `loop`. These tests pin all
 * four: Format keeps the spelling it was given, and running it twice changes
 * nothing.
 */

const doc = (body) => `@kai-swimlane

/role/

<a>
label: A;

<b>
label: B;

/line/

${body}

@end
`;

const flowOf = (text) =>
  text
    .split("/line/")[1]
    .split("@end")[0]
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

/** Format once, check it parses, then format again and demand no change. */
function formatted(src) {
  const once = formatDsl(src);
  expect(once.ok, JSON.stringify(once.errors)).toBe(true);
  expect(parseDSL(once.value).errors).toEqual([]);
  const twice = formatDsl(once.value);
  expect(twice.ok, JSON.stringify(twice.errors)).toBe(true);
  expect(twice.value, "Format is idempotent").toBe(once.value);
  return once.value;
}

describe("Format keeps every jump statement in the form it was written", () => {
  it("`[goto: id]` keeps its id, and the target keeps its `id:` line", () => {
    const flow = flowOf(
      formatted(
        doc(`[a: start]
if (q?)
case (yes)
[a: one]
[goto: late]
case (no)
[a: two]
end-if
[a: late]
id: late;`),
      ),
    );
    expect(flow).toContain("[goto: late]");
    expect(flow).toContain("id: late;");
    // …and the id stays a property line: it never turns back into a suffix.
    expect(flow).toContain("[a: late]");
    expect(flow.some((l) => l.includes("@late"))).toBe(false);
  });

  it("a bare `loop` stays bare — it is not `loop @id` with the id missing", () => {
    const flow = flowOf(
      formatted(
        doc(`[a: start]
id: top;
if (q?)
case (yes)
[a: one]
case (no)
loop
end-if
[a: done]`),
      ),
    );
    expect(flow).toContain("loop");
    expect(flow.some((l) => l.startsWith("loop @"))).toBe(false);
  });

  it("`loop @id` keeps its id and never collapses to a bare `loop`", () => {
    const flow = flowOf(
      formatted(
        doc(`[a: start]
id: top;
if (q?)
case (yes)
[a: one]
case (no)
loop @top
end-if
[a: done]`),
      ),
    );
    expect(flow).toContain("loop @top");
    // `loop @id` still references the step by `@id`; only a *step's own* name
    // moved from a suffix to a property line.
    expect(flow).toContain("id: top;");
  });

  it("all four forms in one document, each still itself after two passes", () => {
    const src = doc(`[a: start]
id: top;
if (first?)
case (yes)
[a: one]
[goto: late]
case (no)
[a: two]
end-if

[a: middle]
if (second?)
case (yes)
[a: three]
loop @top
case (no)
[b: four]
loop
end-if

[a: late]
id: late;`);
    const flow = flowOf(formatted(src));
    for (const line of ["[goto: late]", "loop @top", "loop", "id: top;", "id: late;"]) {
      expect(flow, `"${line}" survived Format`).toContain(line);
    }
    // …and nothing turned into something else: exactly one of each spelling.
    expect(flow.filter((l) => l === "loop")).toHaveLength(1);
    expect(flow.filter((l) => l === "loop @top")).toHaveLength(1);
    expect(flow.filter((l) => l === "[goto: late]")).toHaveLength(1);
  });

  it("a jump to the very last step of the flow leaves `@end` alone", () => {
    const out = formatted(
      doc(`[a: start]
if (q?)
case (yes)
[a: one]
[goto: after]
case (no)
[a: two]
end-if
[a: after]
id: after;`),
    );
    expect(flowOf(out)).toContain("[goto: after]");
    expect(out.trimEnd().endsWith("@end")).toBe(true);
  });

  it("refuses the removed spellings rather than quietly rewriting them", () => {
    // `merge` is gone entirely and a step's `@id` suffix no longer parses, so
    // an old document is an error to fix by hand (or via migrateLegacyDsl),
    // never something Format silently reinterprets.
    for (const body of ["[a: x] @done", "merge", "merge @done", "goto", "goto @done"]) {
      const result = formatDsl(doc(`[a: start]\n${body}`));
      expect(result.ok, `"${body}" should not format`).toBe(false);
    }
  });
});
