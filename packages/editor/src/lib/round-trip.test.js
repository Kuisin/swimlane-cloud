import { describe, expect, it } from "vitest";
import { parseDSL } from "@swimlane-cloud/diagram-converter/parser";
import { textToSvg } from "@swimlane-cloud/diagram-converter";
import { serializeDSL } from "./serialize-dsl.js";
import { formatDsl } from "./format-dsl.js";
import { isDocumentDirty, createDocument } from "./dsl-document.js";
import { buildFolderTree } from "./folder-tree.js";
import { mergeSectionTemplate } from "./template-merge.js";
import { applyModelEdit } from "./gui-model.js";

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

describe("keys this build has no meaning for", () => {
  // dsl-rule.md:889 requires an unknown key be kept and re-emitted. Before this
  // was implemented the parser reported it as an error and dropped it, so the
  // first GUI save silently deleted the line.
  const SRC = `@kai-swimlane

/title/
T

/role/
<a>
label: A;
x-figma-node: 12:345;

/block/
<b1>
shape: rect;
colour: red;

/prop/
<p1>
label: P;
icon: #monitor;

/line/
[a: x] <b1>
props: p1;
@end
`;

  it("survives a serialize/parse round-trip instead of being deleted", () => {
    const model = parseDSL(SRC);
    expect(model.errors).toEqual([]);
    expect(model.warnings).toHaveLength(3);

    const out = serializeDSL(model);
    expect(out).toContain("x-figma-node: 12:345;");
    expect(out).toContain("colour: red;");
    expect(out).toContain("icon: #monitor;");

    // and a second pass is stable, so the keys do not drift or accumulate
    expect(serializeDSL(parseDSL(out))).toBe(out);
  });

  it("does not block formatting or count as a broken document", () => {
    expect(parseDSL(SRC).errors).toHaveLength(0);
    expect(formatDsl(SRC).ok).toBe(true);
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

const V2_MULTILANG_SAMPLE = `@kai-swimlane-v2
@lang ja, en;

/title/
受注 | Order;

/role/
<sales>
  label: 営業;
  label.en: Sales;

/line/
if (承認する？ | Approve?)
case (はい | Yes)
  [sales: 完了 | Done] @done
    desc: 詳細;
    desc.en: Detail;
case (いいえ | No)
  [sales: 却下 | Rejected]
end-if
@end
`;

function allLangs(obj, field, n) {
  const arr = obj[`${field}$langs`];
  return Array.from({ length: n }, (_, i) => (arr && arr[i] != null ? arr[i] : obj[field]));
}

describe("GUI-mode edit path preserves every language it doesn't touch", () => {
  it("patching one step's text through applyModelEdit leaves every other field/language intact", () => {
    const before = parseDSL(V2_MULTILANG_SAMPLE);
    expect(before.errors).toEqual([]);

    // `applyModelEdit` runs `editFn` on a *normalized* draft (branchStart's
    // firstCase becomes its own row) — find the row inside the edit itself
    // rather than assuming its index matches a plain, unnormalized parse.
    // This also matches today's real GUI mode: it only ever sets the
    // flattened field, with no idea `$langs` exists yet (that's Phase D).
    const next = applyModelEdit(V2_MULTILANG_SAMPLE, (draft) => {
      const i = draft.rows.findIndex((r) => r.kind === "step" && r.stepId === "done");
      draft.rows[i] = { ...draft.rows[i], text: "完了しました" };
    });

    const after = parseDSL(next);
    expect(after.errors).toEqual([]);
    const n = 2;
    const afterDone = after.rows.find((r) => r.kind === "step" && r.stepId === "done");
    const beforeDone = before.rows.find((r) => r.kind === "step" && r.stepId === "done");

    // the touched field changed, in the language it was edited in...
    expect(afterDone.text).toBe("完了しました");
    // ...and the untouched language for that same field survived (this is
    // exactly what "GUI mode edits one language without losing the others"
    // needs: touching a row's flattened field must not wipe out a sibling
    // language even though this edit only supplied the active one, and must
    // not let a now-stale `$langs[0]` silently undo the edit either).
    expect(allLangs(afterDone, "text", n)).toEqual(["完了しました", "Done"]);

    // every other row, and every other field on the touched row, survives
    // in every language, unchanged.
    expect(allLangs(after, "title", n)).toEqual(allLangs(before, "title", n));
    expect(allLangs(after.roles.sales, "label", n)).toEqual(
      allLangs(before.roles.sales, "label", n),
    );
    const beforeStart = before.rows.find((r) => r.kind === "branchStart");
    const afterStart = after.rows.find((r) => r.kind === "branchStart");
    expect(allLangs(afterStart, "cond", n)).toEqual(allLangs(beforeStart, "cond", n));
    expect(allLangs(afterStart, "firstCase", n)).toEqual(allLangs(beforeStart, "firstCase", n));
    expect(allLangs(afterDone, "description", n)).toEqual(allLangs(beforeDone, "description", n));
    const beforeRejected = before.rows.find((r) => r.kind === "step" && r.text === "却下");
    const afterRejected = after.rows.find((r) => r.kind === "step" && r.text === "却下");
    expect(allLangs(afterRejected, "text", n)).toEqual(allLangs(beforeRejected, "text", n));
  });
});
