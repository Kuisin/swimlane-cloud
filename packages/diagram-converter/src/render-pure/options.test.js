import { describe, expect, it } from "vitest";
import { parseDSL } from "../parser.js";
import { THEMES } from "../themes.js";
import { renderDiagramSvg } from "./diagram.js";

const theme = THEMES.basic;

const DSL = `@kai-swimlane
/role/
<a>
label: A;
/prop/
<L>
label: LEFTDOC;
side: left;
<R>
label: RIGHTDOC;
side: right;
/line/
[a: blockbody]
label: GUTTERONLY;
props: L,R;
@end`;

function render(opts) {
  return renderDiagramSvg({
    model: parseDSL(DSL),
    theme,
    showStepBlockCaptions: false,
    ...opts,
  });
}

describe("display option toggles", () => {
  it("shows the gutter title and both prop chips by default", () => {
    const svg = render({});
    expect(svg).toContain("GUTTERONLY"); // left gutter title
    expect(svg).toContain("LEFTDOC"); // left prop chip
    expect(svg).toContain("RIGHTDOC"); // right prop chip
  });

  it("showLeftGutter=false hides the left gutter column", () => {
    const svg = render({ showLeftGutter: false });
    expect(svg).not.toContain("GUTTERONLY");
    // prop chips are independent of the gutter and always render
    expect(svg).toContain("LEFTDOC");
    expect(svg).toContain("RIGHTDOC");
  });
});
