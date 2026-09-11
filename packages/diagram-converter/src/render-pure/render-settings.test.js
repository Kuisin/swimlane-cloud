import { describe, expect, it } from "vitest";
import { parseDSL } from "../parser.js";
import { THEMES } from "../themes.js";
import { resolveDiagramOptions } from "../diagram-options.js";
import { renderDiagramSvg } from "./diagram.js";
import { DIAGRAM_LAYOUT, FORK_GATEWAY_RADIUS } from "./diagram-layout.js";

const theme = THEMES.basic;

const doc = (body, option = "") => `@kai-swimlane
${option ? `/option/\n${option}\n` : ""}/role/
<a>
label: A;
<b>
label: B;
/line/
${body}
@end
`;

const FLOW = `[a: start]
fork
  [a: one]
case
  [b: two]
end-fork
if (ok?) is (yes) than
  [a: yes]
else-if () than
  [b: no]
end-if
[a: end]`;

const render = (src, overrides = {}) => {
  const model = parseDSL(src);
  expect(model.errors).toEqual([]);
  return renderDiagramSvg({ model, theme, ...resolveDiagramOptions(model.options, overrides) });
};

const gatewayCircles = (svg) =>
  (svg.match(new RegExp(`<circle[^>]*r="${FORK_GATEWAY_RADIUS}"`, "g")) || []).length;
const svgHeight = (svg) => Number(svg.match(/viewBox="0 0 [\d.]+ ([\d.]+)"/)[1]);

describe("show-gateway-icons", () => {
  it("hides the fork circles and the join diamond, but keeps the decision diamond", () => {
    const shown = render(doc(FLOW));
    const hidden = render(doc(FLOW), { showGatewayIcons: false });
    expect(gatewayCircles(shown)).toBe(2);
    expect(gatewayCircles(hidden)).toBe(0);
    expect(hidden).toContain("ok?");
  });

  it("is a per-file /option/ too, which wins over the repository setting", () => {
    const svg = render(doc(FLOW, "show-gateway-icons: false;"), { showGatewayIcons: true });
    expect(gatewayCircles(svg)).toBe(0);
  });
});

describe("block-margin", () => {
  it("adds that many pixels to every step row", () => {
    const base = svgHeight(render(doc(FLOW)));
    const roomy = svgHeight(render(doc(FLOW), { blockMargin: 20 }));
    const steps = parseDSL(doc(FLOW)).rows.filter((r) => r.kind === "step").length;
    expect(roomy - base).toBe(20 * steps);
  });

  it("rejects anything but a whole number of pixels in /option/", () => {
    const model = parseDSL(doc(FLOW, "block-margin: lots;"));
    expect(model.errors.map((e) => e.msg)).toContain(
      '"block-margin": expected a whole number of pixels from 0 to 80',
    );
  });
});

describe("block-text", () => {
  const LONG = `[a: This step has a title far too long for one line of its box]`;

  const boxTextLines = (svg) => (svg.match(/<tspan/g) || []).length;

  it("truncates to one line by default", () => {
    const svg = render(doc(LONG));
    expect(boxTextLines(svg)).toBe(1);
    expect(svg).toMatch(/<tspan[^>]*>[^<]*…<\/tspan>/);
  });

  it("wraps onto several lines and grows the box to fit", () => {
    const svg = render(doc(LONG), { blockText: "wrap" });
    const lines = boxTextLines(svg);
    expect(lines).toBeGreaterThan(1);
    expect(svg).not.toMatch(/<tspan[^>]*>[^<]*…<\/tspan>/);
    const boxHeights = [
      ...svg.matchAll(
        new RegExp(`<rect[^>]*width="${DIAGRAM_LAYOUT.nodeW}"[^>]*height="([\\d.]+)"`, "g"),
      ),
    ].map((m) => Number(m[1]));
    expect(Math.max(...boxHeights)).toBe(
      DIAGRAM_LAYOUT.stepBoxH + (lines - 1) * DIAGRAM_LAYOUT.stepTextLineH,
    );
  });

  it("breaks between words when it can, and inside a run of CJK text when it must", () => {
    const latin = render(doc(LONG), { blockText: "wrap" });
    const spans = [...latin.matchAll(/<tspan[^>]*>([^<]*)<\/tspan>/g)].map((m) => m[1]);
    for (const s of spans) expect(s).toBe(s.trim());
    expect(spans.join(" ")).toBe("This step has a title far too long for one line of its box");

    const cjk = render(doc("[a: 受注から請求までの一連の業務プロセスを表す長い工程名]"), {
      blockText: "wrap",
    });
    expect(boxTextLines(cjk)).toBeGreaterThan(1);
  });

  it("round-trips as a per-file option value", () => {
    const model = parseDSL(doc(LONG, "block-text: wrap;"));
    expect(model.options.blockText).toBe("wrap");
    expect(parseDSL(doc(LONG, "block-text: sideways;")).errors.map((e) => e.msg)).toContain(
      '"block-text": expected truncate or wrap',
    );
  });
});
