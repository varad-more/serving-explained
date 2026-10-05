/**
 * Chapter 1's page helpers and its memory-budget interaction script, shared
 * by kv-cache.spec.ts and kv-cache-perf.spec.ts.
 */
import { expect, type Page } from "@playwright/test";
import {
  maxConcurrency,
  type KvDtype,
} from "../src/chapters/kv-cache/budget.ts";
import { gpu, model } from "../src/chapters/kv-cache/data.ts";
import { MEMORY_BUDGET_DEFAULTS as D } from "../src/chapters/kv-cache/presets.ts";
import { BASE, expectFocusRing, figure, tabTo } from "./helpers.ts";

const URL = `${BASE}kv-cache/`;

/** Max concurrency on the default GPU, from the chapter's own math. */
export const mc = (
  context: number,
  dtype: KvDtype = "bf16",
  slug: string = D.model,
) => maxConcurrency(gpu(D.gpu), model(slug), dtype, context);

export async function open(page: Page, width = 768) {
  await page.setViewportSize({ width, height: 900 });
  await page.goto(URL);
  await expect(
    page.getByRole("heading", { level: 1, name: "The KV cache" }),
  ).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
}

/**
 * The memory budget's interaction script: concurrency past the limit, context
 * up, fp8, a model whose max context clamps, and the chart from the keyboard.
 */
export async function driveBudget(page: Page, browserName: string) {
  const press = (key: string) => page.keyboard.press(key);
  const fig = figure(page, "1.5");
  const heading = fig.locator(".budget__heading");
  const readout = fig.locator(".budget__readout");
  await expect(heading).toHaveText(/^Fits: uses /);
  await expect(readout).toContainText(
    `Max concurrency at 8,192 tokens: ${String(mc(8192))}`,
  );

  // Concurrency 4 → 6 → 8: it no longer fits.
  await tabTo(page, fig.getByLabel("Requests at once"), browserName);
  await expectFocusRing(page);
  await press("ArrowRight");
  await press("ArrowRight");
  await expect(fig.locator(".slider__output").nth(1)).toHaveText("8 requests");
  await expect(heading).toHaveText(
    /^Does not fit: needs 22\.96 GiB of 22\.50 GiB\./,
  );

  // Context 8K → 12K → 16K: the readout follows.
  await tabTo(page, fig.getByLabel("Context length"), browserName);
  await expectFocusRing(page);
  await press("ArrowRight");
  await press("ArrowRight");
  await expect(readout).toContainText(
    `Max concurrency at 16,384 tokens: ${String(mc(16384))}`,
  );

  // fp8 doubles it, give or take one.
  await tabTo(page, fig.getByLabel("bf16, 2 bytes"), browserName);
  await expectFocusRing(page);
  await press("ArrowDown");
  await expect(fig.getByLabel("fp8, 1 byte")).toBeChecked();
  const fp8 = mc(16384, "fp8");
  expect([2 * mc(16384), 2 * mc(16384) + 1]).toContain(fp8);
  await expect(readout).toContainText(
    `Max concurrency at 16,384 tokens: ${String(fp8)}`,
  );

  // Context to the end (128K), then a model whose max is 32K: it clamps.
  await tabTo(page, fig.getByLabel("Context length"), browserName);
  await press("End");
  await expect(fig.locator(".slider__output").first()).toHaveText(
    "128K tokens",
  );
  const picker = fig.getByLabel("Model");
  await tabTo(page, picker, browserName);
  await expectFocusRing(page);
  await picker.selectOption("qwen2.5-7b");
  await expect(fig.locator(".budget__notice")).toHaveText(
    "Context set to 32K tokens: Qwen2.5-7B supports at most 32K.",
  );
  await expect(readout).toContainText(
    `Max concurrency at 32,768 tokens: ${String(mc(32768, "fp8", "qwen2.5-7b"))}`,
  );

  // The chart: focus reads the current point; arrows move along the curve.
  const chart = fig.locator(".chart__svg");
  await tabTo(page, chart, browserName);
  await expectFocusRing(page);
  await expect(fig.locator(".chart__tip")).toHaveText(
    `32K tokens: ${String(mc(32768, "fp8", "qwen2.5-7b"))} requests`,
  );
  await press("ArrowLeft");
  await expect(fig.locator(".chart__tip")).toHaveText(
    `24K tokens: ${String(mc(24576, "fp8", "qwen2.5-7b"))} requests`,
  );

  // The table view.
  const summary = fig.getByText("Show the numbers as a table");
  await tabTo(page, summary, browserName);
  await expectFocusRing(page);
  await press("Enter");
  await expect(fig.locator("table")).toBeVisible();
  await expect(fig.locator("tbody tr").last()).toHaveText(/^32,768\d+$/);
}
