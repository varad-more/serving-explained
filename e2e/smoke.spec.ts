/**
 * Every route returns 200 from its own index.html, has no console errors, and
 * has its own title and og:image, in the raw HTML and once the app runs
 * (Prompt 1 step 7). With SMOKE_BASE_URL set, it runs against the live site.
 */
import { expect, test } from "@playwright/test";
import { pageTitle, routePath, routes } from "../src/routes.ts";
import { BASE, SITE_URL, watchErrors } from "./helpers.ts";

const og = (html: string) =>
  /<meta property="og:image" content="([^"]+)"/.exec(html)?.[1];
const title = (html: string) => /<title>([^<]*)<\/title>/.exec(html)?.[1];

test.describe("smoke", () => {
  for (const route of routes) {
    const url = BASE + routePath(route.slug).slice(1);
    test(`${route.slug || "landing"} serves its own HTML and runs cleanly`, async ({
      page,
      request,
    }) => {
      const res = await request.get(url);
      expect(res.status()).toBe(200);
      const html = await res.text();
      expect(title(html)).toBe(pageTitle(route));
      expect(og(html)).toBe(SITE_URL + route.ogImage);

      const errors = watchErrors(page);
      await page.goto(url);
      await expect(page.locator("h1")).toBeVisible();
      await expect(page).toHaveTitle(pageTitle(route));
      await expect(page.locator('meta[property="og:image"]')).toHaveAttribute(
        "content",
        SITE_URL + route.ogImage,
      );
      const image = await request.get(BASE + route.ogImage);
      expect(image.status()).toBe(200);
      expect(errors).toEqual([]);
    });
  }

  test("titles and og:images are unique across routes", async ({ request }) => {
    const pages = await Promise.all(
      routes.map(async (r) =>
        (await request.get(BASE + routePath(r.slug).slice(1))).text(),
      ),
    );
    expect(new Set(pages.map(title)).size).toBe(routes.length);
    expect(new Set(pages.map(og)).size).toBe(routes.length);
  });

  test("without JavaScript, every route says why it is blank (AUDIT.md R1)", async ({
    browser,
  }) => {
    const context = await browser.newContext({ javaScriptEnabled: false });
    const page = await context.newPage();
    for (const route of routes) {
      await page.goto(BASE + routePath(route.slug).slice(1));
      await expect(page.getByText(/needs JavaScript/)).toBeVisible();
    }
    await context.close();
  });

  test("an unknown path renders the not-found page", async ({ page }) => {
    await page.goto(`${BASE}no-such-page/`);
    await expect(page.locator("h1")).toHaveText("Page not found");
  });
});
