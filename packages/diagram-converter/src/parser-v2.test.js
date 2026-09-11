import { describe, it, expect } from "vitest";
import { parseDSL } from "./parser.js";
import { dslVersion, scanImports, checkImportPath } from "./parser-v2.js";
import { renderDiagramSvg } from "./render-pure/index.js";
import { THEMES } from "./themes.js";

const doc = (body) => `@kai-swimlane\n${body}\n@end\n`;

/**
 * dsl-rule.md's translatable set is closed and `/meta/` is outside it, `tags`
 * included — so the tokenizer's language-separator marker (a NUL byte) must
 * never be inserted in a `/meta/` value. It used to be, and since `/meta/`
 * stores `prop.value` raw rather than running it through `seg()`, the NUL ended
 * up in `model.meta` and from there in whatever the app wrote next.
 */
describe("/meta/ is not a translatable position", () => {
  const NUL = String.fromCharCode(0);
  const meta = (value) => parseDSL(doc(`/meta/\ntags: ${value};\n\n/line/\n[a: x]`)).meta.tags;

  it("reads a bar as ordinary content", () => {
    expect(meta("a | b")).toBe("a | b");
    expect(meta("a ｜ b")).toBe("a ｜ b");
    expect(meta("|")).toBe("|");
  });

  it("still honours an escape, unnecessary though it is there", () => {
    expect(meta("a \\| b")).toBe("a | b");
    expect(meta("\\|")).toBe("|");
  });

  it("never puts the segment marker in the model", () => {
    for (const value of ["a | b", "a ｜ b", "|", "a \\| b", "a, b"]) {
      expect(meta(value), value).not.toContain(NUL);
    }
  });

  it("leaves a genuinely translatable position splitting as before", () => {
    const m = parseDSL(doc("@lang ja, en;\n\n/title/\n受注 | Order;\n\n/line/\n[a: x]"), {
      lang: "en",
    });
    expect(m.errors).toEqual([]);
    expect(m.title).toBe("Order");
  });
});

describe("version dispatch", () => {
  it("routes a bare header to the one reader", () => {
    const m = parseDSL("@kai-swimlane\n/title/\nT;\n/line/\n[a: x]\n@end\n");
    expect(m.errors).toEqual([]);
    expect(m.title).toBe("T");
  });

  it("reports 2 for the header, and null for anything else", () => {
    expect(dslVersion("@kai-swimlane\n")).toBe(2);
    expect(dslVersion("nothing")).toBe(null);
    // A versioned spelling isn't a header this returns a version for any
    // more — `parseDSL` refuses it outright (see below) rather than reading
    // it as some other version.
    expect(dslVersion("@kai-swimlane-v2\n")).toBe(null);
  });

  it("refuses a versioned header, pointing at the migration, instead of falling back", () => {
    const m = parseDSL("@kai-swimlane-v3\n@end\n");
    expect(m.errors[0].msg).toBe(
      "the header is @kai-swimlane — there are no versions any more; run Update DSL",
    );
    expect(m.rows).toEqual([]);
  });
});

