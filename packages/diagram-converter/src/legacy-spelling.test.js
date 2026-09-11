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

  it("leaves a current document untouched", () => {
    const now = `@kai-swimlane\n/line/\n[a: one]\nif (x) is (y) than\n[a: two]\nend-if\n@end\n`;
    expect(migrateLegacySpellings(now)).toEqual({ text: now, changed: 0 });
  });
});
