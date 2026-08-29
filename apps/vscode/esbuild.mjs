/**
 * Two bundles with almost nothing in common.
 *
 * Unlike `apps/desktop/vite.config.js:31-47`, which has to alias every
 * workspace specifier to on-disk source, esbuild happily follows the pnpm
 * symlinks into `packages/*` and transforms the raw `.jsx`/`.ts` it finds
 * there. No aliasing is needed.
 */
import { build, context } from "esbuild";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const watch = process.argv.includes("--watch");
const dev = watch || process.argv.includes("--dev");

/**
 * `packages/editor/src/styles.css` is self-contained, but the editor's palette
 * is light-only and lives in TWO places: `.sw-editor` and, because it renders
 * into a document.body portal, `.sw-parts-tooltip`. Appending our overrides
 * after the package CSS lets the theme reach both.
 */
const themeCss = () => readFileSync(join(here, "webview", "theme.css"), "utf8");

const cssAppendPlugin = {
  name: "append-vscode-theme",
  setup(b) {
    b.onEnd(() => {
      const out = join(here, "dist", "webview.css");
      try {
        writeFileSync(out, `${readFileSync(out, "utf8")}\n${themeCss()}`);
      } catch {
        /* first build may not have emitted CSS yet */
      }
    });
  },
};

const common = {
  bundle: true,
  sourcemap: dev,
  minify: !dev,
  logLevel: "info",
};

/** Extension host: real Node, CJS, and `vscode` is provided by the runtime. */
const extensionConfig = {
  ...common,
  entryPoints: [join(here, "src", "extension.ts")],
  outfile: join(here, "dist", "extension.cjs"),
  platform: "node",
  format: "cjs",
  target: "node20",
  external: ["vscode"],
};

/**
 * Webview: a browser. `jsx: "automatic"` is mandatory — the editor's components
 * import only the hooks they use and never `React` itself, so the classic
 * transform would produce "React is not defined" at runtime.
 */
const webviewConfig = {
  ...common,
  entryPoints: [join(here, "webview", "main.tsx")],
  outfile: join(here, "dist", "webview.js"),
  platform: "browser",
  format: "iife",
  target: "chrome114",
  jsx: "automatic",
  loader: { ".css": "css" },
  plugins: [cssAppendPlugin],
  define: { "process.env.NODE_ENV": JSON.stringify(dev ? "development" : "production") },
};

mkdirSync(join(here, "dist"), { recursive: true });

if (watch) {
  const ctxs = await Promise.all([context(extensionConfig), context(webviewConfig)]);
  await Promise.all(ctxs.map((c) => c.watch()));
  console.log("watching...");
} else {
  await Promise.all([build(extensionConfig), build(webviewConfig)]);
}
