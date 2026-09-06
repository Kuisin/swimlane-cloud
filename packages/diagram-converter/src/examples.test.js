/**
 * The repository's worked example is a fixture: every diagram in
 * `examples/kai-swimlane-2` must parse with no errors and render, in every
 * language it declares. It is the cheapest guard against a reader change that
 * silently breaks real files, and it exercises the whole import path — the
 * resolvers below are what a host has to supply. Skipped when the package is
 * checked out on its own.
 */
import { describe, it, expect } from "vitest";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, dirname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { textToSvg } from "./render-pure/text-to-svg.js";
import { scanImports, ASSET_EXTENSIONS } from "./parser-v2.js";

const EXAMPLE = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "..",
  "examples",
  "kai-swimlane-2",
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

/** `./` and `../` resolve against the file; anything else against the root. */
function locate(file, path) {
  return path.startsWith(".")
    ? resolve(dirname(file), path.split("/").join(sep))
    : join(EXAMPLE, path.split("/").join(sep));
}

function resolversFor(file) {
  return {
    resolveImport: (path) => {
      const target = locate(file, path);
      return existsSync(target) ? readFileSync(target, "utf8") : null;
    },
    resolveAsset: (path) => {
      const target = locate(file, path);
      if (!existsSync(target)) return null;
      const ext = path.slice(path.lastIndexOf(".") + 1).toLowerCase();
      const mime = ASSET_EXTENSIONS[ext];
      return mime ? `data:${mime};base64,${readFileSync(target).toString("base64")}` : null;
    },
  };
}

describe.skipIf(!existsSync(ROOT))("examples/kai-swimlane-2", () => {
  const files = diagrams(ROOT);

  it("has the sample diagrams", () => {
    expect(files.length).toBeGreaterThanOrEqual(6);
  });

  it.each(files.map((f) => [f.slice(ROOT.length + 1), f]))("%s renders", (_name, path) => {
    const src = readFileSync(path, "utf8");
    for (const lang of ["ja", "en"]) {
      const { svg, model, errors, error } = textToSvg(src, {
        themeKey: "basic",
        lang,
        filename: repoPath(path),
        ...resolversFor(path),
      });
      expect(error).toBeUndefined();
      expect(errors ?? []).toEqual([]);
      expect(model.rows.some((r) => r.kind === "step")).toBe(true);
      expect(svg).toContain("<svg");
    }
  });

  it("every @use target exists", () => {
    for (const file of files) {
      for (const use of scanImports(readFileSync(file, "utf8"), repoPath(file))) {
        expect(existsSync(locate(file, use.path)), `${file}: ${use.path}`).toBe(true);
      }
    }
  });

  it("embeds an imported image and never inlines its markup", () => {
    const showcase = files.find((f) => f.endsWith("asset-showcase.txt"));
    expect(showcase).toBeDefined();
    const { svg, model } = textToSvg(readFileSync(showcase, "utf8"), {
      themeKey: "basic",
      filename: repoPath(showcase),
      ...resolversFor(showcase),
    });
    expect(Object.keys(model.assets).sort()).toEqual(["badge", "kai-mark"]);
    // The vector mark and the raster badge both arrive as data URIs.
    expect(model.assets["kai-mark"].dataUri).toMatch(/^data:image\/svg\+xml;base64,/);
    expect(model.assets.badge.dataUri).toMatch(/^data:image\/png;base64,/);
    // Drawn as <image>, so nothing inside an imported drawing can execute.
    expect(svg).toContain("<image");
    expect(svg).not.toContain("<script");
    expect(svg).not.toContain('<circle cx="12" cy="12" r="11"');
  });
});
