import { describe, expect, it } from "vitest";
import { dslToMobile, toColor } from "./mobile-model.js";

const DSL = `@kai-swimlane
/title/
Demo
/role/
<a: Alice> #blue
<b: Bob> #green
/line/
[a: Start]
if (ok?) is (yes) than
[b: Approve]
else
[a: Reject]
endif
[a: Done]
@end
`;

describe("buildMobileTree", () => {
  const { tree } = dslToMobile(DSL);

  it("keeps the title and lanes", () => {
    expect(tree.title).toBe("Demo");
    expect(tree.lanes.map((l) => l.id)).toEqual(["a", "b"]);
  });

  it("nests branch cases with their steps", () => {
    const branch = tree.nodes.find((n) => n.type === "branch");
    expect(branch).toBeTruthy();
    expect(branch.cases.length).toBe(2);
    // first case = "yes" with Bob's Approve step
    expect(branch.cases[0].label).toBe("yes");
    expect(branch.cases[0].children[0]).toMatchObject({ type: "step", role: "b", text: "Approve" });
    // else case
    expect(branch.cases[1].label).toBe("else");
    expect(branch.cases[1].children[0]).toMatchObject({ role: "a", text: "Reject" });
  });

  it("places top-level steps before and after the branch", () => {
    const steps = tree.nodes.filter((n) => n.type === "step");
    expect(steps[0].text).toBe("Start");
    expect(steps.at(-1).text).toBe("Done");
  });
});

describe("toColor", () => {
  it("maps names and hex, rejects junk", () => {
    expect(toColor("blue")).toBe("#2563eb");
    expect(toColor("#abc")).toBe("#abc");
    expect(toColor("123456")).toBe("#123456");
    expect(toColor("notacolor")).toBeNull();
  });
});
