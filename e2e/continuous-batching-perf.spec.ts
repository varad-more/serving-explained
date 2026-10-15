/**
 * Chapter 3 performance (CHAPTER_DOD items 15–16), Chromium only, with and
 * without 4× CPU throttling: Event Timing over control changes, which re-run
 * the sims, then rAF intervals while Figure 3.6 compares chunking off and on.
 * Each run keeps a Playwright and a Chromium trace.
 */
import { expect, test } from "@playwright/test";
import { figure } from "./helpers.ts";
import { driveTimeline, open, seek } from "./continuous-batching.ts";
import { measure } from "./perf.ts";

test.use({ trace: "on" });

test.describe("continuous-batching: performance", () => {
  for (const throttle of [1, 4]) {
    test(`controls and compare playback, CPU ${String(throttle)}× @perf`, async ({
      page,
      browserName,
    }, info) => {
      test.skip(browserName !== "chromium", "CDP throttling is Chromium only");
      test.setTimeout(120_000);
      const fig = figure(page, "3.6");
      const perf = await measure(page, throttle, info, "continuous-batching", {
        open: () => open(page),
        drive: async () => {
          await driveTimeline(page, browserName);
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
