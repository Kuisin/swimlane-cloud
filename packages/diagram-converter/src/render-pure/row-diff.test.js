import { describe, expect, it } from "vitest";
import { parseDSL } from "../parser.js";
import { THEMES } from "../themes.js";
import { renderDiagramSvg } from "./diagram.js";
import { diffModelRows, diffModels } from "./row-diff.js";
import { textDiffToSvg } from "./text-to-svg.js";

const theme = THEMES.basic;

function parse(dsl) {
  const model = parseDSL(dsl);
  expect(model.errors).toEqual([]);
  return model;
}

/** A one-role flow whose steps are `texts`, in order. */
function flow(texts, role = "a") {
  return `@kai-swimlane
/role/
<${role}>
  label: A;

/line/
${texts.map((t) => `[${role}: ${t}]`).join("\n")}
@end`;
}

/** Just the step rows' captions and statuses, which is what a reader checks. */
function summarize({ rows, diffRows }) {
  return rows
    .map((r, i) => ({ i, r }))
    .filter(({ r }) => r.kind === "step")
    .map(({ i, r }) => ({
      text: r.text,
      role: r.role,
      status: diffRows.get(i)?.status ?? "same",
      oldText: diffRows.get(i)?.oldText,
    }));
}

function diffOf(beforeDsl, afterDsl) {
  return diffModelRows(parse(beforeDsl).rows, parse(afterDsl).rows);
}

describe("diffModelRows: nothing changed", () => {
  it("returns the new rows untouched and an empty map for identical models", () => {
    const after = parse(flow(["A", "B", "C"]));
    const { rows, diffRows } = diffModelRows(parse(flow(["A", "B", "C"])).rows, after.rows);
    expect(diffRows.size).toBe(0);
    expect(rows).toEqual(after.rows);
  });

  it("treats a missing/empty old side as everything added", () => {
    const { diffRows } = diffModelRows([], parse(flow(["A", "B"])).rows);
    expect([...diffRows.values()].map((v) => v.status)).toEqual(["added", "added"]);
  });
});

describe("diffModelRows: pure add", () => {
  it("marks only the new step, leaving its neighbours untouched", () => {
    const d = diffOf(flow(["A", "C"]), flow(["A", "B", "C"]));
    expect(summarize(d)).toEqual([
      { text: "A", role: "a", status: "same", oldText: undefined },
      { text: "B", role: "a", status: "added", oldText: undefined },
      { text: "C", role: "a", status: "same", oldText: undefined },
    ]);
  });

  it("marks a step appended at the end", () => {
    const d = diffOf(flow(["A", "B"]), flow(["A", "B", "C"]));
    expect(summarize(d).map((s) => s.status)).toEqual(["same", "same", "added"]);
  });
});

describe("diffModelRows: pure remove", () => {
  it("splices a ghost row in where the removed step used to be", () => {
    const d = diffOf(flow(["A", "B", "C"]), flow(["A", "C"]));
    expect(summarize(d)).toEqual([
      { text: "A", role: "a", status: "same", oldText: undefined },
      { text: "B", role: "a", status: "removed", oldText: undefined },
      { text: "C", role: "a", status: "same", oldText: undefined },
    ]);
  });

  it("strips a ghost's addressable ids so it can never steal a jump target", () => {
    const { rows, diffRows } = diffOf(flow(["A", "B", "C"]), flow(["A", "C"]));
    const [ghostIndex] = [...diffRows].find(([, v]) => v.status === "removed");
    expect(rows[ghostIndex].diffRemovedGhost).toBe(true);
    expect(rows[ghostIndex].stepId).toBeUndefined();
    expect(rows[ghostIndex].mergeId).toBeUndefined();
    // The entry still carries the original row for a caller that wants it.
    expect(diffRows.get(ghostIndex).oldRow.text).toBe("B");
  });
});

