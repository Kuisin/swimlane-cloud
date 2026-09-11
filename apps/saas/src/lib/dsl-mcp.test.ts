import { describe, expect, it } from "vitest";
import { execSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import {
  DEFAULT_MAX_SVG_BYTES,
  exampleCatalogue,
  formatReport,
  migrateReport,
  readExample,
  readExampleIndex,
  renderReport,
  svgDimensions,
  validateReport,
} from "./dsl-mcp.js";

// The examples are synced out of the repo root by prebuild/predev and are
// gitignored, so a clean checkout running `vitest` alone has not got them yet.
if (!existsSync(join(process.cwd(), "content/examples/index.json"))) {
  execSync("node scripts/sync-dsl-rule.mjs", { cwd: process.cwd() });
}

const CLEAN = [
  "@kai-swimlane",
  "",
  "/title/",
  "Expense approval;",
  "",
  "/role/",
  "<staff>",
  "  label: Staff;",
  "",
  "<manager>",
  "  label: Manager;",
  "",
  "/line/",
  "[staff: Submit the claim]",
  "if (Approved?) is (Yes) than #green",
  "  [manager: Pay it]",
  "else-if (No) than #red",
  "  [staff: Revise]",
  "  loop",
  "end-if",
  "",
  "@end",
  "",
].join("\n");

const BROKEN = [
  "@kai-swimlane",
  "",
  "/line/",
  "[nobody: Do a thing]",
  "end-if",
  "",
  "@end",
  "",
].join("\n");

describe("validateReport", () => {
  it("passes a clean document", () => {
    const r = validateReport(CLEAN);
    expect(r.isError).toBeFalsy();
    expect(r.summary).toContain("parses cleanly");
  });

  it("reports errors with line numbers", () => {
    const r = validateReport(BROKEN);
    expect(r.isError).toBe(true);
    expect(r.summary).toMatch(/line \d+:/);
  });

  it("never throws on junk", () => {
    for (const junk of ["", " ", "not a diagram at all", "@kai-swimlane"]) {
      expect(() => validateReport(junk)).not.toThrow();
    }
  });
});

describe("svgDimensions", () => {
  it("reads the viewBox", () => {
    expect(svgDimensions('<svg viewBox="0 0 598 296" xmlns="...">')).toEqual({
      width: 598,
      height: 296,
    });
  });

  it("is null when there is no viewBox", () => {
    expect(svgDimensions("<svg>")).toBeNull();
  });
});

describe("renderReport", () => {
  it("returns the SVG and its size for a clean document", () => {
    const r = renderReport(CLEAN);
    expect(r.isError).toBeFalsy();
    expect(r.payload).toContain("<svg");
    expect(r.summary).toMatch(/\d+x\d+ px/);
    expect(r.summary).toContain('"basic" theme');
  });

  it("honours a named theme and falls back to basic for an unknown one", () => {
    expect(renderReport(CLEAN, { theme: "ink" }).summary).toContain('"ink" theme');
    expect(renderReport(CLEAN, { theme: "nonsense" }).summary).toContain('"basic" theme');
  });

  it("omits the SVG whole rather than truncating it past maxBytes", () => {
    const r = renderReport(CLEAN, { maxBytes: 10 });
    expect(r.payload).toBeUndefined();
    expect(r.summary).toContain("maxBytes (10)");
    expect(r.summary).toMatch(/maxBytes at least \d+/);
  });

  it("still draws a document with errors, but says so", () => {
    const r = renderReport(BROKEN);
    expect(r.isError).toBe(true);
    expect(r.summary).toContain("Errors:");
  });

  it("never throws on junk", () => {
    for (const junk of ["", " ", "not a diagram at all"]) {
      expect(() => renderReport(junk)).not.toThrow();
    }
  });

  it("keeps the default budget above the largest bundled example", () => {
    for (const e of readExampleIndex()) {
      const text = readExample(e.name)!.text;
      const r = renderReport(text);
      expect(r.payload, `${e.name} exceeded ${DEFAULT_MAX_SVG_BYTES} bytes`).toContain("<svg");
    }
  });
});

describe("formatReport", () => {
  it("refuses to format a document that does not parse", () => {
    const r = formatReport(BROKEN);
    expect(r.isError).toBe(true);
    expect(r.payload).toBeUndefined();
    expect(r.summary).toContain("does not parse");
  });

  it("is idempotent — formatting its own output changes nothing", () => {
    const once = formatReport(CLEAN);
    expect(once.isError).toBeFalsy();
    const canonical = once.payload ?? CLEAN;
    const twice = formatReport(canonical);
    expect(twice.payload).toBeUndefined();
    expect(twice.summary).toContain("Already canonical");
  });

  it("formats every bundled example to a still-valid document", () => {
    for (const e of readExampleIndex()) {
      const r = formatReport(readExample(e.name)!.text);
      expect(r.isError, e.name).toBeFalsy();
      if (r.payload) expect(validateReport(r.payload).isError, e.name).toBeFalsy();
    }
  });

  // formatReport is parse + serializeDSL, not the editor's formatDsl, because
  // formatDsl is only reachable through a barrel that drags React into Next's
  // server layer. This pins the claim that the difference (formatDsl's extra
  // normalizeBranchRows pass) is a no-op on freshly parsed input, so the tool
  // really does write what the app writes.
  it("matches the editor's own formatDsl byte for byte", async () => {
    const { formatDsl } = (await import("@swimlane-cloud/editor")) as unknown as {
      formatDsl: (src: string) => { ok: boolean; value: string };
    };
    for (const src of [CLEAN, ...readExampleIndex().map((e) => readExample(e.name)!.text)]) {
      const theirs = formatDsl(src);
      expect(theirs.ok).toBe(true);
      const mine = formatReport(src);
      expect(mine.payload ?? src.trim()).toBe(
        theirs.value.trim() === src.trim() ? src.trim() : theirs.value,
      );
    }
  });
});

describe("migrateReport", () => {
  it("rewrites an old construct and validates the result", () => {
    const legacy = [
      "@kai-swimlane-v2",
      "/line/",
      "[a: one]",
      "  id: landing;",
      "if [a] (ok?)",
      "case (yes)",
      "  merge: landing;",
      "endif",
      "@end",
      "",
    ].join("\n");
    const r = migrateReport(legacy);
    expect(r.summary).toMatch(/Rewrote \d+ lines/);
    expect(r.payload).toContain("[goto: landing]");
    expect(r.payload).not.toContain("@kai-swimlane-v2");
    expect(r.payload).toContain("end-if");
  });

  it("says so when there is nothing to migrate, and still validates", () => {
    const r = migrateReport(CLEAN);
    expect(r.summary).toContain("Nothing to migrate");
    expect(r.summary).toContain("parses cleanly");
    expect(r.isError).toBeFalsy();
  });

  it("flags the constructs that have no automatic mapping", () => {
    const r = migrateReport(
      [
        "@kai-swimlane",
        "/line/",
        "[a: one]",
        "if [a] (ok?)",
        "case (yes)",
        "  merge;",
        "endif",
        "@end",
        "",
      ].join("\n"),
    );
    expect(r.isError).toBe(true);
    expect(r.summary).toContain("[goto: id]");
  });

  it("leaves every bundled example alone", () => {
    for (const e of readExampleIndex()) {
      const r = migrateReport(readExample(e.name)!.text);
      expect(r.summary, e.name).toContain("Nothing to migrate");
    }
  });
});

describe("examples", () => {
  it("bundles a non-empty catalogue, each entry parse-clean", () => {
    const index = readExampleIndex();
    expect(index.length).toBeGreaterThan(0);
    for (const e of index) {
      expect(e.title.length).toBeGreaterThan(0);
      expect(e.summary.length).toBeGreaterThan(0);
      expect(e.teaches.length).toBeGreaterThan(0);
      const found = readExample(e.name);
      expect(found, e.name).not.toBeNull();
      expect(found!.text).toContain("@kai-swimlane");
      expect(validateReport(found!.text).isError, e.name).toBeFalsy();
    }
  });

  it("names the constructs a model most often gets wrong", () => {
    const teaches = readExampleIndex()
      .flatMap((e) => e.teaches)
      .join(" ");
    for (const construct of ["fork", "goto", "loop", "else-if"]) {
      expect(teaches).toContain(construct);
    }
  });

  it("returns null for an unknown name, and for a traversal attempt", () => {
    expect(readExample("nope")).toBeNull();
    expect(readExample("../../package")).toBeNull();
    expect(readExample("../dsl-rule")).toBeNull();
  });

  it("is case-insensitive on the name", () => {
    const first = readExampleIndex()[0].name;
    expect(readExample(first.toUpperCase())?.meta.name).toBe(first);
  });

  it("renders a catalogue listing every example", () => {
    const index = readExampleIndex();
    const text = exampleCatalogue(index);
    for (const e of index) expect(text).toContain(`\`${e.name}\``);
  });

  it("says so plainly when nothing is bundled", () => {
    expect(exampleCatalogue([])).toContain("No examples");
  });
});
