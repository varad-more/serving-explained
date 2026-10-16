/**
 * Launch audit §2 (docs/AUDIT.md): axe, a Tab walk, live-region rate, and
 * reduced motion, on every live page.
 */
import { AxeBuilder } from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { openPage, PAGES, save, THEMES } from "./audit-helpers.ts";

const violations = async (page: Page, include?: string) => {
  const builder = new AxeBuilder({ page });
  if (include) builder.include(include);
  const r = await builder.analyze();
  return r.violations.map((v) => ({
    id: v.id,
    impact: v.impact,
    help: v.help,
    nodes: v.nodes.length,
    targets: v.nodes.slice(0, 5).map((n) => n.target.join(" ")),
  }));
};

const isChapter = (name: string) =>
  [
    "kv-cache",
    "paged-attention",
    "continuous-batching",
    "prefix-caching",
  ].includes(name);

test.describe("axe", () => {
  for (const p of PAGES)
    for (const theme of THEMES)
      for (const width of [375, 1440])
        test(`axe ${p.name} ${theme} ${String(width)}`, async ({
          page,
          browserName,
        }) => {
          await page.setViewportSize({ width, height: 900 });
          await openPage(page, p.url, theme);
          const full = await violations(page);
          // From 1024 px a chapter shows one step's figure at a time: scan
          // each step's figure too (Chromium only; axe is the same engine).
          const steps: {
            step: number;
            v: Awaited<ReturnType<typeof violations>>;
          }[] = [];
          if (
            width === 1440 &&
            isChapter(p.name) &&
            browserName === "chromium"
          ) {
            const n = await page.locator(".step").count();
            for (let i = 1; i <= n; i++) {
              await page
                .locator(".step")
                .nth(i - 1)
                .evaluate((el) => {
                  el.scrollIntoView({ block: "center" });
                });
              await page.waitForTimeout(300);
              const v = await violations(page, ".chapter__figure");
              if (v.length) steps.push({ step: i, v });
            }
          }
          save("axe", `${p.name}-${theme}-${String(width)}-${browserName}`, {
            full,
            steps,
          });
          expect.soft(full).toEqual([]);
          expect.soft(steps).toEqual([]);
        });
});

interface Stop {
  key: string;
  desc: string;
  ring: boolean;
  inView: boolean;
  visible: boolean;
}

test.describe("keyboard", () => {
  for (const p of PAGES)
    test(`Tab walk ${p.name}`, async ({ page, browserName }) => {
      await page.setViewportSize({ width: 1440, height: 900 });
      await openPage(page, p.url);
      const tab =
        browserName === "webkit" && process.platform === "darwin"
          ? "Alt+Tab"
          : "Tab";
      const stops: Stop[] = [];
      let end = "limit";
      for (let i = 0; i < 1000; i++) {
        await page.keyboard.press(tab);
        const s = await page.evaluate((): Stop | null => {
          const el = document.activeElement;
          if (!el || el === document.body) return null;
          const path: string[] = [];
          for (
            let e: Element | null = el;
            e && e !== document.body;
            e = e.parentElement
          ) {
            const parent = e.parentElement;
            const i = parent ? [...parent.children].indexOf(e) : 0;
            path.unshift(`${e.tagName.toLowerCase()}:${String(i)}`);
          }
          const cs = getComputedStyle(el);
          const r = el.getBoundingClientRect();
          const name =
            el.getAttribute("aria-label") ??
            (
              (el as HTMLInputElement).labels?.[0]?.innerText ||
              (el as HTMLElement).innerText ||
              `#${el.id}`
            )
              .trim()
              .slice(0, 40);
          return {
            key: path.join(">"),
            desc: `${el.tagName.toLowerCase()}${el.getAttribute("role") ? `[${el.getAttribute("role") ?? ""}]` : ""} "${name}"`,
            ring:
              (cs.outlineStyle !== "none" && parseFloat(cs.outlineWidth) > 0) ||
              cs.boxShadow !== "none",
            inView:
              r.bottom > 0 &&
              r.top < innerHeight &&
              r.right > 0 &&
              r.left < innerWidth,
            visible: r.width > 0 && r.height > 0 && cs.visibility !== "hidden",
          };
        });
        if (!s) {
          if (stops.length) {
            end = "left the page";
            break;
          }
          continue;
        }
        if (stops.length && s.key === stops[0]?.key) {
          end = "wrapped to the first stop";
          break;
        }
        // Firefox hands focus to the browser chrome after the last control,
        // and the page's activeElement stays on it.
        if (s.key === stops.at(-1)?.key) {
          end = "left the page";
          break;
        }
        stops.push(s);
      }
      const seen = new Set<string>();
      const revisits = stops.filter((s) =>
        seen.has(s.key) ? true : (seen.add(s.key), false),
      );
      const report = {
        stops: stops.length,
        end,
        first: stops.slice(0, 3).map((s) => s.desc),
        noRing: stops.filter((s) => !s.ring).map((s) => s.desc),
        notInView: stops.filter((s) => !s.inView).map((s) => s.desc),
        invisible: stops.filter((s) => !s.visible).map((s) => s.desc),
        revisits: revisits.map((s) => s.desc),
      };
      save("keyboard", `${p.name}-${browserName}`, {
        ...report,
        all: stops.map((s) => s.desc),
      });
      expect.soft(end).not.toBe("limit");
      expect.soft(report.noRing).toEqual([]);
      expect.soft(report.invisible).toEqual([]);
      expect.soft(report.revisits).toEqual([]);
    });
});

