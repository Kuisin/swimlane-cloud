import { describe, expect, it } from "vitest";
import { parseDSL } from "../parser.js";
import { THEMES } from "../themes.js";
import { renderDiagramSvg } from "./diagram.js";

/**
 * Geometry of the one edge a `goto` / `loop` draws.
 *
 * Every case here renders a whole diagram and reads the arrows back out of the
 * SVG, because the bugs these cover were all geometric: an arrow that ended
 * inside the box it pointed at, a rail drawn straight through a block, two
 * jumps on one line, and a case whose only row was a jump drawing a stub that
 * started nowhere. The shared checks below hold for *every* fixture, so a new
 * routing rule has to keep all of them true at once.
 */

const doc = (body) => `@kai-swimlane
/role/
<a>
label: Alpha;
<b>
label: Bravo;
<c>
label: Charlie;
/line/
${body}
@end`;

const renderAnyway = (body) =>
  renderDiagramSvg({
    model: parseDSL(doc(body)),
    theme: THEMES.basic,
    showStepBlockCaptions: false,
  });

const render = (body) => {
  const model = parseDSL(doc(body));
  expect(model.errors, JSON.stringify(model.errors)).toEqual([]);
  return renderDiagramSvg({ model, theme: THEMES.basic, showStepBlockCaptions: false });
};

/** Every `<path>` the renderer tagged as a jump, with its polyline. */
function jumpArrows(svg) {
  return [...svg.matchAll(/<path\b[^>]*\bdata-jump="[^"]*"[^>]*\/>/g)].map(([tag]) => {
    const attr = (name) => tag.match(new RegExp(`\\b${name}="([^"]*)"`))?.[1] ?? null;
    const from = attr("data-jump-from");
    return {
      kind: attr("data-jump"),
      row: Number(attr("data-jump-row")),
      // "" = the jump is the whole case body; "join:…" = it leaves a nested
      // block's join; otherwise the row index of the block it leaves.
      from: from === "" || from.startsWith("join:") ? null : Number(from),
      fromRaw: from,
      to: attr("data-jump-to"),
      markerEnd: attr("marker-end"),
      points: points(attr("d")),
    };
  });
}

/** `M x y L x y …` → `[[x, y], …]`. The router only ever emits M/L. */
function points(d) {
  return [...d.matchAll(/[ML]\s+(-?[\d.]+)\s+(-?[\d.]+)/g)].map(([, x, y]) => [
    Number(x),
    Number(y),
  ]);
}

/**
 * Every step block's box. Step blocks are the only `rx="6"` rects the renderer
 * draws at the node width, which is what makes them findable without the
 * renderer having to label them.
 */
function stepBoxes(svg) {
  return [
    ...svg.matchAll(/<rect x="([\d.]+)" y="([\d.]+)" width="188" height="([\d.]+)" rx="6"/g),
  ].map(([, x, y, h]) => ({
    left: Number(x),
    right: Number(x) + 188,
    top: Number(y),
    bottom: Number(y) + Number(h),
  }));
}

const segments = (pts) => pts.slice(1).map((p, i) => [pts[i], p]);

/** Axis-aligned segment × rect, with the rect shrunk so touching is allowed. */
function crossesBox(segment, box, inset = 1) {
  const [[x1, y1], [x2, y2]] = segment;
  const left = box.left + inset;
  const right = box.right - inset;
  const top = box.top + inset;
  const bottom = box.bottom - inset;
  return (
    Math.min(x1, x2) < right &&
    Math.max(x1, x2) > left &&
    Math.min(y1, y2) < bottom &&
    Math.max(y1, y2) > top
  );
}

const onBoxEdge = ({ left, right, top, bottom }, [x, y], slack = 0.51) =>
  ((Math.abs(x - left) <= slack || Math.abs(x - right) <= slack) &&
    y >= top - slack &&
    y <= bottom + slack) ||
  ((Math.abs(y - top) <= slack || Math.abs(y - bottom) <= slack) &&
    x >= left - slack &&
    x <= right + slack);

/**
 * The invariants every jump arrow in every fixture has to satisfy. Returns the
 * arrows so a case can go on to assert what is specific to it.
 */
