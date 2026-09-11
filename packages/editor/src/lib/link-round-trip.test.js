import { describe, expect, it } from "vitest";
import { parseDSL } from "@swimlane-cloud/diagram-converter/parser";
import { formatDsl } from "./format-dsl.js";

describe("a step's link to another flow survives Format", () => {
  it("v1 `link:` is written back after the step", () => {
    const src = `@kai-swimlane

/role/

<a>
label: A;

/line/

[a: pick and pack]
link: ../ops/pick.md;

@end
`;
    const once = formatDsl(src);
    expect(once.ok, JSON.stringify(once.errors)).toBe(true);
    expect(once.value).toContain("[a: pick and pack]\nlink: ../ops/pick.md;");
    expect(formatDsl(once.value).value).toBe(once.value);
    expect(parseDSL(once.value).rows[0].link).toBe("../ops/pick.md");
  });

  it("v2 `=> path` is written back as a suffix", () => {
    const src = `@kai-swimlane-v2

/role/

<a>
label: A;

/line/

[a: pick and pack] => ../ops/pick.md

@end
`;
    const once = formatDsl(src);
    expect(once.ok, JSON.stringify(once.errors)).toBe(true);
    expect(once.value).toContain("[a: pick and pack] => ../ops/pick.md");
    expect(parseDSL(once.value).rows[0].link).toBe("../ops/pick.md");
  });
});
