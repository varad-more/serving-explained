/**
 * Launch audit §4–§5 (docs/AUDIT.md): requests per page and after load, JS
 * bytes per route, no-JS and worker-failure fallbacks, the 404 page,
 * per-route metadata, and in-site links.
 */
import { gzipSync } from "node:zlib";
import { expect, test } from "@playwright/test";
import { routePath, routes } from "../src/routes.ts";
import { openPage, PAGES, save } from "./audit-helpers.ts";
import { BASE } from "./helpers.ts";

const origin = new URL(BASE).origin;

test.describe("requests", () => {
  for (const p of PAGES)
    test(`requests ${p.name}`, async ({ page, browserName }) => {
      const reqs: { url: string; type: string; afterLoad: boolean }[] = [];
      let loaded = false;
      page.on("load", () => (loaded = true));
      page.on("request", (r) =>
        reqs.push({ url: r.url(), type: r.resourceType(), afterLoad: loaded }),
      );
      const js: {
        url: string;
        body: number;
        gzip9: number;
        encoded: number;
      }[] = [];
      page.on("response", (r) => {
        if (r.request().resourceType() !== "script" && !r.url().endsWith(".js"))
          return;
        void (async () => {
          const body = await r.body().catch(() => Buffer.alloc(0));
          const sizes = await r
            .request()
            .sizes()
            .catch(() => null);
          js.push({
            url: r.url(),
            body: body.length,
            gzip9: gzipSync(body, { level: 9 }).length,
            encoded: sizes?.responseBodySize ?? -1,
          });
        })();
      });
      await page.setViewportSize({ width: 1440, height: 900 });
      await openPage(page, p.url);
      // Read the whole page and press Play once, as a reader would.
      const n = await page.locator(".step").count();
      for (let i = 0; i < n; i++) {
        await page
          .locator(".step")
          .nth(i)
          .evaluate((el) => {
            el.scrollIntoView({ block: "center" });
          });
        await page.waitForTimeout(150);
      }
      const play = page
        .locator('button[aria-label="Play"]:not([disabled])')
        .first();
      if (await play.count()) await play.click();
      await page.waitForTimeout(3000);
      const thirdParty = reqs.filter(
        (r) =>
          !r.url.startsWith(origin) &&
          !r.url.startsWith("data:") &&
          !r.url.startsWith("blob:"),
      );
      const report = {
        requests: reqs.length,
        thirdParty: thirdParty.map((r) => r.url),
        afterLoad: reqs
          .filter((r) => r.afterLoad)
          .map((r) => `${r.type} ${r.url.replace(origin, "")}`),
        cookies: (await page.context().cookies()).map((c) => c.name),
        storage: await page.evaluate(() => Object.keys(localStorage)),
        js: {
          files: js.length,
          gzip9: js.reduce((a, f) => a + f.gzip9, 0),
          encoded: js.reduce((a, f) => a + Math.max(0, f.encoded), 0),
          raw: js.reduce((a, f) => a + f.body, 0),
          list: js.map((f) => ({ ...f, url: f.url.replace(origin, "") })),
        },
      };
      save("requests", `${p.name}-${browserName}`, report);
      expect.soft(report.thirdParty).toEqual([]);
      expect.soft(report.cookies).toEqual([]);
      expect.soft(report.js.gzip9).toBeLessThan(200 * 1024);
    });
});

test("no JavaScript", async ({ browser, browserName }) => {
  test.skip(browserName !== "chromium", "one browser is enough");
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  const out: Record<string, { status: number; title: string; text: string }> =
    {};
  for (const p of PAGES) {
    const res = await page.goto(p.url);
    out[p.name] = {
      status: res?.status() ?? 0,
      title: await page.title(),
      text: (await page.locator("body").innerText()).slice(0, 300),
    };
  }
  save("fallbacks", "no-js", out);
  await context.close();
});

test("worker failure", async ({ page, browserName }) => {
  const sandbox = `${BASE}sandbox/`;
  const cases: Record<string, unknown> = {};
  // 1. The worker script fails to load.
  await page.route(/sim\.worker-.*\.js/, (r) => r.abort());
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(sandbox);
  await expect(page.locator("h1")).toBeVisible();
  await page.waitForTimeout(5000);
  cases.blocked = {
    status: await page.locator("section.sb-run").getAttribute("data-status"),
    text: (await page.locator("section.sb-run").innerText()).slice(0, 300),
    errors: [...errors],
  };
  await page.unroute(/sim\.worker-.*\.js/);
  // 2. No Worker at all.
  const page2 = await page.context().newPage();
  await page2.addInitScript(() => {
    (window as unknown as { Worker: undefined }).Worker = undefined;
  });
  const errors2: string[] = [];
  page2.on("pageerror", (e) => errors2.push(e.message));
  await page2.goto(sandbox);
  await expect(page2.locator("h1")).toBeVisible();
  await page2.waitForTimeout(3000);
  cases.noWorker = {
    status: await page2
      .locator("section.sb-run")
      .getAttribute("data-status")
      .catch(() => null),
    text: (await page2.locator("main").innerText()).slice(0, 400),
    errors: errors2,
  };
  save("fallbacks", `worker-${browserName}`, cases);
});

