/**
 * `serializeDSL` (the dispatcher in `serialize-dsl.js`) must round-trip a
 * `@kai-swimlane` document without corruption: every declared language,
 * `@use`, `phase` vs `section`, an opener's own `@id`, and a `loop`'s own
 * `@target` all have to survive a parse → serialize → reparse cycle, since
 * that's exactly what happens every time the GUI editor saves a document.
 */
import { describe, it, expect } from "vitest";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, dirname, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { parseDSL } from "@swimlane-cloud/diagram-converter/parser";
import { migrateLegacyDsl } from "@swimlane-cloud/diagram-converter";
import { serializeDSL } from "./serialize-dsl.js";

const doc = (body) => `@kai-swimlane\n${body}\n@end\n`;

/** Idempotence: once canonicalized, a second round-trip must not drift. */
function assertStableRoundTrip(src, options) {
  const m1 = parseDSL(src, options);
  expect(m1.errors).toEqual([]);
  const once = serializeDSL(m1);
  const m2 = parseDSL(once, options);
  expect(m2.errors).toEqual([]);
  const twice = serializeDSL(m2);
  expect(twice).toBe(once);
  return { m1, m2, once };
}

/** Every declared language's value for `field`, using `$langs` with the
 * flattened field as fallback — the two representations round-trip may
 * legitimately choose different (but equivalent) internal shapes for. */
function allLangs(obj, field, n) {
  const arr = obj[`${field}$langs`];
  return Array.from({ length: n }, (_, i) => (arr && arr[i] != null ? arr[i] : obj[field]));
}

describe("serializeDSL", () => {
  it("writes @kai-swimlane for every model — there is only one grammar", () => {
    const out = serializeDSL(parseDSL(doc("/line/\n[a: x]")));
    expect(out.startsWith("@kai-swimlane\n")).toBe(true);
    expect(out).not.toContain("@kai-swimlane-v2");
  });
});

describe("serializeDSLv2: multi-language content", () => {
  it("keeps both languages for title, page, and role/prop labels through a round-trip", () => {
    const src = doc(
      [
        "@lang ja, en;",
        "",
        "/page/",
        "left-title: 手順 | Procedure;",
        "",
        "/title/",
        "受注 | Order;",
        "",
        "/role/",
        "<sales>",
        "  label: 営業;",
        "  label.en: Sales;",
        "",
        "/prop/",
        "<PO>",
        "  label: 注文書 | Purchase order;",
        "",
        "/line/",
        "[sales: 完了 | Done] +PO",
      ].join("\n"),
    );
    const { m2 } = assertStableRoundTrip(src);
    const n = 2;
    expect(allLangs(m2, "title", n)).toEqual(["受注", "Order"]);
    expect(allLangs(m2.page, "leftTitle", n)).toEqual(["手順", "Procedure"]);
    expect(allLangs(m2.roles.sales, "label", n)).toEqual(["営業", "Sales"]);
    expect(allLangs(m2.props.PO, "label", n)).toEqual(["注文書", "Purchase order"]);
    expect(allLangs(m2.rows[0], "text", n)).toEqual(["完了", "Done"]);
  });

  it("keeps an escaped literal bar as content instead of treating it as a language split", () => {
    const src = doc("@lang ja, en;\n\n/line/\n[sales: x]\n  remark: 記録は「a \\| b」;");
    const { m2 } = assertStableRoundTrip(src);
    expect(m2.rows[0].remark).toBe("記録は「a | b」");
  });

  it("leaves a single-language document's shape untouched (no .tag lines introduced)", () => {
    const src = doc("/title/\nT;\n\n/line/\n[a: x]\n  desc: d;");
    const { once } = assertStableRoundTrip(src);
    expect(once).not.toMatch(/\.\w+:/);
  });
});

