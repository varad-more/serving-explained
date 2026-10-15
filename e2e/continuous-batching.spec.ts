/**
 * Chapter 3 (CHAPTER_DOD items 7–18): one interaction test per widget in
 * every browser, keyboard and touch, sizes and themes, layout shift, console
 * errors, axe, reduced motion, and screenshots. Performance is in
 * continuous-batching-perf.spec.ts.
 */
import { expect, test } from "@playwright/test";
import { budgetSweep } from "../src/chapters/continuous-batching/BudgetSweep.tsx";
import { secs } from "../src/chapters/continuous-batching/charts.tsx";
import { phaseSteps } from "../src/chapters/continuous-batching/stats.ts";
import {
  axeViolations,
  clippedSvgText,
  expectFocusRing,
  figure,
  horizontalOverflow,
  shifts,
  smallTargets,
  tabTo,
  watchErrors,
  watchShifts,
} from "./helpers.ts";
import { driveTimeline, open, seek } from "./continuous-batching.ts";

const WIDTHS = [375, 768, 1440] as const;

test.describe("continuous-batching: widgets", () => {
  test("timeline: Step, the scheduler, chunked prefill, and the budget change the readouts", async ({
    page,
    browserName,
  }) => {
    const errors = watchErrors(page);
    await watchShifts(page);
    await open(page);
    await driveTimeline(page, browserName);
    expect(await shifts(page)).toEqual([]);
    expect(errors).toEqual([]);
  });

  test("phase bars: changing the GPU changes the step times", async ({
    page,
    browserName,
  }) => {
    const errors = watchErrors(page);
    await open(page);
    const fig = figure(page, "3.1");
    const prefill = fig.locator(".phase__svg").first();
    const a10g = phaseSteps("llama-3.1-8b", "a10g-24");
    const h100 = phaseSteps("llama-3.1-8b", "h100-sxm-80");
    if (!a10g || !h100) throw new Error("step 1's pairs do not fit");
    await expect(prefill).toHaveAttribute(
      "aria-label",
      new RegExp(`Compute time ${secs(a10g.prefill.computeS)}`),
    );
    const gpu = fig.getByLabel("GPU");
    await tabTo(page, gpu, browserName);
    await expectFocusRing(page);
    await gpu.selectOption("h100-sxm-80");
    await expect(prefill).toHaveAttribute(
      "aria-label",
      new RegExp(`Compute time ${secs(h100.prefill.computeS)}`),
    );
    expect(secs(h100.prefill.computeS)).not.toBe(secs(a10g.prefill.computeS));
    expect(errors).toEqual([]);
  });

  test("budget sweep: the current marker moves with the budget", async ({
    page,
    browserName,
  }) => {
    await open(page);
    const fig = figure(page, "3.7");
    const marker = fig.locator(".sweep__current text").first();
    const at = (b: number) =>
      budgetSweep()
        .find((d) => d.budget === b)
        ?.throughput.toFixed(1) ?? "";
    await expect(marker).toHaveText(at(2048));
    await tabTo(page, fig.getByLabel(/^Token budget/), browserName);
    await expectFocusRing(page);
    await page.keyboard.press("ArrowRight");
    await expect(marker).toHaveText(at(4096));
    await page.keyboard.press("Home");
    await expect(marker).toHaveText(at(64));
  });

  test("histogram: arrows move between bars and runs, and the readout says what each holds", async ({
    page,
    browserName,
  }) => {
    await open(page);
    const fig = figure(page, "3.3");
    await seek(fig, 30);
    const chart = fig.getByRole("group", {
      name: /^Time to first token \(TTFT\), log scale\./,
    });
    await tabTo(page, chart, browserName);
    await expectFocusRing(page);
    await page.keyboard.press("ArrowRight");
    const readout = chart.locator("xpath=..").locator(".cb-chart__readout");
    await expect(readout).toHaveText(
      /^Static, \d+ ms to \d+ ms: \d+ requests\.$/,
    );
    await page.keyboard.press("ArrowDown");
    await expect(readout).toHaveText(/^Continuous, /);
  });

  test("queue chart: arrows move a cursor and read out both runs", async ({
    page,
    browserName,
  }) => {
    await open(page);
    const fig = figure(page, "3.3");
    await seek(fig, 20);
    const chart = fig.getByRole("group", { name: /^Queue chart\./ });
    await tabTo(page, chart, browserName);
    await page.keyboard.press("End");
    await expect(
      chart.locator("xpath=..").locator(".cb-chart__readout"),
    ).toHaveText(/^At \d+ s: Static \d+, Continuous \d+ waiting\.$/);
  });

  test("reduced motion: no autoplay, and Step reaches every step end", async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await open(page);
    const fig = figure(page, "3.3");
    await expect(fig.getByRole("button", { name: "Play" })).toBeDisabled();
    const time = fig.locator(".playback output");
    for (let i = 0; i < 3; i++) {
      const before = await time.textContent();
      await fig.getByRole("button", { name: "Step" }).click();
      await expect(time).not.toHaveText(before ?? "");
    }
  });

  test("the wide layout shows each step's figure as the reader scrolls", async ({
    page,
  }) => {
    await open(page, 1440);
    const board = page.locator(".chapter__figure");
    // Steps 6–7 share Figure 3.6, and steps 8–9 share Figure 3.7.
    const figures = [
      "3.1",
      "3.2",
      "3.3",
      "3.4",
      "3.5",
      "3.6",
      "3.6",
      "3.7",
      "3.7",
    ];
    for (const [i, n] of figures.entries()) {
      await page
        .locator(`.step[data-step="${String(i + 1)}"]`)
        .evaluate((el) => {
          el.scrollIntoView({ block: "center" });
        });
      await expect(board.locator(".figure__number")).toHaveText(`Fig. ${n}`);
    }
  });
});

