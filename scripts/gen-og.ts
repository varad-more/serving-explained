/**
 * Preview images from the real site (tasks/todo.md, Prompt 9 decision 4).
 * `pnpm gen:og` builds dist-og (VITE_OG=1), serves it, and screenshots each
 * card on /og-cards/: public/og/<slug>.png at 1200 × 630, and the repo's
 * social preview, docs/launch/social-preview.png, at 1280 × 640. Each
 * widget's playhead is set to the same share of its run first, so the
 * images do not depend on timing.
 */
import { spawn } from "node:child_process";
import { mkdirSync, statSync } from "node:fs";
import { chromium, type Locator } from "@playwright/test";
import { routes } from "../src/routes.ts";

// Not 4173–4177: other preview servers may hold those.
const PORT = 4186;
/**
 * Where each card's playhead stops, as a share of its run: a moment when
 * both sides of a comparison are busy.
 */
export const PLAYHEAD: Record<string, number> = {
  index: 0.12,
  "paged-attention": 0.12,
  "continuous-batching": 0.45,
  "prefix-caching": 0.25,
  "social-preview": 0.12,
};
const MAX_SOCIAL_BYTES = 1_000_000;

/** Sets a range input as a reader's drag would, so React sees it. */
async function seek(slider: Locator, share: number) {
  await slider.evaluate((el, share) => {
    const input = el as HTMLInputElement;
    const v =
      Number(input.min) + share * (Number(input.max) - Number(input.min));
    // eslint-disable-next-line @typescript-eslint/unbound-method
    const set = Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value",
    )?.set;
    set?.call(input, String(v));
    input.dispatchEvent(new Event("input", { bubbles: true }));
  }, share);
}

async function waitFor(url: string) {
  for (let i = 0; i < 100; i++) {
    try {
      if ((await fetch(url)).ok) return;
    } catch {
      // Not up yet.
    }
    await new Promise((r) => setTimeout(r, 150));
  }
  throw new Error(`preview server did not start at ${url}`);
}

// The vite binary itself, not `pnpm exec`, so kill() stops the server.
const server = spawn(
  "node_modules/.bin/vite",
  ["preview", "--outDir", "dist-og", "--port", String(PORT), "--strictPort"],
  { stdio: "ignore" },
);
const browser = await chromium.launch();
try {
  const root = `http://localhost:${String(PORT)}/serving-explained/`;
  await waitFor(root);
  const page = await browser.newPage({
    viewport: { width: 1400, height: 900 },
    colorScheme: "light",
  });
  await page.goto(`${root}og-cards/`);
  await page.locator('[data-card="social-preview"]').waitFor();
  await page.evaluate(() => document.fonts.ready);
  const sandbox = page
    .locator('[data-card="sandbox"] iframe')
    .contentFrame()
    .locator('section.sb-run[data-status="done"]');
  await sandbox.nth(1).waitFor({ timeout: 60_000 });

  for (const [id, share] of Object.entries(PLAYHEAD))
    for (const slider of await page
      .locator(`[data-card="${id}"] .playback input[type=range]`)
      .all())
      await seek(slider, share);
  await page.waitForTimeout(500);
  // The sandbox card shows only the A/B views: the diff and both runs.
  await page
    .locator('[data-card="sandbox"] iframe')
    .contentFrame()
    .locator("body")
    .evaluate((body) => {
      const style = body.ownerDocument.createElement("style");
      style.textContent = `
        .site-header, .skip, .sandbox > h1, .sandbox__lede,
        .sandbox__controls, .sb-ab, .sb-share, .sb-verify,
        .playback { display: none !important; }
        .sandbox__layout { display: block !important; }
        main { padding-top: 0 !important; }
      `;
      body.append(style);
    });
  // The widgets without their playback bars and setting controls.
  await page.addStyleTag({
    content: `
      .og__widget .playback, .og__widget .paged__controls,
      .og__widget .paged__select, .og__widget .paged__keys,
      .og__widget .cb__controls, .og__widget .cb__charts,
      .og__widget .cache__note { display: none !important; }
    `,
  });
  await page.waitForTimeout(300);
  // Shrink each widget to fit its box, so no card crops its figure.
  await page.locator(".og__widget").evaluateAll((boxes) => {
    for (const box of boxes) {
      const inner = box.firstElementChild as HTMLElement | null;
      if (!inner || inner.tagName === "IFRAME") continue;
      const zoom = Math.min(
        1,
        box.clientWidth / inner.scrollWidth,
        box.clientHeight / inner.scrollHeight,
      );
      inner.style.zoom = String(zoom);
    }
  });
  await page.waitForTimeout(300);

  /** A card's exact pixels: its box can sit at a fractional offset. */
  const shoot = async (id: string, path: string) => {
    const box = await page.locator(`[data-card="${id}"]`).boundingBox();
    if (!box) throw new Error(`no card ${id}`);
    await page.screenshot({
      path,
      fullPage: true,
      clip: {
        x: Math.round(box.x),
        y: Math.round(box.y),
        width: Math.round(box.width),
        height: Math.round(box.height),
      },
    });
  };

  mkdirSync("public/og", { recursive: true });
  mkdirSync("docs/launch", { recursive: true });
  for (const r of routes) {
    const id = r.slug || "index";
    const file = `public/${r.ogImage}`;
    await shoot(id, file);
    console.log(`gen-og: ${file}`);
  }
  const social = "docs/launch/social-preview.png";
  await shoot("social-preview", social);
  const bytes = statSync(social).size;
  console.log(`gen-og: ${social}, ${String(bytes)} bytes`);
  if (bytes >= MAX_SOCIAL_BYTES)
    throw new Error(`${social} is ${String(bytes)} bytes; GitHub allows 1 MB`);
} finally {
  await browser.close();
  server.kill();
}
