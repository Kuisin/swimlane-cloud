import { describe, expect, it } from "vitest";
import { extractPartsCode } from "./parts-extract.js";
import { tr, EN, JA } from "../i18n.jsx";

const DOC = `@kai-swimlane
/title/
Sample
/role/
<sales>
label: Sales;
/block/
<approve>
shape: rounded;
label: Approve;
<reject>
shape: hex;
label: Reject;
/prop/
<urgent>
label: Urgent;
/line/
[sales: do it] <approve>
@end
`;

describe("extractPartsCode", () => {
  it("pulls both block and prop sections from a full document", () => {
    const code = extractPartsCode(DOC);
    expect(code).toContain("/block/");
    expect(code).toContain("<approve>");
    expect(code).toContain("<reject>");
    expect(code).toContain("/prop/");
    expect(code).toContain("<urgent>");
    // flow / role content must not leak into the parts fragment
    expect(code).not.toContain("/line/");
    expect(code).not.toContain("<sales>");
  });

  it("limits to a single block definition by id", () => {
    const code = extractPartsCode(DOC, "block", "approve");
    expect(code).toContain("<approve>");
    expect(code).not.toContain("<reject>");
    expect(code).not.toContain("/prop/");
  });

  it("returns empty string when nothing matches", () => {
    expect(extractPartsCode("@kai-swimlane\n/title/\nx\n@end", "block")).toBe("");
  });
});

describe("i18n", () => {
  it("translates with variable interpolation and falls back to English", () => {
    expect(tr(EN, "counts.steps", { n: 3 })).toBe("3 steps");
    expect(tr(JA, "counts.steps", { n: 3 })).toBe("ステップ 3");
    expect(tr(JA, "totally.missing.key")).toBe("totally.missing.key");
  });

  it("keeps English and Japanese dictionaries in sync", () => {
    expect(Object.keys(JA).sort()).toEqual(Object.keys(EN).sort());
  });
});
