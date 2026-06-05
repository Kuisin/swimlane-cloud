import { describe, expect, it } from "vitest";
import { parseDSL } from "@swimlane-cloud/diagram-converter/parser";
import { textToSvg } from "@swimlane-cloud/diagram-converter";
import { serializeDSL } from "./serialize-dsl.js";
import { formatDsl } from "./format-dsl.js";
import { isDocumentDirty, createDocument } from "./dsl-document.js";
import { buildFolderTree } from "./folder-tree.js";
import { mergeSectionTemplate } from "./template-merge.js";

const SAMPLE = `@kai-swimlane

/title/
Onboarding

/role/

<user>
label: User;

<system>
label: System;

/line/

[user: Submit request]

if (approved?) is (yes) than
  [system: Provision account]
else
  [system: Send rejection]
endif

[user: Receive result]

@end
`;

describe("serialize/parse round-trip", () => {
  it("re-serializing a parsed model preserves structure (idempotent format)", () => {
    const once = serializeDSL(parseDSL(SAMPLE));
    const twice = serializeDSL(parseDSL(once));
    expect(twice).toBe(once);
  });

  it("formatDsl returns ok for valid DSL and is idempotent", () => {
    const first = formatDsl(SAMPLE);
    expect(first.ok).toBe(true);
    const second = formatDsl(first.value);
    expect(second.ok).toBe(true);
    expect(second.value).toBe(first.value);
  });

  it("formatDsl preserves the flow model (roles + steps survive)", () => {
    const formatted = formatDsl(SAMPLE).value;
    const a = parseDSL(SAMPLE);
    const b = parseDSL(formatted);
    expect(b.errors).toHaveLength(0);
    expect(b.lanes.map((l) => l.id)).toEqual(a.lanes.map((l) => l.id));
    const steps = (m) => m.rows.filter((r) => r.kind === "step" && !r.empty).length;
    expect(steps(b)).toBe(steps(a));
  });

  it("formatDsl rejects unparseable input", () => {
    const res = formatDsl("not a diagram");
    expect(res.ok).toBe(false);
    expect(res.errors.length).toBeGreaterThan(0);
  });
});

describe("textToSvg engine integration", () => {
  it("renders an SVG string for valid DSL", () => {
    const { svg, errors } = textToSvg(SAMPLE, { themeKey: "basic" });
    expect(errors).toHaveLength(0);
    expect(typeof svg).toBe("string");
    expect(svg).toContain("<svg");
  });
});

describe("document model", () => {
  it("isDocumentDirty tracks src vs savedSrc", () => {
    const doc = createDocument("a.txt", SAMPLE);
    expect(isDocumentDirty(doc)).toBe(false);
    expect(isDocumentDirty({ ...doc, src: doc.src + "\n" })).toBe(true);
  });
});

describe("folder tree", () => {
  it("nests ids split on /", () => {
    const tree = buildFolderTree([
      { id: "ops/onboarding/flow.txt", name: "flow.txt" },
      { id: "ops/offboarding.txt", name: "offboarding.txt" },
      { id: "root.txt", name: "root.txt" },
    ]);
    expect(tree.files.map((f) => f.name)).toEqual(["root.txt"]);
    const ops = tree.folders.find((f) => f.name === "ops");
    expect(ops).toBeTruthy();
    expect(ops.files.map((f) => f.name)).toEqual(["offboarding.txt"]);
    expect(ops.folders[0].name).toBe("onboarding");
  });
});

describe("template merge", () => {
  it("merges a role template into the model", () => {
    const body = "<auditor>\nlabel: Auditor;";
    const merged = mergeSectionTemplate(SAMPLE, "role", body);
    const model = parseDSL(merged);
    expect(model.lanes.map((l) => l.id)).toContain("auditor");
    expect(model.errors).toHaveLength(0);
  });
});