test.describe("continuous-batching: sizes", () => {
  for (const width of WIDTHS) {
    test(`no horizontal scroll or clipped SVG text at ${String(width)} px`, async ({
      page,
    }) => {
      await open(page, width);
      for (const fig of await page.locator(".figure:has(.cb-lanes)").all())
        await seek(fig, 15);
      expect(await horizontalOverflow(page)).toBe(0);
      expect(await clippedSvgText(page)).toEqual([]);
    });
  }

  for (const width of [375, 768]) {
    test(`every control is at least 44 × 44 px at ${String(width)} px`, async ({
      page,
    }) => {
      await open(page, width);
      expect(await smallTargets(page)).toEqual([]);
    });
  }
});

test.describe("continuous-batching: accessibility", () => {
  for (const [width, colorScheme] of [
    [768, "light"],
    [768, "dark"],
    [1440, "light"],
  ] as const) {
    test(`axe finds no violations at ${String(width)} px, ${colorScheme}`, async ({
      page,
    }) => {
      await page.emulateMedia({ colorScheme });
      await open(page, width);
      expect(await axeViolations(page)).toEqual([]);
    });
  }
});

test.describe("continuous-batching: screenshots @screenshot", () => {
  for (const width of WIDTHS) {
    for (const colorScheme of ["light", "dark"] as const) {
      test(`${String(width)} px, ${colorScheme} @screenshot`, async ({
        page,
        browserName,
      }) => {
        test.skip(
          browserName !== "chromium",
          "pixel baselines are Chromium only (CHAPTER_DOD item 17)",
        );
        await page.emulateMedia({ colorScheme });
        await open(page, width);
        // Every timeline on the page, paused at t = 15 s.
        for (const fig of await page.locator(".figure:has(.cb-lanes)").all())
          await seek(fig, 15);
        // The page is a fractional number of pixels tall, and a full-page
        // capture rounds that differently between loads: 1 px taller or
        // shorter on Linux. Pin it to a whole pixel first.
        await page.evaluate(() => {
          const h = document.documentElement.getBoundingClientRect().height;
          document.documentElement.style.minHeight = `${String(Math.ceil(h))}px`;
        });
        await expect(page).toHaveScreenshot(
          `continuous-batching-${String(width)}-${colorScheme}.png`,
          { fullPage: true, animations: "disabled", caret: "hide" },
        );
      });
    }
  }
});
