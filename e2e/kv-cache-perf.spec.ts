/**
 * Chapter 1 performance (CHAPTER_DOD items 15–16), Chromium only, with and
 * without 4× CPU throttling. Each run keeps a Playwright trace and a Chromium
 * performance trace under test-results/.
 */
import { writeFileSync } from "node:fs";
import { expect, test, type Page, type TestInfo } from "@playwright/test";
import { driveBudget, figure, open } from "./kv-cache.ts";

test.use({ trace: "on" });

interface Perf {
  throttle: number;
  eventEntries: number;
  eventMax: number;
  eventP95: number;
  frames: number;
  frameP50: number;
  frameP95: number;
  frameMax: number;
}

const pct = (sorted: number[], p: number) =>
  sorted[Math.max(0, Math.ceil(p * sorted.length) - 1)] ?? 0;

/** Items 15–16 in Chromium, with a Playwright and a Chromium trace each. */
async function measure(
  page: Page,
  throttle: number,
  browserName: string,
  info: TestInfo,
): Promise<Perf> {
  const browser = page.context().browser();
  if (!browser) throw new Error("no browser");
  await page.addInitScript(() => {
    const w = window as unknown as { events: number[] };
    w.events = [];
    new PerformanceObserver((list) => {
      for (const e of list.getEntries()) w.events.push(e.duration);
    }).observe({
      type: "event",
      buffered: true,
      durationThreshold: 16,
    } as PerformanceObserverInit);
  });
  await open(page);
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: throttle });
  await browser.startTracing(page, {
    path: info.outputPath(`chrome-trace-${String(throttle)}x.json`),
    screenshots: true,
  });

  await driveBudget(page, browserName);

  // 5 s of TokenGrid playback at 1×; restart it when it reaches the end.
  const fig = figure(page, "1.1");
  await fig.scrollIntoViewIfNeeded();
  const frames = page.evaluate(
    () =>
      new Promise<number[]>((resolve) => {
        const out: number[] = [];
        const start = performance.now();
        let last = start;
        const tick = (now: number) => {
          out.push(now - last);
          last = now;
          if (now - start < 5000) requestAnimationFrame(tick);
          else resolve(out.slice(1));
        };
        requestAnimationFrame(tick);
      }),
  );
  const play = fig.getByRole("button", { name: "Play" });
  const scrub = fig.getByLabel("Playhead");
  const t0 = Date.now();
  while (Date.now() - t0 < 4800) {
    if (await play.isEnabled()) await play.click();
    else if (await fig.getByRole("button", { name: "Step" }).isDisabled()) {
      await scrub.focus();
      await page.keyboard.press("Home");
    }
    await page.waitForTimeout(100);
  }
  const intervals = (await frames).sort((a, b) => a - b);

  await browser.stopTracing();
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 1 });

  const events = await page.evaluate(
    () => (window as unknown as { events: number[] }).events,
  );
  // Event Timing reports only events of 16 ms or more, so this p95 is over
  // those entries: an upper bound on the p95 over every event.
  const all = [...events].sort((a, b) => a - b);
  const perf: Perf = {
    throttle,
    eventEntries: events.length,
    eventMax: Math.max(0, ...events),
    eventP95: pct(all, 0.95),
    frames: intervals.length,
    frameP50: pct(intervals, 0.5),
    frameP95: pct(intervals, 0.95),
    frameMax: intervals.at(-1) ?? 0,
  };
  writeFileSync(
    info.outputPath(`perf-${String(throttle)}x.json`),
    JSON.stringify(perf, null, 2),
  );
  console.log(`kv-cache perf ${JSON.stringify(perf)}`);
  return perf;
}

test.describe("kv-cache: performance", () => {
  for (const throttle of [1, 4]) {
    test(`interactions and animation, CPU ${String(throttle)}× @perf`, async ({
      page,
      browserName,
    }, info) => {
      test.skip(browserName !== "chromium", "CDP throttling is Chromium only");
      test.setTimeout(90_000);
      const perf = await measure(page, throttle, browserName, info);
      expect(perf.eventMax).toBeLessThanOrEqual(100);
      expect(perf.frameP95).toBeLessThanOrEqual(18);
      expect(perf.frameMax).toBeLessThanOrEqual(50);
    });
  }
});
