import { AxeBuilder } from "@axe-core/playwright";
import { expect, type Locator, type Page } from "@playwright/test";

export const SITE_URL = "https://varadmore.me/serving-explained/";
export const BASE =
  process.env.SMOKE_BASE_URL ?? "http://localhost:4173/serving-explained/";
export const KITCHEN = "http://localhost:4174/serving-explained/kitchen-sink/";

/** Console errors, page errors, and failed responses, collected for a test. */
export function watchErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("console", (m) => {
    // Firefox's automation layer (juggler) logs its own aborted worker loads
    // when a test navigates away mid-run; those are not the page's errors.
    if (m.type() === "error" && !m.text().includes("chrome://juggler/"))
      errors.push(`console: ${m.text()}`);
  });
  page.on("pageerror", (e) => errors.push(`page: ${e.message}`));
  page.on("response", (r) => {
    if (r.status() >= 400) errors.push(`${String(r.status())}: ${r.url()}`);
  });
  return errors;
}

/** A chapter figure by its number ("2.4"). */
export const figure = (page: Page, n: string) =>
  page.locator(".figure").filter({
    has: page.locator(".figure__number", { hasText: `Fig. ${n}` }),
  });

/**
 * Presses Tab, or Shift+Tab when `target` comes earlier in the page, until it
 * has focus, as a keyboard user would. (Firefox does not wrap Tab back into
 * the page.)
 */
export async function tabTo(page: Page, target: Locator, browserName: string) {
  // WebKit on macOS skips buttons on Tab unless Option is held.
  const tab =
    browserName === "webkit" && process.platform === "darwin"
      ? "Alt+Tab"
      : "Tab";
  const handle = await target.elementHandle();
  const back = await page.evaluate((el) => {
    const active = document.activeElement;
    if (!active || active === document.body) return false;
    return Boolean(
      el.compareDocumentPosition(active) & Node.DOCUMENT_POSITION_FOLLOWING,
    );
  }, handle);
  const key = back ? `Shift+${tab}` : tab;
  for (let i = 0; i < 400; i++) {
    if (await page.evaluate((el) => el === document.activeElement, handle))
      return;
    await page.keyboard.press(key);
  }
  throw new Error("could not reach the control with Tab");
}

export async function expectFocusRing(page: Page) {
  expect(
    await page.evaluate(() => {
      const el = document.activeElement;
      return el ? getComputedStyle(el).outlineStyle !== "none" : false;
    }),
  ).toBe(true);
}

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
export async function watchShifts(page: Page) {
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
export async function shifts(page: Page) {
  const w = await page.evaluate(() => {
    const x = window as unknown as { shifts: string[]; inputShifts: number };
    return { shifts: x.shifts, inputShifts: x.inputShifts };
  });
  console.log(`input-driven layout shift: ${w.inputShifts.toFixed(5)}`);
  return w.shifts;
}

/** Pixels the page scrolls sideways; 0 when nothing overflows. */
export const horizontalOverflow = (page: Page) =>
  page.evaluate(
    () =>
      document.documentElement.scrollWidth -
      document.documentElement.clientWidth,
  );

/** The text of every SVG label that spills outside its own SVG. */
export const clippedSvgText = (page: Page) =>
  page.evaluate(() =>
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

/**
 * Controls under 44 × 44 px (CHAPTER_DOD item 7). Links and terms inside
 * sentences are exempt, as in WCAG 2.5.8. A radio's hit area is its label.
 */
export const smallTargets = (page: Page) =>
  page.evaluate(() =>
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

/** axe's violations, one line each. */
export async function axeViolations(page: Page) {
  const results = await new AxeBuilder({ page }).analyze();
  return results.violations.map(
    (v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`,
  );
}
