/** Shared by the launch audit's `e2e/*.audit.ts` (docs/AUDIT.md). */
import { mkdirSync, writeFileSync } from "node:fs";
import { expect, type Page } from "@playwright/test";
import { routePath, routes } from "../src/routes.ts";
import { BASE } from "./helpers.ts";

/** Raw results land here; Playwright's outputDir is wiped each run. */
export const OUT = process.env.AUDIT_OUT ?? "test-results/audit-2";

/** Every route, plus the not-found page and an A/B sandbox. */
export const PAGES = [
  ...routes.map((r) => ({
    name: r.slug || "landing",
    url: BASE + routePath(r.slug).slice(1),
  })),
  { name: "not-found", url: `${BASE}no-such-page/` },
  { name: "sandbox-ab", url: `${BASE}sandbox/?v=1&a.sc=static&b.p=chatbot` },
];

export const THEMES = ["light", "dark"] as const;

/** Opens a page in a theme, waiting for its heading and any sandbox runs. */
export async function openPage(
  page: Page,
  url: string,
  theme: (typeof THEMES)[number] = "light",
) {
  await page.emulateMedia({ colorScheme: theme });
  await page.addInitScript((t) => {
    localStorage.setItem("theme", t);
  }, theme);
  await page.goto(url);
  await expect(page.locator("h1").first()).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  const runs = page.locator("section.sb-run");
  const n = await runs.count();
  if (n > 0)
    await expect(
      page.locator(
        'section.sb-run[data-status="done"], section.sb-run[data-status="error"]',
      ),
    ).toHaveCount(n, { timeout: 60_000 });
}

/** Writes one result file: `<OUT>/<area>/<name>.json`. */
export function save(area: string, name: string, data: unknown) {
  mkdirSync(`${OUT}/${area}`, { recursive: true });
  writeFileSync(`${OUT}/${area}/${name}.json`, JSON.stringify(data, null, 2));
}
