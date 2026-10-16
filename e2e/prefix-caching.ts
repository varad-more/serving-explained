/**
 * Chapter 4's page helpers and its interaction script, shared by
 * prefix-caching.spec.ts and prefix-caching-perf.spec.ts.
 */
import { expect, type Locator, type Page } from "@playwright/test";
import { cacheRun } from "../src/chapters/prefix-caching/CacheFigure.tsx";
import { frameAt } from "../src/chapters/prefix-caching/cacheFrames.ts";
import {
  PRESSURE,
  SHARED,
  type CacheOptions,
  type PresetKey,
} from "../src/chapters/prefix-caching/presets.ts";
import { BASE, expectFocusRing, figure, tabTo } from "./helpers.ts";

const URL = `${BASE}prefix-caching/`;

export async function open(page: Page, width = 768) {
  await page.setViewportSize({ width, height: 900 });
  await page.goto(URL);
  await expect(
    page.getByRole("heading", { level: 1, name: "Prefix caching" }),
  ).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
}

/** Sets a figure's playhead as a scrub would; returns where it settled. */
export async function seek(fig: Locator, t: number): Promise<number> {
  return fig.getByLabel("Playhead").evaluate((el, v) => {
    const input = el as HTMLInputElement;
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

/** What a run's readout should say at t, from the chapter's own runs. */
export function expected(preset: PresetKey, o: CacheOptions, t: number) {
  const f = frameAt(cacheRun(preset, o).frames, t);
  const rate = f && f.queryTokens > 0 ? f.hitTokens / f.queryTokens : 0;
  return {
    hitRate: `${(100 * rate).toFixed(0)}%`,
    evictions: (f?.evictions ?? 0).toLocaleString("en-US"),
  };
}

export const readout = (fig: Locator, name: string) =>
  fig.getByRole("group", { name, exact: true }).locator(".paged__readout");

/**
 * The grid script: in Figure 4.3, Step, then caching off and on; in Figure
 * 4.5, capacity up a stop. Each control re-runs both sims.
 */
export async function driveGrid(page: Page, browserName: string) {
  const fig = figure(page, "4.3");
  const t = await seek(fig, 10);
  const on = expected("shared-system-prompt", SHARED, t);
  expect(on.hitRate).not.toBe("0%");
  await expect(readout(fig, "Caching on")).toContainText(
    `Hit rate${on.hitRate}`,
  );

  const time = fig.locator(".playback output");
  const before = await time.textContent();
  await tabTo(page, fig.getByRole("button", { name: "Step" }), browserName);
  await expectFocusRing(page);
  await page.keyboard.press("Enter");
  await expect(time).not.toHaveText(before ?? "");

  await seek(fig, t);
  const toggle = fig.getByRole("switch", { name: "Prefix caching" });
  await tabTo(page, toggle, browserName);
  await expectFocusRing(page);
  await page.keyboard.press("Space");
  await expect(readout(fig, "Caching off")).toContainText("Hit rate0%");
  await page.keyboard.press("Space");
  await expect(readout(fig, "Caching on")).toContainText(
    `Hit rate${on.hitRate}`,
  );

  const pressure = figure(page, "4.5");
  const tp = await seek(pressure, 20);
  const small = expected("cache-pressure", PRESSURE, tp);
  await expect(readout(pressure, "Caching on")).toContainText(
    `Evictions${small.evictions}`,
  );
  const capacity = pressure.getByLabel("KV capacity");
  await tabTo(page, capacity, browserName);
  await page.keyboard.press("ArrowRight");
  await expect(pressure.locator(".slider__output").nth(3)).toHaveText(
    "192 blocks (3,072 tokens)",
  );
  const bigger = expected(
    "cache-pressure",
    { ...PRESSURE, capacity: 3072 },
    tp,
  );
  expect(bigger.evictions).not.toBe(small.evictions);
  await expect(readout(pressure, "Caching on")).toContainText(
    `Evictions${bigger.evictions}`,
  );
}
