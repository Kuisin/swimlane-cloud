import { describe, it, expect } from "vitest";
import { parseDSL } from "./parser.js";
import { dslVersion, scanImports, checkImportPath } from "./parser-v2.js";

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

describe("imported images", () => {
  const PNG =
    "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
  const SVG = "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciLz4=";
  const withAsset = (body, resolveAsset = () => PNG, extra = {}) =>
    parseDSL(doc(body), { resolveAsset, ...extra });

  it("binds an image to the file's stem and resolves an icon reference", () => {
    const m = withAsset(
      "@use assets/company-logo.png;\n\n/role/\n<a>\n  icon: @company-logo;\n\n/line/\n[a: x]",
    );
    expect(m.errors).toEqual([]);
    expect(m.assets["company-logo"]).toMatchObject({
      path: "assets/company-logo.png",
      mime: "image/png",
    });
    expect(m.lanes[0].icon).toBe("@company-logo");
    expect(m.lanes[0].iconAsset.dataUri).toBe(PNG);
  });

  it("takes vector and raster alike", () => {
    const m = withAsset("@use a/mark.svg;\n@use a/photo.jpg;\n\n/line/\n[a: x]", (p) =>
      p.endsWith(".svg") ? SVG : PNG,
    );
    expect(m.errors).toEqual([]);
    expect(m.assets.mark.mime).toBe("image/svg+xml");
    expect(m.assets.photo.mime).toBe("image/jpeg");
  });

  it("names an import with `as`, which is how two stems stop colliding", () => {
    const m = withAsset("@use a/logo.svg as brand;\n@use b/logo.png as mark;\n\n/line/\n[a: x]");
    expect(m.errors).toEqual([]);
    expect(Object.keys(m.assets).sort()).toEqual(["brand", "mark"]);
  });

  it("reports a collision rather than letting one image win silently", () => {
    const m = withAsset("@use a/logo.svg;\n@use b/logo.png;\n\n/line/\n[a: x]");
    expect(m.errors.map((e) => e.msg)).toContain(
      'duplicate asset id "logo" — name one of them with "as"',
    );
  });

  it("keeps the reference in `icon` so a save writes `@id`, not the image", () => {
    const m = withAsset("@use a/logo.png;\n\n/block/\n<b>\n  icon: @logo;\n\n/line/\n[a: x] <b>");
    expect(m.blocks.b.icon).toBe("@logo");
    expect(m.blocks.b.iconAsset.dataUri).toBe(PNG);
  });

  it("warns and omits the image when the import does not resolve", () => {
    const m = withAsset(
      "@use a/logo.png;\n\n/role/\n<a>\n  icon: @logo;\n\n/line/\n[a: x]",
      () => null,
    );
    expect(m.errors.map((e) => e.msg)).toEqual([
      'cannot resolve "a/logo.png" — the image is omitted',
    ]);
    expect(m.lanes[0].iconAsset).toBeNull();
  });

  it("warns on a reference to an image nothing imported", () => {
    const m = withAsset("/role/\n<a>\n  icon: @nope;\n\n/line/\n[a: x]");
    expect(m.errors.map((e) => e.msg)).toEqual(['no imported image named "nope"']);
  });

  it("refuses anything that is not a base64 image data URI", () => {
    const m = withAsset("@use a/logo.png;\n\n/line/\n[a: x]", () => "https://example.com/logo.png");
    expect(m.errors[0].msg).toMatch(/did not resolve to a base64 image data URI/);
  });

  it("refuses an image past the size limit", () => {
    const big = "data:image/png;base64," + "A".repeat(3 * 1024 * 1024);
    const m = withAsset("@use a/logo.png;\n\n/line/\n[a: x]", () => big);
    expect(m.errors[0].msg).toMatch(/larger than the 2 MiB limit/);
  });

  it("checks the path before any read, and resolves `../` against the file", () => {
    expect(checkImportPath("../../assets/a.svg", "diagrams/brand")).toBeNull();
    expect(checkImportPath("../../etc/passwd.png", "")).toMatch(/outside the repository/);
    expect(checkImportPath("https://example.com/a.png", "")).toMatch(/must not contain ":"/);
    expect(checkImportPath(".github/x.png", "")).toMatch(/is not importable/);
    expect(checkImportPath("assets/logo", "")).toMatch(/must include a file extension/);
  });

  it("never reads a path that failed a check", () => {
    const reads = [];
    withAsset("@use ../../etc/passwd.png;\n\n/line/\n[a: x]", (p) => {
      reads.push(p);
      return PNG;
    });
    expect(reads).toEqual([]);
  });

  it("lists every import for a host to prefetch, in both layouts", () => {
    expect(scanImports("@use assets/a.svg;\n@use t/b.txt;\n@use c/d.png as pic;")).toEqual([
      { path: "assets/a.svg", alias: null, kind: "asset" },
      { path: "t/b.txt", alias: null, kind: "fragment" },
      { path: "c/d.png", alias: "pic", kind: "asset" },
    ]);
    expect(scanImports("@kai-swimlane 2@use a/b.svg;/line/[a:x]@end")).toHaveLength(1);
  });
});
