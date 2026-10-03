import { defineConfig, devices } from "@playwright/test";

/** Set to run the smoke suite against a deployed site (Prompt 1 step 9). */
const live = process.env.SMOKE_BASE_URL;

export default defineConfig({
  testDir: "e2e",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI
    ? [["list"], ["html", { open: "never" }]]
    : [["list"]],
  use: { trace: "retain-on-failure" },
  // Performance runs alone (pnpm perf): parallel tests skew frame timing.
  grepInvert: process.env.PERF ? undefined : /@perf/,
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "webkit", use: { ...devices["Desktop Safari"] } },
    { name: "firefox", use: { ...devices["Desktop Firefox"] } },
  ],
  // The production build (dist) and the same build with the kitchen sink
  // (dist-ks). `pnpm e2e` builds both first.
  webServer: live
    ? undefined
    : [
        {
          command: "pnpm exec vite preview --port 4173 --strictPort",
          url: "http://localhost:4173/serving-explained/",
          reuseExistingServer: !process.env.CI,
        },
        {
          command:
            "pnpm exec vite preview --outDir dist-ks --port 4174 --strictPort",
          url: "http://localhost:4174/serving-explained/",
          reuseExistingServer: !process.env.CI,
        },
      ],
});
