/**
 * Chapters 3 and 4 read their prose numbers from generated JSON (AUDIT.md
 * P1). Each file must equal what numbers.tsx computes now, and hold only
 * finite numbers, which JSON cannot change.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { CHAPTERS, figuresFile, serialize } from "../../scripts/gen-figures.ts";
import * as cb from "../../src/chapters/continuous-batching/numbers.tsx";
import * as pc from "../../src/chapters/prefix-caching/numbers.tsx";

const computed = {
  "continuous-batching": cb.F,
  "prefix-caching": pc.F,
} satisfies Record<(typeof CHAPTERS)[number], unknown>;

const numbers = (x: unknown): number[] =>
  typeof x === "number"
    ? [x]
    : x && typeof x === "object"
      ? Object.values(x).flatMap(numbers)
      : [];

describe("generated chapter numbers", () => {
  for (const slug of CHAPTERS) {
    it(`${slug}: the JSON is current (rerun pnpm gen:figures)`, () => {
      expect(readFileSync(figuresFile(slug), "utf8")).toBe(
        serialize(computed[slug]),
      );
    });

    it(`${slug}: every number survives JSON`, () => {
      const all = numbers(computed[slug]);
      expect(all.length).toBeGreaterThan(20);
      expect(all.filter((n) => !Number.isFinite(n))).toEqual([]);
    });
  }
});
