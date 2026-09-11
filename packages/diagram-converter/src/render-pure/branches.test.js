import { describe, expect, it } from "vitest";
import { parseDSL } from "../parser.js";
import { THEMES } from "../themes.js";
import { renderDiagramSvg } from "./diagram.js";
import { FORK_GATEWAY_RADIUS } from "./diagram-layout.js";

const render = (dsl) => renderDiagramSvg({ model: parseDSL(dsl), theme: THEMES.basic });

const doc = (body) => `@kai-swimlane
/role/
<sales>
label: Sales;
<ops>
label: Ops;
/line/
[sales: start]
${body}
[sales: end]
@end
`;

/** Open polylines in the body (not the arrowhead glyphs in <defs>), as points. */
function polylines(svg) {
  const body = svg.slice(svg.indexOf("</defs>"));
  const out = [];
  for (const m of body.matchAll(/<path[^>]*\sd="([^"]+)"/g)) {
    const d = m[1];
    if (!d.startsWith("M ") || /[Zz]\s*$/.test(d)) continue;
    out.push(
      d
        .slice(2)
        .split(" L ")
        .map((p) => p.trim().split(/\s+/).map(Number)),
    );
  }
  return out;
}

/** Decision diamonds (the big four-point closed paths), as points. */
function diamonds(svg) {
  const body = svg.slice(svg.indexOf("</defs>"));
  return [...body.matchAll(/<path[^>]*\sd="M ([^"]+) Z"/g)]
    .map((m) => m[1].split(" L ").map((p) => p.trim().split(/\s+/).map(Number)))
    .filter((pts) => pts.length === 4)
    .filter((pts) => Math.max(...pts.map((p) => p[0])) - Math.min(...pts.map((p) => p[0])) > 60);
}

function circles(svg) {
  return [...svg.matchAll(/<circle[^>]*cx="([\d.]+)"[^>]*cy="([\d.]+)"[^>]*r="([\d.]+)"/g)].map(
    (m) => ({ cx: +m[1], cy: +m[2], r: +m[3] }),
  );
}

/** Case label chips: the chip rect and the x its text is centred on. */
function caseLabels(svg) {
  const re =
    /<rect[^>]*x="([\d.]+)"[^>]*y="([\d.]+)"[^>]*width="([\d.]+)"[^>]*height="([\d.]+)"[^>]*\/>\s*<text[^>]*x="([\d.]+)"[^>]*>([^<]+)<\/text>/g;
  return [...svg.matchAll(re)].map((m) => ({ cx: +m[5], text: m[6] }));
}

describe("a case that opens with a nested fork or if", () => {
  it("runs its rail into the fork gateway, not to a fixed distance above it", () => {
    const svg = render(
      doc(`if (q?) is (yes) than
  fork
    [ops: a]
  and
    [sales: b]
  endfork
else
  [ops: c]
endif`),
    );
    const [split] = circles(svg)
      .filter((c) => c.r === FORK_GATEWAY_RADIUS)
      .sort((a, b) => a.cy - b.cy);
    const rail = polylines(svg).find(
      (pts) => pts.length === 4 && pts[3][0] === split.cx && pts[3][1] < split.cy,
    );
    expect(rail).toBeDefined();
    expect(rail[3][1]).toBe(split.cy - split.r);
  });

  it("runs its rail into the nested diamond's top vertex", () => {
    const svg = render(
      doc(`if (q?) is (yes) than
  if (r?) is (y) than
    [ops: a]
  else
    [ops: b]
  endif
else
  [ops: c]
endif`),
    );
    const [, nested] = diamonds(svg).sort((a, b) => a[0][1] - b[0][1]);
    const topX = nested[0][0];
    const topY = Math.min(...nested.map((p) => p[1]));
    const rail = polylines(svg).find(
      (pts) => pts.length === 4 && pts[3][0] === topX && pts[3][1] < topY + 1,
    );
    expect(rail).toBeDefined();
    expect(rail[3][1]).toBe(topY);
  });

  it("draws the case label on that rail, not beside it", () => {
    const svg = render(
      doc(`if (q?) is (yes) than
  fork
    [ops: a]
  and
    [sales: b]
  endfork
else
  [ops: c]
endif`),
    );
    const [split] = circles(svg)
      .filter((c) => c.r === FORK_GATEWAY_RADIUS)
      .sort((a, b) => a.cy - b.cy);
    const yes = caseLabels(svg).find((l) => l.text === "yes");
    expect(yes.cx).toBe(split.cx);
  });
});

describe("a blank case", () => {
  it("hangs straight under the decision instead of at the canvas centre", () => {
    const svg = render(
      doc(`if (q?) is (yes) than
  [ops: work]
else
endif`),
    );
    const [diamond] = diamonds(svg);
    const bottom = diamond.reduce((a, p) => (p[1] > a[1] ? p : a));
    const stub = polylines(svg).find(
      (pts) =>
        pts.length === 2 &&
        pts[0][0] === bottom[0] &&
        pts[0][1] === bottom[1] &&
        pts[1][0] === bottom[0],
    );
    expect(stub).toBeDefined();
  });

  it("does not stack on a second blank case", () => {
    const svg = render(
      doc(`if (q?) is (yes) than
elseif (no) than
endif`),
    );
    const labels = caseLabels(svg).filter((l) => l.text === "yes" || l.text === "no");
    expect(labels).toHaveLength(2);
    expect(labels[0].cx).not.toBe(labels[1].cx);
  });
});
