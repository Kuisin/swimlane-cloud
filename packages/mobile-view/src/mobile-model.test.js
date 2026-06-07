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

const MERGE_DSL = `@kai-swimlane
/title/
M
/role/
<a: Alice> #blue
/line/
[a: Start]
if (cancel?) is (yes) than
[a: Stop]
merge: fin;
else
[a: Continue]
endif
[a: Finish]
id: fin;
@end
`;

describe("mid-flow merge", () => {
  const { tree } = dslToMobile(MERGE_DSL);

  it("renders a merge node pointing at the target id", () => {
    const branch = tree.nodes.find((n) => n.type === "branch");
    const merge = branch.cases[0].children.find((n) => n.type === "merge");
    expect(merge).toBeTruthy();
    expect(merge.target).toBe("fin");
  });

  it("maps the merge target id to the destination step's label", () => {
    expect(tree.mergeTargets.fin).toBe("Finish");
  });

  it("marks the destination step with its mergeId", () => {
    const finish = tree.nodes.find((n) => n.type === "step" && n.text === "Finish");
    expect(finish.mergeId).toBe("fin");
  });
});

const GROUP_DSL = `@kai-swimlane
/title/
G
/role/
<a: Alice> #blue
/line/
[a: Start]
section (枠グループ)
[a: Inside]
end-section
branch (支線グループ)
[a: Side]
end-branch
[a: Done]
@end
`;

describe("section vs sub-branch groups", () => {
  const { tree } = dslToMobile(GROUP_DSL);
  const groups = tree.nodes.filter((n) => n.type === "group");

  it("distinguishes section and branch groups by mode", () => {
    const section = groups.find((g) => g.name === "枠グループ");
    const branch = groups.find((g) => g.name === "支線グループ");
    expect(section?.mode).toBe("section");
    expect(branch?.mode).toBe("branch");
  });
});

describe("row-index annotations (drag drop targets)", () => {
  // rows: 0 step S1, 1 step S2, 2 groupStart, 3 step G1, 4 groupEnd, 5 step S3
  const DSL2 = `@kai-swimlane
/role/
<a: Alice>
/line/
[a: S1]
[a: S2]
section (Box)
[a: G1]
end-section
[a: S3]
@end
`;
  const { tree } = dslToMobile(DSL2);

  it("annotates step rowIndex and group start/end rows", () => {
    const [s1, s2, group, s3] = tree.nodes;
    expect(s1).toMatchObject({ type: "step", text: "S1", rowIndex: 0 });
    expect(s2).toMatchObject({ type: "step", text: "S2", rowIndex: 1 });
    expect(group).toMatchObject({ type: "group", startRow: 2, endRow: 4 });
    expect(group.children[0]).toMatchObject({ type: "step", text: "G1", rowIndex: 3 });
    expect(s3).toMatchObject({ type: "step", text: "S3", rowIndex: 5 });
  });

  it("exposes container end rows for the trailing drop gap", () => {
    expect(tree.rootEndRow).toBe(6); // past the last flow row
    expect(tree.nodes[2].endRow).toBe(4); // before the group's end marker
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
