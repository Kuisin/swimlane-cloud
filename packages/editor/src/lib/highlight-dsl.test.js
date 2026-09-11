import { describe, it, expect } from "vitest";
import { tokenizeDslLine } from "./highlight-dsl.js";

const concat = (line) =>
  tokenizeDslLine(line)
    .map((tok) => tok.s)
    .join("");
const types = (line) =>
  tokenizeDslLine(line)
    .filter((t) => t.s.trim())
    .map((t) => `${t.t}:${t.s}`);

describe("tokenizeDslLine", () => {
  it("is lossless — tokens always concatenate back to the line (overlay alignment)", () => {
    const lines = [
      "",
      "   ",
      "  arrow: dashed;",
      "if (status) #Done",
      "case (ok)",
      "// a comment",
      "/* another comment */",
      "@meta directive",
      "/role/",
      "<lane>: Do the thing and wait;",
      "section (Intake) #S1",
      "goto @target",
      "merge @done",
      "[]",
      "level: 2;",
      "résumé: 日本語のテキスト;",
    ];
    for (const line of lines) expect(concat(line)).toBe(line);
  });

  it("classifies the common constructs", () => {
    expect(types("arrow: dashed;")).toEqual(["key:arrow", "punct::", "plain:dashed", "punct:;"]);
    expect(types("// hi")).toEqual(["comment:// hi"]);
    expect(types("/role/")).toEqual(["section:/role/"]);
    expect(types("@x")).toEqual(["meta:@x"]);
    expect(types("end-if")).toEqual(["keyword:end-if"]);
    expect(types("end-phase")).toEqual(["keyword:end-phase"]);
    expect(types("<ref>")).toEqual(["ref:<ref>"]);
  });

  it("colours the bare spacer statement", () => {
    expect(types("[]")).toEqual(["keyword:[]"]);
  });

  it("colours goto and merge, with or without an @id", () => {
    expect(types("goto")).toEqual(["keyword:goto"]);
    expect(types("goto @done")).toEqual(["keyword:goto", "plain:@done"]);
    expect(types("merge")).toEqual(["keyword:merge"]);
    expect(types("merge @done")).toEqual(["keyword:merge", "plain:@done"]);
  });

  it("recognises `level` and `skip` as property keys, like `id`", () => {
    expect(types("level: 2;")).toEqual(["key:level", "punct::", "plain:2", "punct:;"]);
    expect(types("skip;")).toEqual(["key:skip", "punct:;"]);
  });

  it("colours inline keywords only on control-flow lines", () => {
    // `and` highlights inside a `fork` line...
    expect(types("fork (Shipping)")).toContain("keyword:fork");
    expect(types("and (Billing)")).toContain("keyword:and");
    // ...but a bare "and" inside step text stays plain.
    expect(types("<lane>: review and approve;")).not.toContain("keyword:and");
  });

  it("colours a blank case () as a keyword, same as a labelled one", () => {
    expect(types("case ()")).toContain("keyword:case");
  });
});