describe("diffModelRows: a step's text changed", () => {
  it("is one 'changed' row carrying the old caption, not a remove plus an add", () => {
    const d = diffOf(flow(["A", "承諾書を受領", "C"]), flow(["A", "承諾書と誓約書を受領", "C"]));
    expect(summarize(d)).toEqual([
      { text: "A", role: "a", status: "same", oldText: undefined },
      { text: "承諾書と誓約書を受領", role: "a", status: "changed", oldText: "承諾書を受領" },
      { text: "C", role: "a", status: "same", oldText: undefined },
    ]);
  });

  it("keeps a ghost after the reworded row it used to follow", () => {
    // Both old rows land in the same gap: one is reworded, one is gone. The
    // ghost belongs where it sat relative to the row that survived.
    const d = diffOf(
      flow(["開始", "承諾書を受領", "検印する", "完了"]),
      flow(["開始", "承諾書と誓約書を受領", "完了"]),
    );
    expect(summarize(d).map((s) => [s.text, s.status])).toEqual([
      ["開始", "same"],
      ["承諾書と誓約書を受領", "changed"],
      ["検印する", "removed"],
      ["完了", "same"],
    ]);
  });

  it("pairs each reworded step with the most similar old one when several change at once", () => {
    const d = diffOf(flow(["申請を受理", "書類を審査"]), flow(["書類を再審査", "申請を受理する"]));
    const byText = Object.fromEntries(summarize(d).map((s) => [s.text, s]));
    expect(byText["書類を再審査"].oldText).toBe("書類を審査");
    expect(byText["申請を受理する"].oldText).toBe("申請を受理");
  });
});

describe("diffModelRows: a step's role changed", () => {
  // Documented choice: `role` is part of the row's identity, because on a
  // swimlane diagram the role *is* the column. Moving a step to another lane
  // is a removal from one and an addition to the other, never an edit.
  it("is a ghost in the old lane plus a fresh box in the new one", () => {
    const before = `@kai-swimlane
/role/
<a>
  label: A;
<b>
  label: B;

/line/
[a: 開始]
[a: 審査]
[a: 完了]
@end`;
    const after = before.replace("[a: 審査]", "[b: 審査]");
    const summary = summarize(diffOf(before, after));
    expect(summary.filter((s) => s.status === "changed")).toEqual([]);
    expect(summary.filter((s) => s.status === "removed")).toEqual([
      { text: "審査", role: "a", status: "removed", oldText: undefined },
    ]);
    expect(summary.filter((s) => s.status === "added")).toEqual([
      { text: "審査", role: "b", status: "added", oldText: undefined },
    ]);
  });
});

describe("diffModelRows: reordered rows", () => {
  // Documented choice: a move is reported as removed-here + added-there. It is
  // never "changed", because a changed row must have a caption delta to show.
  it("never reports a moved-but-identical step as changed", () => {
    const summary = summarize(diffOf(flow(["A", "B", "C"]), flow(["A", "C", "B"])));
    expect(summary.some((s) => s.status === "changed")).toBe(false);
    expect(summary.filter((s) => s.status === "removed").map((s) => s.text)).toEqual(["B"]);
    expect(summary.filter((s) => s.status === "added").map((s) => s.text)).toEqual(["B"]);
  });

  it("leaves a whole-flow reversal free of any 'changed' claim", () => {
    const summary = summarize(diffOf(flow(["A", "B", "C", "D"]), flow(["D", "C", "B", "A"])));
    expect(summary.some((s) => s.status === "changed")).toBe(false);
  });
});

describe("diffModelRows: structural rows", () => {
  const BRANCHED = `@kai-swimlane
/role/
<a>
  label: A;

/line/
[a: 開始]
if (承認されたか) is (はい) than
  [a: 発行]
else-if () than
  [a: 却下]
end-if
[a: 完了]
@end`;

  it("reports a reworded question as a changed branchStart row", () => {
    const after = BRANCHED.replace("承認されたか", "部長が承認したか");
    const { rows, diffRows } = diffOf(BRANCHED, after);
    const entry = [...diffRows].find(([i]) => rows[i].kind === "branchStart");
    expect(entry?.[1]).toMatchObject({ status: "changed", oldText: "承認されたか" });
  });

  it("gives a deleted branch no ghost row, so the frame stays balanced", () => {
    const after = flow(["開始", "完了"]);
    const { rows, diffRows } = diffOf(BRANCHED, after);
    // No branchStart/branchEnd survives into the rendered list ...
    expect(rows.some((r) => r.kind === "branchStart" || r.kind === "branchEnd")).toBe(false);
    // ... and the two steps that lived inside it are the only ghosts.
    expect(
      [...diffRows.values()].filter((v) => v.status === "removed").map((v) => v.oldRow.text),
    ).toEqual(["発行", "却下"]);
  });
});

