import { describe, it, expect } from "vitest";
import { parseDSL } from "./parser.js";
import { dslVersion } from "./parser-v2.js";

const doc = (body) => `@kai-swimlane 2\n${body}\n@end\n`;

describe("version dispatch", () => {
  it("routes a bare header to the version 1 reader", () => {
    const m = parseDSL("@kai-swimlane\n/title/\nT\n/line/\n[a: x]\n@end\n");
    expect(m.errors).toEqual([]);
    expect(m.title).toBe("T");
  });

  it("reads the version from the header, prefix-matched", () => {
    expect(dslVersion("@kai-swimlane\n")).toBe(1);
    expect(dslVersion("@kai-swimlane 2\n")).toBe(2);
    expect(dslVersion("﻿@kai-swimlane 2 /title/ x;")).toBe(2);
    expect(dslVersion("nothing")).toBe(null);
  });

  it("refuses a version it does not implement instead of falling back", () => {
    const m = parseDSL("@kai-swimlane 3\n@end\n");
    expect(m.errors[0].msg).toMatch(/unsupported version 3/);
    expect(m.rows).toEqual([]);
  });
});

describe("kai-swimlane 2", () => {
  it("parses a step with every suffix in any order", () => {
    const m = parseDSL(doc("/line/\n[sales: 見積作成] <hex> @quote +RQ ~>"));
    expect(m.errors).toEqual([]);
    const step = m.rows[0];
    expect(step).toMatchObject({
      kind: "step",
      role: "sales",
      text: "見積作成",
      blockRef: "hex",
      mergeId: "quote",
      props: ["RQ"],
      arrowLine: "dashed",
    });
  });

  it("is whitespace-insensitive: the squashed form parses identically", () => {
    const expanded = doc("/title/\nT;\n\n/line/\nif (q?)\ncase (a) #green\n  [sales: x]\nend-if");
    const squashed = "@kai-swimlane 2/title/T;/line/if(q?)case(a)#green[sales:x]end-if@end";
    const a = parseDSL(expanded);
    const b = parseDSL(squashed);
    expect(a.errors).toEqual([]);
    expect(b.errors).toEqual([]);
    expect(b.rows.map((r) => r.kind)).toEqual(a.rows.map((r) => r.kind));
    expect(b.title).toBe(a.title);
  });

  it("closes frames by kind and reports a mismatch", () => {
    const m = parseDSL(doc("/line/\nsection (A)\n[a: x]\nend-if"));
    expect(m.errors.map((e) => e.msg)).toContain("end-if closes nothing");
  });

  it("renders one language and falls back when a segment is missing", () => {
    const body = "@lang ja, en;\n\n/title/\n受注 | Order;\n\n/line/\n[sales: 完了]";
    expect(parseDSL(doc(body), { lang: "en" }).title).toBe("Order");
    expect(parseDSL(doc(body), { lang: "ja" }).title).toBe("受注");
    expect(parseDSL(doc(body), { lang: "en" }).rows[0].text).toBe("完了");
  });

  it("keeps an escaped bar as content", () => {
    const m = parseDSL(doc("@lang ja, en;\n\n/line/\n[sales: a \\| b]"));
    expect(m.errors).toEqual([]);
    expect(m.rows[0].text).toBe("a | b");
  });

  it("attaches a property row to the preceding statement", () => {
    const m = parseDSL(doc("/line/\n[sales: x]\n  label: L;\n  skip;"));
    expect(m.errors).toEqual([]);
    expect(m.rows[0]).toMatchObject({ name: "L", skipIndex: true });
  });

  it("merges an import and lets a local key override it", () => {
    const fragment = "/role/\n<sales>\n  label: Sales;\n  icon: #user;\n";
    const m = parseDSL(
      doc(
        "@use templates/role/standard.txt;\n\n/role/\n<sales>\n  unset: icon;\n\n/line/\n[sales: x]",
      ),
      { resolveImport: () => fragment },
    );
    expect(m.errors).toEqual([]);
    expect(m.lanes[0]).toMatchObject({ id: "sales", label: "Sales", icon: null });
  });

  it("reports an unresolved import without failing the parse", () => {
    const m = parseDSL(doc("@use missing.txt;\n\n/line/\n[sales: x]"));
    expect(m.errors).toHaveLength(1);
    expect(m.errors[0].msg).toMatch(/cannot resolve "missing.txt"/);
    expect(m.rows).toHaveLength(1);
  });

  it("draws a lane only when a step references it", () => {
    const fragment = "/role/\n<a>\n  label: A;\n\n<b>\n  label: B;\n";
    const m = parseDSL(doc("@use x.txt;\n\n/line/\n[a: step]"), { resolveImport: () => fragment });
    expect(m.lanes.map((l) => l.id)).toEqual(["a"]);
  });

  it("carries a fenced value with its newlines", () => {
    const m = parseDSL(doc("/line/\n[sales: x]\n  desc: ```\n  one\n  two\n  ```;"));
    expect(m.errors).toEqual([]);
    expect(m.rows[0].description).toBe("one\ntwo");
  });

  it("reports a jump whose target does not exist", () => {
    const m = parseDSL(doc("/line/\nif (q)\ncase (a)\n  goto @nope\nend-if"));
    expect(m.errors.map((e) => e.msg)).toContain('no node with id "nope"');
  });
});
