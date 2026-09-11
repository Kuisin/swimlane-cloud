import { describe, expect, it } from "vitest";
import { buildStepRowDisplayInfo, parseDSL } from "./parser.js";
import { THEMES } from "./themes.js";
import { renderDiagramSvg } from "./render-pure/diagram.js";

const render = (dsl) => renderDiagramSvg({ model: parseDSL(dsl), theme: THEMES.basic });

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

describe("a landing marker", () => {
  it("parses `merge` / `merge @name` and a bare or named `goto`", () => {
    const model = parseDSL(
      doc(`[a: start]
if (cancel?)
case (yes)
  [a: accept]
  goto
case ()
  [b: normal]
  goto @late
end-if
[a: refund]
merge
[a: done]
merge @late
[a: very late]`),
    );
    expect(model.errors).toEqual([]);
    const merges = model.rows.filter((r) => r.kind === "branchMerge").map((r) => r.mergeTarget);
    expect(merges).toEqual([null, "late"]);
    const markers = model.rows.filter((r) => r.kind === "mergeMarker").map((r) => r.name);
    expect(markers).toEqual([null, "late"]);
  });

  it("rejects a bare goto with no marker after its if", () => {
    const model = parseDSL(
      doc(`if (x?)
case (yes)
  [a: one]
  goto
end-if
[a: after]`),
    );
    expect(model.errors.map((e) => e.msg)).toContain("goto has no merge marker after this if");
  });

  it("rejects a marker name that is also a step id", () => {
    const model = parseDSL(
      doc(`[a: one] @done
[a: two]
merge @done`),
    );
    expect(model.errors.filter((e) => e.msg === 'duplicate node id "done"')).toHaveLength(1);
  });

  it("renders exactly as the id-based form does, with the marker taking no space", () => {
    const withMarker = doc(`[a: start]
if (cancel?)
case (yes)
  [a: accept]
  goto
case ()
  [b: normal]
end-if
[a: refund]
merge
[a: done]`);
    const withId = doc(`[a: start]
if (cancel?)
case (yes)
  [a: accept]
  goto @done
case ()
  [b: normal]
end-if
[a: refund]
[a: done] @done`);
    expect(render(withMarker)).toBe(render(withId));
  });
});

describe("step numbering with level", () => {
  const body = doc(`[a: take order]
[a: check stock]
[b: warehouse A]
level: 2;
[b: warehouse B]
level: 2;
[b: bin 3]
level: 3;
[a: ship]
[a: extra]
skip;
[a: bill]`);

  it("counts sub-steps under the previous shallower step", () => {
    const model = parseDSL(body);
    expect(model.errors).toEqual([]);
    const info = buildStepRowDisplayInfo(model.rows);
    const numbers = model.rows
      .map((r, i) => (r.kind === "step" ? info.get(i) : null))
      .filter(Boolean)
      .map((d) => d.displayIndex ?? "skip");
    expect(numbers).toEqual(["1", "2", "2-1", "2-2", "2-2-1", "3", "skip", "4"]);
  });

  it("writes the hierarchical number into the left gutter", () => {
    const svg = render(body);
    expect(svg).toContain("2-2-1. ");
    expect(svg).toContain("3. ");
  });

  it("counts a sub-step with no parent under an implicit 1, which the next step follows", () => {
    const model = parseDSL(
      doc(`[a: first]
level: 2;
[a: second]`),
    );
    const info = buildStepRowDisplayInfo(model.rows);
    expect([...info.values()].map((d) => d.displayIndex)).toEqual(["1-1", "2"]);
  });

  it("rejects a level outside 1-9, and a non-integer level, with the same message", () => {
    expect(parseDSL(doc(`[a: x]\nlevel: 0;`)).errors.map((e) => e.msg)).toContain(
      "level must be a whole number from 1 to 9",
    );
    expect(parseDSL(doc(`[a: x]\nlevel: 1.5;`)).errors.map((e) => e.msg)).toContain(
      "level must be a whole number from 1 to 9",
    );
  });
});

// The earlier grammar's `[merge]` / `[merge: id]` bracket form was two
// spellings collapsed onto one meaning depending on context — a marker
// outside an if, a jump inside one. `legacy-migrate.test.js` covers that
// ambiguity being converted away; the current grammar has no such thing to
// assert here, since `goto` (jump) and `merge` (marker) are distinct
// keywords regardless of nesting. What is still worth asserting on its own
// is the renderer's routing geometry for a backward jump.
describe("a backward goto's routing", () => {
  it("routes around the blocks between, not up the flow's spine", () => {
    const svg = render(
      doc(`[a: start] @again
[a: middle]
[a: check]
if (ok?)
case (no)
  goto @again
case ()
  [a: done]
end-if`),
    );
    // The jump's path: down from the case, across to a route x, up to the
    // target's centre y, then into the target's side. Its route x must sit
    // outside every block it passes — here all blocks share one lane, so it
    // must clear that lane's block width.
    const body = svg.slice(svg.indexOf("</defs>"));
    const paths = [...body.matchAll(/<path[^>]*\sd="M ([^"]+)"/g)]
      .map((m) => m[1].split(" L ").map((p) => p.trim().split(/\s+/).map(Number)))
      .filter((pts) => pts.length === 5);
    const boxes = [...body.matchAll(/<rect[^>]*x="([\d.]+)"[^>]*width="188"/g)].map((m) => ({
      left: Number(m[1]),
      right: Number(m[1]) + 188,
    }));
    const jump = paths.find((pts) => pts[4][1] < pts[0][1]); // ends above where it started
    expect(jump).toBeDefined();
    const routeX = jump[2][0];
    const clear = boxes.every((b) => routeX < b.left || routeX > b.right);
    expect(clear).toBe(true);
  });
});
