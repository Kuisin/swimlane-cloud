import { describe, expect, it } from "vitest";
import { buildStepRowDisplayInfo, parseDSL } from "./parser.js";
import { THEMES } from "./themes.js";
import { renderDiagramSvg } from "./render-pure/diagram.js";

const render = (dsl) => renderDiagramSvg({ model: parseDSL(dsl), theme: THEMES.basic });

const v1 = (body) => `@kai-swimlane
/role/
<a>
label: A;
<b>
label: B;
/line/
${body}
@end
`;

const v2 = (body) => `@kai-swimlane-v2
/role/
<a>
label: A;
<b>
label: B;
/line/
${body}
@end
`;

describe("a landing marker (v1)", () => {
  it("parses `[merge]` and a bare `merge;` that lands on it", () => {
    const model = parseDSL(
      v1(`[a: start]
if (cancel?) is (yes) than
  [a: accept]
  merge;
else
  [b: normal]
end-if
[a: refund]
[merge]
[a: done]`),
    );
    expect(model.errors).toEqual([]);
    const merge = model.rows.find((r) => r.kind === "branchMerge");
    expect(merge.mergeTarget).toBeNull();
    const marker = model.rows.find((r) => r.kind === "mergeMarker");
    expect(marker).toMatchObject({ name: null });
    expect(model.rows[model.rows.indexOf(marker) + 1]).toMatchObject({ text: "done" });
  });

  it("parses `[merge: name]` and lets `merge: name;` target it", () => {
    const model = parseDSL(
      v1(`if (x?) is (yes) than
  [a: one]
  merge: done;
else
  [b: two]
end-if
[merge: done]
[a: after]`),
    );
    expect(model.errors).toEqual([]);
    expect(model.rows.find((r) => r.kind === "mergeMarker")).toMatchObject({ name: "done" });
  });

  it("rejects a bare merge with no marker after its if", () => {
    const model = parseDSL(
      v1(`if (x?) is (yes) than
  [a: one]
  merge;
end-if
[a: after]`),
    );
    expect(model.errors.map((e) => e.msg)).toContain("merge; has no [merge] marker after this if");
  });

  it("rejects a marker name that is also a step id", () => {
    const model = parseDSL(
      v1(`[a: one]
id: done;
[merge: done]
[a: two]`),
    );
    expect(model.errors.filter((e) => e.msg === 'duplicate step id "done"')).toHaveLength(2);
  });

  it("renders exactly as the id-based form does, with the marker taking no space", () => {
    const withMarker = v1(`[a: start]
if (cancel?) is (yes) than
  [a: accept]
  merge;
else
  [b: normal]
end-if
[a: refund]
[merge]
[a: done]`);
    const withId = v1(`[a: start]
if (cancel?) is (yes) than
  [a: accept]
  merge: done;
else
  [b: normal]
end-if
[a: refund]
[a: done]
id: done;`);
    expect(render(withMarker)).toBe(render(withId));
  });
});

describe("a landing marker (v2)", () => {
  it("parses `merge` / `merge @name` and a bare or named `goto`", () => {
    const model = parseDSL(
      v2(`[a: start]
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
      v2(`if (x?)
case (yes)
  [a: one]
  goto
end-if
[a: after]`),
    );
    expect(model.errors.map((e) => e.msg)).toContain("goto has no merge marker after this if");
  });
});

describe("step numbering with level", () => {
  const doc = v1(`[a: take order]
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
    const model = parseDSL(doc);
    expect(model.errors).toEqual([]);
    const info = buildStepRowDisplayInfo(model.rows);
    const numbers = model.rows
      .map((r, i) => (r.kind === "step" ? info.get(i) : null))
      .filter(Boolean)
      .map((d) => d.displayIndex ?? "skip");
    expect(numbers).toEqual(["1", "2", "2-1", "2-2", "2-2-1", "3", "skip", "4"]);
  });

  it("writes the hierarchical number into the left gutter", () => {
    const svg = render(doc);
    expect(svg).toContain("2-2-1. ");
    expect(svg).toContain("3. ");
  });

  it("counts a sub-step with no parent under an implicit 1, which the next step follows", () => {
    const model = parseDSL(
      v1(`[a: first]
level: 2;
[a: second]`),
    );
    const info = buildStepRowDisplayInfo(model.rows);
    expect([...info.values()].map((d) => d.displayIndex)).toEqual(["1-1", "2"]);
  });

  it("rejects a level outside 1-9 (v1) and a non-integer level (v2)", () => {
    expect(parseDSL(v1(`[a: x]\nlevel: 0;`)).errors.map((e) => e.msg)).toContain(
      "level must be written as level: <1-9>;",
    );
    expect(parseDSL(v2(`[a: x]\nlevel: 1.5;`)).errors.map((e) => e.msg)).toContain(
      "level must be a whole number from 1 to 9",
    );
  });
});
