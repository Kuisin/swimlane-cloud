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

// There is no landing-marker row any more — every jump names a real step's
// own `id:`, written as `[goto: id]`.
describe("goto", () => {
  it("parses `[goto: id]`, pointing at the step carrying that `id:`", () => {
    const model = parseDSL(
      doc(`[a: start]
if (cancel?)
case (yes)
  [a: accept]
  [goto: late]
case ()
  [b: normal]
end-if
[a: refund]
[a: done]
  id: late;
[a: very late]`),
    );
    expect(model.errors).toEqual([]);
    const merges = model.rows.filter((r) => r.kind === "branchMerge").map((r) => r.mergeTarget);
    expect(merges).toEqual(["late"]);
  });

  it("rejects a `[goto: id]` naming an id that does not exist", () => {
    const model = parseDSL(
      doc(`if (x?)
case (yes)
  [a: one]
  [goto: nowhere]
end-if
[a: after]`),
    );
    expect(model.errors.map((e) => e.msg)).toContain('no node with id "nowhere"');
  });

  it("rejects the same id given to two steps", () => {
    const model = parseDSL(
      doc(`[a: one]
  id: done;
[a: two]
  id: done;`),
    );
    expect(model.errors.filter((e) => e.msg === 'duplicate node id "done"')).toHaveLength(1);
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

describe("a backward goto's routing", () => {
  it("routes around the blocks between, not up the flow's spine", () => {
    const svg = render(
      doc(`[a: start]
  id: again;
[a: middle]
[a: check]
if (ok?)
case (no)
  [goto: again]
case ()
  [a: done]
end-if`),
    );
    // The jump runs up a vertical rail and comes in to the target's side. That
    // rail must sit outside every block it passes — here all blocks share one
    // lane, so it must clear that lane's block width.
    const body = svg.slice(svg.indexOf("</defs>"));
    const jumpD = body.match(/<path[^>]*\bdata-jump="goto"[^>]*\sd="([^"]+)"/)?.[1];
    expect(jumpD, "the goto is drawn as one tagged path").toBeTruthy();
    const pts = [...jumpD.matchAll(/[ML]\s+(-?[\d.]+)\s+(-?[\d.]+)/g)].map(([, x, y]) => [
      Number(x),
      Number(y),
    ]);
    expect(pts.at(-1)[1], "it ends above where it started").toBeLessThan(pts[0][1]);
    const boxes = [...body.matchAll(/<rect[^>]*x="([\d.]+)"[^>]*width="188"/g)].map((m) => ({
      left: Number(m[1]),
      right: Number(m[1]) + 188,
    }));
    const rail = pts
      .slice(1)
      .map((p, i) => [pts[i], p])
      .filter(([p, q]) => p[0] === q[0])
      .sort((a, b) => Math.abs(b[0][1] - b[1][1]) - Math.abs(a[0][1] - a[1][1]))[0];
    const routeX = rail[0][0];
    const clear = boxes.every((b) => routeX < b.left || routeX > b.right);
    expect(clear).toBe(true);
  });
});
