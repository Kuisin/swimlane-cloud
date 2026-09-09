/**
 * These edits address rows by their **raw** `model.rows` index — the index the
 * mobile tree hands out. The regression they guard against is real and has
 * bitten twice: routing the same index through `applyModelEdit` (which
 * normalizes rows first) silently retargets the edit to a different row for
 * any node that sits after an `if` with a labelled first case.
 */
import { describe, expect, it } from "vitest";
import { parseDSL } from "@swimlane-cloud/diagram-converter/parser";
import { serializeDSL, type GuiRow } from "@swimlane-cloud/editor";
import { dslToMobile } from "@swimlane-cloud/mobile-view";
import { blockRows, withExtraCase, withoutBlock } from "./mobile-rows";

const SRC = `@kai-swimlane-v2
/line/
if (Approved?)
case (Yes)
  [sales: Ship it] @shipped
case (No)
  [sales: Reject]
end-if

section (Closing)
  [sales: Invoice]
end-section
@end
`;

type Parsed = { rows: GuiRow[]; errors: Array<unknown> };
type Tree = {
  nodes: Array<{
    type: string;
    name?: string;
    cond?: string;
    parallel?: boolean;
    startRow?: number;
    cases?: Array<{ label: string; rowIndex: number | null; branchRow: number; isFirst: boolean }>;
  }>;
};

const parse = (dsl: string) => parseDSL(dsl) as unknown as Parsed;
const tree = (dsl: string) => (dslToMobile(dsl) as unknown as { tree: Tree }).tree;
const write = (src: string, rows: GuiRow[]) =>
  serializeDSL({ ...(parse(src) as unknown as object), rows });

const branchOf = (t: Tree) => t.nodes.find((n) => n.type === "branch")!;
const groupOf = (t: Tree) => t.nodes.find((n) => n.type === "group")!;

describe("mobile row edits use raw row indices", () => {
  it("renames the case the user tapped, not a neighbouring row", () => {
    const t = tree(SRC);
    const second = branchOf(t).cases![1];
    expect(second).toMatchObject({ label: "No", isFirst: false });

    const rows = parse(SRC).rows.slice();
    rows[second.rowIndex!] = { ...rows[second.rowIndex!], label: "Declined" };
    const out = write(SRC, rows);

    expect(parse(out).errors).toEqual([]);
    expect(branchOf(tree(out)).cases!.map((c) => c.label)).toEqual(["Yes", "Declined"]);
  });

  it("renames an if's first case through firstCase on the branchStart", () => {
    const t = tree(SRC);
    const first = branchOf(t).cases![0];
    // The first clause has no row of its own — it lives on the branchStart.
    expect(first).toMatchObject({ label: "Yes", isFirst: true, rowIndex: null });

    const rows = parse(SRC).rows.slice();
    rows[first.branchRow] = { ...rows[first.branchRow], firstCase: "Approved" };
    const out = write(SRC, rows);

    expect(parse(out).errors).toEqual([]);
    expect(branchOf(tree(out)).cases!.map((c) => c.label)).toEqual(["Approved", "No"]);
  });

  it("renames a section that sits after an if — the index-shift case", () => {
    const t = tree(SRC);
    const group = groupOf(t);
    const rows = parse(SRC).rows.slice();
    // Sanity: this raw index really is the groupStart. (Through the
    // *normalized* rows the same index is a different row entirely.)
    expect(rows[group.startRow!].kind).toBe("groupStart");

    rows[group.startRow!] = { ...rows[group.startRow!], sectionName: "Wrap up" };
    const out = write(SRC, rows);

    expect(parse(out).errors).toEqual([]);
    expect(groupOf(tree(out)).name).toBe("Wrap up");
  });
});

