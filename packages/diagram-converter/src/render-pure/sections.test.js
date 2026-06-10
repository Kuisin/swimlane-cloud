import { describe, expect, it } from "vitest";
import { parseDSL } from "../parser.js";
import { THEMES } from "../themes.js";
import { renderDiagramSvg } from "./diagram.js";
import { DIAGRAM_LAYOUT } from "./diagram-layout.js";
import { findGroupEndIndex } from "../group-rows.js";

const theme = THEMES.basic;

function render(dsl) {
  const model = parseDSL(dsl);
  return renderDiagramSvg({ model, theme, showStepBlockCaptions: false });
}

/** Count dashed section boxes (stroke-dasharray="6 4" on a rect). */
function sectionBoxCount(svg) {
  return (svg.match(/stroke-dasharray="6 4"/g) || []).length;
}

/**
 * x-positions of section box rects (x attr comes before stroke-dasharray in
 * the serialized SVG since attributes are written in declaration order).
 */
function sectionBoxXValues(svg) {
  // Anchor on `<rect x="…"` (x is the first attribute) — `[^>]*x=` would greedily
  // capture the later `rx="8"` corner radius instead of the real x position.
  return [...svg.matchAll(/<rect x="([\d.]+)"[^>]*stroke-dasharray="6 4"/g)].map(
    (m) => +m[1],
  );
}

/** Count arrows (path or line with marker-end="#arrowhead"). */
function arrowCount(svg) {
  const paths = (svg.match(/<path[^>]*marker-end="url\(#arrowhead\)"/g) || []).length;
  const lines = (svg.match(/<line[^>]*marker-end="url\(#arrowhead\)"/g) || []).length;
  return paths + lines;
}

const BASE_DSL = `@kai-swimlane
/role/
<a>
label: A;
<b>
label: B;
/line/`;

// ──────────────────────────────────────────────────────────────────────────────
// Parser tests
// ──────────────────────────────────────────────────────────────────────────────

