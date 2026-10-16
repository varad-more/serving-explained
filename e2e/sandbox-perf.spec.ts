/**
 * The sandbox's 16 ms rule (tasks/todo.md, Prompt 7, "Architecture"), in
 * Chromium: during a 5,000-request run, arrow keys move the playhead every
 * 100 ms. Pass: Event Timing input delay at most 16 ms and no rAF interval
 * over 34 ms, from the first render until the run is done. Also reported at
 * 4× CPU throttling. A second test holds A/B to the same rule through 5 s of
 * playback (CHAPTER_DOD item 16) and a control change that reruns B.
 */
import { writeFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import { open, waitDone } from "./sandbox.ts";

interface Recorder {
  inputs: { delay: number; duration: number; name: string }[];
  frames: number[];
  recording: boolean;
}

/** Records Event Timing entries and rAF intervals while `recording` is set. */
async function instrument(page: Page) {
  await page.addInitScript(() => {
    const w = window as unknown as Recorder;
    w.inputs = [];
    w.frames = [];
    w.recording = false;
    new PerformanceObserver((list) => {
      if (!w.recording) return;
      for (const e of list.getEntries() as PerformanceEventTiming[])
        w.inputs.push({
          delay: e.processingStart - e.startTime,
          duration: e.duration,
          name: e.name,
        });
    }).observe({
      type: "event",
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
}

const record = (page: Page, on: boolean) =>
  page.evaluate((on) => {
    const w = window as unknown as Recorder;
    if (on) {
      w.inputs = [];
      w.frames = [];
    }
    w.recording = on;
  }, on);

async function stats(page: Page) {
  const { inputs, frames } = await page.evaluate(() => {
    const w = window as unknown as Recorder;
    return { inputs: w.inputs, frames: w.frames };
  });
  const sorted = [...frames].sort((a, b) => a - b);
  return {
    inputsOver16msDuration: inputs.length,
    maxInputDelay: Math.max(0, ...inputs.map((i) => i.delay)),
    frames: frames.length,
    frameP50: pct(sorted, 0.5),
    frameP95: pct(sorted, 0.95),
    frameMax: sorted.at(-1) ?? 0,
  };
}

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
      await instrument(page);
      const cdp = await page.context().newCDPSession(page);
      await cdp.send("Emulation.setCPUThrottlingRate", { rate: throttle });
      // The page's chunk loads before recording starts (the plan excludes it).
      await open(page, 1440, "v=1&a.n=5000");
      await record(page, true);
      const scrub = page.getByRole("slider", { name: "Playhead" });
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
      const report = {
        throttle,
        presses,
        runMs: Date.now() - t0,
        ...(await stats(page)),
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

  test("A/B: 5 s of playback and a control change stay smooth, CPU 1× @perf", async ({
    page,
    browserName,
  }, info) => {
    test.skip(browserName !== "chromium", "rAF timing is checked in Chromium");
    test.setTimeout(120_000);
    await instrument(page);
    await open(page, 1440, "v=1&a.p=chatbot&a.sc=static&b.p=chatbot");
    await waitDone(page, 2);

    await record(page, true);
    await page.getByRole("button", { name: "Play" }).click();
    await page.waitForTimeout(5_000);
    await page.getByRole("button", { name: "Pause" }).click();
    await record(page, false);
    const playback = await stats(page);

    await record(page, true);
    await page.getByRole("tab", { name: "B" }).click();
    await page.getByLabel("Scheduler", { exact: true }).selectOption("static");
    await waitDone(page, 2);
    await page.waitForTimeout(500);
    await record(page, false);
    const change = await stats(page);

    const report = { playback, change };
    console.log("sandbox A/B perf", JSON.stringify(report));
    writeFileSync(
      info.outputPath("perf.json"),
      JSON.stringify(report, null, 2),
    );
    // 5 s at 60 fps is about 300 frames; none may drop two in a row.
    expect(playback.frames).toBeGreaterThan(280);
    for (const r of [playback, change]) {
      expect(r.maxInputDelay).toBeLessThanOrEqual(16);
      expect(r.frameMax).toBeLessThanOrEqual(34);
    }
  });
});
