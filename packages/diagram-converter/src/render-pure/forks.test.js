import { describe, expect, it } from "vitest";
import { parseDSL } from "../parser.js";
import { THEMES } from "../themes.js";
import { renderDiagramSvg } from "./diagram.js";

const theme = THEMES.basic;

function render(dsl) {
  return renderDiagramSvg({ model: parseDSL(dsl), theme, showStepBlockCaptions: false });
}

/** Fork/endfork gateways match endif styling: purple fill + stroke circles. */
function forkGatewayCircles(svg) {
  return [...svg.matchAll(/<circle[^>]*r="14"[^>]*fill="#f3e8ff"[^>]*stroke="#7e22ce"/g)];
}

describe("parallel fork/join", () => {
  const FORK = `@kai-swimlane
/role/
<a>
label: A;
<b>
label: B;
<c>
label: C;
/line/
[a: 開始]
fork
[a: メール送信]
and
[b: 台帳更新]
and
[c: 配送初期化]
endfork
[a: 完了]
@end`;

  it("parses fork/and/endfork into parallel branch rows", () => {
    const model = parseDSL(FORK);
    expect(model.errors).toEqual([]);
    const start = model.rows.find((r) => r.kind === "branchStart");
    expect(start.parallel).toBe(true);
    const cases = model.rows.filter((r) => r.kind === "branchCase");
    expect(cases.length).toBe(2); // two `and`s (first path opens at `fork`)
    expect(cases.every((c) => c.parallel)).toBe(true);
    const end = model.rows.find((r) => r.kind === "branchEnd");
    expect(end.parallel).toBe(true);
  });

  it("renders purple fork and endfork circles (not diamonds or bars)", () => {
    const circles = forkGatewayCircles(render(FORK));
    expect(circles.length).toBe(2);
  });

  it("rejects elseif/endif against a fork and and/endfork against an if", () => {
    const mixed = parseDSL(`@kai-swimlane
/role/
<a>
label: A;
/line/
fork
[a: x]
elseif (y) than
[a: z]
endif
@end`);
    const msgs = mixed.errors.map((e) => e.msg);
    expect(msgs).toContain("elseif without if");
    expect(msgs).toContain("endif without if");
  });
});
