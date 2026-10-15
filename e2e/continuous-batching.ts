/**
 * Chapter 3's page helpers and its interaction script, shared by
 * continuous-batching.spec.ts and continuous-batching-perf.spec.ts.
 */
import { expect, type Locator, type Page } from "@playwright/test";
import { secs } from "../src/chapters/continuous-batching/charts.tsx";
import {
  BASICS,
  BASICS_STATIC,
  STALL,
  STALL_OFF,
  type PresetKey,
  type RunOptions,
} from "../src/chapters/continuous-batching/presets.ts";
import {
  readoutAt,
  runTimeline,
} from "../src/chapters/continuous-batching/timeline.ts";
import { BASE, expectFocusRing, figure, tabTo } from "./helpers.ts";

const URL = `${BASE}continuous-batching/`;

export async function open(page: Page, width = 768) {
  await page.setViewportSize({ width, height: 900 });
  await page.goto(URL);
  await expect(
    page.getByRole("heading", { level: 1, name: "Continuous batching" }),
  ).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
}

/**
 * Sets a figure's playhead as a scrub would, and returns the time the range
 * input settled on (it snaps to its step). Test setup only.
 */
export async function seek(fig: Locator, t: number): Promise<number> {
  return fig.getByLabel("Playhead").evaluate((el, v) => {
    const input = el as HTMLInputElement;
    // React tracks .value itself; only the native setter makes it see the
    // change. `call` passes `this` explicitly.
    // eslint-disable-next-line @typescript-eslint/unbound-method
    const set = Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value",
    )?.set;
    set?.call(input, String(v));
    input.dispatchEvent(new Event("input", { bubbles: true }));
    return Number(input.value);
  }, t);
}

/** A run's readout row: "So far" (0) or "At the end" (1). */
export const readoutRow = (fig: Locator, run: string, row: 0 | 1) =>
  fig
    .getByRole("group", { name: run, exact: true })
    .locator(".cb__readout tbody tr")
    .nth(row);

/** The end-of-run readouts a run should show, from the chapter's own runs. */
export function endOf(preset: PresetKey, o: RunOptions) {
  const tl = runTimeline(preset, o);
  const r = readoutAt(tl, tl.duration);
  return {
    ttftMean: secs(r.ttftMean),
    itlP99: secs(r.itlP99),
  };
}

/**
 * The timeline script: Step in Figure 3.2, static → continuous, then in
 * Figure 3.5 chunked prefill on and the budget down a stop. Each control
 * re-runs the sim.
 */
export async function driveTimeline(page: Page, browserName: string) {
  const fig = figure(page, "3.2");
  await seek(fig, 15);
  const time = fig.locator(".playback output");
  const before = await time.textContent();
  await tabTo(page, fig.getByRole("button", { name: "Step" }), browserName);
  await expectFocusRing(page);
  await page.keyboard.press("Enter");
  await expect(time).not.toHaveText(before ?? "");

  // Static → continuous: the mean TTFT readout changes.
  await expect(readoutRow(fig, "Static", 1)).toContainText(
    endOf("batching-basics", BASICS_STATIC).ttftMean,
  );
  const continuous = fig.getByLabel("Continuous (per step)");
  await tabTo(page, fig.getByLabel("Static (per batch)"), browserName);
  await expectFocusRing(page);
  await page.keyboard.press("ArrowDown");
  await expect(continuous).toBeChecked();
  await expect(readoutRow(fig, "Continuous", 1)).toContainText(
    endOf("batching-basics", BASICS).ttftMean,
  );

  // Chunked prefill on: p99 ITL changes; then the budget slider changes it.
  const stall = figure(page, "3.5");
  await expect(readoutRow(stall, "Chunking off", 1)).toContainText(
    endOf("long-prompt-stall", STALL_OFF).itlP99,
  );
  const toggle = stall.getByRole("switch", { name: "Chunked prefill" });
  await tabTo(page, toggle, browserName);
  await expectFocusRing(page);
  await page.keyboard.press("Space");
  await expect(readoutRow(stall, "Chunking on", 1)).toContainText(
    endOf("long-prompt-stall", STALL).itlP99,
  );
  const budget = stall.getByLabel("Token budget (max_num_batched_tokens)");
  await tabTo(page, budget, browserName);
  await page.keyboard.press("ArrowLeft");
  await expect(stall.locator(".slider__output").first()).toHaveText(
    "1,024 tokens",
  );
  const smaller = endOf("long-prompt-stall", { ...STALL, budget: 1024 });
  expect(smaller.itlP99).not.toBe(endOf("long-prompt-stall", STALL).itlP99);
  await expect(readoutRow(stall, "Chunking on", 1)).toContainText(
    smaller.itlP99,
  );
}