describe("diffModels: the model handed to the renderer", () => {
  it("keeps a ghost's lane alive when the new model dropped the role", () => {
    const before = `@kai-swimlane
/role/
<a>
  label: A;
<b>
  label: B;

/line/
[a: 開始]
[b: 審査]
@end`;
    const after = `@kai-swimlane
/role/
<a>
  label: A;

/line/
[a: 開始]
@end`;
    const { model, diffRows } = diffModels(parse(before), parse(after));
    expect([...diffRows.values()].map((v) => v.status)).toEqual(["removed"]);
    const lane = model.lanes.find((l) => l.id === "b");
    expect(lane).toMatchObject({ id: "b", label: "B", used: true });
  });
});

describe("rendering a computed diff", () => {
  const BEFORE = flow(["開始", "承諾書を受領", "完了"]);
  // "承諾書を受領" reworded, and a step added after it.
  const AFTER = flow(["開始", "承諾書と誓約書を受領", "押印", "完了"]);

  it("produces exactly one changed and one added row for the realistic edit", () => {
    expect(summarize(diffOf(BEFORE, AFTER))).toEqual([
      { text: "開始", role: "a", status: "same", oldText: undefined },
      {
        text: "承諾書と誓約書を受領",
        role: "a",
        status: "changed",
        oldText: "承諾書を受領",
      },
      { text: "押印", role: "a", status: "added", oldText: undefined },
      { text: "完了", role: "a", status: "same", oldText: undefined },
    ]);
  });

  it("renders that map through renderDiagramSvg with the expected diff markup", () => {
    const { model, diffRows } = diffModels(parse(BEFORE), parse(AFTER));
    const svg = renderDiagramSvg({ model, theme, showStepBlockCaptions: false, diffRows });
    // the toggle stylesheet is present once there is anything to toggle
    expect(svg).toContain(".diff-hidden .sw-diff-highlight{display:none}");
    // the added row: green dashed outline + "+" badge
    expect(svg).toContain('stroke="#16a34a"');
    expect(svg).toContain(">+<");
    // the changed row: amber "~" badge and the inserted words underlined green
    expect(svg).toContain('stroke="#d97706"');
    expect(svg).toContain(">~<");
    expect(svg).toContain(
      '<tspan class="sw-diff-insert" fill="#15803d" text-decoration="underline">と誓約書</tspan>',
    );
    // nothing was removed, so no red anywhere
    expect(svg).not.toContain('stroke="#dc2626"');
    expect(svg).not.toContain(">−<");
  });

  it("draws a removed step as a struck-through ghost with red connector overlays", () => {
    const { svg } = textDiffToSvg(flow(["開始", "承諾書を受領", "完了"]), flow(["開始", "完了"]), {
      themeKey: "basic",
    });
    expect(svg).toContain(">−<");
    expect(svg).toContain('text-decoration="line-through"');
    expect(svg).toContain('<g class="sw-diff-highlight"><rect');
    // one overlay for the edge into the ghost, one for the edge out of it
    expect([...svg.matchAll(/stroke="#dc2626" stroke-width="5"/g)].length).toBe(2);
  });

  it("renders the plain 'after' diagram when nothing changed", () => {
    const src = flow(["開始", "完了"]);
    const { svg, diffRows } = textDiffToSvg(src, src, { themeKey: "basic" });
    expect(diffRows.size).toBe(0);
    expect(svg).not.toContain("sw-diff-highlight");
    expect(svg).not.toContain("diff-hidden");
  });

  it("survives a deleted file — every row becomes a ghost, nothing throws", () => {
    const { svg, diffRows } = textDiffToSvg(flow(["開始", "完了"]), "", { themeKey: "basic" });
    expect([...diffRows.values()].map((v) => v.status)).toEqual(["removed", "removed"]);
    expect(svg).toContain(">−<");
  });

  it("survives an added file — every row is marked added", () => {
    const { svg, diffRows } = textDiffToSvg("", flow(["開始", "完了"]), { themeKey: "basic" });
    expect([...diffRows.values()].map((v) => v.status)).toEqual(["added", "added"]);
    expect(svg).toContain(">+<");
  });
});
