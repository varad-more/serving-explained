/**
 * Chapter 1 performance (CHAPTER_DOD items 15–16), Chromium only, with and
 * without 4× CPU throttling. Each run keeps a Playwright trace and a Chromium
 * performance trace under test-results/.
 */
import { expect, test } from "@playwright/test";
import { figure } from "./helpers.ts";
import { driveBudget, open } from "./kv-cache.ts";
import { measure } from "./perf.ts";

test.use({ trace: "on" });

test.describe("kv-cache: performance", () => {
  for (const throttle of [1, 4]) {
    test(`interactions and animation, CPU ${String(throttle)}× @perf`, async ({
      page,
      browserName,
    }, info) => {
      test.skip(browserName !== "chromium", "CDP throttling is Chromium only");
      test.setTimeout(90_000);
      const fig = figure(page, "1.1");
      const perf = await measure(page, throttle, info, "kv-cache", {
        open: () => open(page),
        drive: async () => {
          await driveBudget(page, browserName);
          await fig.scrollIntoViewIfNeeded();
        },
        // TokenGrid at 1×; when it ends, scrub back to the start and replay.
        keepPlaying: async () => {
          const play = fig.getByRole("button", { name: "Play" });
          if (await play.isEnabled()) await play.click();
          else if (
            await fig.getByRole("button", { name: "Step" }).isDisabled()
          ) {
            await fig.getByLabel("Playhead").focus();
            await page.keyboard.press("Home");
          }
        },
      });
      expect(perf.eventMax).toBeLessThanOrEqual(100);
      expect(perf.frameP95).toBeLessThanOrEqual(18);
      expect(perf.frameMax).toBeLessThanOrEqual(50);
    });
  }
});
