import { describe, expect, it } from "vitest";
import { mergeDsl, splitDocument, joinDocument } from "./merge-dsl.js";
import { parseDSL } from "./parser.js";

const doc = (body) => `@kai-swimlane\n${body}\n@end\n`;

/** Every merge result must still be a document the reader accepts. */
const expectParses = (text) => {
  const res = parseDSL(text);
  expect(res.errors).toEqual([]);
  return res;
};

describe("splitDocument / joinDocument", () => {
  it("round-trips a document byte for byte", () => {
    const src = doc(
      "@lang ja, en;\n\n/title/\nOrder\n\n/role/\n<a>\nlabel: A;\n\n/line/\n[a: Start]",
    );
    expect(joinDocument(splitDocument(src))).toBe(src);
  });

  it("keeps unknown preamble lines in the head", () => {
    const { head, sections } = splitDocument(doc("@use assets/x.svg;\n/line/\n[a: Start]"));
    expect(head.join("\n")).toContain("@use assets/x.svg;");
    expect(sections.map((s) => s.marker)).toEqual(["/line/"]);
  });
});

describe("mergeDsl — the cases git gets wrong", () => {
  it("collapses a grammar-migration-only edit to nothing", () => {
    // This is the shape of the real conflict on Kuisin/template-docs#7: one
    // side migrated the document, the other added a step. Git conflicts on
    // every migrated line; here the migration is not a change at all.
    const base = doc("/line/\n[a: Start]\n  props: RQ;\n[a: Done]");
    const theirs = doc("/line/\n[a: Start] +RQ\n[a: Done]"); // migrated
    const ours = doc("/line/\n[a: Start]\n  props: RQ;\n[a: Middle]\n[a: Done]"); // edited

    const { text, clean, conflicts } = mergeDsl(base, ours, theirs);
    expect(conflicts).toEqual([]);
    expect(clean).toBe(true);
    expect(text).toContain("[a: Middle]");
    expect(text).toContain("[a: Start] +RQ");
    expect(text).not.toContain("props:");
  });

  it("reports migration on the side that needed it", () => {
    const base = doc("/line/\n[a: Start]");
    const { migrated } = mergeDsl(
      "@kai-swimlane 2\n/line/\n[a: Start]\n@end\n",
      base,
      "@kai-swimlane 2\n/line/\n[a: Start]\n@end\n",
    );
    expect(migrated).toMatchObject({ base: true, theirs: true, ours: false });
  });

  it("merges two different /role/ definitions without conflict", () => {
    const base = doc("/role/\n<a>\nlabel: A;\n\n/line/\n[a: Start]");
    const ours = doc("/role/\n<a>\nlabel: A;\nbackground-color: #eee;\n\n/line/\n[a: Start]");
    const theirs = doc("/role/\n<a>\nlabel: A;\n\n<b>\nlabel: B;\n\n/line/\n[a: Start]");

    const { text, clean } = mergeDsl(base, ours, theirs);
    expect(clean).toBe(true);
    expect(text).toContain("background-color: #eee;");
    expect(text).toContain("<b>");
    expectParses(text);
  });

  it("conflicts on the one role both sides redefined, and only that one", () => {
    const base = doc("/role/\n<a>\nlabel: A;\n\n<b>\nlabel: B;\n\n/line/\n[a: Start]");
    const ours = doc("/role/\n<a>\nlabel: Ours;\n\n<b>\nlabel: B;\n\n/line/\n[a: Start]");
    const theirs = doc("/role/\n<a>\nlabel: Theirs;\n\n<b>\nlabel: Bee;\n\n/line/\n[a: Start]");

    const { clean, conflicts } = mergeDsl(base, ours, theirs);
    expect(clean).toBe(false);
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]).toMatchObject({ section: "/role/", key: "a" });
    // `b` was only changed on one side, so it is not a conflict.
    expect(conflicts.map((c) => c.key)).not.toContain("b");
  });

  it("merges per /option/ key rather than per line", () => {
    const base = doc(
      "/option/\nshow-left-gutter: true;\nshow-right-gutter: true;\n\n/line/\n[a: S]",
    );
    const ours = doc(
      "/option/\nshow-left-gutter: false;\nshow-right-gutter: true;\n\n/line/\n[a: S]",
    );
    const theirs = doc(
      "/option/\nshow-left-gutter: true;\nshow-right-gutter: true;\nleft-title: Steps;\n\n/line/\n[a: S]",
    );

    const { text, clean } = mergeDsl(base, ours, theirs);
    expect(clean).toBe(true);
    expect(text).toContain("show-left-gutter: false;");
    expect(text).toContain("left-title: Steps;");
  });

  it("keeps a role definition deleted on one side and untouched on the other deleted", () => {
    const base = doc("/role/\n<a>\nlabel: A;\n\n<b>\nlabel: B;\n\n/line/\n[a: S]");
    const ours = doc("/role/\n<a>\nlabel: A;\n\n/line/\n[a: S]");
    const theirs = base;

    const { text, clean } = mergeDsl(base, ours, theirs);
    expect(clean).toBe(true);
    expect(text).not.toContain("<b>");
  });
});

