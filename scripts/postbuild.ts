/**
 * Writes dist/<slug>/index.html for every route, each with its own title,
 * description, canonical URL, and Open Graph and Twitter tags, so links
 * preview correctly without running JavaScript. Also writes dist/404.html.
 */
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pageTitle, routePath, routes, type Route } from "../src/routes.ts";
import { SITE_URL } from "./site.ts";

const TITLE = /<title>[^<]*<\/title>/;

export function escapeHtml(text: string): string {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

/** The head tags for one route. `siteUrl` ends with a slash. */
export function routeHead(route: Route, siteUrl: string): string {
  const title = escapeHtml(pageTitle(route));
  const description = escapeHtml(route.description);
  const url = new URL(routePath(route.slug).slice(1), siteUrl).href;
  const image = new URL(route.ogImage, siteUrl).href;
  return [
    `<title>${title}</title>`,
    `<meta name="description" content="${description}" />`,
    `<link rel="canonical" href="${url}" />`,
    `<meta property="og:type" content="website" />`,
    `<meta property="og:site_name" content="serving-explained" />`,
    `<meta property="og:title" content="${title}" />`,
    `<meta property="og:description" content="${description}" />`,
    `<meta property="og:url" content="${url}" />`,
    `<meta property="og:image" content="${image}" />`,
    `<meta property="og:image:width" content="1200" />`,
    `<meta property="og:image:height" content="630" />`,
    `<meta name="twitter:card" content="summary_large_image" />`,
    `<meta name="twitter:title" content="${title}" />`,
    `<meta name="twitter:description" content="${description}" />`,
    `<meta name="twitter:image" content="${image}" />`,
  ].join("\n    ");
}

const NOT_FOUND_HEAD = [
  "<title>Page not found – serving-explained</title>",
  '<meta name="robots" content="noindex" />',
].join("\n    ");

/** Rewrites dist in place and returns the files it wrote, relative to dist. */
export function postbuild(distDir: string, siteUrl: string): string[] {
  const template = readFileSync(join(distDir, "index.html"), "utf8");
  if (template.match(new RegExp(TITLE, "g"))?.length !== 1) {
    throw new Error("dist/index.html must contain exactly one <title>");
  }
  const written: string[] = [];
  const write = (file: string, head: string) => {
    const path = join(distDir, file);
    mkdirSync(join(path, ".."), { recursive: true });
    writeFileSync(path, template.replace(TITLE, head));
    written.push(file);
  };
  for (const route of routes) {
    write(join(route.slug, "index.html"), routeHead(route, siteUrl));
  }
  write("404.html", NOT_FOUND_HEAD);
  return written;
}

/** The production dist must not ship the kitchen sink (Prompt 1 step 6). */
export function assertNoKitchenSink(distDir: string): void {
  const assets = join(distDir, "assets");
  for (const file of readdirSync(assets)) {
    if (
      /kitchen/i.test(file) ||
      readFileSync(join(assets, file), "utf8").includes("Kitchen sink")
    ) {
      throw new Error(`postbuild: ${file} contains the kitchen sink`);
    }
  }
}

if (import.meta.main) {
  assertNoKitchenSink("dist");
  const files = postbuild("dist", SITE_URL);
  console.log(`postbuild: wrote ${String(files.length)} pages for ${SITE_URL}`);
}
