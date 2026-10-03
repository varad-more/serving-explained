import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parseSources, sourcesJson } from "../scripts/gen-sources.ts";

const markdown = readFileSync("docs/SOURCES.md", "utf8");

function files(dir: string, ext: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return files(path, ext);
    return path.endsWith(ext) ? [path] : [];
  });
}

describe("src/data/sources.json", () => {
  it("matches a fresh parse of docs/SOURCES.md, so it is never stale", () => {
    expect(readFileSync("src/data/sources.json", "utf8")).toBe(
      sourcesJson(markdown),
    );
  });

  it("has every source once, each with an https URL and a year", () => {
    const sources = parseSources(markdown);
    expect(sources.length).toBeGreaterThanOrEqual(12);
    expect(new Set(sources.map((s) => s.id)).size).toBe(sources.length);
    for (const s of sources) {
      expect(s.url).toMatch(/^https:\/\//);
      expect(s.year).toBeGreaterThan(2000);
    }
  });

  it("every SourceLink id used in src/**/*.mdx and *.tsx exists", () => {
    const ids = new Set(parseSources(markdown).map((s) => s.id));
    const used = [...files("src", ".mdx"), ...files("src", ".tsx")].flatMap(
      (f) =>
        [
          ...readFileSync(f, "utf8").matchAll(/<SourceLink\s+id="([^"]+)"/g),
        ].map((m) => [f, m[1]]),
    );
    for (const [file, id] of used)
      expect(ids.has(id ?? ""), `${String(file)}: ${String(id)}`).toBe(true);
  });
});
