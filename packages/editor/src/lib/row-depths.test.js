import { describe, expect, it } from "vitest";
import { computeRowDepths } from "./row-depths.js";
import { formatDsl } from "./format-dsl.js";

const step = (text, depth = 99) => ({ kind: "step", role: "a", text, depth });

describe("computeRowDepths", () => {
  it("nests a branch inside a group, and its body inside both", () => {
    const rows = [
      { kind: "groupStart", id: 1, depth: 0 },
      { kind: "branchStart", id: 1, depth: 0 }, // parser said 0; it is inside the section
      { kind: "branchCase", id: 1, depth: 0 },
      step("inside"),
      { kind: "branchEnd", id: 1, depth: 0 },
      { kind: "groupEnd", id: 1, depth: 0 },
      step("after"),
    ];
    expect(computeRowDepths(rows).map((d) => [d.depth, d.controlDepth])).toEqual([
      [0, 0],
      [1, 1],
      [2, 1],
      [2, 2],
      [1, 1],
      [0, 0],
      [0, 0],
    ]);
  });

  it("nests a group inside a case, and a second case back at the branch column", () => {
    const rows = [
      { kind: "branchStart", id: 7 },
      { kind: "branchCase", id: 7 },
      { kind: "groupStart", id: 3 },
      step("in section"),
      { kind: "groupEnd", id: 3 },
      { kind: "branchCase", id: 7 },
      step("else"),
      { kind: "branchEnd", id: 7 },
    ];
    expect(computeRowDepths(rows).map((d) => d.depth)).toEqual([0, 1, 1, 2, 1, 1, 1, 0]);
    expect(computeRowDepths(rows).map((d) => d.controlDepth)).toEqual([0, 0, 1, 2, 1, 0, 1, 0]);
  });

  it("lines a case up with its own branch even when an inner branch sits between", () => {
    const rows = [
      { kind: "branchStart", id: 1 },
      { kind: "branchCase", id: 1 },
      { kind: "branchStart", id: 2 },
      { kind: "branchCase", id: 2 },
      step("deep"),
      { kind: "branchEnd", id: 2 },
      { kind: "branchCase", id: 1 },
      { kind: "branchEnd", id: 1 },
    ];
    expect(computeRowDepths(rows).map((d) => d.controlDepth)).toEqual([0, 0, 1, 1, 2, 1, 0, 0]);
  });

  it("never goes negative on a stray closer", () => {
    const rows = [{ kind: "branchEnd", id: 9 }, { kind: "groupEnd", id: 9 }, step("x")];
    expect(computeRowDepths(rows).map((d) => d.depth)).toEqual([0, 0, 0]);
  });
});

describe("formatting nested indents", () => {
  it("indents an if inside a section, and the step inside both", () => {
    const src = `@kai-swimlane

/role/

<a>
label: A;

/line/

section (Audit)
if (x?) is (yes) than
[a: inside]
end-if
end-section

@end
`;
    const result = formatDsl(src);
    expect(result.ok).toBe(true);
    const flow = result.value.split("/line/")[1].split("@end")[0].trim().split("\n");
    expect(flow).toEqual([
      "section (Audit)",
      "  if (x?) is (yes) than",
      "    [a: inside]",
      "  end-if",
      "end-section",
    ]);
  });

  it("indents a section inside a case one level under the case", () => {
    const src = `@kai-swimlane-v2

/role/

<a>
label: A;

/line/

if (x?)
case (yes)
section (Audit)
[a: inside]
end-section
case ()
[a: other]
end-if

@end
`;
    const result = formatDsl(src);
    expect(result.ok, JSON.stringify(result.errors)).toBe(true);
    const flow = result.value.split("/line/")[1].split("@end")[0].trim().split("\n");
    expect(flow.filter((l) => l.trim())).toEqual([
      "if (x?)",
      "case (yes)",
      "  section (Audit)",
      "    [a: inside]",
      "  end-section",
      "case ()",
      "  [a: other]",
      "end-if",
    ]);
  });
});
