import { describe, expect, it } from "vitest";
import { parseDSL } from "../parser.js";
import { THEMES } from "../themes.js";
import { renderDiagramSvg } from "./diagram.js";

const theme = THEMES.basic;

/**
 * A row-level visual diff (see dsl-rule.md-adjacent design notes in
 * diagram.js) is caller-supplied: the caller aligns an old and new model's
 * rows however it likes and hands `renderDiagramSvg` a `rowIndex -> status`
 * map against the model it's already rendering. These tests exercise the
 * renderer's side of that contract directly, without depending on any
 * particular alignment algorithm.
 */
const LINEAR = `@kai-swimlane-v2
/role/
<a>
  label: A;

/line/
[a: 開始]
[a: 承諾書を受領]
[a: 完了]
@end`;

function parse(dsl) {
  const model = parseDSL(dsl);
  expect(model.errors).toEqual([]);
  return model;
}

describe("diffRows: no-op by default", () => {
  it("omits every diff marker and the toggle <style> when diffRows is not passed", () => {
    const svg = renderDiagramSvg({ model: parse(LINEAR), theme, showStepBlockCaptions: false });
    expect(svg).not.toContain("sw-diff-highlight");
    expect(svg).not.toContain("sw-diff-insert");
    expect(svg).not.toContain("diff-hidden");
  });

  it("renders byte-identical output whether diffRows is omitted or an empty Map", () => {
    const model = parse(LINEAR);
    const withNull = renderDiagramSvg({ model, theme, showStepBlockCaptions: false });
    const withEmpty = renderDiagramSvg({
      model,
      theme,
      showStepBlockCaptions: false,
      diffRows: new Map(),
    });
    expect(withEmpty).toBe(withNull);
  });
});

describe("diffRows: added / changed / removed", () => {
  it("emits the toggle <style> once diffRows has any entry", () => {
    const model = parse(LINEAR);
    const svg = renderDiagramSvg({
      model,
      theme,
      showStepBlockCaptions: false,
      diffRows: new Map([[1, { status: "added" }]]),
    });
    expect(svg).toContain(".diff-hidden .sw-diff-highlight{display:none}");
    expect(svg).toContain(".diff-hidden .sw-diff-insert{fill:inherit;text-decoration:none}");
  });

  it("draws the green + badge and dashed outline for an added row", () => {
    const model = parse(LINEAR);
    const svg = renderDiagramSvg({
      model,
      theme,
      showStepBlockCaptions: false,
      diffRows: new Map([[1, { status: "added" }]]),
    });
    expect(svg).toContain('class="sw-diff-highlight"');
    expect(svg).toContain(">+<");
    expect(svg).toContain('stroke="#16a34a"');
  });

  it("draws the red − badge, fades the box, and strikes through the text for a removed row", () => {
    const model = parse(LINEAR);
    const svg = renderDiagramSvg({
      model,
      theme,
      showStepBlockCaptions: false,
      diffRows: new Map([[1, { status: "removed" }]]),
    });
    expect(svg).toContain(">−<"); // "−"
    expect(svg).toContain('stroke="#dc2626"');
    expect(svg).toContain('text-decoration="line-through"');
    // The whole ghost — shape, icon, text, and its highlight — is one
    // sw-diff-highlight unit, so hiding highlights removes it entirely
    // rather than leaving a de-highlighted box with no real presence.
    const stepGroupOpen = svg.indexOf('<g key="step-1"');
    expect(stepGroupOpen).toBe(-1); // key is a React-only prop, never serialized
    expect(svg).toContain('<g class="sw-diff-highlight"><rect');
  });

  it("renders the inline word-level diff for a changed row, tagged for the toggle", () => {
    const model = parse(LINEAR);
    const svg = renderDiagramSvg({
      model,
      theme,
      showStepBlockCaptions: false,
      diffRows: new Map([[1, { status: "changed", oldText: "承諾書を受領" }]]),
    });
    // "受領" -> "受領" unchanged, "承諾書" unchanged, "と誓約書" inserted —
    // but here old === "承諾書を受領" and new (r.text) === "承諾書を受領" too
    // since LINEAR wasn't edited; use a model whose step text actually
    // differs from oldText to exercise a real insertion.
    expect(svg).toContain(">~<");
  });

  it("shows an inserted word underlined and marks it for the hide toggle", () => {
    const edited = `@kai-swimlane-v2
/role/
<a>
  label: A;

/line/
[a: 開始]
[a: 承諾書と誓約書を受領]
[a: 完了]
@end`;
    const model = parse(edited);
    const svg = renderDiagramSvg({
      model,
      theme,
      showStepBlockCaptions: false,
      diffRows: new Map([[1, { status: "changed", oldText: "承諾書を受領" }]]),
    });
    expect(svg).toContain(
      '<tspan class="sw-diff-insert" fill="#15803d" text-decoration="underline">と誓約書</tspan>',
    );
    expect(svg).toContain(">承諾書<");
    expect(svg).toContain(">を受領<");
  });

  it("marks a deleted word for full removal on hide, not just de-emphasis", () => {
    const edited = `@kai-swimlane-v2
/role/
<a>
  label: A;

/line/
[a: 開始]
[a: 受領]
[a: 完了]
@end`;
    const model = parse(edited);
    const svg = renderDiagramSvg({
      model,
      theme,
      showStepBlockCaptions: false,
      diffRows: new Map([[1, { status: "changed", oldText: "承諾書を受領" }]]),
    });
    expect(svg).toContain(
      '<tspan class="sw-diff-highlight" fill="#b91c1c" text-decoration="line-through">承諾書を</tspan>',
    );
  });
});

describe("diffRows: connectors touching a removed row", () => {
  it("adds a red highlight overlay on both edges around a removed step, on top of the normal edge", () => {
    const model = parse(LINEAR);
    const plain = renderDiagramSvg({ model, theme, showStepBlockCaptions: false });
    const withDiff = renderDiagramSvg({
      model,
      theme,
      showStepBlockCaptions: false,
      diffRows: new Map([[1, { status: "removed" }]]),
    });
    // Every connector present in the plain render is still present verbatim
    // (the normal edge is never altered by a diff) ...
    const plainConnectorLines = [...plain.matchAll(/<(?:line|path)[^>]*marker-end[^>]*\/>/g)];
    for (const m of plainConnectorLines) expect(withDiff).toContain(m[0]);
    // ... plus a red dashed overlay for each edge touching the removed row.
    const overlays = [...withDiff.matchAll(/stroke="#dc2626" stroke-width="5"/g)];
    expect(overlays.length).toBe(2); // step0->ghost and ghost->step2
  });
});
