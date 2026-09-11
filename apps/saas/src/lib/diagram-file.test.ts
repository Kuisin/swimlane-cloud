/**
 * A diagram is stored as `.txt` or `.md`, and everything that reads repository
 * content has to ask what a file *holds* rather than trusting its extension.
 * The case that bites is the third one: a `.md` that is only prose. It looks
 * like a diagram by extension, holds none, and must never be rewritten as one.
 */
import { describe, expect, it } from "vitest";
import { parseDSL } from "@swimlane-cloud/diagram-converter/parser";
import { dslOf, isDiagramFile, isMarkdownFile, storedFrom } from "./diagram-file";

const DSL = `@kai-swimlane

/title/
Order to cash;

/line/
[sales: Take the order]

@end`;

const MD = `---
owner: sales-ops
---

# Order to cash

\`\`\`kai-swimlane
${DSL}
\`\`\`
`;

const PROSE = "# Diagrams\n\nkai-swimlane files live here.\n";

describe("isDiagramFile / isMarkdownFile", () => {
  it("accepts the two diagram extensions, case-insensitively", () => {
    for (const p of ["a.txt", "a.md", "dir/a.TXT", "dir/a.MD"]) expect(isDiagramFile(p)).toBe(true);
    for (const p of ["a.png", ".gitkeep", "dir/.gitkeep", "a.json"])
      expect(isDiagramFile(p)).toBe(false);
    expect(isMarkdownFile("a.md")).toBe(true);
    expect(isMarkdownFile("a.txt")).toBe(false);
  });
});

describe("dslOf", () => {
  it("passes a .txt through as DSL", () => {
    expect(dslOf("flow.txt", DSL)).toBe(DSL);
  });

  it("unwraps a .md diagram and restores its frontmatter as /meta/", () => {
    const dsl = dslOf("flow.md", MD)!;
    const model = parseDSL(dsl);
    expect(model.errors).toEqual([]);
    expect(model.title).toBe("Order to cash");
    expect(model.meta).toEqual({ owner: "sales-ops" });
  });

  it("returns null for markdown that is only prose", () => {
    expect(dslOf("README.md", PROSE)).toBeNull();
  });

  it("returns null for a file that is not a diagram at all", () => {
    // `.gitkeep` is draftable (it marks a folder) but holds no DSL — returning
    // its bytes here is what used to feed empty text into template checks.
    expect(dslOf("dir/.gitkeep", "")).toBeNull();
    expect(dslOf("logo.png", "binary")).toBeNull();
  });
});

describe("storedFrom", () => {
  it("stores a .txt unchanged", () => {
    expect(storedFrom("flow.txt", DSL)).toBe(DSL);
  });

  it("puts an edited diagram back in its fence, keeping frontmatter and prose", () => {
    const edited = dslOf("flow.md", MD)!.replace("Take the order", "Take the order by phone");
    const out = storedFrom("flow.md", edited, MD);
    expect(out).toContain("# Order to cash");
    expect(out).toContain("owner: sales-ops");
    expect(out).toContain("Take the order by phone");
    expect(dslOf("flow.md", out)).toBe(edited);
  });

  it("round-trips an untouched .md byte for byte", () => {
    expect(storedFrom("flow.md", dslOf("flow.md", MD)!, MD)).toBe(MD);
  });

  it("leaves prose as prose instead of wrapping it in a fence", () => {
    const edited = `${PROSE}\nAnd a new line.\n`;
    expect(storedFrom("README.md", edited, PROSE)).toBe(edited);
  });

  it("builds a whole markdown document for a brand-new .md", () => {
    const out = storedFrom("new.md", DSL);
    expect(out).toContain("```kai-swimlane");
    expect(dslOf("new.md", out)).toBe(DSL);
  });
});
