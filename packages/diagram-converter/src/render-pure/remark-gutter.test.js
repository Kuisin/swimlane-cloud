import { describe, expect, it } from "vitest";
import { parseDSL } from "../parser.js";
import { THEMES } from "../themes.js";
import { renderDiagramSvg } from "./diagram.js";

const theme = THEMES.basic;

function render(dsl) {
  return renderDiagramSvg({ model: parseDSL(dsl), theme, showStepBlockCaptions: false });
}

const WITH_REMARK = `@kai-swimlane
/page/
left-title: Procedure;
left-subtitle: Description;
right-title: REMARKCOL;
/role/
<a>
label: A;
/line/
[a: Submit]
label: Submit;
remark: NEEDSAPPROVAL;
@end`;

const WITHOUT_REMARK = `@kai-swimlane
/page/
right-title: REMARKCOL;
/role/
<a>
label: A;
/line/
[a: Submit]
label: Submit;
@end`;

describe("right remark gutter", () => {
  it("renders the right-title header, left titles, and per-step remark text", () => {
    const svg = render(WITH_REMARK);
    expect(svg).toContain("Procedure"); // left gutter title
    expect(svg).toContain("Description"); // left gutter subtitle
    expect(svg).toContain("REMARKCOL"); // right gutter title
    expect(svg).toContain("NEEDSAPPROVAL"); // per-step remark
  });

  it("is content-driven: no remark on any step → no right gutter", () => {
    const svg = render(WITHOUT_REMARK);
    expect(svg).not.toContain("REMARKCOL");
  });

  it("widens the diagram to fit the remark gutter", () => {
    const w = (svg) => +svg.match(/viewBox="0 0 ([\d.]+)/)[1];
    expect(w(render(WITH_REMARK))).toBeGreaterThan(w(render(WITHOUT_REMARK)));
  });
});