interface Said {
  t: number;
  region: string;
  text: string;
}

/** Records each text change inside a live region that is not "off". */
async function watchLive(page: Page) {
  await page.addInitScript(() => {
    const w = window as unknown as { said: Said[] };
    w.said = [];
    const politeness = (el: Element | null) => {
      for (let e = el; e; e = e.parentElement) {
        const live = e.getAttribute("aria-live");
        if (live) return { el: e, live };
        const role = e.getAttribute("role");
        if (role === "status" || role === "log")
          return { el: e, live: "polite" };
        if (role === "alert") return { el: e, live: "assertive" };
      }
      return null;
    };
    new MutationObserver((list) => {
      for (const m of list) {
        const target =
          m.target instanceof Element ? m.target : m.target.parentElement;
        const r = politeness(target);
        if (!r || r.live === "off") continue;
        const label =
          r.el.getAttribute("aria-label") ??
          (r.el.id || (r.el.getAttribute("class") ?? "").slice(0, 40));
        w.said.push({
          t: performance.now(),
          region: `${r.live} ${label}`,
          text: r.el.textContent.slice(0, 80),
        });
      }
    }).observe(document, {
      subtree: true,
      childList: true,
      characterData: true,
    });
  });
}

/** Announcements: changes to one region within 100 ms count as one. */
const announcements = (said: Said[]) => {
  const last = new Map<string, number>();
  let n = 0;
  for (const s of said) {
    const prev = last.get(s.region);
    if (prev === undefined || s.t - prev > 100) n++;
    last.set(s.region, s.t);
  }
  return n;
};

const said = (page: Page) =>
  page.evaluate(() => {
    const w = window as unknown as { said: Said[] };
    const out = w.said;
    w.said = [];
    return out;
  });

