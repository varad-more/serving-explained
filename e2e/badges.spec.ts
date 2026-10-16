/**
 * A provenance badge's meaning is reachable without hover (AUDIT.md B1): on
 * keyboard focus, on tap, and in one visible legend on every page with badges.
 */
import { expect, test, type Locator, type Page } from "@playwright/test";
import { MEANING } from "../src/viz/ui/ProvenanceBadge.tsx";
import { BASE, expectFocusRing, horizontalOverflow, tabTo } from "./helpers.ts";

const PAGES = [
  "kv-cache",
  "paged-attention",
  "continuous-batching",
  "prefix-caching",
  "sandbox",
];

/** The note a badge opens, found through its aria-describedby. */
async function noteOf(page: Page, badge: Locator) {
  const id = await badge.getAttribute("aria-describedby");
  expect(id).toBeTruthy();
  return page.locator(`[id="${String(id)}"]`);
}

test.describe("badges: legend", () => {
  for (const slug of PAGES) {
    test(`${slug} shows one legend with all three meanings`, async ({
      page,
    }) => {
      await page.goto(BASE + slug + "/");
      const legend = page.locator(".badge-legend");
      await expect(legend).toHaveCount(1);
      await expect(legend).toBeVisible();
      for (const text of Object.values(MEANING))
        await expect(legend).toContainText(text);
    });
  }
});

test.describe("badges: keyboard", () => {
  test("focus opens a simulated badge's meaning; Escape closes it", async ({
    page,
    browserName,
  }) => {
    await page.goto(BASE + "kv-cache/");
    const badge = page.locator("button.badge--simulated").first();
    await tabTo(page, badge, browserName);
    await expectFocusRing(page);
    const note = await noteOf(page, badge);
    await expect(note).toBeVisible();
    await expect(note).toContainText(MEANING.simulated);
    await page.keyboard.press("Escape");
    await expect(note).toBeHidden();
  });

  test("focus opens a measured badge's meaning", async ({
    page,
    browserName,
  }) => {
    await page.goto(BASE + "continuous-batching/");
    const badge = page.locator("a.badge--measured").first();
    await tabTo(page, badge, browserName);
    const note = await noteOf(page, badge);
    await expect(note).toBeVisible();
    await expect(note).toContainText(MEANING.measured);
  });

  test("moving focus on closes the note", async ({ page, browserName }) => {
    await page.goto(BASE + "kv-cache/");
    const badges = page.locator("button.badge");
    await tabTo(page, badges.first(), browserName);
    const first = await noteOf(page, badges.first());
    await expect(first).toBeVisible();
    await tabTo(page, badges.nth(1), browserName);
    await expect(first).toBeHidden();
    await expect(await noteOf(page, badges.nth(1))).toBeVisible();
  });
});

test.describe("badges: touch", () => {
  test.use({ hasTouch: true, viewport: { width: 375, height: 800 } });

  for (const slug of ["kv-cache", "sandbox"]) {
    test(`${slug}: a tap opens the meaning on screen; a tap elsewhere closes it`, async ({
      page,
    }) => {
      await page.goto(BASE + slug + "/");
      const badge = page.locator("button.badge").first();
      await badge.tap();
      const note = await noteOf(page, badge);
      await expect(note).toBeVisible();
      const kind = (await badge.textContent()) as keyof typeof MEANING;
      await expect(note).toContainText(MEANING[kind]);
      const box = await note.boundingBox();
      expect(box).not.toBeNull();
      expect(box?.x ?? -1).toBeGreaterThanOrEqual(0);
      expect((box?.x ?? 0) + (box?.width ?? 0)).toBeLessThanOrEqual(375);
      expect(await horizontalOverflow(page)).toBe(0);

      await page.locator("h1").tap();
      await expect(note).toBeHidden();
    });
  }

  test("a badge at the right edge keeps its note on screen", async ({
    page,
  }) => {
    await page.goto(BASE + "kv-cache/");
    // The visible badge that sits furthest right.
    const index = await page.evaluate(() => {
      let best = 0;
      let right = 0;
      document.querySelectorAll("button.badge").forEach((el, i) => {
        const r = el.getBoundingClientRect();
        if (r.width > 0 && r.right > right) [best, right] = [i, r.right];
      });
      return best;
    });
    const badge = page.locator("button.badge").nth(index);
    await badge.tap();
    const box = await (await noteOf(page, badge)).boundingBox();
    expect(box).not.toBeNull();
    expect((box?.x ?? 0) + (box?.width ?? 0)).toBeLessThanOrEqual(375);
    expect(await horizontalOverflow(page)).toBe(0);
  });
});
