import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

const rootDir = fileURLToPath(new URL(".", import.meta.url));
const repoRoot = path.resolve(rootDir, "../..");

export default defineConfig({
  plugins: [react(), tailwindcss()],
  base: "./",
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
  server: {
    port: 5175,
    strictPort: false,
    fs: {
      // Workspace packages (@swimlane-cloud/editor, diagram-converter) live
      // outside this app dir; allow Vite to serve their source.
      allow: [repoRoot],
    },
  },
  resolve: {
    // Workspace packages ship raw source (no build step), so they share this
    // app's single React copy.
    dedupe: ["react", "react-dom"],
  },
  // The workspace packages are ESM source consumed directly; nothing extra to
  // exclude, but make sure Vite pre-bundles their deps once.
  optimizeDeps: {
    include: ["react", "react-dom", "react-dom/client"],
  },
});
