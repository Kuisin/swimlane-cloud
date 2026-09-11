import { describe, expect, it } from "vitest";
import { parseDSL } from "@swimlane-cloud/diagram-converter/parser";
import { formatDsl } from "./format-dsl.js";

/**
 * Format is parse → serialize, so it is the one operation that can silently
 * rewrite a document. For jumps that matters more than anywhere else: `goto`,
 * `goto @id`, `loop`, `loop @id`, `merge` and `merge @name` are six different
 * statements, four of them a pair where one spelling is bare and the other
 * names a node, and the grammar is explicit that no tool converts one into
 * another. These tests pin all six: Format keeps the spelling it was given,
 * and running it twice changes nothing.
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
  it("a bare `goto` stays bare and never gains a generated id", () => {
    const flow = flowOf(
      formatted(
        doc(`[a: start]
if (q?)
case (yes)
[a: one]
goto
case (no)
[a: two]
end-if
merge
[a: after]`),
      ),
    );
    expect(flow).toContain("goto");
    expect(flow.some((l) => l.startsWith("goto @"))).toBe(false);
    expect(flow).toContain("merge");
  });

  it("`goto @id` keeps its id, and the target keeps its `@id` suffix", () => {
    const flow = flowOf(
      formatted(
        doc(`[a: start]
if (q?)
case (yes)
[a: one]
goto @late
case (no)
[a: two]
end-if
[a: late] @late`),
      ),
    );
    expect(flow).toContain("goto @late");
    expect(flow).toContain("[a: late] @late");
  });

  it("a bare `loop` stays bare — it is not `loop @id` with the id missing", () => {
    const flow = flowOf(
      formatted(
        doc(`[a: start] @top
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
        doc(`[a: start] @top
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
    expect(flow).toContain("[a: start] @top");
  });

  it("a bare `merge` marker survives as a bare marker", () => {
    const flow = flowOf(
      formatted(
        doc(`[a: start]
if (q?)
case (yes)
goto
case (no)
[a: two]
end-if
merge
[a: after]`),
      ),
    );
    expect(flow.filter((l) => l === "merge")).toHaveLength(1);
  });

  it("`merge @name` keeps its name, and `goto @name` keeps pointing at it", () => {
    const flow = flowOf(
      formatted(
        doc(`[a: start]
if (q?)
case (yes)
goto @join
case (no)
[a: two]
end-if
[a: middle]
merge @join
[b: after]`),
      ),
    );
    expect(flow).toContain("goto @join");
    expect(flow).toContain("merge @join");
  });

  it("all six forms in one document, each still itself after two passes", () => {
    const src = doc(`[a: start] @top
if (first?)
case (yes)
[a: one]
goto @late
case (no)
[a: two]
goto
end-if
merge
[a: middle]
if (second?)
case (yes)
[a: three]
loop @top
case (no)
[b: four]
loop
end-if
merge @home
[a: late] @late`);
    const out = formatted(src);
    const flow = flowOf(out);
    for (const line of [
      "goto @late",
      "goto",
      "loop @top",
      "loop",
      "merge",
      "merge @home",
      "[a: start] @top",
      "[a: late] @late",
    ]) {
      expect(flow, `"${line}" survived Format`).toContain(line);
    }
    // …and nothing turned into something else: exactly one of each spelling.
    expect(flow.filter((l) => l === "goto")).toHaveLength(1);
    expect(flow.filter((l) => l === "loop")).toHaveLength(1);
    expect(flow.filter((l) => l === "merge")).toHaveLength(1);
  });

  it("a marker at the very end of the flow leaves `@end` alone", () => {
    const out = formatted(
      doc(`[a: start]
if (q?)
case (yes)
[a: one]
goto @after
case (no)
[a: two]
end-if
[a: after] @after
merge`),
    );
    expect(flowOf(out)).toContain("merge");
    expect(out.trimEnd().endsWith("@end")).toBe(true);
  });
});
