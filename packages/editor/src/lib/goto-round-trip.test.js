import { describe, expect, it } from "vitest";
import { parseDSL } from "@swimlane-cloud/diagram-converter/parser";
import { migrateLegacyDsl } from "@swimlane-cloud/diagram-converter";
import { formatDsl } from "./format-dsl.js";

/**
 * (Was `merge-marker-round-trip.test.js`.) The landing-marker row kind is
 * gone: a jump is `[goto: id]` and it always names a real step, which names
 * itself with an `id: …;` follow-up line. These are the same two round-trip
 * guarantees the marker tests made, restated for the statements that replaced
 * it — the `id:` line and the jump keep their indentation and their spelling
 * through Format, and an older document still converts into them.
 */

const flowOf = (text) =>
  text
    .split("/line/")[1]
    .split("@end")[0]
    .split("\n")
    .filter((l) => l.trim());

describe("`id:` and `[goto: id]` survive Format", () => {
  it("keeps both jump lines and the `level:` beside them, indented under their step", () => {
    const src = `@kai-swimlane

/role/

<a>
label: A;

/line/

[a: start]
level: 2;
if (x?)
case (yes)
[a: one]
[goto: after]
case ()
[a: two]
[goto: late]
end-if
[a: after]
id: after;
[a: last]
id: late;

@end
`;
    const once = formatDsl(src);
    expect(once.ok, JSON.stringify(once.errors)).toBe(true);
    const flow = flowOf(once.value);
    // A step's follow-up properties all sit one level in from the step, and
    // `id:` is one of them now — same family as `level:`, not a suffix.
    expect(flow).toContain("  level: 2;");
    expect(flow).toContain("  id: after;");
    expect(flow).toContain("  id: late;");
    // A jump sits at the depth of the case body it ends, alongside the steps.
    expect(flow).toContain("  [goto: after]");
    expect(flow).toContain("  [goto: late]");
    expect(formatDsl(once.value).value).toBe(once.value);
    expect(parseDSL(once.value).errors).toEqual([]);
  });

  it("migrates the older `merge: name;` / `[merge: name]` jumps to `[goto: name]`", () => {
    const old = `@kai-swimlane

/role/

<a>
label: A;

/line/

[a: start]
level: 2;
if (x?) is (yes) than
[a: one]
merge: after;
else-if (no) than
[a: two]
merge: late;
end-if
[a: after]
id: after;
[a: last]
id: late;

@end
`;
    const { text: migrated, changed } = migrateLegacyDsl(old);
    expect(changed).toBeGreaterThan(0);
    expect(migrated).toContain("[goto: after]");
    expect(migrated).toContain("[goto: late]");
    const once = formatDsl(migrated);
    expect(once.ok, JSON.stringify(once.errors)).toBe(true);
    expect(parseDSL(once.value).errors).toEqual([]);
    const twice = formatDsl(once.value);
    expect(twice.value).toBe(once.value);
  });

  it("leaves a bare `merge` alone, so the reader points at the line to fix", () => {
    // There is no marker concept left to map a nameless merge onto, so the
    // migration deliberately does not guess — it has to be an error the
    // author sees, not a silent rewrite into something that means something
    // else.
    const old = `@kai-swimlane

/role/

<a>
label: A;

/line/

[a: start]
merge;
[a: after]

@end
`;
    const { text: migrated } = migrateLegacyDsl(old);
    expect(migrated).toContain("merge;");
    expect(formatDsl(migrated).ok).toBe(false);
  });
});
