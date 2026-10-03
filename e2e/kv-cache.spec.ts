/**
 * Chapter 1 (CHAPTER_DOD items 7–18): one interaction test per widget in
 * every browser, keyboard and touch, sizes and themes, layout shift, console
 * errors, axe, reduced motion, and screenshots. Performance is in
 * kv-cache-perf.spec.ts.
 */
import { AxeBuilder } from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { watchErrors } from "./helpers.ts";
import {
  driveBudget,
  expectFocusRing,
  figure,
  mc,
  open,
  tabTo,
} from "./kv-cache.ts";

const WIDTHS = [375, 768, 1440] as const;

interface Shift {
  value: number;
  hadRecentInput: boolean;
  sources: { node?: Node; previousRect: DOMRect; currentRect: DOMRect }[];
}

/**
 * Records layout shifts with what moved (item 12). Chromium only: the others
 * have no layout-shift entries. CLS leaves out shifts within 500 ms of an
 * input, such as a disclosure the reader opens; those are logged, not failed.
 */
async function watchShifts(page: Page) {
  await page.addInitScript(() => {
    const w = window as unknown as { shifts: string[]; inputShifts: number };
    w.shifts = [];
    w.inputShifts = 0;
    if (!PerformanceObserver.supportedEntryTypes.includes("layout-shift"))
      return;
    new PerformanceObserver((list) => {
      for (const e of list.getEntries() as unknown as Shift[]) {
        if (e.hadRecentInput) {
          w.inputShifts += e.value;
          continue;
        }
        for (const src of e.sources)
          w.shifts.push(
            `${e.value.toFixed(5)} ${src.node instanceof Element ? src.node.outerHTML.slice(0, 60) : JSON.stringify(src.node?.textContent)} at ${String(src.previousRect.x)},${String(src.previousRect.y)} → ${String(src.currentRect.x)},${String(src.currentRect.y)}`,
          );
      }
    }).observe({ type: "layout-shift", buffered: true });
  });
}

/** Shifts that count toward CLS; logs the input-driven total. */
async function shifts(page: Page) {
  const w = await page.evaluate(() => {
    const x = window as unknown as { shifts: string[]; inputShifts: number };
    return { shifts: x.shifts, inputShifts: x.inputShifts };
  });
  console.log(`input-driven layout shift: ${w.inputShifts.toFixed(5)}`);
  return w.shifts;
}