describe("kai-swimlane", () => {
  it("parses a step with every suffix in any order, and its id: line", () => {
    const m = parseDSL(doc("/line/\n[sales: 見積作成] <hex> +RQ ~>\n  id: quote;"));
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
    const expanded = doc("/title/\nT;\n\n/line/\nif (q?) is (a) than #green\n  [sales: x]\nend-if");
    const squashed = "@kai-swimlane/title/T;/line/if(q?)is(a)than#green[sales:x]end-if@end";
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
    // Both roles are known (the GUI offers them); only the used one is drawn.
    expect(m.lanes.map((l) => l.id)).toEqual(["a", "b"]);
    expect(m.lanes.filter((l) => l.used).map((l) => l.id)).toEqual(["a"]);
    const svg = renderDiagramSvg({ model: m, theme: THEMES.basic });
    expect(svg).toContain(">A<");
    expect(svg).not.toContain(">B<");
  });

  it("carries a fenced value with its newlines", () => {
    const m = parseDSL(doc("/line/\n[sales: x]\n  desc: ```\n  one\n  two\n  ```;"));
    expect(m.errors).toEqual([]);
    expect(m.rows[0].description).toBe("one\ntwo");
  });

  it("keeps a loop's own target so it can round-trip", () => {
    const m = parseDSL(
      doc("/line/\nif (q) is (a) than\n  [x: y]\n    id: start;\n  loop @start\nend-if"),
    );
    expect(m.errors).toEqual([]);
    expect(m.rows.find((r) => r.kind === "branchLoop")).toMatchObject({ loopTarget: "start" });
  });

  it("leaves loopTarget null for a bare loop with no target", () => {
    const m = parseDSL(doc("/line/\nif (q) is (a) than\n  [x: y]\n  loop\nend-if"));
    expect(m.errors).toEqual([]);
    expect(m.rows.find((r) => r.kind === "branchLoop")).toMatchObject({ loopTarget: null });
  });

  it("reports a jump whose target does not exist", () => {
    const m = parseDSL(doc("/line/\nif (q)\ncase (a)\n  [goto: nope]\nend-if"));
    expect(m.errors.map((e) => e.msg)).toContain('no node with id "nope"');
  });
});

