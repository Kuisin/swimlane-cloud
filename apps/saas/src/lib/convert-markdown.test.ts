import { describe, expect, it } from "vitest";
import { dslOf } from "./diagram-file";
import { markdownPathFor, planMarkdownConversion, rewriteImports } from "./convert-markdown";

const DSL = `@kai-swimlane

/meta/
owner: sales-ops;

/title/
Order to cash

/role/
<sales>
label: Sales;

/line/
[sales: Take the order]
@end
`;

describe("markdownPathFor", () => {
  it("changes only the extension", () => {
    expect(markdownPathFor("diagrams/a/b.txt")).toBe("diagrams/a/b.md");
    expect(markdownPathFor("a.b.txt")).toBe("a.b.md");
  });
});

describe("rewriteImports", () => {
  const renamed = new Set(["diagrams/shared.txt", "diagrams/sub/other.txt"]);
  const from = "diagrams/flow.txt";

  it("repoints a relative import whose target is being renamed", () => {
    expect(rewriteImports("@use ./shared.txt;", from, renamed)).toBe("@use ./shared.md;");
    expect(rewriteImports("@use ./sub/other.txt;", from, renamed)).toBe("@use ./sub/other.md;");
  });

  it("repoints a root-relative import", () => {
    expect(rewriteImports("@use diagrams/shared.txt;", from, renamed)).toBe(
      "@use diagrams/shared.md;",
    );
  });

  it("keeps the alias and the quoting", () => {
    expect(rewriteImports("@use ./shared.txt as base;", from, renamed)).toBe(
      "@use ./shared.md as base;",
    );
    expect(rewriteImports('@use "./shared.txt";', from, renamed)).toBe('@use "./shared.md";');
  });

  it("leaves a target that is not being renamed exactly as written", () => {
    // Template fragments live outside the diagram tree and are not converted.
    expect(rewriteImports("@use templates/role/standard.txt;", from, renamed)).toBe(
      "@use templates/role/standard.txt;",
    );
    expect(rewriteImports("@use ./nowhere.txt;", from, renamed)).toBe("@use ./nowhere.txt;");
    expect(rewriteImports("@use assets/logo.png;", from, renamed)).toBe("@use assets/logo.png;");
  });

  it("resolves ../ against the importing file, not the root", () => {
    const deep = "diagrams/sub/deep.txt";
    expect(rewriteImports("@use ../shared.txt;", deep, renamed)).toBe("@use ../shared.md;");
    // From the root of the tree the same operand points somewhere else entirely.
    expect(rewriteImports("@use ../shared.txt;", "diagrams/flow.txt", renamed)).toBe(
      "@use ../shared.txt;",
    );
  });
});

describe("planMarkdownConversion", () => {
  it("writes a .md and deletes the .txt for every diagram", () => {
    const plan = planMarkdownConversion({ "diagrams/flow.txt": DSL });
    expect(plan.deletions).toEqual(["diagrams/flow.txt"]);
    expect(plan.renames).toEqual([{ from: "diagrams/flow.txt", to: "diagrams/flow.md" }]);
    expect(plan.writes).toHaveLength(1);
    expect(plan.writes[0]!.path).toBe("diagrams/flow.md");
  });

  it("moves /meta/ into frontmatter and keeps the diagram readable", () => {
    const plan = planMarkdownConversion({ "diagrams/flow.txt": DSL });
    const text = plan.writes[0]!.text;
    expect(text.startsWith("---\nowner: sales-ops\n---\n")).toBe(true);
    expect(text).toContain("```kai-swimlane");
    // and the DSL comes back out of it byte for byte — the conversion is
    // reversible, which is what makes it safe to revert as one commit.
    expect(dslOf("diagrams/flow.md", text)).toBe(DSL);
  });

  it("leaves files that are already markdown alone", () => {
    const plan = planMarkdownConversion({
      "diagrams/flow.txt": DSL,
      "diagrams/notes.md": "# Notes\n",
    });
    expect(plan.deletions).toEqual(["diagrams/flow.txt"]);
    expect(plan.writes.map((w) => w.path)).toEqual(["diagrams/flow.md"]);
  });

  it("repoints imports between two files it is converting together", () => {
    const plan = planMarkdownConversion({
      "diagrams/flow.txt": `@kai-swimlane\n@use ./shared.txt;\n/line/\n[a: x]\n@end\n`,
      "diagrams/shared.txt": DSL,
    });
    const flow = plan.writes.find((w) => w.path === "diagrams/flow.md")!;
    expect(flow.text).toContain("@use ./shared.md;");
    expect(flow.text).not.toContain("shared.txt");
  });

  // Overwriting someone's existing document would be an unrecoverable step in
  // a bulk action, so the whole conversion refuses instead.
  it("refuses entirely when a .md already sits where a .txt would land", () => {
    const plan = planMarkdownConversion({ "diagrams/flow.txt": DSL }, ["diagrams/flow.md"]);
    expect(plan.conflicts).toEqual(["diagrams/flow.md"]);
    expect(plan.writes).toEqual([]);
    expect(plan.deletions).toEqual([]);
  });

  it("plans nothing for a project that is already converted", () => {
    const plan = planMarkdownConversion({ "diagrams/notes.md": "# Notes\n" });
    expect(plan.writes).toEqual([]);
    expect(plan.deletions).toEqual([]);
    expect(plan.conflicts).toEqual([]);
  });
});
