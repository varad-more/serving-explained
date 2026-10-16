/**
 * The rendered text of every live route, for the correctness review
 * (docs/AUDIT.md §1). At 768 px every figure renders inline below its step,
 * so the text holds the prose, every figure's readouts, and their badges.
 * Writes test-results/audit/text/<slug>.txt.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { routePath, routes } from "../src/routes.ts";
import { BASE } from "./helpers.ts";

const OUT = "test-results/audit/text";

for (const route of routes) {
  test(`text of ${route.slug || "landing"}`, async ({ page, browserName }) => {
    test.skip(browserName !== "chromium", "one copy is enough");
    await page.setViewportSize({ width: 768, height: 1000 });
    await page.goto(BASE + routePath(route.slug).slice(1));
    await expect(page.locator("h1")).toBeVisible();
    if (route.slug === "sandbox")
      await expect(
        page.locator('section.sb-run[data-status="done"]'),
      ).toHaveCount(1, { timeout: 60_000 });
    for (const d of await page.locator("details").all())
      await d.evaluate((el) => {
        (el as HTMLDetailsElement).open = true;
      });
    const text = await page.locator("main").innerText();
    mkdirSync(OUT, { recursive: true });
    writeFileSync(`${OUT}/${route.slug || "index"}.txt`, text);
  });
}
