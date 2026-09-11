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
      "if (status) is (ok) than #Done",
      "// a comment",
      "*** another comment",
      "@meta directive",
      "/role/",
      "<lane>: Do the thing and wait;",
      "section-start (Intake) #S1",
      "merge: target;",
      "[loop];",
      "[merge];",
      "[merge: done];",
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
    expect(types("endif")).toEqual(["keyword:endif"]);
    expect(types("end-if")).toEqual(["keyword:end-if"]);
    expect(types("<ref>")).toEqual(["ref:<ref>"]);
  });

  it("tokenizes [merge] / [merge: name] as one keyword/marker token, like [loop]", () => {
    expect(types("[loop];")).toEqual(["keyword:[loop]", "punct:;"]);
    expect(types("[merge];")).toEqual(["keyword:[merge]", "punct:;"]);
    expect(types("[merge: done];")).toEqual(["keyword:[merge: done]", "punct:;"]);
  });

  it("recognises `level` as a property key, like `skip`/`id`", () => {
    expect(types("level: 2;")).toEqual(["key:level", "punct::", "plain:2", "punct:;"]);
    expect(types("id: fin;")).toEqual(["key:id", "punct::", "plain:fin", "punct:;"]);
    expect(types("skip;")).toEqual(["keyword:skip", "punct:;"]);
  });

  it("colours inline keywords only on control-flow lines", () => {
    // `is` / `than` highlight inside an `if` line...
    expect(types("if (a) is (b) than #X")).toContain("keyword:is");
    expect(types("if (a) is (b) than #X")).toContain("anchor:#X");
    // ...but a bare "and" inside step text stays plain.
    expect(types("<lane>: review and approve;")).not.toContain("keyword:and");
  });
});
