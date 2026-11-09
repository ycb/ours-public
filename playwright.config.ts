import { defineConfig, devices } from "@playwright/test";

/**
 * Local-only browser checks against the local Supabase stack (never a hosted project).
 * Traces, screenshots and video are off: even synthetic runs keep no page captures by default.
 */
export default defineConfig({
  testDir: "./e2e",
  // README screenshots run only on request (`npm run screenshots`), never in the test suite.
  testIgnore: process.env.OURS_SCREENSHOTS ? [] : ["**/screenshots.spec.ts"],
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 180_000,
  expect: { timeout: 15_000 },
  reporter: [["list"]],
  use: {
    baseURL: "http://localhost:5173",
    // A stuck click or page load fails fast and names its step, instead of silently using up the test.
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
    trace: "off",
    screenshot: "off",
    video: "off",
    ...devices["Desktop Chrome"],
  },
  webServer: {
    command: "npm run dev -- --port 5173 --strictPort",
    url: "http://localhost:5173",
    reuseExistingServer: true,
    timeout: 60_000,
  },
});
