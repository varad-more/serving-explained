/**
 * CHAPTER_DOD items 15–16 in Chromium: Event Timing over a chapter's
 * interaction script, then rAF intervals over 5 s of its animation, with a
 * Chromium performance trace saved beside the test's Playwright trace.
 */
import { writeFileSync } from "node:fs";
import type { Page, TestInfo } from "@playwright/test";

export interface Perf {
  throttle: number;
  eventEntries: number;
  eventMax: number;
  eventP95: number;
  frames: number;
  frameP50: number;
  frameP95: number;
  frameMax: number;
}

export interface PerfScript {
  /** Opens the page; the Event Timing observer is already installed. */
  open: () => Promise<void>;
  /** The inputs Event Timing measures. */
  drive: () => Promise<void>;
  /** Starts the animation, or restarts it if it has ended. Called every 100 ms. */
  keepPlaying: () => Promise<void>;
}

const pct = (sorted: number[], p: number) =>
  sorted[Math.max(0, Math.ceil(p * sorted.length) - 1)] ?? 0;

export async function measure(
  page: Page,
  throttle: number,
  info: TestInfo,
  name: string,
  script: PerfScript,
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
  await script.open();
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: throttle });
  await browser.startTracing(page, {
    path: info.outputPath(`chrome-trace-${String(throttle)}x.json`),
    screenshots: true,
  });

  await script.drive();

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
  const t0 = Date.now();
  while (Date.now() - t0 < 4800) {
    await script.keepPlaying();
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
  console.log(`${name} perf ${JSON.stringify(perf)}`);
  return perf;
}
