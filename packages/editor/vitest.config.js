import { defineConfig } from "vitest/config";

// The host apps compile JSX with the automatic runtime (no `React` global);
// match that here so component tests can actually render JSX modules.
export default defineConfig({
  esbuild: { jsx: "automatic" },
});
