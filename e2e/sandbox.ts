/** The sandbox page's helpers, shared by sandbox.spec.ts and its perf spec. */
import { expect, type Page } from "@playwright/test";
import { BASE } from "./helpers.ts";

export const URL = `${BASE}sandbox/`;

export async function open(page: Page, width = 1440, query = "") {
  await page.setViewportSize({ width, height: 900 });
  await page.goto(`${URL}${query ? `?${query}` : ""}`);
  await expect(
    page.getByRole("heading", { level: 1, name: "Sandbox" }),
  ).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
}

/** Waits until every run on the page has finished. */
export async function waitDone(page: Page, runs = 1, timeout = 60_000) {
  await expect(page.locator('section.sb-run[data-status="done"]')).toHaveCount(
    runs,
    {
      timeout,
    },
  );
}

/** Sets the playhead as a scrub would, and waits for each run's frame. */
export async function seek(page: Page, t: number, runs = 1) {
  const value = await page
    .getByRole("slider", { name: "Playhead" })
    .evaluate((el, v) => {
      const input = el as HTMLInputElement;
      // eslint-disable-next-line @typescript-eslint/unbound-method
      const set = Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value",
      )?.set;
      set?.call(input, String(v));
      input.dispatchEvent(new Event("input", { bubbles: true }));
      return Number(input.value);
    }, t);
  await expect(
    page.locator(`.sb-grid[data-frame-t="${String(value)}"]`),
  ).toHaveCount(runs);
  return value;
}

/** The share link the page would copy. */
export const shareLink = (page: Page) =>
  page.getByRole("button", { name: "Copy link" }).getAttribute("data-link");