describe("withoutBlock", () => {
  it("takes a section's closing row with it", () => {
    const rows = parse(SRC).rows;
    const out = write(SRC, withoutBlock(rows, groupOf(tree(SRC)).startRow!));
    const re = parse(out);
    expect(re.errors).toEqual([]);
    expect(re.rows.some((r) => r.kind === "groupStart" || r.kind === "groupEnd")).toBe(false);
    // the branch above it is untouched
    expect(branchOf(tree(out)).cases!.map((c) => c.label)).toEqual(["Yes", "No"]);
  });

  it("takes a whole if block, cases and all", () => {
    const rows = parse(SRC).rows;
    const out = write(SRC, withoutBlock(rows, branchOf(tree(SRC)).startRow!));
    const re = parse(out);
    expect(re.errors).toEqual([]);
    expect(re.rows.some((r) => String(r.kind).startsWith("branch"))).toBe(false);
    // the section below it survives
    expect(groupOf(tree(out)).name).toBe("Closing");
  });

  it("removes a single non-block row on its own", () => {
    const rows = parse(SRC).rows;
    const caseIdx = branchOf(tree(SRC)).cases![1].rowIndex!;
    const out = withoutBlock(rows, caseIdx);
    expect(out).toHaveLength(rows.length - 1);
  });

  it("leaves the rows alone for an out-of-range index", () => {
    const rows = parse(SRC).rows;
    expect(withoutBlock(rows, 999)).toBe(rows);
  });
});

describe("withExtraCase", () => {
  it("appends a case before the branch end, from the branchStart", () => {
    const rows = parse(SRC).rows;
    const out = write(SRC, withExtraCase(rows, branchOf(tree(SRC)).startRow!, "Maybe"));
    expect(parse(out).errors).toEqual([]);
    expect(branchOf(tree(out)).cases!.map((c) => c.label)).toEqual(["Yes", "No", "Maybe"]);
  });

  it("works when invoked from one of the branch's cases", () => {
    const rows = parse(SRC).rows;
    const out = write(SRC, withExtraCase(rows, branchOf(tree(SRC)).cases![1].rowIndex!, "Maybe"));
    expect(parse(out).errors).toEqual([]);
    expect(branchOf(tree(out)).cases!.map((c) => c.label)).toEqual(["Yes", "No", "Maybe"]);
  });

  it("leaves a parallel path unlabelled", () => {
    const forkSrc = `@kai-swimlane-v2\n/line/\nfork (Ship)\n  [a: x]\nand (Bill)\n  [a: y]\nend-fork\n@end\n`;
    const rows = parse(forkSrc).rows;
    const out = write(forkSrc, withExtraCase(rows, branchOf(tree(forkSrc)).startRow!, "ignored"));
    expect(parse(out).errors).toEqual([]);
    expect(branchOf(tree(out)).cases!.map((c) => c.label)).toEqual(["Ship", "Bill", ""]);
  });
});

describe("blockRows", () => {
  const labels = { condition: "Condition", firstCase: "New case" };
  const append = (kind: Parameters<typeof blockRows>[0]) =>
    write(SRC, [...parse(SRC).rows, ...blockRows(kind, "new1", labels)]);

  it("appends an if that parses, with a labelled and a catch-all clause", () => {
    const out = append("if");
    expect(parse(out).errors).toEqual([]);
    const added = tree(out).nodes.filter((n) => n.type === "branch")[1];
    expect(added.cond).toBe("Condition");
    expect(added.cases!.map((c) => c.label)).toEqual(["New case", ""]);
  });

  it("appends a fork with two paths and no phantom leading one", () => {
    const out = append("fork");
    expect(parse(out).errors).toEqual([]);
    const added = tree(out).nodes.filter((n) => n.type === "branch")[1];
    expect(added.parallel).toBe(true);
    expect(added.cases).toHaveLength(2);
  });

  it("appends a section and a side path", () => {
    for (const kind of ["section", "subBranch"] as const) {
      const out = append(kind);
      expect(parse(out).errors).toEqual([]);
      expect(tree(out).nodes.filter((n) => n.type === "group")).toHaveLength(2);
    }
  });
});
