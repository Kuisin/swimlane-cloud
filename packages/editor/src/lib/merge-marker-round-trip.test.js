import { describe, expect, it } from "vitest";
import { parseDSL } from "@swimlane-cloud/diagram-converter/parser";
import { migrateLegacyDsl } from "@swimlane-cloud/diagram-converter";
import { formatDsl } from "./format-dsl.js";

const flowOf = (text) =>
  text
    .split("/line/")[1]
    .split("@end")[0]
    .split("\n")
    .filter((l) => l.trim());

describe("landing markers and levels survive Format", () => {
  it("merge, merge @name, goto, goto @name and level:", () => {
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
goto
case ()
[a: two]
goto @late
end-if
merge
[a: after]
merge @late
[a: last]

@end
`;
    const once = formatDsl(src);
    expect(once.ok, JSON.stringify(once.errors)).toBe(true);
    const flow = flowOf(once.value);
    expect(flow).toContain("  level: 2;");
    expect(flow).toContain("  goto");
    expect(flow).toContain("  goto @late");
    expect(flow).toContain("merge");
    expect(flow).toContain("merge @late");
    expect(formatDsl(once.value).value).toBe(once.value);
    expect(parseDSL(once.value).errors).toEqual([]);
  });

  it("migrates the older [merge], [merge: name], merge;/else-if landing markers", () => {
    const old = `@kai-swimlane

/role/

<a>
label: A;

/line/

[a: start]
level: 2;
if (x?) is (yes) than
[a: one]
merge;
else-if (no) than
[a: two]
merge: late;
end-if
[merge]
[a: after]
[merge: late]
[a: last]

@end
`;
    const { text: migrated, changed } = migrateLegacyDsl(old);
    expect(changed).toBeGreaterThan(0);
    const once = formatDsl(migrated);
    expect(once.ok, JSON.stringify(once.errors)).toBe(true);
    expect(parseDSL(once.value).errors).toEqual([]);
    const twice = formatDsl(once.value);
    expect(twice.value).toBe(once.value);
  });
});