describe("else-if is the only later clause — bare else was dropped", () => {
  it("rejects a bare else as an unknown statement instead of reading it as a clause", () => {
    const m = parseDSL(doc("/line/\nif (q) is (a) than\n  [sales: x]\nelse\n  [sales: y]\nend-if"));
    expect(m.errors.map((e) => e.msg)).toContain('unknown statement "else"');
    // The first case is fused onto the if's own line (branchStart.firstCase),
    // not a row of its own; a bare "else" isn't read as a second case at
    // all, so no branchCase row is produced here.
    const start = m.rows.find((r) => r.kind === "branchStart");
    expect(start.firstCase).toBe("a");
    expect(m.rows.filter((r) => r.kind === "branchCase")).toHaveLength(0);
  });

  it("allows a blank else-if () than as the unlabelled, catch-all clause", () => {
    const m = parseDSL(
      doc("/line/\nif (q) is (a) than\n  [sales: x]\nelse-if () than\n  [sales: y]\nend-if"),
    );
    expect(m.errors).toEqual([]);
    const start = m.rows.find((r) => r.kind === "branchStart");
    expect(start.firstCase).toBe("a");
    const cases = m.rows.filter((r) => r.kind === "branchCase");
    expect(cases.map((c) => c.label)).toEqual([""]);
  });

  it("allows else-if with no parens at all, same as a labelled one — but than is still required", () => {
    const m = parseDSL(
      doc("/line/\nif (q) is (a) than\n  [sales: x]\nelse-if than\n  [sales: y]\nend-if"),
    );
    expect(m.errors).toEqual([]);
    const start = m.rows.find((r) => r.kind === "branchStart");
    expect(start.firstCase).toBe("a");
    const cases = m.rows.filter((r) => r.kind === "branchCase");
    expect(cases.map((c) => c.label)).toEqual([""]);
  });

  it("requires than even with no parens", () => {
    const m = parseDSL(
      doc("/line/\nif (q) is (a) than\n  [sales: x]\nelse-if\n  [sales: y]\nend-if"),
    );
    expect(m.errors.map((e) => e.msg)).toContain('else-if must end with "than"');
  });

  it("allows a blank is () than in the first-case (branchStart) slot too", () => {
    const m = parseDSL(
      doc("/line/\nif (q) is () than\n  [sales: x]\nelse-if (b) than\n  [sales: y]\nend-if"),
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
      "if (承認する？ | Approve?) is (はい | Yes) than",
      "  [sales: 完了 | Done]",
      "else-if (いいえ | No) than",
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
      "case (請求 | Billing)",
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
    const m = parseDSL(doc("/line/\nif (q) is (a) than\n  [x: y]\nend-if"));
    expect(m.errors).toEqual([]);
    expect(m.rows.find((r) => r.kind === "branchStart").openerId).toBeNull();
  });

  it("tells phase apart from section on the row, even though both render the same today", () => {
    const m = parseDSL(
      doc(
        "/line/\nphase (Intake) @intake\n  [a: x]\nend-phase\n\nsection (Review)\n  [a: y]\nend-section",
      ),
    );
    expect(m.errors).toEqual([]);
    const [phaseStart, phaseEnd, sectionStart, sectionEnd] = m.rows.filter(
      (r) => r.kind === "groupStart" || r.kind === "groupEnd",
    );
    expect(phaseStart).toMatchObject({
      kind: "groupStart",
      groupMode: "section",
      openerKeyword: "phase",
    });
    expect(phaseEnd).toMatchObject({ kind: "groupEnd", openerKeyword: "phase" });
    expect(sectionStart).toMatchObject({
      kind: "groupStart",
      groupMode: "section",
      openerKeyword: "section",
    });
    expect(sectionEnd).toMatchObject({ kind: "groupEnd", openerKeyword: "section" });
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
    expect(scanImports("@kai-swimlane@use a/b.svg;/line/[a:x]@end")).toHaveLength(1);
  });
});

/**
 * `/option/ lane-order:` decides which lane is drawn leftmost. Without it the
 * order is implicit — `/role/` declarations in source order, then roles a step
 * introduces — and that is still what the unnamed lanes keep, behind the ones
 * the option names.
 */
describe("/option/ lane-order", () => {
  const ROLES =
    "/role/\n<sales>\n  label: Sales;\n\n<manager>\n  label: Manager;\n\n<system>\n  label: System;\n";
  const FLOW = "/line/\n[sales: a]\n[manager: b]\n[system: c]";
  const withOrder = (value) =>
    parseDSL(
      doc(`${value === null ? "" : `/option/\nlane-order: ${value};\n\n`}${ROLES}\n${FLOW}`),
    );
  const laneIds = (m) => m.lanes.filter((l) => l.used).map((l) => l.id);
  /** The lane headings, in the order the SVG paints them. */
  const headings = (m) => {
    const svg = renderDiagramSvg({ model: m, theme: THEMES.basic });
    return [...svg.matchAll(/>([^<>]+)</g)]
      .map((x) => x[1])
      .filter((t) => ["Sales", "Manager", "System"].includes(t));
  };

  it("is implicit — declaration order — when the option is absent", () => {
    const m = withOrder(null);
    expect(m.errors).toEqual([]);
    expect(m.options.laneOrder).toBeUndefined();
    expect(laneIds(m)).toEqual(["sales", "manager", "system"]);
  });

  it("reorders the lanes to the order it names", () => {
    const m = withOrder("system, manager, sales");
    expect(m.errors).toEqual([]);
    expect(m.warnings).toEqual([]);
    expect(m.options.laneOrder).toEqual(["system", "manager", "sales"]);
    expect(laneIds(m)).toEqual(["system", "manager", "sales"]);
  });

  it("puts the lanes it does not name after the ones it does, implicit order kept", () => {
    // "system" jumps to the front; "sales" and "manager" stay in the order
    // /role/ declared them.
    expect(laneIds(withOrder("system"))).toEqual(["system", "sales", "manager"]);
    expect(laneIds(withOrder("manager"))).toEqual(["manager", "sales", "system"]);
  });

  it("warns on a name that is no role, still renders, and keeps the rest of the order", () => {
    const m = withOrder("system, nobody, sales");
    expect(m.errors).toEqual([]);
    expect(m.warnings.map((w) => w.msg)).toEqual([
      'lane-order names "nobody", which is not a role',
    ]);
    expect(m.warnings[0].severity).toBe("warning");
    // Dropped from the order, never invented as a lane of its own.
    expect(laneIds(m)).toEqual(["system", "sales", "manager"]);
    expect(headings(m)).toEqual(["System", "Sales", "Manager"]);
  });

  it("reserves a column for a declared lane no step has reached yet", () => {
    const m = parseDSL(doc(`/option/\nlane-order: system;\n\n${ROLES}\n/line/\n[sales: a]`));
    expect(m.errors).toEqual([]);
    expect(laneIds(m)).toEqual(["system", "sales"]);
    // "manager" is declared but neither used nor named, so it is still not drawn.
    expect(m.lanes.map((l) => l.id)).toEqual(["system", "sales", "manager"]);
    expect(m.lanes.find((l) => l.id === "manager").used).toBe(false);
  });

  it("draws its lanes left to right in that order", () => {
    expect(headings(withOrder("system, manager, sales"))).toEqual(["System", "Manager", "Sales"]);
    expect(headings(withOrder(null))).toEqual(["Sales", "Manager", "System"]);
  });

  it("takes the first mention of a repeated id and rejects an empty list", () => {
    expect(laneIds(withOrder("system, sales, system"))).toEqual(["system", "sales", "manager"]);
    const empty = withOrder(" , ");
    expect(empty.errors.map((e) => e.msg)).toEqual([
      '"lane-order": expected a comma-separated list of role ids',
    ]);
  });
});

/**
 * `if [sales] (q) is (a) than` used to parse, store a `lane` on the branchStart
 * row and serialize back — and nothing ever drew it. It is out of the grammar
 * now, so it has to fail loudly rather than be read as something else.
 */
describe("if takes no [lane]", () => {
  const ifDoc = (head) => doc(`/line/\n[a: before]\n${head}\n  [a: x]\nend-if`);

  it("is an error, naming what it replaced", () => {
    const m = parseDSL(ifDoc("if [a] (q?) is (yes) than"));
    expect(m.errors.map((e) => e.msg)).toEqual([
      "if takes no [lane] — the gateway is drawn in the lane of the step before it",
    ]);
  });

  it("reads the rest of the statement, so the bracket is not taken for a step", () => {
    const m = parseDSL(ifDoc("if [a] (q?) is (yes) than #green"));
    expect(m.errors).toHaveLength(1);
    const start = m.rows.find((r) => r.kind === "branchStart");
    expect(start).toMatchObject({ cond: "q?", firstCase: "yes", branchColor: "green" });
    expect(start.lane).toBeUndefined();
    // Three steps' worth of rows, not four: `[a]` was consumed by the error.
    expect(m.rows.filter((r) => r.kind === "step").map((r) => r.text)).toEqual(["before", "x"]);
  });

  it("leaves the step and the spacer that may follow an opener alone", () => {
    // Whitespace is not structural, so a bare `fork` is followed on the next
    // line by an ordinary statement — a bracket run with a `:` is a step head
    // and `[]` is a spacer; neither is a lane selector.
    const m = parseDSL(doc("/line/\nfork\n[a: one]\ncase (two)\n[]\n[a: three]\nend-fork"));
    expect(m.errors).toEqual([]);
    // The spacer is a step row of its own with no text — three rows, not two.
    expect(m.rows.filter((r) => r.kind === "step").map((r) => r.text)).toEqual([
      "one",
      "",
      "three",
    ]);
  });

  it("says so on a group opener too, where it never meant anything", () => {
    const m = parseDSL(doc("/line/\nsection [a] (Audit)\n  [a: x]\nend-section"));
    expect(m.errors.map((e) => e.msg)).toEqual([
      "section takes no [lane] — a section spans every lane",
    ]);
  });

  it("no longer accepts `lane:` as a property either", () => {
    const m = parseDSL(doc("/line/\nif (q?) is (yes) than\n  lane: a;\n  [a: x]\nend-if"));
    expect(m.errors.map((e) => e.msg)).toEqual(['"lane" is not a property of this statement']);
  });
});
