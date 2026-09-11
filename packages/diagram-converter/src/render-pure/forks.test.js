import { describe, expect, it } from "vitest";
import { parseDSL } from "../parser.js";
import { THEMES } from "../themes.js";
import { renderDiagramSvg } from "./diagram.js";

const theme = THEMES.basic;

function render(dsl) {
  return renderDiagramSvg({ model: parseDSL(dsl), theme, showStepBlockCaptions: false });
}

/** Fork/end-fork gateways match end-if styling: purple fill + stroke circles. */
function forkGatewayCircles(svg) {
  return [...svg.matchAll(/<circle[^>]*r="14"[^>]*fill="#f3e8ff"[^>]*stroke="#7e22ce"/g)];
}

/**
 * Every case's fan-out edge (`buildCaseFanOutEdgeD`) starts its path at the
 * same `(dCx, dCy + dH/2)` point for a given frame — one path per case in
 * `f.cases`, regardless of whether the case has a label or any steps. So the
 * largest group of body `<path>` elements sharing an identical `M x y` start
 * is exactly the case count of whichever frame has the most paths — a
 * black-box way to catch an extra, invisible case (a phantom rail) without
 * depending on internal state or on `key` (which never reaches the markup).
 * Excludes `<defs>` (arrowhead marker glyphs also start at a shared point).
 */
function largestFanOutGroup(svg) {
  const body = svg.slice(svg.indexOf("</defs>"));
  const starts = [...body.matchAll(/<path d="M ([-\d.]+) ([-\d.]+) /g)].map(
    (m) => `${m[1]},${m[2]}`,
  );
  const counts = new Map();
  for (const s of starts) counts.set(s, (counts.get(s) || 0) + 1);
  return Math.max(0, ...counts.values());
}

/**
 * A bare `fork` (no label) still gets an explicit `branchCase` row for its
 * own first path — the reader (parser-v2.js) always emits one for `fork`,
 * labelled or not, so there is only one behaviour now, not a "v1 leaves it
 * implicit, v2 makes it explicit" split.
 */
const FORK = `@kai-swimlane
/role/
<a>
label: A;
<b>
label: B;
<c>
label: C;
/line/
[a: 開始]
fork
[a: メール送信]
case
[b: 台帳更新]
case
[c: 配送初期化]
end-fork
[a: 完了]
@end`;

describe("parallel fork/join", () => {
  it("parses fork/case/end-fork into parallel branch rows", () => {
    const model = parseDSL(FORK);
    expect(model.errors).toEqual([]);
    const start = model.rows.find((r) => r.kind === "branchStart");
    expect(start.parallel).toBe(true);
    const cases = model.rows.filter((r) => r.kind === "branchCase");
    // `fork`'s own first path, plus the two `case`s.
    expect(cases.length).toBe(3);
    expect(cases.every((c) => c.parallel)).toBe(true);
    const end = model.rows.find((r) => r.kind === "branchEnd");
    expect(end.parallel).toBe(true);
  });

  it("renders purple fork and end-fork circles (not diamonds or bars)", () => {
    const circles = forkGatewayCircles(render(FORK));
    expect(circles.length).toBe(2);
  });

  it("rejects end-if against a fork and end-fork against an if", () => {
    const forkClosedByIf = parseDSL(`@kai-swimlane
/role/
<a>
label: A;
/line/
fork
[a: x]
end-if
@end`);
    expect(forkClosedByIf.errors.map((e) => e.msg)).toContain("end-if closes fork");

    const ifClosedByFork = parseDSL(`@kai-swimlane
/role/
<a>
label: A;
/line/
if (y) is (z) than
[a: x]
end-fork
@end`);
    expect(ifClosedByFork.errors.map((e) => e.msg)).toContain("end-fork closes if");
  });
});

describe("labeled fork (fork (label) / case (label))", () => {
  // The reader emits an explicit `branchCase` for `fork (label)` itself,
  // right after the `branchStart` row (parser-v2.js). The renderer must not
  // *also* synthesize an implicit first-path case on top of that — doing so
  // would double-count it into a 4th, unlabeled, step-less case that
  // rendered as a bare vertical rail with no block on it.
  const FORK_LABELED = `@kai-swimlane
/role/
<a>
  label: A;

/line/
[a: 開始]
fork (書類) #orange
  [a: 契約]
case (アカウント) #purple
  [a: 発行]
case (備品) #blue
  [a: 手配]
end-fork
[a: 完了]
@end`;

  it("parses fork (label)/case (label) into exactly 3 parallel branchCase rows", () => {
    const model = parseDSL(FORK_LABELED);
    expect(model.errors).toEqual([]);
    const cases = model.rows.filter((r) => r.kind === "branchCase" && r.parallel);
    expect(cases.map((c) => c.label)).toEqual(["書類", "アカウント", "備品"]);
  });

  it("fans out exactly 3 edges from the gateway, not 4 (no phantom rail)", () => {
    expect(largestFanOutGroup(render(FORK_LABELED))).toBe(3);
  });

  it("renders all 3 case labels as chips", () => {
    const svg = render(FORK_LABELED);
    for (const label of ["書類", "アカウント", "備品"]) {
      expect(svg).toContain(`>${label}<`);
    }
  });

  it("does not double-count an unlabeled fork's own first path either", () => {
    // FORK (above) has no label at all: `fork`'s own path plus 2 `case`s is
    // 3 explicit cases, so this must also fan out to exactly 3 edges, not 4.
    expect(largestFanOutGroup(render(FORK))).toBe(3);
  });
});

describe("blank else-if () than draws no label chip", () => {
  const IF_WITH_BLANK_CASE = `@kai-swimlane
/role/
<a>
  label: A;

/line/
[a: 開始]
if (q?) is (はい) than #green
  [a: 対応]
else-if () than
  [a: 何もしない]
end-if
[a: 完了]
@end`;

  it("still renders the labelled sibling's chip", () => {
    expect(render(IF_WITH_BLANK_CASE)).toContain(">はい<");
  });

  it("draws no chip text for the blank case", () => {
    const svg = render(IF_WITH_BLANK_CASE);
    // Every case-label chip is a <text> at font-size 11; the labelled case
    // above is the only one, so exactly one such node should exist — a
    // second, empty one would mean the blank case wrongly drew a chip.
    const chips = [
      ...svg.matchAll(/<text x="[^"]*" y="[^"]*" text-anchor="middle" font-size="11"/g),
    ];
    expect(chips).toHaveLength(1);
  });
});