test.describe("live regions", () => {
  for (const p of PAGES.filter(
    (p) => isChapter(p.name) || p.name.startsWith("sandbox"),
  ))
    test(`live-region rate ${p.name}`, async ({ page, browserName }) => {
      test.skip(browserName !== "chromium", "rate is the same everywhere");
      test.setTimeout(600_000);
      await page.setViewportSize({ width: 1440, height: 900 });
      await watchLive(page);
      await openPage(page, p.url);
      const rows: {
        step: number;
        playMs: number;
        duringPlay: number;
        perSecond: number;
        steps: number;
        perStep: number;
        regions: string[];
      }[] = [];
      const n = isChapter(p.name) ? await page.locator(".step").count() : 1;
      const scope = isChapter(p.name) ? ".chapter__figure" : "main";
      for (let i = 1; i <= n; i++) {
        if (isChapter(p.name)) {
          await page
            .locator(".step")
            .nth(i - 1)
            .evaluate((el) => {
              el.scrollIntoView({ block: "center" });
            });
          await page.waitForTimeout(400);
        }
        const bar = page.locator(`${scope} .playback`).first();
        if (!(await bar.count())) continue;
        const play = bar.getByRole("button", { name: "Play" });
        const stepBtn = bar.getByRole("button", { name: "Step" });
        // Rewind so there is something to play.
        const scrub = bar.getByRole("slider").first();
        await scrub.focus();
        await page.keyboard.press("Home");
        await page.waitForTimeout(200);
        await said(page);
        let playMs = 0;
        let duringPlay: Said[] = [];
        if (await play.isEnabled()) {
          await play.click();
          const t0 = Date.now();
          await page.waitForTimeout(3000);
          const pause = bar.getByRole("button", { name: "Pause" });
          // The run may end, disabling Pause, between the check and the click.
          if (await pause.isEnabled())
            await pause.click({ timeout: 2000 }).catch(() => undefined);
          playMs = Date.now() - t0;
          duringPlay = await said(page);
        }
        let stepped = 0;
        const afterSteps: Said[] = [];
        for (let k = 0; k < 3; k++) {
          if (!(await stepBtn.isEnabled())) break;
          await stepBtn.click();
          stepped++;
          await page.waitForTimeout(300);
          afterSteps.push(...(await said(page)));
        }
        const a = announcements(duringPlay);
        rows.push({
          step: i,
          playMs,
          duringPlay: a,
          perSecond: playMs ? +(a / (playMs / 1000)).toFixed(2) : 0,
          steps: stepped,
          perStep: stepped
            ? +(announcements(afterSteps) / stepped).toFixed(2)
            : 0,
          regions: [
            ...new Set([...duringPlay, ...afterSteps].map((s) => s.region)),
          ],
        });
      }
      save("live", p.name, rows);
      expect(rows.length).toBeGreaterThan(0);
    });
});

test.describe("reduced motion", () => {
  for (const p of PAGES)
    for (const width of [375, 1440])
      test(`reduced motion ${p.name} ${String(width)}`, async ({
        page,
        browserName,
      }) => {
        await page.emulateMedia({ reducedMotion: "reduce" });
        await page.setViewportSize({ width, height: 900 });
        await openPage(page, p.url);
        const ranges = () =>
          page.evaluate(() =>
            [
              ...document.querySelectorAll<HTMLInputElement>(
                'input[type="range"]',
              ),
            ].map((r) => r.value),
          );
        const before = await ranges();
        await page.waitForTimeout(3000);
        const after = await ranges();
        // Visit every step on the wide board, as a reader scrolling would.
        const steps = width === 1440 ? await page.locator(".step").count() : 0;
        const running: string[] = [];
        let bars = 0;
        let enabledPlay = 0;
        const scan = async () => {
          bars = Math.max(bars, await page.locator(".playback").count());
          enabledPlay += await page
            .locator('button[aria-label="Play"]:not([disabled])')
            .count();
          running.push(
            ...(await page.evaluate(() =>
              document
                .getAnimations()
                .filter((a) => a.playState === "running")
                .map((a) => {
                  const t = (a.effect as KeyframeEffect | null)?.target;
                  return `${a.constructor.name} ${t instanceof Element ? (t.getAttribute("class") ?? "").slice(0, 40) : ""}`;
                }),
            )),
          );
        };
        await scan();
        for (let i = 0; i < steps; i++) {
          await page
            .locator(".step")
            .nth(i)
            .evaluate((el) => {
              el.scrollIntoView({ block: "center" });
            });
          await page.waitForTimeout(150);
          await scan();
        }
        const transitions = await page.evaluate(() => {
          const out = new Set<string>();
          for (const el of document.querySelectorAll("*")) {
            const cs = getComputedStyle(el);
            const moving =
              cs.transitionDuration
                .split(",")
                .some((d) => parseFloat(d) > 0.01) ||
              cs.animationName !== "none";
            if (moving)
              out.add(
                `${el.tagName.toLowerCase()}.${(el.getAttribute("class") ?? "").split(" ")[0] ?? ""} ${cs.transitionProperty} ${cs.transitionDuration} ${cs.animationName}`,
              );
          }
          return [...out];
        });
        const notices = await page.getByText("Motion is reduced").count();
        const report = {
          autoplay: before.some((v, i) => v !== after[i]),
          running: [...new Set(running)],
          transitions,
          playbackBars: bars,
          enabledPlay,
          notices,
        };
        save(
          "reduced-motion",
          `${p.name}-${String(width)}-${browserName}`,
          report,
        );
        expect.soft(report.autoplay).toBe(false);
        expect.soft(report.running).toEqual([]);
        expect.soft(report.transitions).toEqual([]);
        expect.soft(enabledPlay).toBe(0);
      });
});
