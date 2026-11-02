import { defineConfig, devices } from "@playwright/test";

// Smoke test. Runs against E2E_BASE_URL (default: a local dev server it starts).
// Signed-in checks need E2E_EMAIL and E2E_PASSWORD for a login on the Neon DEV branch,
// never production. See docs/testing.md.
const baseURL = process.env.E2E_BASE_URL ?? "http://localhost:3000";
const local = baseURL.startsWith("http://localhost");

export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  retries: 0,
  use: { baseURL, trace: "retain-on-failure" },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "phone", use: { ...devices["iPhone 13"], browserName: "chromium" } },
  ],
  webServer: local ? { command: "npm run dev", url: baseURL, reuseExistingServer: true, timeout: 120_000 } : undefined,
});
