import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { assertNoKitchenSink, postbuild } from "../scripts/postbuild.ts";
import { routes } from "../src/routes.ts";

const SITE = "https://example.com/base/";

function build() {
  const dist = mkdtempSync(join(tmpdir(), "postbuild-"));
  writeFileSync(
    join(dist, "index.html"),
    '<html><head><title>serving-explained</title></head><body><script src="/base/assets/x.js"></script></body></html>',
  );
  const files = postbuild(dist, SITE);
  const read = (file: string) => readFileSync(join(dist, file), "utf8");
  return { files, read };
}

const meta = (html: string, attr: string) =>
  new RegExp(`${attr}" content="([^"]*)"`).exec(html)?.[1];

describe("postbuild", () => {
  it("writes one index.html per route, plus 404.html", () => {
    const { files } = build();
    expect(files).toHaveLength(routes.length + 1);
    for (const r of routes) expect(files).toContain(join(r.slug, "index.html"));
    expect(files).toContain("404.html");
  });

  it("gives every route a unique title and description", () => {
    const { read } = build();
    const pages = routes.map((r) => read(join(r.slug, "index.html")));
    const titles = pages.map(
      (html) => /<title>([^<]*)<\/title>/.exec(html)?.[1],
    );
    expect(new Set(titles).size).toBe(routes.length);
    expect(new Set(pages.map((h) => meta(h, "description"))).size).toBe(
      routes.length,
    );
  });

  it("uses absolute canonical, og:url, og:image, and twitter:image URLs", () => {
    const { read } = build();
    for (const r of routes) {
      const html = read(join(r.slug, "index.html"));
      const page = r.slug === "" ? SITE : `${SITE}${r.slug}/`;
      expect(html).toContain(`<link rel="canonical" href="${page}" />`);
      expect(meta(html, 'property="og:url')).toBe(page);
      expect(meta(html, 'property="og:image')).toBe(`${SITE}${r.ogImage}`);
      expect(meta(html, 'name="twitter:image')).toBe(`${SITE}${r.ogImage}`);
      expect(html).toContain('src="/base/assets/x.js"');
    }
  });

  it("marks 404.html noindex", () => {
    const { read } = build();
    expect(read("404.html")).toContain(
      '<meta name="robots" content="noindex" />',
    );
  });

  it("has a committed 1200×630 preview image for every route", () => {
    for (const r of routes) {
      const path = join("public", r.ogImage);
      expect(existsSync(path), path).toBe(true);
      const png = readFileSync(path);
      expect([png.readUInt32BE(16), png.readUInt32BE(20)]).toEqual([1200, 630]);
    }
  });

  it("refuses a dist that ships the kitchen sink", () => {
    const dist = mkdtempSync(join(tmpdir(), "postbuild-"));
    mkdirSync(join(dist, "assets"));
    writeFileSync(join(dist, "assets", "index-abc.js"), "console.log('app')");
    expect(() => {
      assertNoKitchenSink(dist);
    }).not.toThrow();
    writeFileSync(join(dist, "assets", "KitchenSink-abc.js"), "x");
    expect(() => {
      assertNoKitchenSink(dist);
    }).toThrow(/kitchen sink/);
  });
});
