import { describe, expect, it } from "vitest";
import { routePath, routes } from "../src/routes.ts";

describe("routes", () => {
  it("has 7 routes with unique slugs and titles", () => {
    expect(routes).toHaveLength(7);
    expect(new Set(routes.map((r) => r.slug)).size).toBe(7);
    expect(new Set(routes.map((r) => r.title)).size).toBe(7);
  });

  it("gives every route a trailing-slash path and its own preview image", () => {
    for (const r of routes) {
      expect(routePath(r.slug)).toMatch(/^\/([a-z-]+\/)?$/);
      expect(r.ogImage).toBe(`og/${r.slug || "index"}.png`);
    }
  });
});