describe("serializeDSLv2: structure that needs its own model field to survive", () => {
  it("keeps an if/fork/section opener's own @id", () => {
    const src = doc(
      "/line/\nfork (Shipping) @fulfil\n  [a: x]\nend-fork\n\nsection (Closing) @closing\n  [a: y]\nend-section",
    );
    const { m2, once } = assertStableRoundTrip(src);
    expect(m2.rows.find((r) => r.kind === "branchStart").openerId).toBe("fulfil");
    expect(m2.rows.find((r) => r.kind === "groupStart").openerId).toBe("closing");
    expect(once).toContain("@fulfil");
    expect(once).toContain("@closing");
  });

  it("writes phase back as phase, not section, even though they render the same", () => {
    const src = doc("/line/\nphase (Intake)\n  [a: x]\nend-phase");
    const { m2, once } = assertStableRoundTrip(src);
    expect(m2.rows.find((r) => r.kind === "groupStart").openerKeyword).toBe("phase");
    expect(once).toContain("phase (Intake)");
    expect(once).toContain("end-phase");
  });

  it("keeps a loop's own @target", () => {
    const src = doc("/line/\nif (q) is (a) than\n  [x: y]\n    id: start;\n  loop @start\nend-if");
    const { m2, once } = assertStableRoundTrip(src);
    expect(m2.rows.find((r) => r.kind === "branchLoop").loopTarget).toBe("start");
    expect(once).toContain("loop @start");
  });

  it("keeps a bare loop with no target bare", () => {
    const src = doc("/line/\nif (q) is (a) than\n  [x: y]\n  loop\nend-if");
    const { once } = assertStableRoundTrip(src);
    expect(once).toMatch(/^\s*loop\s*$/m);
  });

  it("folds a fork's first path label back into the fork line itself", () => {
    const src = doc(
      "/line/\nfork (Shipping) #purple\n  [a: x]\ncase (Billing)\n  [a: y]\nend-fork",
    );
    const { m2, once } = assertStableRoundTrip(src);
    const firstCase = m2.rows.find((r) => r.kind === "branchCase" && r.parallel);
    expect(firstCase.label).toBe("Shipping");
    expect(once).toContain("fork (Shipping) #purple");
    expect(once).toContain("case (Billing)");
  });

  it("keeps a blank else-if () than as the catch-all clause", () => {
    const src = doc("/line/\nif (q) is (a) than\n  [x: y]\nelse-if () than\n  [x: z]\nend-if");
    const { m2 } = assertStableRoundTrip(src);
    const cases = m2.rows.filter((r) => r.kind === "branchCase");
    expect(cases.map((c) => c.label)).toEqual([""]);
  });
});

describe("serializeDSLv2: imports", () => {
  it("re-emits an @use fragment import instead of inlining the fragment's own definitions", () => {
    const fragment = "/role/\n<sales>\n  label: Sales;\n\n<ops>\n  label: Ops;\n";
    const src = doc(
      "@use templates/role/standard.txt;\n\n/role/\n<sales>\n  icon: #user;\n\n/line/\n[sales: x]\n[ops: y]",
    );
    const options = { resolveImport: () => fragment };
    const m1 = parseDSL(src, options);
    expect(m1.errors).toEqual([]);
    const out = serializeDSL(m1);
    expect(out).toContain("@use templates/role/standard.txt;");
    // "sales" was locally reopened (for icon), so it's written locally too;
    // "ops" came only from the fragment and must not be duplicated inline.
    expect(out).toContain("<sales>");
    expect(out).not.toContain("<ops>");
    const m2 = parseDSL(out, options);
    expect(m2.errors).toEqual([]);
    expect(m2.roles.ops).toMatchObject({ label: "Ops" });
    expect(m2.roles.sales).toMatchObject({ label: "Sales", icon: "#user" });
  });

  it("re-emits an @use image import with its alias", () => {
    const PNG = "data:image/png;base64,AAAA";
    const src = doc(
      "@use assets/logo.png as brand;\n\n/role/\n<a>\n  icon: @brand;\n\n/line/\n[a: x]",
    );
    const options = { resolveAsset: () => PNG };
    const m1 = parseDSL(src, options);
    expect(m1.errors).toEqual([]);
    const out = serializeDSL(m1);
    expect(out).toContain("@use assets/logo.png as brand;");
    const m2 = parseDSL(out, options);
    expect(m2.errors).toEqual([]);
    expect(m2.roles.a.iconAsset.dataUri).toBe(PNG);
  });
});