/** Reads a PNG's width and height from its IHDR chunk. */
const pngSize = (b: Buffer) => [b.readUInt32BE(16), b.readUInt32BE(20)];

test("404 and per-route metadata", async ({ request, browserName }) => {
  test.skip(browserName !== "chromium", "HTTP is the same everywhere");
  const meta = (html: string, attr: string, key: string) =>
    new RegExp(`<meta ${attr}="${key}" content="([^"]*)"`).exec(html)?.[1] ??
    null;
  const out: Record<string, unknown> = {};
  for (const r of routes) {
    const url = BASE + routePath(r.slug).slice(1);
    const res = await request.get(url);
    const html = await res.text();
    const image = meta(html, "property", "og:image");
    const img = image ? await request.get(image) : null;
    const buf = img ? await img.body() : null;
    out[r.slug || "landing"] = {
      status: res.status(),
      title: /<title>([^<]*)<\/title>/.exec(html)?.[1] ?? null,
      description: meta(html, "name", "description"),
      canonical: /<link rel="canonical" href="([^"]*)"/.exec(html)?.[1] ?? null,
      ogTitle: meta(html, "property", "og:title"),
      ogUrl: meta(html, "property", "og:url"),
      ogImage: image,
      ogImageStatus: img?.status() ?? null,
      ogImageSize: buf ? pngSize(buf) : null,
      twitterCard: meta(html, "name", "twitter:card"),
      twitterImage: meta(html, "name", "twitter:image"),
      lang: /<html lang="([^"]*)"/.exec(html)?.[1] ?? null,
    };
  }
  const missing = await request.get(`${BASE}no-such-page/`);
  const missingHtml = await missing.text();
  const noSlash = await request.get(`${BASE}kv-cache`, { maxRedirects: 0 });
  const deep = await request.get(`${BASE}kv-cache/no-such-page/`);
  const asset = await request.get(`${BASE}assets/no-such-file.js`);
  out.notFound = {
    status: missing.status(),
    title: /<title>([^<]*)<\/title>/.exec(missingHtml)?.[1] ?? null,
    noindex: missingHtml.includes('content="noindex"'),
    noSlash: [noSlash.status(), noSlash.headers().location ?? null],
    deep: deep.status(),
    asset: asset.status(),
  };
  save("fallbacks", "metadata", out);
});

test("in-site links and anchors", async ({ page, browserName }) => {
  test.skip(browserName !== "chromium", "links are the same everywhere");
  const links = new Map<string, string[]>();
  const external = new Set<string>();
  for (const p of PAGES) {
    await page.setViewportSize({ width: 768, height: 900 });
    await openPage(page, p.url);
    for (const d of await page.locator("details").all())
      await d.evaluate((el) => {
        (el as HTMLDetailsElement).open = true;
      });
    const hrefs = await page
      .locator("a[href]")
      .evaluateAll((as) => as.map((a) => (a as HTMLAnchorElement).href));
    for (const h of hrefs) {
      if (h.startsWith(origin)) links.set(h, [...(links.get(h) ?? []), p.name]);
      else if (h.startsWith("http")) external.add(h);
    }
  }
  const broken: string[] = [];
  for (const [href, from] of links) {
    const u = new URL(href);
    const res = await page.goto(href.split("#")[0] ?? href);
    // The not-found page links to itself (its skip link); 404 is right there.
    const expected = u.pathname.endsWith("/no-such-page/") ? 404 : 200;
    if (!res || res.status() !== expected) {
      broken.push(`${href} (${String(res?.status())}) from ${from.join(", ")}`);
      continue;
    }
    await expect(page.locator("h1").first()).toBeVisible();
    if (u.hash) {
      const id = decodeURIComponent(u.hash.slice(1));
      const found = await page.evaluate(
        (id) => Boolean(document.getElementById(id)),
        id,
      );
      if (!found)
        broken.push(
          `${href} (no #${id}) from ${[...new Set(from)].join(", ")}`,
        );
    }
  }
  save("links", "in-site", {
    checked: links.size,
    broken,
    external: [...external].sort(),
  });
  expect.soft(broken).toEqual([]);
});
