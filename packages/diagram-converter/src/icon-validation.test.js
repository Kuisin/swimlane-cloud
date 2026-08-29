import { describe, it, expect } from "vitest";
import { parseDSL } from "./parser.js";

const iconErrors = (src) => parseDSL(src).errors.filter((e) => /unknown icon/.test(e.msg));

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
    expect(iconErrors(doc("#check"))).toHaveLength(0);
  });

  it("flags an unknown block icon", () => {
    const errs = iconErrors(doc("#definitely-not-an-icon"));
    expect(errs).toHaveLength(1);
    expect(errs[0].msg).toContain("definitely-not-an-icon");
  });

  it("flags an unknown role icon", () => {
    expect(iconErrors(doc("#check", "#nope"))).toHaveLength(1);
  });

  it("leaves literal / emoji icons alone (no `#` prefix)", () => {
    expect(iconErrors(doc("📦"))).toHaveLength(0);
  });
});
