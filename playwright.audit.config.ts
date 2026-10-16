/**
 * The launch audit (docs/AUDIT.md): `e2e/*.audit.ts` against the live site,
 * in all three browsers. CI never runs these; run them by hand with
 * `pnpm exec playwright test -c playwright.audit.config.ts`.
 * Set SMOKE_BASE_URL to audit another deployment.
 */
import { defineConfig, devices } from "@playwright/test";

process.env.SMOKE_BASE_URL ??= "https://varadmore.me/serving-explained/";

export default defineConfig({
  testDir: "e2e",
  testMatch: "**/*.audit.ts",
  outputDir: "test-results/audit",
  fullyParallel: true,
  workers: 4,
  reporter: [["list"]],
  timeout: 120_000,
  use: { actionTimeout: 10_000 },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "webkit", use: { ...devices["Desktop Safari"] } },
    { name: "firefox", use: { ...devices["Desktop Firefox"] } },
  ],
});
