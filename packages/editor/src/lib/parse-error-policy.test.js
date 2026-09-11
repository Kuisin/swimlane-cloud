import { describe, expect, it } from "vitest";
import {
  errorLineSet,
  hasParseErrors,
  buildLockedGuiRowIndices,
  isGuiRowEditingLocked,
  mustChooseParseErrorPolicy,
  canUseGuiEditing,
  findRowForErrorLine,
  classifyErrors,
} from "./parse-error-policy.js";

const rows = [
  { kind: "step", dslLines: [3, 4] },
  { kind: "step", dslLines: [5] },
  { kind: "branchStart", dslLines: [6] },
];

describe("errorLineSet / hasParseErrors", () => {
  it("collects positive numeric lines only", () => {
    const set = errorLineSet([{ line: 3 }, { line: 0 }, { line: -1 }, { msg: "no line" }]);
    expect(set).toEqual(new Set([3]));
  });

  it("reports whether there are any errors at all", () => {
    expect(hasParseErrors([])).toBe(false);
    expect(hasParseErrors([{ line: 1 }])).toBe(true);
  });
});

describe("buildLockedGuiRowIndices", () => {
  it("locks every row whose dslLines intersect an error line", () => {
    const locked = buildLockedGuiRowIndices(rows, [{ line: 5 }]);
    expect(locked).toEqual(new Set([1]));
  });

  it("locks nothing when there are no errors or no rows", () => {
    expect(buildLockedGuiRowIndices(rows, [])).toEqual(new Set());
    expect(buildLockedGuiRowIndices([], [{ line: 5 }])).toEqual(new Set());
  });

  it("is queryable via isGuiRowEditingLocked", () => {
    const locked = buildLockedGuiRowIndices(rows, [{ line: 5 }]);
    expect(isGuiRowEditingLocked(1, locked)).toBe(true);
    expect(isGuiRowEditingLocked(0, locked)).toBe(false);
    expect(isGuiRowEditingLocked(0, null)).toBe(false);
  });
});

describe("mustChooseParseErrorPolicy / canUseGuiEditing", () => {
  it("requires a policy only when there are errors and none is set yet", () => {
    expect(mustChooseParseErrorPolicy([], null)).toBe(false);
    expect(mustChooseParseErrorPolicy([{ line: 1 }], null)).toBe(true);
    expect(mustChooseParseErrorPolicy([{ line: 1 }], "continue")).toBe(false);
  });

  it("allows GUI editing whenever a policy isn't required", () => {
    expect(canUseGuiEditing([], null)).toBe(true);
    expect(canUseGuiEditing([{ line: 1 }], "continue")).toBe(true);
    expect(canUseGuiEditing([{ line: 1 }], null)).toBe(false);
  });
});

describe("findRowForErrorLine", () => {
  it("finds the row whose dslLines include the error line", () => {
    expect(findRowForErrorLine(rows, 4)).toBe(0);
    expect(findRowForErrorLine(rows, 6)).toBe(2);
  });

  it("returns -1 for a line with no matching row, or an invalid line", () => {
    expect(findRowForErrorLine(rows, 99)).toBe(-1);
    expect(findRowForErrorLine(rows, 0)).toBe(-1);
    expect(findRowForErrorLine(rows, null)).toBe(-1);
    expect(findRowForErrorLine([], 4)).toBe(-1);
  });
});

describe("classifyErrors", () => {
  it("tags an error on a row's dslLines as target row + rowIndex", () => {
    const [classified] = classifyErrors([{ line: 5, msg: "boom" }], rows);
    expect(classified).toMatchObject({ line: 5, msg: "boom", target: "row", rowIndex: 1 });
  });

  it("tags a lined error with no matching row as target definitions", () => {
    const [classified] = classifyErrors([{ line: 1, msg: "bad /role/" }], rows);
    expect(classified).toMatchObject({ target: "definitions" });
  });

  it("tags a lineless error as target unknown", () => {
    const [classified] = classifyErrors([{ msg: "no line info" }], rows);
    expect(classified).toMatchObject({ target: "unknown" });
  });
});
