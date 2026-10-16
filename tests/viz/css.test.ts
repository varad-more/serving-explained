import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function cssFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return cssFiles(path);
    return path.endsWith(".css") ? [path] : [];
  });
}

/** Rule bodies, roughly: everything between a `{` and its `}`. */
function rules(css: string): { selector: string; body: string }[] {
  const out: { selector: string; body: string }[] = [];
  const re = /([^{}]+)\{([^{}]*)\}/g;
  for (const m of css.replace(/\/\*[\s\S]*?\*\//g, "").matchAll(re)) {
    out.push({ selector: (m[1] ?? "").trim(), body: m[2] ?? "" });
  }
  return out;
}

describe("CSS", () => {
  it("text on a --highlight background always uses --on-highlight (AUDIT.md m1)", () => {
    for (const file of cssFiles("src")) {
      for (const r of rules(readFileSync(file, "utf8"))) {
        if (/background(-color)?:[^;]*var\(--highlight\)/.test(r.body)) {
          expect(r.body, `${file}: ${r.selector}`).toMatch(
            /(^|;|\s)color:\s*var\(--on-highlight\)/,
          );
        }
      }
    }
  });

  it("a state drawn in --highlight has a second cue besides color (AUDIT.md A4)", () => {
    const state =
      /aria-current|aria-selected|data-active|is-active|--active|--cursor|--selected/;
    const cue =
      /text-decoration:|font-weight:|stroke:\s*var\(--ink\)|border-[a-z]+:[^;]*var\(--ink\)/;
    for (const file of cssFiles("src")) {
      const all = rules(readFileSync(file, "utf8"));
      for (const r of all) {
        if (!state.test(r.selector) || !/var\(--highlight\)/.test(r.body))
          continue;
        const after = all.find((o) => o.selector === `${r.selector}::after`);
        expect(
          cue.test(r.body) || cue.test(after?.body ?? ""),
          `${file}: ${r.selector}`,
        ).toBe(true);
      }
    }
  });

  it("the two dark token blocks are identical, and light defines the same tokens", () => {
    const css = readFileSync("src/viz/tokens.css", "utf8");
    const blocks = rules(css).map((r) => {
      const tokens: Record<string, string> = {};
      for (const m of r.body.matchAll(/(--[\w-]+):\s*([^;]+);/g)) {
        tokens[m[1] ?? ""] = (m[2] ?? "").trim();
      }
      return { ...r, tokens };
    });
    const light = blocks.find((b) => b.selector.startsWith(":root,"));
    const darks = blocks.filter(
      (b) =>
        b.selector.includes("dark") ||
        b.selector.includes(':not([data-theme="light"])'),
    );
    expect(darks).toHaveLength(2);
    expect(darks[0]?.tokens).toEqual(darks[1]?.tokens);
    expect(Object.keys(light?.tokens ?? {}).sort()).toEqual(
      Object.keys(darks[0]?.tokens ?? {}).sort(),
    );
  });
});
