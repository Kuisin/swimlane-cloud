import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  resolve: {
    alias: {
      // The `vscode` module only exists inside the extension host, so the
      // end-to-end git tests substitute a stub exposing just the surface
      // `Repository` touches. `Git` itself is unstubbed and runs real git.
      vscode: fileURLToPath(new URL("./test/vscode-stub.ts", import.meta.url)),
    },
  },
});
