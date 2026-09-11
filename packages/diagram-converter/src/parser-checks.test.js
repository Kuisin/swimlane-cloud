import { describe, expect, it } from "vitest";
import { parseDSL } from "./parser.js";

const msgs = (src) => parseDSL(src).errors.map((e) => e.msg);
const warns = (src) => parseDSL(src).warnings.map((e) => e.msg);

const DOC = (body) => `@kai-swimlane
/role/
<a>
label: A;
/line/
${body}
@end`;

describe("parser validation — document structure", () => {
  it("errors when @end is missing", () => {
    const src = `@kai-swimlane\n/role/\n<a>\nlabel: A;\n/line/\n[a: x]`;
    expect(msgs(src)).toContain("missing @end marker");
  });

  it("errors on unclosed if (missing end-if)", () => {
    const errors = parseDSL(DOC(`if (確認) is (OK) than\n  [a: 手順]`)).errors;
    expect(errors.map((e) => e.msg)).toContain("unclosed if (missing end-if)");
    // The error points at the opening line, like the unclosed-section check.
    const err = errors.find((e) => e.msg.startsWith("unclosed if"));
    expect(err.text).toContain("if (確認)");
  });

  it("errors on unclosed fork (missing end-fork)", () => {
    expect(msgs(DOC(`fork\n  [a: 並行1]\nand\n  [a: 並行2]`))).toContain(
      "unclosed fork (missing end-fork)",
    );
  });

  it("reports every unclosed nested frame", () => {
    const m = msgs(DOC(`if (外) is (yes) than\n  fork\n    [a: x]`));
    expect(m).toContain("unclosed if (missing end-if)");
    expect(m).toContain("unclosed fork (missing end-fork)");
  });

  it("accepts a well-formed document with no errors", () => {
    const src = `@kai-swimlane
/role/
<a>
label: 申請者;
icon: #user;
/block/
<b1>
shape: hex;
background-color: #fff7ed;
/prop/
<p1>
label: 帳票;
side: left;
max-chars: 12;
/line/
[a: 提出] <b1>
props: p1;
if (承認) is (yes) than #green
  [a: 登録]
end-if
@end`;
    expect(parseDSL(src).errors).toEqual([]);
  });
});

describe("parser — the older closer spellings are refused by name", () => {
  const doc = (body) => `@kai-swimlane
/role/
<a>
label: A;
/line/
${body}
@end`;

  it("names the spelling to use for each old one", () => {
    const cases = [
      [`if (x) is (y) than\n[a: 1]\nendif`, '"endif" is no longer read; write end-if'],
      [`fork\n[a: 1]\nendfork`, '"endfork" is no longer read; write end-fork'],
      [
        `if (x) is (y) than\n[a: 1]\nelseif (z) than\n[a: 2]\nend-if`,
        '"elseif" is no longer read; write else-if (…) than',
      ],
      [`start-point\n[a: 1]\nend-point`, '"start-point" is no longer read; write section'],
      [
        `section-start (S)\n[a: 1]\nend-section`,
        '"section-start" is no longer read; write section (…)',
      ],
    ];
    for (const [body, msg] of cases) {
      expect(
        parseDSL(doc(body)).errors.map((e) => e.msg),
        body,
      ).toContain(msg);
    }
  });

  it("errors on end-if without an open if, mentioning end-if", () => {
    expect(parseDSL(doc(`[a: 1]\nend-if`)).errors.map((e) => e.msg)).toContain("end-if without if");
  });

  it("errors on end-fork without an open fork, mentioning end-fork", () => {
    expect(parseDSL(doc(`[a: 1]\nend-fork`)).errors.map((e) => e.msg)).toContain(
      "end-fork without fork",
    );
  });

  it("errors on else-if without an open if, mentioning else-if", () => {
    expect(parseDSL(doc(`[a: 1]\nelse-if (z) than`)).errors.map((e) => e.msg)).toContain(
      "else-if without if",
    );
  });
});

