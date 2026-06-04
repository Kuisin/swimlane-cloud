import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * The pure renderer is meant to be consumed by external tools/plugins under
 * Node's native ESM loader (not just vitest's esbuild transform, which silently
 * tolerates duplicate exports). Importing it in a real `node` process is the
 * only way to catch generator regressions like a duplicated `export`.
 */
describe("render-pure native ESM", () => {
  it("imports under Node's native ESM loader", () => {
    const entry = join(__dirname, "diagram.js");
    const script = `import(${JSON.stringify(entry)}).then((m) => {
      const keys = Object.keys(m).sort().join(",");
      if (keys !== "BRANCH_COLOR_STYLES,renderDiagramSvg") {
        throw new Error("unexpected exports: " + keys);
      }
    })`;
    expect(() =>
      execFileSync(process.execPath, ["--input-type=module", "-e", script], {
        stdio: "pipe",
      }),
    ).not.toThrow();
  });
});
