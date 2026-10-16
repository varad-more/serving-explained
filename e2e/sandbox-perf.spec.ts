/**
 * The sandbox's 16 ms rule (tasks/todo.md, Prompt 7, "Architecture"), in
 * Chromium: during a 5,000-request run, arrow keys move the playhead every
 * 100 ms. Pass: Event Timing input delay at most 16 ms and no rAF interval
 * over 34 ms, from the first render until the run is done. Also reported at
 * 4× CPU throttling.
 */
import { writeFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { open } from "./sandbox.ts";

test.use({ trace: "on" });

const pct = (sorted: number[], p: number) =>
  sorted[Math.max(0, Math.ceil(p * sorted.length) - 1)] ?? 0;

test.describe("sandbox: performance", () => {
  for (const throttle of [1, 4]) {
    test(`a 5,000-request run stays responsive, CPU ${String(throttle)}× @perf`, async ({
      page,
      browserName,
    }, info) => {
      test.skip(browserName !== "chromium", "CDP throttling is Chromium only");
      test.setTimeout(180_000);
      await page.addInitScript(() => {
        const w = window as unknown as {
          inputs: { delay: number; duration: number; name: string }[];
          frames: number[];
          recording: boolean;
        };
        w.inputs = [];
        w.frames = [];
        w.recording = false;
        new PerformanceObserver((list) => {
          for (const e of list.getEntries() as PerformanceEventTiming[])
            w.inputs.push({
              delay: e.processingStart - e.startTime,
              duration: e.duration,
              name: e.name,
            });
        }).observe({
          type: "event",
          buffered: true,
          durationThreshold: 16,
        } as PerformanceObserverInit);
        let last = 0;
        const tick = (now: number) => {
          if (w.recording) {
            if (last > 0) w.frames.push(now - last);
            last = now;
          } else last = 0;
          requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      });
      const cdp = await page.context().newCDPSession(page);
      await cdp.send("Emulation.setCPUThrottlingRate", { rate: throttle });
      // The page's chunk loads before recording starts (the plan excludes it).
      await open(page, 1440, "v=1&a.n=5000");
      await page.evaluate(() => {
        (window as unknown as { recording: boolean }).recording = true;
      });
      const scrub = page.getByLabel("Playhead");
      await scrub.focus();
      const run = page.locator("section.sb-run");
      const t0 = Date.now();
      let presses = 0;
      while ((await run.getAttribute("data-status")) !== "done") {
        await page.keyboard.press("ArrowRight");
        presses++;
        await page.waitForTimeout(100);
        expect(Date.now() - t0).toBeLessThan(150_000);
      }
      // A few more presses after the results land, while the views redraw.
      for (let i = 0; i < 5; i++) {
        await page.keyboard.press("ArrowRight");
        await page.waitForTimeout(100);
      }
      const { inputs, frames } = await page.evaluate(() => {
        const w = window as unknown as {
          inputs: { delay: number; duration: number }[];
          frames: number[];
        };
        return { inputs: w.inputs, frames: w.frames };
      });
      const sorted = [...frames].sort((a, b) => a - b);
      const report = {
        throttle,
        presses,
        runMs: Date.now() - t0,
        inputsOver16msDuration: inputs.length,
        maxInputDelay: Math.max(0, ...inputs.map((i) => i.delay)),
        frames: frames.length,
        frameP50: pct(sorted, 0.5),
        frameP95: pct(sorted, 0.95),
        frameMax: sorted.at(-1) ?? 0,
      };
      console.log("sandbox perf", JSON.stringify(report));
      writeFileSync(
        info.outputPath("perf.json"),
        JSON.stringify(report, null, 2),
      );
      if (throttle === 1) {
        expect(report.maxInputDelay).toBeLessThanOrEqual(16);
        expect(report.frameMax).toBeLessThanOrEqual(34);
      }
    });
  }
});