describe("parser validation — definition sections", () => {
  it("errors on duplicate role definition", () => {
    const src = `@kai-swimlane\n/role/\n<a>\nlabel: A;\n<a>\nlabel: B;\n/line/\n[a: x]\n@end`;
    expect(msgs(src)).toContain("duplicate role definition <a>");
  });

  it("errors on duplicate block and prop definitions", () => {
    const src = `@kai-swimlane\n/role/\n<a>\n/block/\n<b1>\n<b1>\n/prop/\n<p1>\n<p1>\n/line/\n[a: x]\n@end`;
    const m = msgs(src);
    expect(m).toContain("duplicate block definition <b1>");
    expect(m).toContain("duplicate prop definition <p1>");
  });

  it("errors on an empty definition id", () => {
    const src = `@kai-swimlane\n/role/\n< >\nlabel: A;\n/line/\n[a: x]\n@end`;
    expect(msgs(src)).toContain("definition id must not be empty");
  });

  // dsl-rule.md:1015 makes `unknownKey` a warning with `impact: none`, and :889
  // requires the key be kept and re-emitted rather than dropped.
  it("warns about unknown keys (typos) in /role/, /block/, /prop/ and keeps them", () => {
    const src = `@kai-swimlane\n/role/\n<a>\nlable: A;\n/block/\n<b1>\ncolor: red;\n/prop/\n<p1>\nwidth: 4;\n/line/\n[a: x]\n@end`;
    const model = parseDSL(src);
    expect(model.errors).toEqual([]);
    const w = warns(src);
    expect(w).toContain("unknown /role/ key: lable — kept, not rendered");
    expect(w).toContain("unknown /block/ key: color — kept, not rendered");
    expect(w).toContain("unknown /prop/ key: width — kept, not rendered");

    expect(model.lanes.find((l) => l.id === "a").unknown).toEqual({ lable: "A" });
    expect(model.blocks.b1.unknown).toEqual({ color: "red" });
    expect(model.props.p1.unknown).toEqual({ width: "4" });
  });

  it("errors on a property line before any <id> definition", () => {
    const src = `@kai-swimlane\n/role/\nlabel: A;\n<a>\n/line/\n[a: x]\n@end`;
    expect(msgs(src)).toContain("property line must follow a <id> definition");
  });

  it("errors on unrecognized lines in definition sections", () => {
    const src = `@kai-swimlane\n/role/\n<a>\nstray text\n/line/\n[a: x]\n@end`;
    expect(msgs(src)).toContain("unrecognized /role/ line");
  });

  // dsl-rule.md P11: an unknown shape is `badValue`, a warning that falls back
  // to `rounded` and keeps the written value.
  it("warns about an unknown block shape and keeps the value", () => {
    const src = `@kai-swimlane\n/role/\n<a>\n/block/\n<b1>\nshape: star;\n/line/\n[a: x]\n@end`;
    const model = parseDSL(src);
    expect(model.errors).toEqual([]);
    expect(warns(src).some((m) => m.startsWith('unknown shape "star"'))).toBe(true);
    expect(model.blocks.b1.shape).toBe("star");
  });

  it("errors on invalid prop side and max-chars", () => {
    const src = `@kai-swimlane\n/role/\n<a>\n/prop/\n<p1>\nside: middle;\nmax-chars: lots;\n/line/\n[a: x]\n@end`;
    const m = msgs(src);
    expect(m.some((x) => x.startsWith("side: must be left or right"))).toBe(true);
    expect(m.some((x) => x.startsWith("max-chars: must be a positive integer"))).toBe(true);
  });
});

describe("parser validation — branch colors", () => {
  it("accepts every published palette name", () => {
    for (const ok of [
      "blue",
      "green",
      "red",
      "orange",
      "purple",
      "gray",
      "black",
      "pink",
      "teal",
      "yellow",
    ]) {
      expect(msgs(DOC(`section (S) #${ok}\n  [a: s1]\nend-section`))).toEqual([]);
    }
  });

  it("errors on unknown #color tokens on if/else-if/fork/and/section", () => {
    const m = msgs(
      DOC(
        `if (確認) is (OK) than #salmon\n  [a: 手順]\nelse-if (NG) than #magenta\n  [a: 差戻]\nend-if\nfork #cyan\n  [a: p1]\nand #indigo\n  [a: p2]\nend-fork\nsection (S) #ivory\n  [a: s1]\nend-section`,
      ),
    );
    for (const bad of ["#salmon", "#magenta", "#cyan", "#indigo", "#ivory"]) {
      expect(m.some((x) => x.includes(`unknown color "${bad}"`))).toBe(true);
    }
  });

  it("accepts all palette colors", () => {
    const m = msgs(
      DOC(
        `if (c) is (y) than #blue\n  [a: 1]\nelse-if (n) than #green\n  [a: 2]\nend-if\nfork #purple\n  [a: 3]\nand #gray\n  [a: 4]\nend-fork\nsection (S) #orange\n  [a: 5]\nend-section`,
      ),
    );
    expect(m.filter((x) => x.includes("unknown color"))).toEqual([]);
  });
});
