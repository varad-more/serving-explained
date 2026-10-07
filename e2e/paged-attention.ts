/**
 * Chapter 2's page helpers and its compare-widget interaction script, shared
 * by paged-attention.spec.ts and paged-attention-perf.spec.ts.
 */
import { expect, type Locator, type Page } from "@playwright/test";
import { frameAt } from "../src/chapters/paged-attention/frames.ts";
import {
  compareFrames,
  DEFAULTS,
  type Allocator,
  type CompareOptions,
} from "../src/chapters/paged-attention/presets.ts";
import { BASE, expectFocusRing, figure, tabTo } from "./helpers.ts";

const URL = `${BASE}paged-attention/`;

export async function open(page: Page, width = 768) {
  await page.setViewportSize({ width, height: 900 });
  await page.goto(URL);
  await expect(
    page.getByRole("heading", { level: 1, name: "Paged attention" }),
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

/** What a grid's readout should say at t, from the chapter's own runs. */
export function expected(
  allocator: Allocator,
  t: number,
  options: CompareOptions = DEFAULTS,
) {
  const f = frameAt(compareFrames(allocator, options), t);
  const kv = f?.kv;
  const waste = kv ? (kv.allocated - kv.tokens + kv.unusable) / kv.capacity : 0;
  return {
    running: f?.running ?? 0,
    waiting: f?.waiting ?? 0,
    waste: `${(100 * waste).toFixed(0)}%`,
  };
}

export const readout = (fig: Locator, name: "Contiguous" | "Paged") =>
  fig.getByRole("group", { name, exact: true }).locator(".paged__readout");

/**
 * The compare widget's script: Step, then block size 16 → 64, arrival rate,
 * output spread, and max_model_len 512 → 1024, each re-running both sims.
 */
export async function driveCompare(page: Page, browserName: string) {
  const fig = figure(page, "2.4");
  const t = await seek(fig, 12);
  const contiguous = readout(fig, "Contiguous");
  const paged = readout(fig, "Paged");
  await expect(paged).toContainText(
    `Running${String(expected("paged", t).running)}`,
  );

  // Step jumps to the next step end and changes the readouts.
  const time = fig.locator(".playback output");
  const before = await time.textContent();
  await tabTo(page, fig.getByRole("button", { name: "Step" }), browserName);
  await expectFocusRing(page);
  await page.keyboard.press("Enter");
  await expect(time).not.toHaveText(before ?? "");

  await seek(fig, t);
  // Block size 16 → 32 → 64: paged waste changes.
  const B64 = { ...DEFAULTS, blockSize: 64 };
  await tabTo(page, fig.getByLabel("Block size"), browserName);
  await expectFocusRing(page);
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("ArrowRight");
  await expect(fig.locator(".slider__output").first()).toHaveText("64 tokens");
  await expect(paged).toContainText(`Waste${expected("paged", t, B64).waste}`);
  expect(expected("paged", t, B64).waste).not.toBe(expected("paged", t).waste);

  // Arrival rate and output spread re-run both sims too.
  await tabTo(page, fig.getByLabel("Arrival rate"), browserName);
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("ArrowLeft");
  await tabTo(page, fig.getByLabel("Output length spread (σ)"), browserName);
  await page.keyboard.press("ArrowLeft");
  await page.keyboard.press("ArrowRight");

  // max_model_len 512 → 1024: contiguous runs one request at a time.
  const picker = fig.getByLabel("max_model_len");
  await tabTo(page, picker, browserName);
  await expectFocusRing(page);
  await picker.selectOption("1024");
  const raised = { ...B64, maxModelLen: 1024 };
  await expect(contiguous).toContainText(
    `Running${String(expected("contiguous-max", t, raised).running)}`,
  );
  expect(expected("contiguous-max", t, raised).running).toBe(1);
}
