import { describe, it, expect } from "vitest";
import { parseDSL } from "./parser.js";
import { dslVersion, scanImports, checkImportPath } from "./parser-v2.js";

const doc = (body) => `@kai-swimlane-v2\n${body}\n@end\n`;

describe("version dispatch", () => {
  it("routes a bare header to the version 1 reader", () => {
    const m = parseDSL("@kai-swimlane\n/title/\nT\n/line/\n[a: x]\n@end\n");
    expect(m.errors).toEqual([]);
    expect(m.title).toBe("T");
  });

  it("reads the version from the header, prefix-matched", () => {
    expect(dslVersion("@kai-swimlane\n")).toBe(1);
    expect(dslVersion("@kai-swimlane-v2\n")).toBe(2);
    expect(dslVersion("﻿@kai-swimlane-v2 /title/ x;")).toBe(2);
    expect(dslVersion("nothing")).toBe(null);
  });

  it("refuses a version it does not implement instead of falling back", () => {
    const m = parseDSL("@kai-swimlane-v3\n@end\n");
    expect(m.errors[0].msg).toMatch(/unsupported version 3/);
    expect(m.rows).toEqual([]);
  });
});

describe("kai-swimlane-v2", () => {
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
    const squashed = "@kai-swimlane-v2/title/T;/line/if(q?)case(a)#green[sales:x]end-if@end";
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

describe("case is the only if clause — else was dropped", () => {
  it("rejects else as an unknown statement instead of reading it as a clause", () => {
    const m = parseDSL(doc("/line/\nif (q)\ncase (a)\n  [sales: x]\nelse\n  [sales: y]\nend-if"));
    expect(m.errors.map((e) => e.msg)).toContain('unknown statement "else"');
    // `case (a)` is the if's first case, carried on branchStart (not a row of
    // its own — same as an if's first case has always worked); "else" isn't
    // read as a second case at all, so no branchCase row is produced here.
    const start = m.rows.find((r) => r.kind === "branchStart");
    expect(start.firstCase).toBe("a");
    expect(m.rows.filter((r) => r.kind === "branchCase")).toHaveLength(0);
  });

  it("allows a blank case () as the unlabelled, catch-all clause", () => {
    const m = parseDSL(
      doc("/line/\nif (q)\ncase (a)\n  [sales: x]\ncase ()\n  [sales: y]\nend-if"),
    );
    expect(m.errors).toEqual([]);
    const start = m.rows.find((r) => r.kind === "branchStart");
    expect(start.firstCase).toBe("a");
    const cases = m.rows.filter((r) => r.kind === "branchCase");
    expect(cases.map((c) => c.label)).toEqual([""]);
  });

  it("allows a bare case with no parens at all, same as a labelled one", () => {
    const m = parseDSL(doc("/line/\nif (q)\ncase (a)\n  [sales: x]\ncase\n  [sales: y]\nend-if"));
    expect(m.errors).toEqual([]);
    const start = m.rows.find((r) => r.kind === "branchStart");
    expect(start.firstCase).toBe("a");
    const cases = m.rows.filter((r) => r.kind === "branchCase");
    expect(cases.map((c) => c.label)).toEqual([""]);
  });

  it("allows a blank case in the first-case (branchStart) slot too", () => {
    const m = parseDSL(
      doc("/line/\nif (q)\ncase ()\n  [sales: x]\ncase (b)\n  [sales: y]\nend-if"),
    );
    expect(m.errors).toEqual([]);
    const start = m.rows.find((r) => r.kind === "branchStart");
    expect(start.firstCase).toBe("");
  });
});

describe("multi-language retention ($langs)", () => {
  it("keeps every declared language for inline bar segments (title, condition, case, section)", () => {
    const body = [
      "@lang ja, en;",
      "",
      "/title/",
      "受注 | Order;",
      "",
      "/line/",
      "section (総務 | General) #gray",
      "if (承認する？ | Approve?)",
      "case (はい | Yes)",
      "  [sales: 完了 | Done]",
      "case (いいえ | No)",
      "  [sales: 却下 | Rejected]",
      "end-if",
      "end-section",
    ].join("\n");
    const m = parseDSL(doc(body));
    expect(m.errors).toEqual([]);
    expect(m.title$langs).toEqual(["受注", "Order"]);
    const section = m.rows.find((r) => r.kind === "groupStart");
    expect(section.sectionName$langs).toEqual(["総務", "General"]);
    const start = m.rows.find((r) => r.kind === "branchStart");
    expect(start.cond$langs).toEqual(["承認する？", "Approve?"]);
    expect(start.firstCase$langs).toEqual(["はい", "Yes"]);
    const secondCase = m.rows.find((r) => r.kind === "branchCase");
    expect(secondCase.label$langs).toEqual(["いいえ", "No"]);
    const steps = m.rows.filter((r) => r.kind === "step");
    expect(steps[0].text$langs).toEqual(["完了", "Done"]);
  });

  it("keeps every declared language for fork/and labels", () => {
    const body = [
      "@lang ja, en;",
      "",
      "/line/",
      "fork (出荷 | Shipping)",
      "  [warehouse: 出荷]",
      "and (請求 | Billing)",
      "  [sales: 請求]",
      "end-fork",
    ].join("\n");
    const m = parseDSL(doc(body));
    expect(m.errors).toEqual([]);
    const cases = m.rows.filter((r) => r.kind === "branchCase");
    expect(cases.map((c) => c.label$langs)).toEqual([
      ["出荷", "Shipping"],
      ["請求", "Billing"],
    ]);
  });

  it("keeps every declared language for a field.tag: property, leaving an unset language undefined", () => {
    const m = parseDSL(doc("@lang ja, en;\n\n/line/\n[sales: x]\n  desc.en: English only;"));
    expect(m.errors).toEqual([]);
    expect(m.rows[0].description$langs).toEqual([undefined, "English only"]);
    expect(m.rows[0].description).toBeUndefined();
  });

  it("lets an untagged bare value serve as the shared fallback under a tagged override", () => {
    const m = parseDSL(
      doc("@lang ja, en;\n\n/line/\n[sales: x]\n  desc: 共通;\n  desc.en: Shared override;"),
    );
    expect(m.errors).toEqual([]);
    expect(m.rows[0].description).toBe("共通");
    expect(m.rows[0].description$langs).toEqual([undefined, "Shared override"]);
  });

  it("appends remark-desc per language independently", () => {
    const m = parseDSL(
      doc(
        "@lang ja, en;\n\n/line/\n[sales: x]\n  remark: 一行目;\n  remark-desc: 二行目;\n  remark.en: line one;\n  remark-desc.en: line two;",
      ),
    );
    expect(m.errors).toEqual([]);
    expect(m.rows[0].remark).toBe("一行目\n\n二行目");
    expect(m.rows[0].remark$langs).toEqual([undefined, "line one\n\nline two"]);
  });

  it("keeps no $langs at all for a single-language document", () => {
    const m = parseDSL(doc("/title/\nT;\n\n/line/\n[sales: x]\n  desc: d;"));
    expect(m.errors).toEqual([]);
    expect(m.title$langs).toBeNull();
    expect(m.rows[0].text$langs).toBeNull();
    expect(m.rows[0].description$langs).toBeUndefined();
  });

  it("does not treat an escaped literal bar as a language separator", () => {
    const m = parseDSL(doc("@lang ja, en;\n\n/line/\n[sales: a \\| b]"));
    expect(m.errors).toEqual([]);
    expect(m.rows[0].text).toBe("a | b");
    expect(m.rows[0].text$langs).toBeNull();
  });

  it("keeps an opener's @id so a branch or section it names can round-trip", () => {
    const m = parseDSL(
      doc(
        "/line/\nfork (Shipping) @fulfil\n  [a: x]\nend-fork\n\nsection (Closing) @closing\n  [a: y]\nend-section",
      ),
    );
    expect(m.errors).toEqual([]);
    const fork = m.rows.find((r) => r.kind === "branchStart");
    const section = m.rows.find((r) => r.kind === "groupStart");
    expect(fork.openerId).toBe("fulfil");
    expect(section.openerId).toBe("closing");
  });

  it("leaves openerId null when an opener has no @id", () => {
    const m = parseDSL(doc("/line/\nif (q)\ncase (a)\n  [x: y]\nend-if"));
    expect(m.errors).toEqual([]);
    expect(m.rows.find((r) => r.kind === "branchStart").openerId).toBeNull();
  });

  it("returns @use targets and which role/block/prop ids were declared locally", () => {
    const fragment = "/role/\n<sales>\n  label: Sales;\n\n<ops>\n  label: Ops;\n";
    const m = parseDSL(
      doc(
        "@use templates/role/standard.txt;\n\n/role/\n<sales>\n  icon: #user;\n\n/line/\n[sales: x]\n[ops: y]",
      ),
      { resolveImport: () => fragment },
    );
    expect(m.errors).toEqual([]);
    expect(m.uses).toEqual([{ path: "templates/role/standard.txt", alias: null }]);
    expect(m.localDefIds.role).toEqual(["sales"]);
    expect(m.roles.ops).toMatchObject({ label: "Ops" });
  });

  it("returns /i18n/ entries as a raw passthrough catalog", () => {
    const m = parseDSL(
      doc("@lang ja, en;\n\n/i18n/\nquote.remark.en: Store audit log;\n\n/line/\n[sales: x]"),
    );
    expect(m.errors).toEqual([]);
    expect(m.catalog).toEqual({ "quote.remark.en": "Store audit log" });
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
    expect(scanImports("@kai-swimlane-v2@use a/b.svg;/line/[a:x]@end")).toHaveLength(1);
  });
});
