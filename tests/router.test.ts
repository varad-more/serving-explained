import { describe, expect, it } from "vitest";
import { href, matchRoute, normalizePath } from "../src/router.ts";

const slugOf = (pathname: string, base: string) =>
  matchRoute(pathname, base)?.slug;

describe.each(["/", "/serving-explained/"])("base %s", (base) => {
  it("matches the landing page with and without the trailing slash", () => {
    expect(slugOf(base, base)).toBe("");
    expect(slugOf(base.slice(0, -1) || "/", base)).toBe("");
  });

  it("matches every chapter, with and without the trailing slash", () => {
    for (const slug of [
      "kv-cache",
      "paged-attention",
      "continuous-batching",
      "prefix-caching",
      "sandbox",
      "glossary",
    ]) {
      expect(slugOf(`${base}${slug}/`, base)).toBe(slug);
      expect(slugOf(`${base}${slug}`, base)).toBe(slug);
    }
  });

  it("returns undefined for unknown and nested paths", () => {
    expect(slugOf(`${base}nope/`, base)).toBeUndefined();
    expect(slugOf(`${base}kv-cache/extra/`, base)).toBeUndefined();
    expect(slugOf(`${base}KV-cache/`, base)).toBeUndefined();
  });

  it("builds hrefs under the base", () => {
    expect(href("/", base)).toBe(base);
    expect(href("/kv-cache/#step-2", base)).toBe(`${base}kv-cache/#step-2`);
  });
});

describe("paths outside the base", () => {
  it("do not match", () => {
    expect(slugOf("/kv-cache/", "/serving-explained/")).toBeUndefined();
    expect(slugOf("/other/kv-cache/", "/serving-explained/")).toBeUndefined();
  });
});

describe("normalizePath", () => {
  it("adds a missing trailing slash and keeps an existing one", () => {
    expect(normalizePath("/a")).toBe("/a/");
    expect(normalizePath("/a/")).toBe("/a/");
  });
});