describe("serializeDSLv2: meta and i18n catalog passthrough", () => {
  it("round-trips /meta/", () => {
    const src = doc("/meta/\nowner: sales-ops;\ntags: a, b;\n\n/line/\n[a: x]");
    const { m2 } = assertStableRoundTrip(src);
    expect(m2.meta).toMatchObject({ owner: "sales-ops", tags: "a, b" });
  });

  it("passes an /i18n/ entry through unchanged even though nothing resolves it yet", () => {
    const src = doc("@lang ja, en;\n\n/i18n/\nquote.remark.en: Store audit log;\n\n/line/\n[a: x]");
    const { m2 } = assertStableRoundTrip(src);
    expect(m2.catalog).toEqual({ "quote.remark.en": "Store audit log" });
  });
});

describe("serializeDSLv2: real worked-example fixtures", () => {
  const EXAMPLE = join(
    dirname(fileURLToPath(import.meta.url)),
    "..",
    "..",
    "..",
    "..",
    "examples",
    "kai-swimlane",
  );
  const ROOT = join(EXAMPLE, "diagrams");

  function diagrams(dir, out = []) {
    for (const name of readdirSync(dir)) {
      const path = join(dir, name);
      if (statSync(path).isDirectory()) diagrams(path, out);
      else if (name.endsWith(".txt")) out.push(path);
    }
    return out;
  }

  /** The file's path relative to the example root, in POSIX form. */
  function repoPath(file) {
    return file
      .slice(EXAMPLE.length + 1)
      .split(sep)
      .join("/");
  }

  function resolversFor(file) {
    return {
      filename: repoPath(file),
      resolveImport: (path) => {
        const target = path.startsWith(".") ? join(dirname(file), path) : join(EXAMPLE, path);
        return existsSync(target) ? readFileSync(target, "utf8") : null;
      },
      resolveAsset: (path) => {
        const target = path.startsWith(".") ? join(dirname(file), path) : join(EXAMPLE, path);
        if (!existsSync(target)) return null;
        const ext = path.slice(path.lastIndexOf(".") + 1).toLowerCase();
        const mime = { svg: "image/svg+xml", png: "image/png" }[ext];
        return mime ? `data:${mime};base64,${readFileSync(target).toString("base64")}` : null;
      },
    };
  }

  describe.skipIf(!existsSync(ROOT))("examples/kai-swimlane", () => {
    const files = diagrams(ROOT);

    it("has the sample diagrams", () => {
      expect(files.length).toBeGreaterThanOrEqual(6);
    });

    it.each(files.map((f) => [f.slice(ROOT.length + 1), f]))(
      "%s survives a parse -> serialize -> reparse cycle with no data loss",
      (_name, path) => {
        // The fixtures under examples/kai-swimlane predate the one-grammar
        // change and still carry the old `@kai-swimlane-v2` header; that
        // directory isn't this package's to rewrite, so migrate on the fly.
        const src = migrateLegacyDsl(readFileSync(path, "utf8")).text;
        const options = resolversFor(path);
        const m1 = parseDSL(src, options);
        expect(m1.errors).toEqual([]);
        const out = serializeDSL(m1);
        const m2 = parseDSL(out, options);
        expect(m2.errors).toEqual([]);
        expect(m2.rows.map((r) => r.kind)).toEqual(m1.rows.map((r) => r.kind));
        const n = Math.max(m1.languages.length, 1);
        expect(allLangs(m1, "title", n)).toEqual(allLangs(m2, "title", n));
        for (const id of Object.keys(m1.roles)) {
          expect(allLangs(m1.roles[id], "label", n)).toEqual(allLangs(m2.roles[id], "label", n));
        }
        // a second round-trip must be a stable fixpoint
        expect(serializeDSL(m2)).toBe(out);
      },
    );
  });
});