function checkedArrows(svg, expectedCount) {
  const arrows = jumpArrows(svg);
  expect(arrows).toHaveLength(expectedCount);
  // One arrow per jump row — never two drawings of the same statement.
  expect(new Set(arrows.map((a) => a.row)).size).toBe(expectedCount);
  const boxes = stepBoxes(svg);
  for (const arrow of arrows) {
    expect(arrow.markerEnd, "a jump carries its arrowhead").toBeTruthy();
    expect(arrow.points.length, "a jump is a polyline, not a point").toBeGreaterThanOrEqual(2);
    // No zero-length or doubling-back segments: those are the stubs.
    for (const [p, q] of segments(arrow.points)) {
      expect(p[0] === q[0] || p[1] === q[1], "every segment is axis-aligned").toBe(true);
      expect(p[0] !== q[0] || p[1] !== q[1], "no zero-length segment").toBe(true);
    }
    // Nothing on the way is drawn over.
    for (const box of boxes) {
      for (const seg of segments(arrow.points)) {
        expect(
          crossesBox(seg, box),
          `segment ${JSON.stringify(seg)} runs through a block ${JSON.stringify(box)}`,
        ).toBe(false);
      }
    }
    // The arrowhead sits on the target's own edge, and the last leg comes in
    // horizontally from the rail rather than stopping short in mid-air.
    const end = arrow.points[arrow.points.length - 1];
    const target = boxes.find((b) => onBoxEdge(b, end));
    if (arrow.to !== null && !arrow.to.startsWith("gateway:")) {
      expect(target, `the arrowhead at ${end} is not on any block's edge`).toBeDefined();
      expect(
        Math.abs(end[0] - target.left) < 0.51 || Math.abs(end[0] - target.right) < 0.51,
        "a jump arrives on the target's left or right edge, never inside it",
      ).toBe(true);
    }
    // The tail leaves the source block's bottom edge.
    if (arrow.from !== null) {
      const [sx, sy] = arrow.points[0];
      const source = boxes.find(
        (b) => Math.abs(b.bottom - sy) < 0.51 && sx > b.left && sx < b.right,
      );
      expect(
        source,
        `the tail at ${arrow.points[0]} is not on a block's bottom edge`,
      ).toBeDefined();
    }
  }
  return arrows;
}

/** The x of the long vertical leg — the rail the jump runs down (or up) in. */
const railX = (arrow) => {
  const vertical = segments(arrow.points)
    .filter(([p, q]) => p[0] === q[0])
    .sort((a, b) => Math.abs(b[0][1] - b[1][1]) - Math.abs(a[0][1] - a[1][1]))[0];
  return vertical[0][0];
};

const endY = (arrow) => arrow.points[arrow.points.length - 1][1];

describe("1. a forward `[goto: id]` to a later block in the same lane", () => {
  const svg = render(`[a: start]
if (q1?)
case (yes)
[a: one]
[goto: later]
case (no)
[a: two]
end-if
[a: three]
[a: later]
  id: later;`);

  it("draws one arrow, from `one`'s bottom edge to `later`'s side", () => {
    const [jump] = checkedArrows(svg, 1);
    expect(jump.kind).toBe("goto");
    const boxes = stepBoxes(svg);
    const later = boxes[boxes.length - 1];
    expect(endY(jump)).toBeCloseTo((later.top + later.bottom) / 2, 5);
  });
});

describe("2. a forward `[goto: id]` into another lane", () => {
  const svg = render(`[a: start]
if (q1?)
case (yes)
[a: one]
[goto: later]
case (no)
[a: two]
end-if
[b: three]
[c: later]
  id: later;`);

  it("crosses the lanes without running over anything", () => {
    const [jump] = checkedArrows(svg, 1);
    // The target is in the right-hand lane, so the rail runs on that side.
    expect(railX(jump)).toBeGreaterThan(jump.points[0][0]);
  });
});

describe("3. a backward `[goto: id]`", () => {
  it("reaches an earlier block in the same lane", () => {
    const svg = render(`[a: start]
  id: top;
[a: middle]
if (q1?)
case (yes)
[a: one]
[goto: top]
case (no)
[a: two]
end-if
[a: done]`);
    const [jump] = checkedArrows(svg, 1);
    // It really does run back up the page.
    expect(endY(jump)).toBeLessThan(jump.points[0][1]);
    expect(jump.to).toBe("0");
  });

  it("reaches an earlier block in another lane", () => {
    const svg = render(`[c: start]
  id: top;
[a: middle]
if (q1?)
case (yes)
[a: one]
[goto: top]
case (no)
[a: two]
end-if
[a: done]`);
    const [jump] = checkedArrows(svg, 1);
    expect(endY(jump)).toBeLessThan(jump.points[0][1]);
    // Before the fix the rail ran at the target's centre, so the arrow ended
    // inside the block: the last leg was invisible under the box.
    const start = stepBoxes(svg).find((b) => b.top < jump.points[0][1] - 100);
    expect(onBoxEdge(start, jump.points[jump.points.length - 1])).toBe(true);
  });
});

describe("4. a jump from inside a nested if", () => {
  const svg = render(`[a: start]
if (outer?)
case (yes)
if (inner?)
case (deep)
[a: deep]
[goto: later]
case (shallow)
[a: shallow]
end-if
case (no)
[b: two]
end-if
[a: later]
  id: later;`);

  it("leaves the inner case's last block and clears both joins", () => {
    const [jump] = checkedArrows(svg, 1);
    expect(jump.from).toBe(3); // `deep`
  });

  it("a case that ends with a whole nested if jumps from that block's join", () => {
    const nested = render(`[a: start]
if (outer?)
case (yes)
if (inner?)
case (a)
[a: one]
case (b)
[a: two]
end-if
[goto: later]
case (no)
[b: three]
end-if
[a: later]
  id: later;`);
    const [jump] = checkedArrows(nested, 1);
    // Not `two`: the last block of one of the nested cases is not where the
    // outer case's flow leaves from — the nested join is.
    expect(jump.fromRaw).toMatch(/^join:/);
  });
});

