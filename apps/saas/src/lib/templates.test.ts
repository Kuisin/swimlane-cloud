import { describe, expect, it } from "vitest";
import {
  assertForcedSections,
  assertForcedSectionsForFile,
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
      assertForcedSections(DSL, { option: { mode: "optional" } }, templatesById),
    ).not.toThrow();
  });
});

/**
 * Enforcement used to be gated on `path.endsWith(".txt")`, which was correct
 * only while every diagram was a `.txt`. Storing diagrams as `.md` would have
 * turned that gate into a silent opt-out: a forced section could diverge in a
 * converted project and nothing would object.
 */
describe("assertForcedSectionsForFile", () => {
  const tpl: TemplateRow = {
    id: "t1",
    section: "option",
    name: "Standard gutters",
    body: "show-left-gutter: true;\nshow-right-gutter: true;",
  };
  const templatesById = { t1: tpl };
  const forced = { option: { mode: "forced" as const, forcedTemplateId: "t1" } };
  const asMarkdown = (dsl: string) => `---\nowner: o\n---\n\n\`\`\`kai-swimlane\n${dsl}\n\`\`\`\n`;

  it("still enforces a forced section when the diagram is stored as .md", () => {
    const bad = DSL.replace("show-left-gutter: true;", "show-left-gutter: false;");
    expect(() =>
      assertForcedSectionsForFile("flow.md", asMarkdown(bad), forced, templatesById),
    ).toThrow(/must match project template/);
  });

  it("passes a conforming .md", () => {
    expect(() =>
      assertForcedSectionsForFile("flow.md", asMarkdown(DSL), forced, templatesById),
    ).not.toThrow();
  });

  it("still enforces a .txt", () => {
    const bad = DSL.replace("show-left-gutter: true;", "show-left-gutter: false;");
    expect(() => assertForcedSectionsForFile("flow.txt", bad, forced, templatesById)).toThrow(
      /must match project template/,
    );
  });

  it("skips a file that holds no DSL, rather than failing it", () => {
    // A prose README has no `/option/` to compare, and a `.gitkeep` has no
    // content at all — neither is a template violation.
    expect(() =>
      assertForcedSectionsForFile("README.md", "# Diagrams\n\nNotes.\n", forced, templatesById),
    ).not.toThrow();
    expect(() =>
      assertForcedSectionsForFile("dir/.gitkeep", "", forced, templatesById),
    ).not.toThrow();
  });
});
