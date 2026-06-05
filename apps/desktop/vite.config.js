import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { devPortPlugin } from "./scripts/dev-port-plugin.js";

const rootDir = fileURLToPath(new URL(".", import.meta.url));
const repoRoot = path.resolve(rootDir, "../..");

// The workspace packages (@swimlane-cloud/editor, /diagram-converter) ship raw
// JSX/ESM from source. Alias their package entries to the on-disk source so Vite
// transpiles them as project source (Vite would otherwise skip node_modules).
const editorSrc = path.join(repoRoot, "packages/editor/src");
const converterSrc = path.join(repoRoot, "packages/diagram-converter/src");

export default defineConfig({
  plugins: [react(), devPortPlugin()],
  base: "./",
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
  server: {
    port: 5174,
    strictPort: false,
    fs: {
      // Allow Vite to serve files from the monorepo root (workspace packages).
      allow: [repoRoot],
    },
  },
  resolve: {
    dedupe: ["react", "react-dom"],
    alias: {
      "@swimlane-cloud/editor/styles.css": path.join(editorSrc, "styles.css"),
      "@swimlane-cloud/editor": path.join(editorSrc, "index.jsx"),
      "@swimlane-cloud/diagram-converter/parser": path.join(converterSrc, "parser.js"),
      "@swimlane-cloud/diagram-converter/themes": path.join(converterSrc, "themes.js"),
      "@swimlane-cloud/diagram-converter/diagram-options": path.join(
        converterSrc,
        "diagram-options.js",
      ),
      "@swimlane-cloud/diagram-converter": path.join(
        converterSrc,
        "render-pure/index.js",
      ),
    },
  },
});
