import { describe, it, expect } from "vitest";
import { parseDSL } from "./parser.js";

// dsl-rule.md:1009 makes an unknown icon `unknownColor`: a warning with
// `impact: none`. It is reported, the icon is omitted, and nothing is blocked.
const iconWarnings = (src) => parseDSL(src).warnings.filter((e) => /unknown icon/.test(e.msg));

const doc = (blockIcon, roleIcon = "#database") => `@kai-swimlane
/title/
T
/role/
<u>
label: User;
icon: ${roleIcon};
/block/
<b1>
shape: rect;
icon: ${blockIcon};
/line/
[u: step] <b1>
@end`;

describe("icon validation", () => {
  it("accepts a known Lucide icon", () => {
    expect(iconWarnings(doc("#check"))).toHaveLength(0);
  });

  it("accepts the icons that complete a family the set already carries", () => {
    for (const name of ["file-plus", "user-plus", "folder-plus", "circle-plus", "circle-help"]) {
      expect(iconWarnings(doc(`#${name}`))).toHaveLength(0);
    }
  });

  it("warns about an unknown block icon without making the file an error", () => {
    const model = parseDSL(doc("#definitely-not-an-icon"));
    expect(model.errors).toHaveLength(0);
    expect(model.warnings).toHaveLength(1);
    expect(model.warnings[0].msg).toContain("definitely-not-an-icon");
  });

  it("warns about an unknown role icon", () => {
    expect(iconWarnings(doc("#check", "#nope"))).toHaveLength(1);
    expect(parseDSL(doc("#check", "#nope")).errors).toHaveLength(0);
  });

  it("leaves literal / emoji icons alone (no `#` prefix)", () => {
    expect(iconWarnings(doc("📦"))).toHaveLength(0);
  });
});
