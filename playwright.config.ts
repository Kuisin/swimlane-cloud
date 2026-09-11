import { defineConfig, devices } from "@playwright/test";

/**
 * End-to-end tests against the standalone web app (`apps/web`): the shared
 * editor over a localStorage host, with no backend and no login, which is
 * exactly what makes it drivable in a headless browser. `?demo=reset` gives
 * every test the same seeded files.
 *
 * Run with `pnpm e2e`. Not part of `pnpm -r test`: it needs a browser.
 */
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "github" : "list",
  timeout: 30_000,
  use: {
    baseURL: "http://127.0.0.1:5199",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  webServer: {
    // Straight to vite: `pnpm run dev -- …` forwards the `--` literally.
    command: "npx vite --port 5199 --strictPort --host 127.0.0.1",
    cwd: "apps/web",
    url: "http://127.0.0.1:5199",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "phone", use: { ...devices["Pixel 7"] } },
  ],
});