describe("mergeDsl — ordered sections", () => {
  it("merges inserts at different points in /line/", () => {
    const base = doc("/line/\n[a: One]\n[a: Two]\n[a: Three]");
    const ours = doc("/line/\n[a: One]\n[a: OneAndAHalf]\n[a: Two]\n[a: Three]");
    const theirs = doc("/line/\n[a: One]\n[a: Two]\n[a: Three]\n[a: Four]");

    const { text, clean } = mergeDsl(base, ours, theirs);
    expect(clean).toBe(true);
    expect(text).toContain("[a: OneAndAHalf]");
    expect(text).toContain("[a: Four]");
    expectParses(text);
  });

  it("does not split a nested block from its closer", () => {
    const base = doc("/line/\n[a: One]\n[a: Two]");
    const ours = doc(
      "/line/\n[a: One]\nif (ok?) is (yes) than #green\n  [a: Yes]\nend-if\n[a: Two]",
    );
    const theirs = doc("/line/\n[a: One]\n[a: Two]\n[a: Three]");

    const { text, clean } = mergeDsl(base, ours, theirs);
    expect(clean).toBe(true);
    const lines = text.split("\n").map((l) => l.trim());
    expect(lines.indexOf("if (ok?) is (yes) than #green")).toBeLessThan(lines.indexOf("end-if"));
    expect(text).toContain("[a: Three]");
    expectParses(text);
  });

  it("conflicts when both sides rewrite the same row", () => {
    const base = doc("/line/\n[a: One]\n[a: Two]");
    const ours = doc("/line/\n[a: One]\n[a: Ours]");
    const theirs = doc("/line/\n[a: One]\n[a: Theirs]");

    const { clean, conflicts } = mergeDsl(base, ours, theirs);
    expect(clean).toBe(false);
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0].ours).toContain("Ours");
    expect(conflicts[0].theirs).toContain("Theirs");
  });
});

describe("mergeDsl — regression: template-docs#7", () => {
  // The real one. An edit branch went on writing a step's id as the retired
  // `@ID` suffix while preview moved to the `id: <id>;` property line, so git
  // conflicted on every step that has an id — three files, every hunk the
  // same non-difference. Migrating first makes preview's side equal to the
  // base, and what is left to merge is only the step the draft added.
  const preamble = "/role/\n<role_staff>\nlabel: Staff;\n\n/line/\n";
  const base = doc(
    `${preamble}[role_staff: Request for Posting Document] <block_manual> @ACT-AC-020-001-001\n[role_staff: Display Posted Document] <block_display> @ACT-AC-020-001-005`,
  );
  const theirs = doc(
    `${preamble}[role_staff: Request for Posting Document] <block_manual>\n  id: ACT-AC-020-001-001;\n[role_staff: Display Posted Document] <block_display>\n  id: ACT-AC-020-001-005;`,
  );
  const ours = doc(
    `${preamble}[role_staff: Request for Posting Document] <block_manual> @ACT-AC-020-001-001\n[role_staff: Approve and Post] <block_approve> @ACT-AC-020-001-004\n[role_staff: Display Posted Document] <block_display> @ACT-AC-020-001-005`,
  );

  it("merges cleanly and keeps both sides' real work", () => {
    const { text, clean, conflicts } = mergeDsl(base, ours, theirs);
    expect(conflicts).toEqual([]);
    expect(clean).toBe(true);
    expect(text).toContain("id: ACT-AC-020-001-001;");
    expect(text).toContain("id: ACT-AC-020-001-004;"); // the draft's own step, migrated
    expect(text).toContain("[role_staff: Approve and Post] <block_approve>");
    expect(text).not.toContain("@ACT-");
    expectParses(text);
  });

  it("is a no-op merge once both sides are on the current grammar", () => {
    const { text, clean } = mergeDsl(theirs, theirs, theirs);
    expect(clean).toBe(true);
    expect(text).toBe(theirs);
  });
});
