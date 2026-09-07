import { describe, expect, it } from "vitest";
import { diffChars } from "./utils.js";

describe("diffChars", () => {
  it("returns a single equal segment for identical strings", () => {
    expect(diffChars("受領", "受領")).toEqual([{ type: "equal", text: "受領" }]);
  });

  it("finds a pure insertion", () => {
    expect(diffChars("承諾書を受領", "承諾書と誓約書を受領")).toEqual([
      { type: "equal", text: "承諾書" },
      { type: "insert", text: "と誓約書" },
      { type: "equal", text: "を受領" },
    ]);
  });

  it("finds a pure deletion", () => {
    expect(diffChars("承諾書と誓約書を受領", "承諾書を受領")).toEqual([
      { type: "equal", text: "承諾書" },
      { type: "delete", text: "と誓約書" },
      { type: "equal", text: "を受領" },
    ]);
  });

  it("finds a replacement as a delete+insert pair, not scattered single chars", () => {
    expect(diffChars("見積を修正", "見積を承認")).toEqual([
      { type: "equal", text: "見積を" },
      { type: "delete", text: "修正" },
      { type: "insert", text: "承認" },
    ]);
  });

  it("handles an empty old or new string", () => {
    expect(diffChars("", "新規")).toEqual([{ type: "insert", text: "新規" }]);
    expect(diffChars("削除", "")).toEqual([{ type: "delete", text: "削除" }]);
    expect(diffChars("", "")).toEqual([]);
  });

  it("treats null/undefined as empty strings", () => {
    expect(diffChars(null, "新規")).toEqual([{ type: "insert", text: "新規" }]);
    expect(diffChars("削除", undefined)).toEqual([{ type: "delete", text: "削除" }]);
  });

  it("keeps a surrogate-pair emoji as one unit, not two broken halves", () => {
    // U+1F600 (😀) is a surrogate pair in UTF-16; Array.from (used internally)
    // iterates by code point, so it must appear as one atomic insert/delete.
    const segs = diffChars("開始", "開始😀");
    expect(segs).toEqual([
      { type: "equal", text: "開始" },
      { type: "insert", text: "😀" },
    ]);
  });
});
