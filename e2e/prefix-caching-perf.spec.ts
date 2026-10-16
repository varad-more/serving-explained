/**
 * Chapter 4 performance (CHAPTER_DOD items 15–16), Chromium only, with and
 * without 4× CPU throttling: Event Timing over control changes, which re-run
 * both sims, then rAF intervals while Figure 4.6 plays caching off vs. on at
 * block size 8, the most cells. Each run keeps a Playwright and a Chromium
 * trace.
 */
import { expect, test } from "@playwright/test";
import { figure, tabTo } from "./helpers.ts";
import { driveGrid, open, seek } from "./prefix-caching.ts";
import { measure } from "./perf.ts";

test.use({ trace: "on" });

test.describe("prefix-caching: performance", () => {
  for (const throttle of [1, 4]) {
    test(`controls and compare playback, CPU ${String(throttle)}× @perf`, async ({
      page,
      browserName,
    }, info) => {
      test.skip(browserName !== "chromium", "CDP throttling is Chromium only");
      test.setTimeout(120_000);
      const fig = figure(page, "4.6");
      const perf = await measure(page, throttle, info, "prefix-caching", {
        open: () => open(page),
        drive: async () => {
          await driveGrid(page, browserName);
          await tabTo(page, fig.getByLabel("Block size"), browserName);
          await page.keyboard.press("Home");
          await expect(fig.locator(".slider__output").nth(4)).toHaveText(
            "8 tokens",
          );
          await seek(fig, 0);
          await fig.scrollIntoViewIfNeeded();
          await fig.getByLabel("Speed").selectOption("4");
        },
        keepPlaying: async () => {
          const play = fig.getByRole("button", { name: "Play" });
          if (await play.isEnabled()) await play.click();
        },
      });
      expect(perf.eventMax).toBeLessThanOrEqual(100);
      expect(perf.frameP95).toBeLessThanOrEqual(18);
      expect(perf.frameMax).toBeLessThanOrEqual(50);
    });
  }
});
