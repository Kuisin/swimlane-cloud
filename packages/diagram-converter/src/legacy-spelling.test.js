import { describe, expect, it } from "vitest";
import { migrateLegacySpellings } from "./legacy-spelling.js";
import { parseDSL } from "./parser.js";

describe("migrateLegacySpellings", () => {
  it("rewrites every refused spelling and nothing else", () => {
    const old = `@kai-swimlane
/role/
<a>
label: A;
/line/
start-point
  [a: one]
  desc: \`\`\`
  endif inside a fence stays
  \`\`\`
  if (x?) is (yes) than
    [a: two]
  elseif (no) than #red
    [a: three]
  endif
  fork
    [a: p]
  and
    [a: q]
  endfork
end-point
section-start (S)
  branch (B)
    [a: b]
  end-point
end-point
@end
`;
    const { text, changed } = migrateLegacySpellings(old);
    expect(changed).toBe(8);
    expect(text).toContain("  else-if (no) than #red");
    expect(text).toContain("  end-if\n");
    expect(text).toContain("  end-fork\n");
    expect(text).toContain("section-start (S)".replace("section-start (S)", "section (S)"));
    expect(text).toContain("  endif inside a fence stays");
    // `end-point` becomes the closer of whatever was open.
    expect(text.split("\n").filter((l) => l.trim() === "end-branch")).toHaveLength(1);
    expect(text.split("\n").filter((l) => l.trim() === "end-section")).toHaveLength(2);
    expect(parseDSL(text).errors).toEqual([]);
  });

  it("renames the pre-rename version 2 header", () => {
    const old = `@kai-swimlane 2\n@lang ja, en;\n\n/role/\n<a>\nlabel: A;\n\n/line/\n[a: x]\n@end\n`;
    const { text, changed } = migrateLegacySpellings(old);
    expect(changed).toBe(1);
    expect(text.startsWith("@kai-swimlane-v2\n@lang ja, en;")).toBe(true);
    expect(parseDSL(text).errors).toEqual([]);
    // Leading comment lines do not hide the header from the rewrite.
    expect(migrateLegacySpellings(`***\n@kai-swimlane 2\n@end`).changed).toBe(0);
  });

  it("turns a version 2 file's leftover `else` into the blank case, and only there", () => {
    const v2 = `@kai-swimlane-v2\n/role/\n<a>\nlabel: A;\n/line/\nif (x?)\ncase (yes)\n[a: one]\nelse #gray\n[a: two]\nend-if\n@end\n`;
    const { text, changed } = migrateLegacySpellings(v2);
    expect(changed).toBe(1);
    expect(text).toContain("\ncase () #gray\n");
    expect(parseDSL(text).errors).toEqual([]);
    const v1 = `@kai-swimlane\n/line/\nif (x) is (y) than\n[a: 1]\nelse\n[a: 2]\nend-if\n@end\n`;
    expect(migrateLegacySpellings(v1).changed).toBe(0);
  });

  it("leaves a current document untouched", () => {
    const now = `@kai-swimlane\n/line/\n[a: one]\nif (x) is (y) than\n[a: two]\nend-if\n@end\n`;
    expect(migrateLegacySpellings(now)).toEqual({ text: now, changed: 0 });
  });
});
