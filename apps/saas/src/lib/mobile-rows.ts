import { findBranchEndIndex, findGroupEndIndex, type GuiRow } from "@swimlane-cloud/editor";

/**
 * Row surgery for the mobile editor's branch/group/case edits.
 *
 * Every function here takes and returns **raw** (unnormalized) `model.rows` —
 * the same array `parseDSL` produces and the mobile tree indexes into via
 * `startRow`/`rowIndex`. That matters: `applyModelEdit` normalizes rows first
 * (`normalizeBranchRows` inserts an extra `branchCase` for any `if` whose
 * first case is labelled), which shifts every later index and would silently
 * retarget these edits. Steps are immune to that shift — normalization only
 * ever adds branchCase rows — so they keep using `applyModelEdit`.
 */

export type BlockKind = "if" | "fork" | "section" | "subBranch";

/** Rows for a new branch/group skeleton, ready to append to a document. */
export function blockRows(
  kind: BlockKind,
  id: string,
  labels: { condition: string; firstCase: string },
): GuiRow[] {
  if (kind === "if") {
    return [
      {
        kind: "branchStart",
        id,
        cond: labels.condition,
        firstCase: labels.firstCase,
        parallel: false,
        branchColor: null,
        depth: 0,
      },
      { kind: "branchCase", id, label: "", parallel: false, branchColor: null, depth: 0 },
      { kind: "branchEnd", id, parallel: false, depth: 0 },
    ];
  }
  if (kind === "fork") {
    // Two paths, because one parallel path is not a fork.
    return [
      { kind: "branchStart", id, parallel: true, branchColor: null, depth: 0 },
      { kind: "branchCase", id, label: "", parallel: true, branchColor: null, depth: 0 },
      { kind: "branchCase", id, label: "", parallel: true, branchColor: null, depth: 0 },
      { kind: "branchEnd", id, parallel: true, depth: 0 },
    ];
  }
  const groupMode = kind === "section" ? "section" : "branch";
  return [
    { kind: "groupStart", id, groupMode, sectionName: "", depth: 0 },
    { kind: "groupEnd", id, groupMode, depth: 0 },
  ];
}

/**
 * Remove the row at `index`. A `branchStart`/`groupStart` owns a whole block,
 * so its closing row — and everything nested between — goes with it; leaving
 * an orphan `end-if`/`end-section` behind would just break the document.
 */
export function withoutBlock(rows: GuiRow[], index: number): GuiRow[] {
  const row = rows[index];
  if (!row) return rows;
  const end =
    row.kind === "branchStart"
      ? findBranchEndIndex(rows, index)
      : row.kind === "groupStart"
        ? findGroupEndIndex(rows, index)
        : index;
  const count = end >= index ? end - index + 1 : 1;
  const out = rows.slice();
  out.splice(index, count);
  return out;
}

/**
 * Append one more case/path to the branch that `index` belongs to (either its
 * `branchStart` or any of its `branchCase` rows), just before its end row.
 */
export function withExtraCase(rows: GuiRow[], index: number, label: string): GuiRow[] {
  const row = rows[index];
  if (!row) return rows;
  let startIdx = -1;
  if (row.kind === "branchStart") {
    startIdx = index;
  } else {
    // Walk back to the branchStart this case belongs to. Matching on `id`
    // alone is not enough — nested branches reuse the same row kinds — so
    // stop at the first branchStart at or before `index` carrying this id.
    for (let i = index; i >= 0; i--) {
      if (rows[i].kind === "branchStart" && rows[i].id === row.id) {
        startIdx = i;
        break;
      }
    }
  }
  if (startIdx < 0) return rows;
  const end = findBranchEndIndex(rows, startIdx);
  if (end < 0) return rows;
  const parallel = Boolean(rows[startIdx].parallel);
  const out = rows.slice();
  out.splice(end, 0, {
    kind: "branchCase",
    id: rows[startIdx].id,
    label: parallel ? "" : label,
    parallel,
    branchColor: null,
    depth: 0,
  });
  return out;
}
