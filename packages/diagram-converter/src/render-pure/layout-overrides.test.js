import { describe, expect, it } from "vitest";
import { parseDSL } from "../parser.js";
import { THEMES } from "../themes.js";
import { resolveDiagramOptions } from "../diagram-options.js";
import { renderDiagramSvg, textToSvg } from "./index.js";
import {
  DIAGRAM_LAYOUT,
  LAYOUT_SETTINGS,
  LAYOUT_SETTING_KEYS,
  isLayoutOverride,
  resolveLayout,
} from "./diagram-layout.js";

const DSL = `@kai-swimlane
/title/
Order handling
/option/
show-left-gutter: true;
show-right-gutter: true;
/role/
<a>
label: Sales;
<b>
label: Ops;
/line/
[a: Take order]
[b: Ship it]
@end
`;

function render(layout) {
  const model = parseDSL(DSL);
  expect(model.errors).toEqual([]);
  return renderDiagramSvg({ model, theme: THEMES.basic, layout });
}

/**
 * How a repository's layout actually reaches the renderer in the app: inside
 * `diagramDefaults`, the same object that carries the other inherited render
 * settings. Worth covering separately from the engine knob, because this is
 * the path every caller uses.
 */
function renderViaSettings(layout) {
  return textToSvg(DSL, {
    themeKey: "basic",
    diagramDefaults: { showGatewayIcons: true, blockMargin: 0, blockText: "truncate", layout },
  }).svg;
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

  it("applies a known key in range and leaves every other value alone", () => {
    const resolved = resolveLayout({ nodeW: 240 });
    expect(resolved.nodeW).toBe(240);
    for (const key of Object.keys(DIAGRAM_LAYOUT)) {
      if (key !== "nodeW") expect(resolved[key], key).toEqual(DIAGRAM_LAYOUT[key]);
    }
  });

  it("ignores keys that are not offered as settings", () => {
    expect(resolveLayout({ notALayoutKey: 10 })).toBe(DIAGRAM_LAYOUT);
    // A real constant that is deliberately not configurable.
    expect(resolveLayout({ titleFontSize: 99 }).titleFontSize).toBe(DIAGRAM_LAYOUT.titleFontSize);
  });

  it("ignores values outside the declared bounds rather than throwing", () => {
    // The render path must degrade to the default: a bad value in someone
    // else's settings file should never cost a viewer their diagram.
    for (const bad of [5, 100000, "240", NaN, null]) {
      expect(resolveLayout({ nodeW: bad }).nodeW, String(bad)).toBe(DIAGRAM_LAYOUT.nodeW);
    }
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
  it("renders byte-identically to the unconfigured engine when nothing is set", () => {
    // The regression guard that matters: every existing repository, and every
    // surface that does not pass a layout, keeps the exact SVG it has today.
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

  it("widens the page when the side margin grows, on both sides", () => {
    const base = pageSize(render(undefined)).width;
    expect(pageSize(render({ xPad: DIAGRAM_LAYOUT.xPad + 20 })).width).toBe(base + 40);
  });

  it("widens the lane grid when the lane column grows, once per lane", () => {
    const base = pageSize(render(undefined)).width;
    expect(pageSize(render({ nodeW: DIAGRAM_LAYOUT.nodeW + 50 })).width).toBe(base + 100);
  });

  it("takes the row height into account", () => {
    const base = pageSize(render(undefined)).height;
    expect(pageSize(render({ rowH: DIAGRAM_LAYOUT.rowH + 40 })).height).toBeGreaterThan(base);
  });

  it("arrives through diagramDefaults, the way the app delivers it", () => {
    // Compared within this path only: textToSvg resolves the /option/ defaults,
    // which differ from renderDiagramSvg's own parameter defaults, so the two
    // are not byte-comparable for reasons that have nothing to do with layout.
    const plain = renderViaSettings(undefined);
    expect(renderViaSettings({})).toBe(plain);
    const wide = renderViaSettings({ leftGutterWidth: DIAGRAM_LAYOUT.leftGutterWidth + 120 });
    expect(pageSize(wide).width).toBe(pageSize(plain).width + 120);
    expect(pageSize(renderViaSettings({ nodeW: DIAGRAM_LAYOUT.nodeW + 50 })).width).toBe(
      pageSize(plain).width + 100,
    );
  });

  it("cannot be overridden by a diagram's own /option/ section", () => {
    // Page geometry is repository-wide: `layout` is not an /option/ key, so
    // resolveDiagramOptions must pass it through untouched.
    const model = parseDSL(DSL);
    const opts = resolveDiagramOptions(model.options, { layout: { nodeW: 240 } });
    expect(opts.layout).toEqual({ nodeW: 240 });
  });

  it("reaches the gutter text budget, not just the box geometry", () => {
    // gutterInnerPad is read through gutterTextCols, which used to take it from
    // the module constant; a narrower budget must wrap the text sooner.
    const roomy = render({ gutterInnerPad: 0 });
    const tight = render({ gutterInnerPad: 90 });
    expect(tight).not.toBe(roomy);
  });
});
