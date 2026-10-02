/**
 * Renders a 1200×630 preview image per route into public/og/, in the Signal
 * Box style (DESIGN.md). A temporary template: Prompt 9 replaces it with
 * cards rendered from the real site.
 */
import { mkdirSync } from "node:fs";
import { chromium } from "@playwright/test";
import { routes, type Route } from "../src/routes.ts";
import { escapeHtml } from "./postbuild.ts";

function card(route: Route, index: number): string {
  const number = index >= 1 && index <= 4 ? `0${String(index)}` : "";
  return `<!doctype html>
<html><head><meta charset="utf-8"><style>
  * { margin: 0; box-sizing: border-box; }
  body {
    width: 1200px; height: 630px; padding: 64px 80px;
    background: #fafaf7; color: #111111;
    font-family: "Helvetica Neue", Helvetica, "Nimbus Sans", Arial, sans-serif;
    display: flex; flex-direction: column; justify-content: space-between;
  }
  header { font-size: 28px; font-weight: 700; padding-bottom: 24px;
    border-bottom: 6px solid #111111; display: flex; justify-content: space-between; }
  .number { font-variant-numeric: tabular-nums; }
  h1 { font-size: 84px; font-weight: 700; letter-spacing: -0.015em; line-height: 1.05;
    background: #ffcc00; padding: 8px 24px; margin-left: -24px; align-self: flex-start; }
  p { font-size: 34px; line-height: 1.35; max-width: 980px; }
  footer { border-top: 2px solid #111111; padding-top: 20px; font-size: 24px; }
</style></head><body>
  <header><span>serving-explained</span><span class="number">${number}</span></header>
  <h1>${escapeHtml(route.title)}</h1>
  <p>${escapeHtml(route.description)}</p>
  <footer>varadmore.me/serving-explained</footer>
</body></html>`;
}

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1200, height: 630 } });
mkdirSync("public/og", { recursive: true });
for (const [index, route] of routes.entries()) {
  await page.setContent(card(route, index));
  await page.screenshot({ path: `public/${route.ogImage}` });
  console.log(`gen-og: public/${route.ogImage}`);
}
await browser.close();