describe("5. a jump out of a fork path, a section and a branch group", () => {
  it("from a fork path", () => {
    const svg = render(`[a: start]
fork (left)
[a: l1]
if (q?)
case (yes)
[a: l2]
[goto: later]
case (no)
[a: l3]
end-if
and (right)
[b: r1]
end-fork
[a: later]
  id: later;`);
    checkedArrows(svg, 1);
  });

  it("from inside a section", () => {
    const svg = render(`[a: start]
section (audit)
if (q?)
case (yes)
[a: inside]
[goto: later]
case (no)
[a: other]
end-if
end-section
[b: later]
  id: later;`);
    checkedArrows(svg, 1);
  });

  it("from inside a branch group, which is where the tail comes from", () => {
    const svg = render(`[a: start]
branch (side)
if (q?)
case (yes)
[b: aside]
[goto: later]
case (no)
[b: other]
end-if
end-branch
[a: middle]
[a: later]
  id: later;`);
    const [jump] = checkedArrows(svg, 1);
    expect(jump.from).toBe(3); // `aside`, inside the group — not the block before it
  });
});

describe("6. a case whose only row is a jump", () => {
  it("`loop`: turns back just under its label, not from the bottom of the page", () => {
    const svg = render(`[a: start]
  id: top;
if (retry?)
case (yes)
[a: work]
case (no)
loop
end-if
[a: done]`);
    const [jump] = checkedArrows(svg, 1);
    expect(jump.kind).toBe("loop");
    expect(jump.to).toMatch(/^gateway:/);
    // The whole arrow lives in the top half of the diagram — the bug it fixes
    // drew a rail all the way down past every later row.
    const done = stepBoxes(svg).at(-1);
    for (const [, y] of jump.points) expect(y).toBeLessThan(done.top);
  });

  it("`[goto: id]`: starts on the case's own rail, not at the jump row's y", () => {
    const svg = render(`[a: start]
if (q1?)
case (yes)
[a: work]
case (no)
[goto: later]
end-if
[a: middle]
[a: later]
  id: later;`);
    const [jump] = checkedArrows(svg, 1);
    expect(jump.from).toBeNull();
    // The rail the decision drew ends exactly where the jump picks up.
    const rails = [
      ...svg.matchAll(/<path d="(M [^"]*)" fill="none" stroke="[^"]*" stroke-width="1\.6"/g),
    ]
      .map(([, d]) => points(d))
      .filter((pts) => pts.length === 4);
    const [jx, jy] = jump.points[0];
    expect(
      rails.some(([, , , end]) => Math.abs(end[0] - jx) < 0.51 && Math.abs(end[1] - jy) < 0.51),
      "the case's fan-out rail and its jump meet",
    ).toBe(true);
  });

  it("`loop @id` goes to the named block, not to the enclosing question", () => {
    const svg = render(`[a: start]
  id: top;
[b: gate]
if (retry?)
case (yes)
[a: work]
case (no)
loop @top
end-if
[a: done]`);
    const [jump] = checkedArrows(svg, 1);
    expect(jump.kind).toBe("loop");
    expect(jump.to).toBe("0"); // `start`, the `id: top` block
  });
});

describe("7. several jumps onto one block", () => {
  const svg = render(`[a: start]
if (q1?)
case (yes)
[a: one]
[goto: later]
case (no)
[b: two]
[goto: later]
end-if
if (q2?)
case (yes)
[c: three]
[goto: later]
case (no)
[a: four]
end-if
[a: later]
  id: later;`);

  it("draws one arrow each, on its own rail, with its own arrowhead", () => {
    const arrows = checkedArrows(svg, 3);
    expect(new Set(arrows.map((a) => a.to))).toEqual(new Set(["14"]));
    expect(new Set(arrows.map(railX)).size, "no two jumps share a rail").toBe(3);
    expect(new Set(arrows.map(endY)).size, "no two arrowheads land on one point").toBe(3);
  });
});

describe("8. a target one row after the end-if", () => {
  const svg = render(`[a: start]
if (q1?)
case (yes)
[a: one]
[goto: next]
case (no)
[a: two]
end-if
[a: next]
  id: next;`);

  it("still routes around the join instead of cutting through it", () => {
    const [jump] = checkedArrows(svg, 1);
    expect(jump.to).toBe("7");
  });
});

describe("a jump with nothing to land on", () => {
  // Diagnosed by the reader, but the editor still renders while the text is
  // being typed — so the picture has to stay sane, with no arrow dangling
  // off a target that does not exist.
  it("`[goto: unknown]` draws no arrow and leaves the case merging into the join", () => {
    const svg = renderAnyway(`[a: start]
if (q?)
case (yes)
[a: one]
[goto: nope]
case (no)
[a: two]
end-if
[a: done]`);
    expect(jumpArrows(svg)).toHaveLength(0);
  });
});
