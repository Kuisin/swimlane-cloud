/**
 * The repository's worked example is a fixture: every diagram in
 * `examples/kai-swimlane-2` must parse with no errors and render, in every
 * language it declares. It is the cheapest guard against a reader change that
 * silently breaks real files. Skipped when the package is checked out alone.
 */
import { describe, it, expect } from "vitest";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { textToSvg } from "./render-pure/text-to-svg.js";

const ROOT = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "..",
  "examples",
  "kai-swimlane-2",
  "diagrams",
);

function diagrams(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) diagrams(path, out);
    else if (name.endsWith(".txt")) out.push(path);
  }
  return out;
}

describe.skipIf(!existsSync(ROOT))("examples/kai-swimlane-2", () => {
  const files = diagrams(ROOT);

  it("has the five sample diagrams", () => {
    expect(files).toHaveLength(5);
  });

  it.each(files.map((f) => [f.slice(ROOT.length + 1), f]))("%s renders", (_name, path) => {
    const src = readFileSync(path, "utf8");
    for (const lang of ["ja", "en"]) {
      const { svg, model, errors, error } = textToSvg(src, { themeKey: "basic", lang });
      expect(error).toBeUndefined();
      expect(errors ?? []).toEqual([]);
      expect(model.rows.some((r) => r.kind === "step")).toBe(true);
      expect(svg).toContain("<svg");
    }
  });
});
