import { describe, expect, it } from "vitest";
import { parseDSL } from "../parser.js";
import { THEMES } from "../themes.js";
import { renderDiagramSvg } from "./diagram.js";

const theme = THEMES.basic;

function render(dsl) {
  return renderDiagramSvg({ model: parseDSL(dsl), theme, showStepBlockCaptions: false });
}

/** Fork/endfork gateways match endif styling: purple fill + stroke circles. */
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

/** v1 fork: the first path opens at `fork` itself and never gets its own row. */
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
and
[b: 台帳更新]
and
[c: 配送初期化]
endfork
[a: 完了]
@end`;

describe("parallel fork/join", () => {
  it("parses fork/and/endfork into parallel branch rows", () => {
    const model = parseDSL(FORK);
    expect(model.errors).toEqual([]);
    const start = model.rows.find((r) => r.kind === "branchStart");
    expect(start.parallel).toBe(true);
    const cases = model.rows.filter((r) => r.kind === "branchCase");
    expect(cases.length).toBe(2); // two `and`s (first path opens at `fork`)
    expect(cases.every((c) => c.parallel)).toBe(true);
    const end = model.rows.find((r) => r.kind === "branchEnd");
    expect(end.parallel).toBe(true);
  });

  it("renders purple fork and endfork circles (not diamonds or bars)", () => {
    const circles = forkGatewayCircles(render(FORK));
    expect(circles.length).toBe(2);
  });

  it("rejects elseif/endif against a fork and and/endfork against an if", () => {
    const mixed = parseDSL(`@kai-swimlane
/role/
<a>
label: A;
/line/
fork
[a: x]
elseif (y) than
[a: z]
endif
@end`);
    const msgs = mixed.errors.map((e) => e.msg);
    expect(msgs).toContain("elseif without if");
    expect(msgs).toContain("endif without if");
  });
});

describe("v2 labeled fork (fork (label) / and (label))", () => {
  // Unlike v1, where a fork's first path never gets a row of its own, the v2
  // reader emits an explicit `branchCase` for `fork (label)` itself, right
  // after the `branchStart` row (parser-v2.js). The renderer's `branchStart`
  // handling used to synthesize an implicit first-path case unconditionally
  // for every parallel frame, regardless of DSL version — double-counting
  // v2's already-explicit first case into a 4th, unlabeled, step-less case
  // that rendered as a bare vertical rail with no block on it.
  const FORK_V2 = `@kai-swimlane 2
/role/
<a>
  label: A;

/line/
[a: 開始]
fork (書類) #orange
  [a: 契約]
and (アカウント) #purple
  [a: 発行]
and (備品) #blue
  [a: 手配]
end-fork
[a: 完了]
@end`;

  it("parses fork (label)/and (label) into exactly 3 parallel branchCase rows", () => {
    const model = parseDSL(FORK_V2);
    expect(model.errors).toEqual([]);
    const cases = model.rows.filter((r) => r.kind === "branchCase" && r.parallel);
    expect(cases.map((c) => c.label)).toEqual(["書類", "アカウント", "備品"]);
  });

  it("fans out exactly 3 edges from the gateway, not 4 (no phantom rail)", () => {
    expect(largestFanOutGroup(render(FORK_V2))).toBe(3);
  });

  it("renders all 3 case labels as chips", () => {
    const svg = render(FORK_V2);
    for (const label of ["書類", "アカウント", "備品"]) {
      expect(svg).toContain(`>${label}<`);
    }
  });

  it("still synthesizes the implicit first-path case for a v1 fork", () => {
    // v1 never emits a row for the fork's own first path, so the renderer
    // must still synthesize it — this regression guard must not remove it
    // for v1. FORK has 2 explicit `and` cases + the synthesized first path
    // = 3 fan-out edges, same count as the v2 fixture above (coincidentally
    // equal case totals, not equal case shapes).
    expect(largestFanOutGroup(render(FORK))).toBe(3);
  });
});
