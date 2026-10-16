/**
 * The sandbox (tasks/todo.md, Prompt 7, "Tests"): share links reproduce,
 * downloads parse, fuzzed links render, cancel stops the worker, A/B
 * updates the diff, scrubbing updates the events list, and the DoD checks.
 * Responsiveness on a 5,000-request run is in sandbox-perf.spec.ts.
 */
import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import {
  axeViolations,
  clippedSvgText,
  horizontalOverflow,
  shifts,
  smallTargets,
  watchErrors,
  watchShifts,
} from "./helpers.ts";
import { open, seek, shareLink, URL, waitDone } from "./sandbox.ts";

const AB = "v=1&a.p=chatbot&a.sc=static&b.p=chatbot";

test.describe("sandbox: runs and links", () => {
  test("a copied link reproduces both runs exactly", async ({
    page,
    context,
  }) => {
    const errors = watchErrors(page);
    await open(page, 1440, AB);
    await waitDone(page, 2);
    const link = await shareLink(page);
    expect(link).toMatch(/[?&]h=[0-9a-f]{8}&hb=[0-9a-f]{8}$/);
    const fresh = await context.newPage();
    await fresh.goto(link ?? "");
    await expect(fresh.locator(".sb-verify")).toHaveText(
      /^Run A reproduced exactly \(log hash [0-9a-f]{8}\)\. Run B reproduced exactly \(log hash [0-9a-f]{8}\)\.$/,
      { timeout: 60_000 },
    );
    expect(errors).toEqual([]);
  });

  test("a link whose hash does not match says so, naming both hashes", async ({
    page,
  }) => {
    await open(page, 1440, "v=1&a.n=40&h=00000000");
    await expect(page.locator(".sb-verify")).toHaveText(
      /^The run's log hash is [0-9a-f]{8}, but the link says 00000000: the engine or its data changed since the link was made\.$/,
      { timeout: 60_000 },
    );
  });

  test("Download JSON holds the config, metrics, and hash", async ({
    page,
  }) => {
    await open(page, 1440, "v=1&a.n=40");
    await waitDone(page);
    const [download] = await Promise.all([
      page.waitForEvent("download"),
      page.getByRole("button", { name: "Download JSON" }).click(),
    ]);
    const json = JSON.parse(readFileSync(await download.path(), "utf8")) as {
      provenance: string;
      config: { a: { n: number } };
      metrics: { a: { outputTokensPerS: number } };
      hashes: { a: string };
      _provenance: { models: { commit: string } };
    };
    expect(json.provenance).toBe("simulated");
    expect(json.config.a.n).toBe(40);
    expect(json.metrics.a.outputTokensPerS).toBeGreaterThan(0);
    expect(json.hashes.a).toMatch(/^[0-9a-f]{14}$/);
    expect(json._provenance.models.commit).toMatch(/^[0-9a-f]{40}$/);
  });

  // Each is invalid in its own way; each must render, with a notice.
  const FUZZED = [
    "v=1&a.n=abc",
    "v=1&a.n=-5",
    "v=1&a.n=99999999",
    "v=1&a.bs=17",
    "v=1&a.m=gpt-9",
    "v=1&a.g=tpu",
    "v=1&a.kd=int4",
    "v=1&a.gf=2",
    "v=1&a.cap=7",
    "v=1&a.al=buddy",
    "v=1&a.pc=yes",
    "v=1&a.sc=fifo",
    "v=1&a.ns=0",
    "v=1&a.bt=1e9",
    "v=1&a.ml=10",
    "v=1&a.pl=z9",
    "v=1&a.ol=x1:f1|1:f1|1:f1|1:f1|1:f1",
    "v=1&a.sp=1,2",
    "v=1&a.r=-1",
    "v=1&a.zz=1",
    "v=9&a.n=5",
    "v=1&a.p=%3Cscript%3Ealert(1)%3C%2Fscript%3E",
    "v=1&a.s=%E2%9C%93%F0%9F%98%80",
    "v=1&h=nothex&a.n=10",
    "v=1&__proto__=1&a.constructor=1",
  ];
  test("25 fuzzed links render with defaults and a notice", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    const errors = watchErrors(page);
    for (const q of FUZZED) {
      await page.goto(`${URL}?${q}`);
      await expect(
        page.getByRole("heading", { level: 1, name: "Sandbox" }),
      ).toBeVisible();
      await expect(page.locator(".sb-notices li").first(), q).toBeVisible();
    }
    expect(errors).toEqual([]);
  });

  test("Cancel stops a 5,000-request run at once, and no progress follows", async ({
    page,
  }) => {
    await open(page, 1440, "v=1&a.n=5000");
    const progress = page.locator(".sb-progress");
    await expect(progress).toHaveAttribute("data-hidden", "false", {
      timeout: 5_000,
    });
    await page.getByRole("button", { name: "Cancel" }).click();
    await expect(page.locator("section.sb-run")).toHaveAttribute(
      "data-status",
      "cancelled",
      {
        timeout: 100,
      },
    );
    await expect(page.locator(".sb-status")).toHaveText(/Run cancelled/);
    const before = await page.locator(".sb-run").textContent();
    await page.waitForTimeout(800);
    expect(await page.locator(".sb-run").textContent()).toBe(before);
  });

  test("A/B: changing B's scheduler updates the diff table", async ({
    page,
  }) => {
    await open(page, 1440, "v=1&a.p=chatbot&b.p=chatbot");
    await waitDone(page, 2);
    const ttft = page.locator(".sb-diff tr", { hasText: "Mean TTFT" });
    await expect(ttft).toContainText("identical (same log hash)");
    await page.getByRole("tab", { name: "B" }).click();
    await page.getByLabel("Scheduler", { exact: true }).selectOption("static");
    await waitDone(page, 2);
    await expect(ttft).toContainText("▲");
    await expect(ttft).not.toContainText("identical");
  });

  test("scrubbing changes the events listed at the playhead", async ({
    page,
  }) => {
    await open(page, 1440, "v=1&a.n=60");
    await waitDone(page);
    const list = page.locator(".sb-events__list");
    const t5 = await seek(page, 5);
    await expect(page.locator(".sb-events")).toHaveAttribute(
      "data-t1",
      String(t5),
    );
    const first = await list.textContent();
    const t12 = await seek(page, 12);
    await expect(page.locator(".sb-events")).toHaveAttribute(
      "data-t1",
      String(t12),
    );
    expect(await list.textContent()).not.toBe(first);
    expect(first).toContain("StepEnd");
  });

  test("guardrails: a model too big for the GPU explains why, with computed numbers", async ({
    page,
  }) => {
    await open(page, 1440, "v=1&a.m=llama-3.1-70b");
    await expect(page.locator(".sb-error")).toContainText(
      "Llama-3.1-70B's weights (131.4 GiB) need more than this GPU's 20.7 GiB budget (22.5 GiB × 0.92).",
    );
    await expect(page.locator(".sb-error a")).toHaveAttribute(
      "href",
      /llm-calculator/,
    );
  });

  test("no layout shift while a run fills in the views", async ({ page }) => {
    await watchShifts(page);
    const errors = watchErrors(page);
    await open(page, 1440, AB);
    await waitDone(page, 2);
    await seek(page, 10, 2);
    expect(await shifts(page)).toEqual([]);
    expect(errors).toEqual([]);
  });
});

