import { describe, expect, it } from "vitest";
import { parseDSL } from "../parser.js";
import { THEMES } from "../themes.js";
import { renderDiagramSvg } from "./diagram.js";
import {
  DIAGRAM_LAYOUT,
  LAYOUT_SETTINGS,
  LAYOUT_SETTING_KEYS,
  isLayoutOverride,
  resolveLayout,
} from "./diagram-layout.js";

const DSL = `@kai-swimlane
/title/
Layout sample
/option/
show-left-gutter: true;
show-right-gutter: true;
/role/
<a>
label: Team A;
<b>
label: Team B;
/line/
[a: Start]
[b: Finish]
@end
`;

function render(layout) {
  return renderDiagramSvg({ model: parseDSL(DSL), theme: THEMES.basic, layout });
}

/**
 * Page size from the viewBox. The root `<svg>` carries no width/height
 * attributes (it scales with `style="width:100%"`), so the viewBox is the only
 * place the computed page size appears.
 */
function pageSize(svg) {
  const m = /<svg viewBox="0 0 ([\d.]+) ([\d.]+)"/.exec(svg);
  if (!m) throw new Error("no viewBox on the rendered svg");
  return { width: Number(m[1]), height: Number(m[2]) };
}

describe("resolveLayout", () => {
  it("returns the engine defaults untouched when there is nothing to apply", () => {
    expect(resolveLayout(undefined)).toBe(DIAGRAM_LAYOUT);
    expect(resolveLayout({})).toBe(DIAGRAM_LAYOUT);
    expect(resolveLayout(null)).toBe(DIAGRAM_LAYOUT);
  });

  it("applies a known key in range", () => {
    expect(resolveLayout({ nodeW: 240 }).nodeW).toBe(240);
  });

  it("leaves every other key alone", () => {
    const resolved = resolveLayout({ nodeW: 240 });
    for (const key of Object.keys(DIAGRAM_LAYOUT)) {
      if (key !== "nodeW") expect(resolved[key]).toEqual(DIAGRAM_LAYOUT[key]);
    }
  });

  it("ignores unknown keys, so a stale config cannot reach the renderer", () => {
    expect(resolveLayout({ notALayoutKey: 10 })).toBe(DIAGRAM_LAYOUT);
    // A real constant that is deliberately *not* configurable.
    expect(resolveLayout({ titleFontSize: 99 }).titleFontSize).toBe(DIAGRAM_LAYOUT.titleFontSize);
  });

  it("ignores values outside the declared bounds rather than throwing", () => {
    // The render path must degrade to the default: someone else's bad
    // .swimlane.json should never cost a viewer their diagram.
    expect(resolveLayout({ nodeW: 5 }).nodeW).toBe(DIAGRAM_LAYOUT.nodeW);
    expect(resolveLayout({ nodeW: 100000 }).nodeW).toBe(DIAGRAM_LAYOUT.nodeW);
    expect(resolveLayout({ nodeW: "240" }).nodeW).toBe(DIAGRAM_LAYOUT.nodeW);
    expect(resolveLayout({ nodeW: NaN }).nodeW).toBe(DIAGRAM_LAYOUT.nodeW);
  });
});

describe("LAYOUT_SETTINGS", () => {
  it("only names keys that actually exist in DIAGRAM_LAYOUT", () => {
    for (const key of LAYOUT_SETTING_KEYS) {
      expect(DIAGRAM_LAYOUT[key], key).toBeTypeOf("number");
    }
  });

  it("brackets every engine default within its own bounds", () => {
    for (const { key, min, max } of LAYOUT_SETTINGS) {
      expect(DIAGRAM_LAYOUT[key], key).toBeGreaterThanOrEqual(min);
      expect(DIAGRAM_LAYOUT[key], key).toBeLessThanOrEqual(max);
    }
  });

  it("agrees with isLayoutOverride", () => {
    expect(isLayoutOverride("nodeW", 240)).toBe(true);
    expect(isLayoutOverride("nodeW", 0)).toBe(false);
    expect(isLayoutOverride("titleFontSize", 20)).toBe(false);
  });
});

describe("renderDiagramSvg with layout overrides", () => {
  it("renders byte-identically to the unconfigured engine when no override is set", () => {
    // The regression guard that matters: every existing repository, and every
    // surface that does not pass a layout yet, must keep the exact SVG it has.
    const before = render(undefined);
    expect(render({})).toBe(before);
    expect(render({ nodeW: DIAGRAM_LAYOUT.nodeW })).toBe(before);
    expect(render({ unknownKey: 4 })).toBe(before);
  });

  it("widens the page when the left gutter grows", () => {
    const base = pageSize(render(undefined)).width;
    const wide = pageSize(render({ leftGutterWidth: DIAGRAM_LAYOUT.leftGutterWidth + 120 })).width;
    expect(wide).toBe(base + 120);
  });

  it("widens the page when the side margin grows", () => {
    const base = pageSize(render(undefined)).width;
    // xPad is applied on both sides.
    const padded = pageSize(render({ xPad: DIAGRAM_LAYOUT.xPad + 20 })).width;
    expect(padded).toBe(base + 40);
  });

  it("widens the lane grid when the lane column grows", () => {
    const base = pageSize(render(undefined)).width;
    const wide = pageSize(render({ nodeW: DIAGRAM_LAYOUT.nodeW + 50 })).width;
    // Two lanes in the sample.
    expect(wide).toBe(base + 100);
  });

  it("takes the row height into account", () => {
    const base = pageSize(render(undefined)).height;
    const tall = pageSize(render({ rowH: DIAGRAM_LAYOUT.rowH + 40 })).height;
    expect(tall).toBeGreaterThan(base);
  });
});
