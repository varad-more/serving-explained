/**
 * Chapter 2 (CHAPTER_DOD items 7–18): one interaction test per widget in
 * every browser, keyboard and touch, sizes and themes, layout shift, console
 * errors, axe, reduced motion, and screenshots. Performance is in
 * paged-attention-perf.spec.ts.
 */
import { expect, test } from "@playwright/test";
import { tableFigure } from "../src/chapters/paged-attention/TokenStrip.tsx";
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
import {
  driveCompare,
  expected,
  open,
  readout,
  seek,
} from "./paged-attention.ts";

const WIDTHS = [375, 768, 1440] as const;

test.describe("paged-attention: widgets", () => {
  test("compare: Step, block size, and max_model_len change the readouts", async ({
    page,
    browserName,
  }) => {
    const errors = watchErrors(page);
    await watchShifts(page);
    await open(page);
    await driveCompare(page, browserName);
    expect(await shifts(page)).toEqual([]);
    expect(errors).toEqual([]);
  });

  test("block grid: arrows move a cell cursor; Enter selects its request", async ({
    page,
    browserName,
  }) => {
    const errors = watchErrors(page);
    await open(page);
    const fig = figure(page, "2.4");
    const t = await seek(fig, 12);
    expect(expected("contiguous-max", t).running).toBeGreaterThan(0);
    const grid = fig.getByRole("group", { name: /^Contiguous memory grid/ });
    await tabTo(page, grid, browserName);
    await expectFocusRing(page);
    await page.keyboard.press("ArrowRight");
    await expect(
      fig.locator(".block-grid .visually-hidden").first(),
    ).toHaveText(/^Slots 16–31: in r\d+'s region, \d+ of 16 hold KV\.$/);
    await page.keyboard.press("Enter");
    const picked = await fig.getByLabel("Show a request's blocks").inputValue();
    expect(picked).not.toBe("");
    await expect(
      fig.getByRole("group", { name: `r${picked}'s blocks` }),
    ).toContainText(`Contiguous: r${picked} reserves slots 0–511`);
    expect(errors).toEqual([]);
  });

  test("token strip: arrows move through tokens and the table", async ({
    page,
    browserName,
  }) => {
    const errors = watchErrors(page);
    await watchShifts(page);
    await open(page);
    const { holder } = tableFigure();
    const fig = figure(page, "2.3");
    const strip = fig.getByRole("group", { name: "Tokens, by logical block" });
    const out = fig.locator(".strip__readout");
    await expect(out).toHaveText(
      `Token 0: logical block 0 → physical block ${String(holder.blocks[0])}, position 0 of 0–15.`,
    );
    await tabTo(page, strip, browserName);
    await expectFocusRing(page);
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("ArrowDown");
    await expect(out).toHaveText(
      `Token 32: logical block 2 → physical block ${String(holder.blocks[2])}, position 0 of 0–15.`,
    );
    await expect(fig.locator("tr.is-active td").nth(1)).toHaveText(
      String(holder.blocks[2]),
    );
    expect(await shifts(page)).toEqual([]);
    expect(errors).toEqual([]);
  });

  test("shared blocks: Step keeps the prefix blocks at ref count 2", async ({
    page,
  }) => {
    const errors = watchErrors(page);
    await open(page);
    const fig = figure(page, "2.6");
    const out = fig.locator(".shared__readout");
    await expect(out).toContainText("Blocks 0 and 1: ref count 2");
    await fig.getByRole("button", { name: "Step" }).click();
    await expect(fig.locator(".playback output")).toHaveText(/^Step 2 of \d+$/);
    await expect(out).toContainText("ref count 2, shared by r0 and r1");
    expect(errors).toEqual([]);
  });

  test("mobile: at most 48 cells, a summary bar, and Next moves the window", async ({
    page,
  }) => {
    await open(page, 375);
    const fig = figure(page, "2.4");
    const paged = fig.getByRole("group", { name: "Paged", exact: true });
    await expect(paged.locator(".block-grid__range")).toHaveText(
      "Blocks 0–47 of 80",
    );
    await expect(paged.locator(".block-grid__summary")).toBeVisible();
    await paged.getByRole("button", { name: "Next blocks" }).click();
    await expect(paged.locator(".block-grid__range")).toHaveText(
      "Blocks 32–79 of 80",
    );
  });

  test("reduced motion: no autoplay, and Step reaches every step end", async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await open(page);
    const fig = figure(page, "2.4");
    await expect(fig.getByRole("button", { name: "Play" })).toBeDisabled();
    const time = fig.locator(".playback output");
    for (let i = 0; i < 3; i++) {
      const before = await time.textContent();
      await fig.getByRole("button", { name: "Step" }).click();
      await expect(time).not.toHaveText(before ?? "");
    }
    await expect(readout(fig, "Paged")).toContainText("Running");
  });

  test("the wide layout shows each step's figure as the reader scrolls", async ({
    page,
  }) => {
    await open(page, 1440);
    const board = page.locator(".chapter__figure");
    for (const [step, n] of [
      [2, "2.1"],
      [4, "2.3"],
      [5, "2.4"],
      [7, "2.6"],
    ] as const) {
      await page
        .locator(`.step[data-step="${String(step)}"]`)
        .evaluate((el) => {
          el.scrollIntoView({ block: "center" });
        });
      await expect(board.locator(".figure__number")).toHaveText(`Fig. ${n}`);
    }
  });
});

test.describe("paged-attention: sizes", () => {
  for (const width of WIDTHS) {
    test(`no horizontal scroll or clipped SVG text at ${String(width)} px`, async ({
      page,
    }) => {
      await open(page, width);
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

test.describe("paged-attention: accessibility", () => {
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

test.describe("paged-attention: screenshots @screenshot", () => {
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
        // Every compare figure on the page, paused at t = 12 s.
        for (const fig of await page.locator(".figure:has(.paged)").all())
          await seek(fig, 12);
        await expect(page).toHaveScreenshot(
          `paged-attention-${String(width)}-${colorScheme}.png`,
          { fullPage: true, animations: "disabled", caret: "hide" },
        );
      });
    }
  }
});