test.describe("sandbox: sizes and accessibility", () => {
  for (const width of [375, 768, 1440] as const) {
    test(`no horizontal scroll or clipped SVG text at ${String(width)} px`, async ({
      page,
    }) => {
      await open(page, width, AB);
      await waitDone(page, 2);
      await seek(page, 10, 2);
      expect(await horizontalOverflow(page)).toBe(0);
      expect(await clippedSvgText(page)).toEqual([]);
    });
  }

  for (const width of [375, 768] as const) {
    test(`every control is at least 44 × 44 px at ${String(width)} px`, async ({
      page,
    }) => {
      await open(page, width, AB);
      await waitDone(page, 2);
      expect(await smallTargets(page)).toEqual([]);
    });
  }

  for (const [width, colorScheme] of [
    [768, "light"],
    [768, "dark"],
    [1440, "light"],
  ] as const) {
    test(`axe finds no violations at ${String(width)} px, ${colorScheme}`, async ({
      page,
    }) => {
      await page.emulateMedia({ colorScheme });
      await open(page, width, AB);
      await waitDone(page, 2);
      expect(await axeViolations(page)).toEqual([]);
    });
  }
});

test.describe("sandbox: screenshots @screenshot", () => {
  for (const width of [375, 768, 1440] as const) {
    for (const colorScheme of ["light", "dark"] as const) {
      for (const [mode, query, runs] of [
        ["default", "", 1],
        ["ab", AB, 2],
      ] as const) {
        test(`${String(width)} px, ${colorScheme}, ${mode} @screenshot`, async ({
          page,
          browserName,
        }) => {
          test.skip(
            browserName !== "chromium",
            "pixel baselines are Chromium only",
          );
          await page.emulateMedia({ colorScheme });
          await open(page, width, query);
          await waitDone(page, runs);
          const t = await seek(page, 20, runs);
          await expect(page.locator(".sb-events").first()).toHaveAttribute(
            "data-t1",
            String(t),
          );
          await page.evaluate(() => {
            const h = document.documentElement.getBoundingClientRect().height;
            document.documentElement.style.minHeight = `${String(Math.ceil(h))}px`;
          });
          await expect(page).toHaveScreenshot(
            `sandbox-${String(width)}-${colorScheme}-${mode}.png`,
            {
              fullPage: true,
              animations: "disabled",
              caret: "hide",
            },
          );
        });
      }
    }
  }
});
