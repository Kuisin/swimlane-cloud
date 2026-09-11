import { defineConfig } from "vitest/config";

// Node environment, no network: every test drives an injected `fetchImpl`.
export default defineConfig({});