describe("section — parser", () => {
  it("parses a basic section into groupStart/groupEnd rows", () => {
    const model = parseDSL(`${BASE_DSL}
[a: 前]
section (監査)
  [a: 監査1]
  [b: 監査2]
end-section
[a: 後]
@end`);
    expect(model.errors).toEqual([]);
    const start = model.rows.find((r) => r.kind === "groupStart");
    const end = model.rows.find((r) => r.kind === "groupEnd");
    expect(start?.groupMode).toBe("section");
    expect(start?.sectionName).toBe("監査");
    expect(end?.id).toBe(start?.id);
  });

  it("parses nested sections with unique ids and inner depth > outer depth", () => {
    const model = parseDSL(`${BASE_DSL}
section (outer)
  [a: step1]
  section (inner)
    [a: step2]
  end-section
  [a: step3]
end-section
@end`);
    expect(model.errors).toEqual([]);
    const starts = model.rows.filter((r) => r.kind === "groupStart");
    expect(starts.length).toBe(2);
    const outer = starts.find((r) => r.sectionName === "outer");
    const inner = starts.find((r) => r.sectionName === "inner");
    expect(outer?.id).not.toBe(inner?.id);
    expect(inner?.depth).toBeGreaterThan(outer?.depth);
  });

  it("errors on unclosed section", () => {
    const model = parseDSL(`${BASE_DSL}
section (open)
  [a: step]
@end`);
    expect(model.errors.some((e) => e.msg.includes("unclosed section"))).toBe(true);
  });

  it("errors on end-section without matching section", () => {
    const model = parseDSL(`${BASE_DSL}
[a: step]
end-section
@end`);
    expect(model.errors.some((e) => e.msg.includes("end-section without section"))).toBe(true);
  });

  it("parses a section inside an if case", () => {
    const model = parseDSL(`${BASE_DSL}
if (x) is (yes) than
  section (inner)
    [a: step]
  end-section
else
  [b: no]
endif
@end`);
    expect(model.errors).toEqual([]);
    const gs = model.rows.find((r) => r.kind === "groupStart");
    expect(gs?.groupMode).toBe("section");
  });

  it("findGroupEndIndex correctly pairs nested groups", () => {
    const model = parseDSL(`${BASE_DSL}
section (outer)
  [a: s1]
  section (inner)
    [a: s2]
  end-section
  [a: s3]
end-section
@end`);
    const rows = model.rows;
    const outerIdx = rows.findIndex((r) => r.kind === "groupStart" && r.sectionName === "outer");
    const innerIdx = rows.findIndex((r) => r.kind === "groupStart" && r.sectionName === "inner");
    const outerEnd = findGroupEndIndex(rows, outerIdx);
    const innerEnd = findGroupEndIndex(rows, innerIdx);
    // Outer end must be further than inner end.
    expect(outerEnd).toBeGreaterThan(innerEnd);
    // Each end row must carry the matching id.
    expect(rows[innerEnd].id).toBe(rows[innerIdx].id);
    expect(rows[outerEnd].id).toBe(rows[outerIdx].id);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// Diagram rendering tests
// ──────────────────────────────────────────────────────────────────────────────

describe("section — diagram rendering", () => {
  it("renders a dashed section box for a basic section", () => {
    const svg = render(`${BASE_DSL}
[a: 前]
section (監査ブロック) #blue
  [a: 監査1]
  [b: 監査2]
end-section
[a: 後]
@end`);
    expect(sectionBoxCount(svg)).toBeGreaterThanOrEqual(1);
  });

  it("renders the section label inside the box", () => {
    const svg = render(`${BASE_DSL}
section (My Section)
  [a: step]
end-section
@end`);
    expect(svg).toContain("My Section");
  });

  it("renders arrows between steps inside a section", () => {
    // Steps are in different lanes so they produce path connectors.
    const svg = render(`${BASE_DSL}
section (test)
  [a: step1]
  [b: step2]
  [a: step3]
end-section
@end`);
    // step1→step2 and step2→step3 connectors plus start/end terminals.
    expect(arrowCount(svg)).toBeGreaterThanOrEqual(2);
  });

  it("draws the same number of arrows for a section as for bare steps", () => {
    const withSection = render(`${BASE_DSL}
[a: before]
section (wrap)
  [b: inside]
end-section
[a: after]
@end`);
    const withoutSection = render(`${BASE_DSL}
[a: before]
[b: inside]
[a: after]
@end`);
    // A section is purely visual; it must not add or remove any connectors.
    expect(arrowCount(withSection)).toBe(arrowCount(withoutSection));
  });

  it("renders the out-arrow from if/fork merge to a step inside a following section", () => {
    // Bug fixed: findNextFlowStepAfterBranchEnd previously skipped steps inside
    // sections (using isInsideGroup instead of isInsideBranchGroup).
    const withSection = render(`${BASE_DSL}
if (x) is (yes) than
  [a: yes]
else
  [b: no]
endif
section (after)
  [a: after-step]
end-section
@end`);
    const withoutSection = render(`${BASE_DSL}
if (x) is (yes) than
  [a: yes]
else
  [b: no]
endif
[a: after-step]
@end`);
    // Both flows are structurally identical (section is visual-only).
    expect(arrowCount(withSection)).toBe(arrowCount(withoutSection));
  });

  it("renders two separate section boxes for nested sections", () => {
    const svg = render(`${BASE_DSL}
section (outer)
  [a: step1]
  section (inner)
    [a: step2]
  end-section
  [a: step3]
end-section
@end`);
    expect(sectionBoxCount(svg)).toBe(2);
  });

  it("insets the inner section box relative to the outer section box", () => {
    const svg = render(`${BASE_DSL}
section (outer)
  [a: step1]
  section (inner)
    [a: step2]
  end-section
end-section
@end`);
    const xs = sectionBoxXValues(svg);
    expect(xs.length).toBe(2);
    // Inner section must start further right (more inset) than the outer.
    expect(Math.max(...xs)).toBeGreaterThan(Math.min(...xs));
  });

  it("renders section box with the specified color", () => {
    const svg = render(`${BASE_DSL}
section (colored) #green
  [a: step]
end-section
@end`);
    // BRANCH_COLOR_STYLES.green stroke = "#15803d".
    expect(svg).toContain("#15803d");
  });

  it("renders a branch group inside a section with its merge arrow", () => {
    const svg = render(`${BASE_DSL}
section (outer)
  [a: main-step]
  branch (side)
    [b: side-step]
  end-branch
  [a: after-branch]
end-section
@end`);
    expect(sectionBoxCount(svg)).toBeGreaterThanOrEqual(1);
    expect(arrowCount(svg)).toBeGreaterThanOrEqual(1);
  });

  it("draws the same arrows when a section wraps a branch group", () => {
    const withSection = render(`${BASE_DSL}
[a: main]
section (wrap)
  branch (side)
    [b: branch-step]
  end-branch
  [a: after]
end-section
@end`);
    const withoutSection = render(`${BASE_DSL}
[a: main]
branch (side)
  [b: branch-step]
end-branch
[a: after]
@end`);
    expect(arrowCount(withSection)).toBe(arrowCount(withoutSection));
  });

  it("renders a section inside a fork path", () => {
    const model = parseDSL(`${BASE_DSL}
fork
  [a: path1]
and
  section (fork-section)
    [b: section-step]
  end-section
endfork
[a: after]
@end`);
    expect(model.errors).toEqual([]);
    const svg = render(`${BASE_DSL}
fork
  [a: path1]
and
  section (fork-section)
    [b: section-step]
  end-section
endfork
[a: after]
@end`);
    expect(sectionBoxCount(svg)).toBeGreaterThanOrEqual(1);
  });

  it("applies arrow: line-type modifier for steps inside a section", () => {
    const svgDashed = render(`${BASE_DSL}
section (wrap)
  [a: step1]
  arrow: dashed;
  [b: step2]
end-section
@end`);
    // A dashed connector must appear.
    expect((svgDashed.match(/stroke-dasharray="6 3"/g) || []).length).toBeGreaterThanOrEqual(1);
  });

  it("paints the lane grid flush against both gutters when sections reserve outer padding", () => {
    const svg = render(`@kai-swimlane
/page/
right-title: 備考;
/role/
<a>
label: A;
<b>
label: B;
/line/
section (S1)
  [a: 手順1]
  remark: 備考あり;
  [b: 手順2]
end-section
@end`);
    const rects = [...svg.matchAll(/<rect ([^>]*?)\/?>/g)].map((m) => {
      const attrs = {};
      for (const a of m[1].matchAll(/([a-zA-Z-]+)="([^"]*)"/g)) attrs[a[1]] = a[2];
      return attrs;
    });
    const { xPad, leftGutterWidth, rightGutterWidth } = DIAGRAM_LAYOUT;
    const gridLeft = xPad + leftGutterWidth;
    // The lane-grid border must start where the left gutter ends…
    const gridBox = rects.find(
      (r) => r.fill === "none" && !r["stroke-dasharray"] && +r.x === gridLeft,
    );
    expect(gridBox).toBeTruthy();
    // …and end where the right (remark) gutter begins: no unpainted band.
    const rightGutterBox = rects.find(
      (r) => r.fill === "none" && +r.width === rightGutterWidth,
    );
    expect(rightGutterBox).toBeTruthy();
    expect(+gridBox.x + +gridBox.width).toBe(+rightGutterBox.x);
    // The first lane's background tint also covers the outer padding band.
    expect(rects.some((r) => +r.x === gridLeft && r.opacity === "0.12")).toBe(true);
    // The section box is inset sectionEdgeInset from the *painted* grid edge
    // on both sides, so it spans the visible lanes (not just the content area).
    const { sectionEdgeInset } = DIAGRAM_LAYOUT;
    const sectionBox = rects.find((r) => r["stroke-dasharray"] === "6 4");
    expect(sectionBox).toBeTruthy();
    expect(+sectionBox.x).toBe(+gridBox.x + sectionEdgeInset);
    expect(+sectionBox.x + +sectionBox.width).toBe(
      +gridBox.x + +gridBox.width - sectionEdgeInset,
    );
  });
});
