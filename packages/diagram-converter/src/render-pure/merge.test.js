import { describe, expect, it } from "vitest";
import { parseDSL } from "../parser.js";
import { THEMES } from "../themes.js";
import { renderDiagramSvg } from "./diagram.js";

const theme = THEMES.basic;

function render(dsl) {
  return renderDiagramSvg({ model: parseDSL(dsl), theme, showStepBlockCaptions: false });
}

const MERGE = `@kai-swimlane
/role/
<a>
label: A;
<b>
label: B;
/line/
[a: 開始]
if (キャンセル?) #red
case (あり)
[a: キャンセル受付]
[goto: done]
case ()
[b: 通常処理]
end-if
[a: 取引完了]
label: 完了;
id: done;
@end`;

describe("mid-flow merge", () => {
  it("parses [goto: id] into a branchMerge row pointing at the step id", () => {
    const model = parseDSL(MERGE);
    expect(model.errors).toEqual([]);
    const merge = model.rows.find((r) => r.kind === "branchMerge");
    expect(merge).toBeTruthy();
    expect(merge.mergeTarget).toBe("done");
  });

  it("renders solid merge forward connector by default", () => {
    const svg = render(MERGE);
    expect((svg.match(/stroke-dasharray=/g) || []).length).toBe(0);
  });

  it("renders dashed merge when the preceding step sets arrow: dashed", () => {
    const dashed = MERGE.replace("[a: キャンセル受付]", "[a: キャンセル受付] ~>");
    const svg = render(dashed);
    expect((svg.match(/stroke-dasharray="6 3"/g) || []).length).toBeGreaterThanOrEqual(1);
  });

  it("errors when the goto target id does not exist", () => {
    const model = parseDSL(`@kai-swimlane
/role/
<a>
label: A;
/line/
if (x)
case (y)
[a: step]
[goto: nowhere]
end-if
@end`);
    expect(model.errors.map((e) => e.msg)).toContain('no node with id "nowhere"');
  });

  it("errors when step id is duplicated in the file", () => {
    const model = parseDSL(`@kai-swimlane
/role/
<a>
label: A;
/line/
[a: one]
id: dup;
[a: two]
id: dup;
@end`);
    expect(model.errors.filter((e) => e.msg.includes('duplicate node id "dup"')).length).toBe(1);
  });

  it("errors on a goto outside any if", () => {
    const model = parseDSL(`@kai-swimlane
/role/
<a>
label: A;
/line/
[a: step]
id: home;
[goto: home]
@end`);
    expect(model.errors.map((e) => e.msg)).toContain(
      "goto outside if is not supported by this renderer",
    );
  });

  // There is no landing-marker row any more: a jump always names a real
  // step's own `id:`, so a bare `merge` is just an unrecognized statement.
  it("errors on a bare `merge` — there is no marker any more", () => {
    const model = parseDSL(`@kai-swimlane
/role/
<a>
label: A;
/line/
[a: step]
merge
@end`);
    expect(model.errors.length).toBeGreaterThan(0);
    expect(model.rows.some((r) => r.kind === "mergeMarker")).toBe(false);
  });
});
