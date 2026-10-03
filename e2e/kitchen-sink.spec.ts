/**
 * The kitchen sink (Prompt 1 step 7; CHAPTER_DOD items 7, 11, 14, 17): every
 * control works from the keyboard with a visible focus ring, every control is
 * at least 44 × 44 px at 375 and 768 px, axe finds nothing in either theme,
 * and the page matches its screenshots.
 */
import { AxeBuilder } from "@axe-core/playwright";
import { expect, test, type Locator, type Page } from "@playwright/test";
import { KITCHEN, watchErrors } from "./helpers.ts";

async function open(page: Page) {
  await page.goto(KITCHEN);
  await expect(page.locator("h1", { hasText: "Kitchen sink" })).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
}

/** Presses Tab until `target` has focus, as a keyboard user would. */
async function tabTo(page: Page, target: Locator, browserName: string) {
  // WebKit on macOS skips buttons on Tab unless Option is held.
  const key =
    browserName === "webkit" && process.platform === "darwin"
      ? "Alt+Tab"
      : "Tab";
  const handle = await target.elementHandle();
  for (let i = 0; i < 400; i++) {
    if (await page.evaluate((el) => el === document.activeElement, handle))
      return;
    await page.keyboard.press(key);
  }
  throw new Error("could not reach the control with Tab");
}

async function focusRingVisible(page: Page) {
  return page.evaluate(() => {
    const el = document.activeElement;
    return el ? getComputedStyle(el).outlineStyle !== "none" : false;
  });
}

test.describe("kitchen sink: keyboard", () => {
  test("every control is reached with Tab, works from the keyboard, and shows focus", async ({
    page,
    browserName,
  }) => {
    const errors = watchErrors(page);
    await open(page);
    const light = page.locator("section[data-theme=light]");

    const context = light.getByLabel("Context length");
    await tabTo(page, context, browserName);
    expect(await focusRingVisible(page)).toBe(true);
    await page.keyboard.press("ArrowRight");
    await expect(light.locator("output").first()).toHaveText("16K tokens");

    const caching = light.getByRole("switch", { name: "Prefix caching" });
    await tabTo(page, caching, browserName);
    expect(await focusRingVisible(page)).toBe(true);
    await page.keyboard.press("Space");
    await expect(caching).toHaveAttribute("aria-checked", "false");
    await page.keyboard.press("Enter");
    await expect(caching).toHaveAttribute("aria-checked", "true");

    const gpu = light.getByLabel("GPU");
    await tabTo(page, gpu, browserName);
    expect(await focusRingVisible(page)).toBe(true);

    // In DOM order: Play, Pause, Step, the playhead, and speed.
    const bar = light.getByRole("group", { name: "Playback" }).first();
    const time = bar.locator("output");
    const play = bar.getByRole("button", { name: "Play" });
    const pause = bar.getByRole("button", { name: "Pause" });
    await tabTo(page, play, browserName);
    expect(await focusRingVisible(page)).toBe(true);
    await page.keyboard.press("Space");
    await expect(pause).toBeEnabled();
    await tabTo(page, pause, browserName);
    await page.keyboard.press("Enter");
    await expect(play).toBeEnabled();
    const paused = Number.parseFloat((await time.textContent()) ?? "0");
    await tabTo(page, bar.getByRole("button", { name: "Step" }), browserName);
    await page.keyboard.press("Enter");
    await expect(time).toHaveText(`${Math.min(40, paused + 1).toFixed(1)} s`);
    await tabTo(page, bar.getByLabel("Playhead"), browserName);
    const before = await time.textContent();
    await page.keyboard.press("ArrowRight");
    await expect(time).not.toHaveText(before ?? "");
    await tabTo(page, bar.getByLabel("Speed"), browserName);
    expect(await focusRingVisible(page)).toBe(true);

    const term = light.getByRole("button", { name: "kitchen sink" }).first();
    await tabTo(page, term, browserName);
    await expect(term).toHaveAttribute("aria-expanded", "true");
    await page.keyboard.press("Escape");
    await expect(term).toHaveAttribute("aria-expanded", "false");

    const summary = light.locator("summary").first();
    await tabTo(page, summary, browserName);
    expect(await focusRingVisible(page)).toBe(true);
    await page.keyboard.press("Enter");
    await expect(light.locator("details").first()).toHaveAttribute("open", "");

    const theme = page.getByRole("button", { name: /^Theme:/ });
    await theme.focus();
    await page.keyboard.press("Enter");
    await expect(theme).toHaveAccessibleName(/^Theme: Light/);
    await page.keyboard.press("Enter");
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");

    expect(errors).toEqual([]);
  });
});

test.describe("kitchen sink: touch targets", () => {
  for (const width of [375, 768]) {
    test(`every control is at least 44 × 44 px at ${String(width)} px`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 900 });
      await open(page);
      // Inline text links and terms are exempt, as in WCAG 2.5.8.
      const small = await page.evaluate(() =>
        [
          ...document.querySelectorAll(
            "button, input, select, summary, a, [role=switch]",
          ),
        ]
          .filter(
            (el) =>
              !el.closest("[data-inline]") && !el.hasAttribute("data-inline"),
          )
          .map((el) => ({ el, r: el.getBoundingClientRect() }))
          .filter(
            ({ el, r }) =>
              r.width > 0 &&
              !el.closest(".visually-hidden") &&
              (r.width < 44 || r.height < 44),
          )
          .map(
            ({ el, r }) =>
              `${el.outerHTML.slice(0, 80)} ${String(Math.round(r.width))}×${String(Math.round(r.height))}`,
          ),
      );
      expect(small).toEqual([]);
    });

    test(`no horizontal scroll at ${String(width)} px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await open(page);
      const overflow = await page.evaluate(
        () =>
          document.documentElement.scrollWidth -
          document.documentElement.clientWidth,
      );
      expect(overflow).toBe(0);
    });
  }
});

test.describe("kitchen sink: accessibility", () => {
  for (const colorScheme of ["light", "dark"] as const) {
    test(`axe finds no violations (${colorScheme})`, async ({ page }) => {
      await page.emulateMedia({ colorScheme });
      await open(page);
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

test.describe("kitchen sink: screenshots @screenshot", () => {
  for (const width of [375, 768, 1440]) {
    for (const colorScheme of ["light", "dark"] as const) {
      test(`${String(width)} px, ${colorScheme} @screenshot`, async ({
        page,
        browserName,
      }) => {
        test.skip(
          browserName !== "chromium",
          "pixel baselines are Chromium only (CHAPTER_DOD item 17)",
        );
        await page.setViewportSize({ width, height: 900 });
        await page.emulateMedia({ colorScheme });
        await open(page);
        await expect(page).toHaveScreenshot(
          `kitchen-sink-${String(width)}-${colorScheme}.png`,
          {
            fullPage: true,
            animations: "disabled",
            caret: "hide",
          },
        );
      });
    }
  }
});