test.describe("kv-cache: widgets", () => {
  test("memory budget: concurrency, context, fp8, model, and chart", async ({
    page,
    browserName,
  }) => {
    const errors = watchErrors(page);
    await watchShifts(page);
    await open(page);
    await driveBudget(page, browserName);
    expect(await shifts(page)).toEqual([]);
    expect(errors).toEqual([]);
  });

  test("token grid: Step and Play advance the counters", async ({
    page,
    browserName,
  }) => {
    const errors = watchErrors(page);
    await watchShifts(page);
    await open(page);
    const noCache = figure(page, "1.1");
    const readout = noCache.locator(".token-grid__readout");
    await expect(readout).toHaveText(
      /Step 1 of 6.*Positions computed this step: 6Positions computed so far: 6$/,
    );
    await tabTo(
      page,
      noCache.getByRole("button", { name: "Step" }),
      browserName,
    );
    await expectFocusRing(page);
    await page.keyboard.press("Enter");
    await expect(readout).toHaveText(
      /Step 2 of 6.*Positions computed this step: 7Positions computed so far: 13$/,
    );

    const cache = figure(page, "1.2");
    const cached = cache.locator(".token-grid__readout");
    await cache.getByRole("button", { name: "Step" }).click();
    await expect(cached).toHaveText(
      /Step 2 of 6.*Positions computed this step: 1Positions computed so far: 7$/,
    );
    await cache.getByRole("button", { name: "Play" }).click();
    await expect(cached).toHaveText(
      /Step 6 of 6.*Positions computed this step: 1Positions computed so far: 11$/,
      { timeout: 10_000 },
    );
    await expect(
      cache.locator(".token-grid__svg .token-grid__cell--computed"),
    ).toHaveCount(32);
    expect(await shifts(page)).toEqual([]);
    expect(errors).toEqual([]);
  });

  test("formula: changing the model changes the product", async ({
    page,
    browserName,
  }) => {
    const errors = watchErrors(page);
    await open(page);
    const fig = figure(page, "1.3");
    const result = fig.locator(".formula__result");
    await expect(result).toHaveText(/= 131,072 bytes = 128 KiB per token/);
    const picker = fig.getByLabel("Model");
    await tabTo(page, picker, browserName);
    await expectFocusRing(page);
    await picker.selectOption("phi-3.5-mini");
    await expect(result).toHaveText(/= 393,216 bytes = 384 KiB per token/);
    await expect(fig.locator(".formula__terms")).toContainText("nkv = 32");
    expect(errors).toEqual([]);
  });

  test("GQA contrast: shows the data's heads, sizes, and fits", async ({
    page,
  }) => {
    // A static figure: no controls, so this checks its rendered text.
    const errors = watchErrors(page);
    await open(page);
    const rows = figure(page, "1.4").locator(".gqa__row");
    await expect(rows.nth(0)).toContainText("Phi-3.5-mini, MHA");
    await expect(rows.nth(0)).toContainText("32 of 32");
    await expect(rows.nth(0)).toContainText("384 KiB");
    await expect(rows.nth(0).locator("dd").last()).toHaveText(
      String(mc(8192, "bf16", "phi-3.5-mini")),
    );
    await expect(rows.nth(1)).toContainText("Llama-3.2-3B, GQA");
    await expect(rows.nth(1)).toContainText("8 of 24");
    await expect(rows.nth(1).locator("dd").last()).toHaveText(
      String(mc(8192, "bf16", "llama-3.2-3b")),
    );
    expect(errors).toEqual([]);
  });

  test("reduced motion: no autoplay, and Step shows every state", async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await open(page);
    const fig = figure(page, "1.1");
    await expect(fig.getByRole("button", { name: "Play" })).toBeDisabled();
    for (let n = 2; n <= 6; n++) {
      await fig.getByRole("button", { name: "Step" }).click();
      await expect(fig.locator(".token-grid__readout")).toContainText(
        `Step ${String(n)} of 6`,
      );
    }
    await expect(fig.getByRole("button", { name: "Step" })).toBeDisabled();
  });

  test("the wide layout shows each step's figure as the reader scrolls", async ({
    page,
  }) => {
    await open(page, 1440);
    const board = page.locator(".chapter__figure");
    for (const [step, n] of [
      [1, "1.1"],
      [3, "1.3"],
      [5, "1.5"],
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

test.describe("kv-cache: sizes", () => {
  for (const width of WIDTHS) {
    test(`no horizontal scroll or clipped SVG text at ${String(width)} px`, async ({
      page,
    }) => {
      await open(page, width);
      expect(
        await page.evaluate(
          () =>
            document.documentElement.scrollWidth -
            document.documentElement.clientWidth,
        ),
      ).toBe(0);
      const clipped = await page.evaluate(() =>
        [...document.querySelectorAll("svg text")].flatMap((t) => {
          const svg = t.closest("svg");
          if (!svg) return [];
          const r = t.getBoundingClientRect();
          const b = svg.getBoundingClientRect();
          const out =
            r.left < b.left - 1 ||
            r.right > b.right + 1 ||
            r.top < b.top - 1 ||
            r.bottom > b.bottom + 1;
          return out ? [t.textContent] : [];
        }),
      );
      expect(clipped).toEqual([]);
    });
  }

  for (const width of [375, 768]) {
    test(`every control is at least 44 × 44 px at ${String(width)} px`, async ({
      page,
    }) => {
      await open(page, width);
      // Links and terms inside sentences are exempt, as in WCAG 2.5.8. A
      // radio's hit area is its label.
      const small = await page.evaluate(() =>
        [
          ...document.querySelectorAll(
            "button, input, select, summary, a, [tabindex='0']",
          ),
        ]
          .filter(
            (el) =>
              !el.closest("[data-inline], p, li") &&
              !el.hasAttribute("data-inline") &&
              !el.closest(".visually-hidden"),
          )
          .map((el) => {
            const box =
              el instanceof HTMLInputElement && el.type === "radio"
                ? (el.closest("label") ?? el)
                : el;
            return { el, r: box.getBoundingClientRect() };
          })
          .filter(({ r }) => r.width > 0 && (r.width < 44 || r.height < 44))
          .map(
            ({ el, r }) =>
              `${el.outerHTML.slice(0, 80)} ${String(Math.round(r.width))}×${String(Math.round(r.height))}`,
          ),
      );
      expect(small).toEqual([]);
    });
  }
});

test.describe("kv-cache: accessibility", () => {
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
      const results = await new AxeBuilder({ page }).analyze();
      expect(
        results.violations.map(
          (v) =>
            `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`,
        ),
      ).toEqual([]);
    });
  }
});

test.describe("kv-cache: screenshots @screenshot", () => {
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
        await expect(page).toHaveScreenshot(
          `kv-cache-${String(width)}-${colorScheme}.png`,
          { fullPage: true, animations: "disabled", caret: "hide" },
        );
      });
    }
  }
});
