import { describe, expect, it } from "vitest";
import { parseDSL } from "../parser.js";
import { THEMES } from "../themes.js";
import { renderDiagramSvg } from "./diagram.js";

const theme = THEMES.basic;

function render(dsl) {
  const model = parseDSL(dsl);
  return renderDiagramSvg({ model, theme, showStepBlockCaptions: false });
}

/** Terminal dots are the only r="5" circles; return their {cx, cy}. */
function terminalCircles(svg) {
  return [...svg.matchAll(/<circle[^>]*cx="([\d.]+)"[^>]*cy="([\d.]+)"[^>]*r="5"/g)].map((m) => ({
    cx: +m[1],
    cy: +m[2],
  }));
}

/** Diamonds render as `M cx top L cx+w/2 mid L cx bottom L cx-w/2 mid Z`. */
function diamonds(svg) {
  const re =
    /M ([\d.-]+) ([\d.-]+) L ([\d.-]+) ([\d.-]+) L ([\d.-]+) ([\d.-]+) L ([\d.-]+) ([\d.-]+) Z/g;
  return [...svg.matchAll(re)].map((m) => {
    const cx = +m[1];
    const top = +m[2];
    const rightX = +m[3];
    return { cx, top, width: Math.abs(rightX - cx) * 2 };
  });
}

describe("flow terminals", () => {
  it("feeds the decision diamond when the flow starts with a branch", () => {
    const svg = render(`@kai-swimlane
/role/
<a>
label: A;
<b>
label: B;
/line/
if (x) is (yes) than
[a: yes]
else
[b: no]
endif
[a: After]
@end`);

    const circles = terminalCircles(svg);
    expect(circles.length).toBe(2); // start + end

    // The decision diamond is the widest diamond (merge diamonds are ~40px wide).
    const decision = diamonds(svg).sort((p, q) => q.width - p.width)[0];
    expect(decision).toBeTruthy();

    const startCircle = circles.sort((p, q) => p.cy - q.cy)[0];
    // Start terminal must sit above the decision diamond so the entry arrow
    // reaches the decision — not the first step inside the first case.
    expect(startCircle.cy).toBeLessThan(decision.top);
  });

  it("still anchors to the first step when the flow starts with a step", () => {
    const svg = render(`@kai-swimlane
/role/
<a>
label: A;
/line/
[a: Start]
if (x) is (yes) than
[a: yes]
endif
[a: End]
@end`);
    const circles = terminalCircles(svg);
    expect(circles.length).toBe(2);
  });
});
