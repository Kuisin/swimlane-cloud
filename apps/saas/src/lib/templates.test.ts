import { describe, expect, it } from "vitest";
import {
  assertForcedSections,
  extractSection,
  normalizeSection,
  type TemplateRow,
} from "./templates";

const DSL = `@kai-swimlane
/title/
Hello
/option/
show-left-gutter: true;
show-right-gutter:  true;
/role/
<role01: Team> #blue
/line/
[role01: Start]
@end
`;

describe("extractSection", () => {
  it("extracts a section body between markers", () => {
    expect(extractSection(DSL, "option")).toBe(
      "show-left-gutter: true;\nshow-right-gutter:  true;",
    );
  });

  it("returns empty string when section missing", () => {
    expect(extractSection(DSL, "prop")).toBe("");
  });
});

describe("normalizeSection", () => {
  it("collapses whitespace and drops blank lines", () => {
    expect(normalizeSection("  a:  1; \n\n  b: 2;  ")).toBe("a: 1;\nb: 2;");
  });
});

describe("assertForcedSections", () => {
  const tpl: TemplateRow = {
    id: "t1",
    section: "option",
    name: "Standard gutters",
    body: "show-left-gutter: true;\nshow-right-gutter: true;",
  };
  const templatesById = { t1: tpl };

  it("passes when forced section matches (normalized)", () => {
    expect(() =>
      assertForcedSections(
        DSL,
        { option: { mode: "forced", forcedTemplateId: "t1" } },
        templatesById,
      ),
    ).not.toThrow();
  });

  it("throws 422 when forced section diverges", () => {
    const bad = DSL.replace("show-left-gutter: true;", "show-left-gutter: false;");
    expect(() =>
      assertForcedSections(
        bad,
        { option: { mode: "forced", forcedTemplateId: "t1" } },
        templatesById,
      ),
    ).toThrow(/must match project template/);
  });

  it("ignores non-forced sections", () => {
    expect(() =>
      assertForcedSections(
        DSL,
        { option: { mode: "optional" } },
        templatesById,
      ),
    ).not.toThrow();
  });
});
