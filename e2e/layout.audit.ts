/**
 * Launch audit §3 (docs/AUDIT.md): every live page in three browsers at 375,
 * 768, and 1440 px, light and dark; touch on emulated phones; sticky and
 * workers in WebKit; hover-only styles.
 */
import { devices, expect, test, type Page } from "@playwright/test";
import { openPage, PAGES, save, THEMES } from "./audit-helpers.ts";
import { clippedSvgText, horizontalOverflow, smallTargets } from "./helpers.ts";

const steps = (page: Page) => page.locator(".step").count();
const center = (page: Page, i: number) =>
  page
    .locator(".step")
    .nth(i)
    .evaluate((el) => {
      el.scrollIntoView({ block: "center" });
    });

test.describe("sizes and themes", () => {
  for (const p of PAGES)
    for (const theme of THEMES)
      for (const width of [375, 768, 1440])
        test(`layout ${p.name} ${theme} ${String(width)}`, async ({
          page,
          browserName,
        }) => {
          await page.setViewportSize({ width, height: 900 });
          await openPage(page, p.url, theme);
          const overflow = [await horizontalOverflow(page)];
          const clipped = new Set(await clippedSvgText(page));
          const small = new Set(width < 1024 ? await smallTargets(page) : []);
          // On the wide board each step swaps the figure: check every one.
          if (width >= 1024)
            for (let i = 0; i < (await steps(page)); i++) {
              await center(page, i);
              await page.waitForTimeout(200);
              overflow.push(await horizontalOverflow(page));
              for (const c of await clippedSvgText(page)) clipped.add(c);
            }
          const report = {
            maxOverflow: Math.max(...overflow),
            clipped: [...clipped],
            small: [...small],
          };
          save(
            "layout",
            `${p.name}-${theme}-${String(width)}-${browserName}`,
            report,
          );
          expect.soft(report.maxOverflow).toBe(0);
          expect.soft(report.clipped).toEqual([]);
          expect.soft(report.small).toEqual([]);
        });
});

test("hover-only styles and title tooltips", async ({ page, browserName }) => {
  test.skip(browserName !== "chromium", "stylesheets are the same everywhere");
  const found: Record<string, unknown> = {};
  for (const p of PAGES) {
    await openPage(page, p.url);
    found[p.name] = await page.evaluate(() => {
      const reveal: string[] = [];
      const walk = (rules: CSSRuleList) => {
        for (const r of rules) {
          if (r instanceof CSSStyleRule && r.selectorText.includes(":hover")) {
            const s = r.style;
            if (s.display || s.visibility || s.opacity || s.maxHeight)
              reveal.push(`${r.selectorText} { ${s.cssText} }`);
          }
          if ("cssRules" in r) walk((r as CSSGroupingRule).cssRules);
        }
      };
      for (const sheet of document.styleSheets) walk(sheet.cssRules);
      const titled = [...document.querySelectorAll("[title]")].map(
        (el) =>
          `${el.tagName.toLowerCase()} "${el.getAttribute("title") ?? ""}"`,
      );
      return { reveal, titled };
    });
  }
  save("layout", "hover-only", found);
});

test("sticky figure board and short screens", async ({ page, browserName }) => {
  const out: Record<string, unknown> = {};
  for (const p of PAGES.filter((p) =>
    [
      "kv-cache",
      "paged-attention",
      "continuous-batching",
      "prefix-caching",
    ].includes(p.name),
  )) {
    for (const height of [900, 500]) {
      await page.setViewportSize({ width: 1440, height });
      await openPage(page, p.url);
      const n = await steps(page);
      const tops: number[] = [];
      for (const i of [Math.floor(n / 2), n - 1]) {
        await center(page, i);
        await page.waitForTimeout(200);
        tops.push(
          await page
            .locator(".chapter__figure")
            .evaluate((el) => Math.round(el.getBoundingClientRect().top)),
        );
      }
      const position = await page
        .locator(".chapter__figure")
        .evaluate((el) => getComputedStyle(el).position);
      const showButtons = await page
        .getByRole("button", { name: "Show in figure" })
        .count();
      out[`${p.name} ${String(height)}`] = { position, tops, showButtons };
      if (height === 900) {
        expect.soft(position).toBe("sticky");
        for (const t of tops) expect.soft(t).toBeLessThan(200);
      }
    }
  }
  save("sticky", browserName, out);
});

test("sandbox worker runs to the end", async ({ page, browserName }) => {
  const p = PAGES.find((p) => p.name === "sandbox-ab");
  if (!p) throw new Error("no sandbox page");
  const t0 = Date.now();
  await openPage(page, p.url);
  const statuses = await page
    .locator("section.sb-run")
    .evaluateAll((els) => els.map((e) => e.getAttribute("data-status")));
  save("workers", browserName, { statuses, ms: Date.now() - t0 });
  expect(statuses).toEqual(["done", "done"]);
});

const PHONES = { chromium: "Pixel 7", webkit: "iPhone 13" } as const;

test.describe("touch", () => {
  for (const p of PAGES)
    test(`touch ${p.name}`, async ({ browser, browserName }) => {
      const phone = PHONES[browserName as keyof typeof PHONES] as
        (typeof PHONES)[keyof typeof PHONES] | undefined;
      test.skip(!phone, "no phone emulation in Firefox");
      if (!phone) return;
      const context = await browser.newContext({ ...devices[phone] });
      const page = await context.newPage();
      await openPage(page, p.url);
      const width = page.viewportSize()?.width ?? 0;
      const small = await smallTargets(page);
      const overflow = await horizontalOverflow(page);
      // Tap each playback bar's Step and check that its playhead moves.
      const results: string[] = [];
      const bars = page.locator(".playback");
      for (let i = 0; i < (await bars.count()); i++) {
        const bar = bars.nth(i);
        const scrub = bar.getByRole("slider").first();
        const step = bar.getByRole("button", { name: "Step" });
        await bar.scrollIntoViewIfNeeded();
        const before = await scrub.inputValue();
        if (await step.isEnabled()) await step.tap();
        else {
          results.push(`bar ${String(i)}: Step disabled`);
          continue;
        }
        await page.waitForTimeout(200);
        const after = await scrub.inputValue();
        results.push(`bar ${String(i)}: ${before} → ${after}`);
      }
      // Tap near the right end of each other slider: its value must change.
      const sliders = page.locator('input[type="range"]:not(.playback input)');
      for (let i = 0; i < (await sliders.count()); i++) {
        const s = sliders.nth(i);
        if (!(await s.isVisible()) || (await s.isDisabled())) continue;
        await s.scrollIntoViewIfNeeded();
        const box = await s.boundingBox();
        if (!box) continue;
        const before = await s.inputValue();
        await page.touchscreen.tap(
          box.x + box.width * 0.9,
          box.y + box.height / 2,
        );
        await page.waitForTimeout(200);
        results.push(
          `slider ${(await s.getAttribute("aria-label")) ?? String(i)} ${String(Math.round(box.height))} px tall: ${before} → ${await s.inputValue()}`,
        );
      }
      save("touch", `${p.name}-${phone}`, { width, small, overflow, results });
      await context.close();
      expect.soft(small).toEqual([]);
      expect.soft(overflow).toBe(0);
      expect.soft(results.filter((r) => /: (\S+) → \1$/.test(r))).toEqual([]);
    });
});
