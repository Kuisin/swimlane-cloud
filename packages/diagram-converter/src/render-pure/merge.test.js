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
if (キャンセル?) is (あり) than #red
[a: キャンセル受付]
merge: done;
else
[b: 通常処理]
endif
[a: 取引完了]
id: done;
label: 完了;
@end`;

describe("mid-flow merge", () => {
  it("parses merge into a branchMerge row pointing at the step id", () => {
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
    const dashed = MERGE.replace(
      "[a: キャンセル受付]",
      "[a: キャンセル受付]\narrow: dashed;",
    );
    const svg = render(dashed);
    expect((svg.match(/stroke-dasharray="6 3"/g) || []).length).toBeGreaterThanOrEqual(
      1,
    );
  });

  it("errors when the merge target id does not exist", () => {
    const model = parseDSL(`@kai-swimlane
/role/
<a>
label: A;
/line/
if (x) is (y) than
[a: step]
merge: nowhere;
endif
@end`);
    expect(model.errors.map((e) => e.msg)).toContain(
      'merge: no step with id "nowhere"',
    );
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
    expect(model.errors.filter((e) => e.msg.includes('duplicate step id "dup"')).length).toBe(2);
  });

  it("errors on legacy merge <id>; without colon", () => {
    const model = parseDSL(`@kai-swimlane
/role/
<a>
label: A;
/line/
if (x) is (y) than
[a: step]
merge legacy;
endif
@end`);
    expect(model.errors.map((e) => e.msg)).toContain(
      "use merge: <id>; instead of merge <id>;",
    );
  });

  it("errors when merge is used outside an if", () => {
    const model = parseDSL(`@kai-swimlane
/role/
<a>
label: A;
/line/
[a: step]
id: home;
merge: home;
@end`);
    expect(model.errors.map((e) => e.msg)).toContain("merge outside if");
  });
});
