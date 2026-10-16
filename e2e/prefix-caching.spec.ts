/**
 * Chapter 4 (CHAPTER_DOD items 7–18): one interaction test per widget in
 * every browser, keyboard and touch, sizes and themes, layout shift, console
 * errors, axe, reduced motion, and screenshots. Performance is in
 * prefix-caching-perf.spec.ts.
 */
import { expect, test } from "@playwright/test";
import { blockKeys } from "../src/sim/index.ts";
import { hex6 } from "../src/chapters/prefix-caching/cells.ts";
import { sharedPrompt } from "../src/chapters/prefix-caching/HashChain.tsx";
import { partialRows } from "../src/chapters/prefix-caching/PartialBlocks.tsx";
import { SHARED } from "../src/chapters/prefix-caching/presets.ts";
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
import { driveGrid, open, seek } from "./prefix-caching.ts";

const WIDTHS = [375, 768, 1440] as const;

test.describe("prefix-caching: widgets", () => {
  test("grid: Step, the caching switch, and capacity change the readouts", async ({
    page,
    browserName,
  }) => {
    const errors = watchErrors(page);
    await watchShifts(page);
    await open(page);
    await driveGrid(page, browserName);
    expect(await shifts(page)).toEqual([]);
    expect(errors).toEqual([]);
  });

  test("grid: selecting a request shows its chain with keys", async ({
    page,
  }) => {
    await open(page);
    const fig = figure(page, "4.3");
    await seek(fig, 10);
    const picker = fig.getByLabel("Show a request's chain");
    const options = await picker.locator("option").allTextContents();
    const req = options.find((o) => o.startsWith("r"));
    expect(req).toBeDefined();
    await picker.selectOption({ label: req ?? "" });
    const panel = fig.getByRole("group", { name: `${req ?? ""}'s chain` });
    await expect(panel.locator("th").nth(3)).toHaveText("Key");
    await expect(
      panel.locator("tbody tr").first().locator("td").nth(3),
    ).toHaveText(/^[0-9a-f]{6}$|^none$/);
  });

  test("grid: the cursor announces cached and shared blocks", async ({
    page,
    browserName,
  }) => {
    await open(page);
    const fig = figure(page, "4.3");
    await seek(fig, 10);
    await tabTo(
      page,
      fig.getByRole("group", { name: /^Caching on memory grid/ }),
      browserName,
    );
    await expectFocusRing(page);
    await page.keyboard.press("Home");
    const live = fig.locator(".block-grid .visually-hidden").first();
    await expect(live).toHaveText(
      /^Block 0: shared by r\d+ \(logical block 0\)/,
    );
    // Walk until a cached block, whose text names its eviction order.
    let text = "";
    for (let i = 0; i < 80 && !text.includes("cached"); i++) {
      await page.keyboard.press("ArrowRight");
      text = (await live.textContent()) ?? "";
    }
    expect(text).toMatch(/: cached\. .* Eviction order \d+ \(1 goes next\)\.$/);
  });

  test("repeated prefill: r9's second prefill is a labelled recompute", async ({
    page,
  }) => {
    await open(page);
    const fig = figure(page, "4.1");
    await expect(fig.locator("svg")).toHaveAttribute(
      "aria-label",
      /r9: \d+ prefix and \d+ other tokens; recompute, 600 prefix/,
    );
    await expect(fig.locator(".rp__label")).toHaveText(["recompute"]);
  });

  test("hash chain: changing a token changes that key and every later one", async ({
    page,
    browserName,
  }) => {
    await open(page);
    const fig = figure(page, "4.2");
    const tokens = sharedPrompt();
    const B = SHARED.blockSize;
    const keys = fig.locator(".chain__key");
    const before = blockKeys(tokens, B).map((k) => `key ${hex6(k)}`);
    await expect(keys.nth(0)).toHaveText(before[0] ?? "");
    await tabTo(
      page,
      fig.getByRole("switch", { name: "Change it" }),
      browserName,
    );
    await expectFocusRing(page);
    await page.keyboard.press("Space");
    const position = Math.floor(tokens.length / 2);
    const first = Math.floor(position / B);
    const after = blockKeys(
      tokens.map((t, i) => (i === position ? t + 1 : t)),
      B,
    ).map((k) => `key ${hex6(k)}`);
    await expect(keys.nth(first)).toHaveText(after[first] ?? "");
    expect(after[first]).not.toBe(before[first]);
    await expect(keys.nth(first - 1)).toHaveText(before[first - 1] ?? "");
    await expect(keys.nth(after.length - 1)).toHaveText(after.at(-1) ?? "");
    await expect(fig.locator(".cache__counter")).toContainText(
      `changes the keys of blocks ${String(first)}–${String(after.length - 1)}`,
    );
  });

  test("partial blocks: the block-size highlight moves", async ({
    page,
    browserName,
  }) => {
    await open(page);
    const fig = figure(page, "4.4");
    const active = fig.locator('.pb__row[data-active="true"] .chart__tick');
    await expect(active).toHaveText("B 16");
    const select = fig.getByLabel("Highlight a block size");
    await tabTo(page, select, browserName);
    await select.selectOption("64");
    await expect(active).toHaveText("B 64");
    const row = partialRows().find((r) => r.B === 64);
    await expect(fig.locator(".cache__counter")).toContainText(
      `reuses ${String(row?.shared ?? 0)} of 600 tokens`,
    );
  });

  test("reduced motion: no autoplay, and Step reaches every step end", async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await open(page);
    const fig = figure(page, "4.6");
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
    const figures = ["4.1", "4.2", "4.3", "4.4", "4.5", "4.6", "4.6"];
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

test.describe("prefix-caching: sizes", () => {
  for (const width of WIDTHS) {
    test(`no horizontal scroll or clipped SVG text at ${String(width)} px`, async ({
      page,
    }) => {
      await open(page, width);
      for (const fig of await page.locator(".figure:has(.block-grid)").all())
        await seek(fig, 10);
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
      const cells = await page.$$eval(".block-grid__canvas", (els) =>
        els.map((e) => {
          const cols = Number((e as HTMLElement).dataset.cols);
          const { width: w } = e.getBoundingClientRect();
          return (w - 4 * (cols - 1)) / cols;
        }),
      );
      expect(cells.length).toBeGreaterThan(0);
      for (const c of cells) expect(c).toBeGreaterThanOrEqual(44);
    });
  }
});

test.describe("prefix-caching: accessibility", () => {
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

test.describe("prefix-caching: screenshots @screenshot", () => {
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
        // Every grid on the page, paused at t = 10 s.
        for (const fig of await page.locator(".figure:has(.block-grid)").all())
          await seek(fig, 10);
        // A full-page capture rounds a fractional page height differently
        // between loads; pin it to a whole pixel (tasks/lessons.md).
        await page.evaluate(() => {
          const h = document.documentElement.getBoundingClientRect().height;
          document.documentElement.style.minHeight = `${String(Math.ceil(h))}px`;
        });
        await expect(page).toHaveScreenshot(
          `prefix-caching-${String(width)}-${colorScheme}.png`,
          { fullPage: true, animations: "disabled", caret: "hide" },
        );
      });
    }
  }
});
