/**
 * BlockGrid's summary strip keeps to CLAUDE.md's SVG budget: one rect per
 * block up to 2,000 blocks, then runs, then bins, always covering the pool.
 */
import { describe, expect, it } from "vitest";
import { summaryRects } from "../../src/chapters/paged-attention/BlockGrid.tsx";
import type { Cell } from "../../src/chapters/paged-attention/cells.ts";

const free: Cell = { kind: "free" };
const used = (req: number): Cell => ({
  kind: "used",
  req,
  fill: 16,
  logical: 0,
});

function covers(rects: { x: number; w: number }[], n: number) {
  let x = 0;
  for (const r of rects) {
    expect(r.x).toBe(x);
    x += r.w;
  }
  expect(x).toBe(n);
}

describe("the summary strip", () => {
  it("draws one rect per block in a small pool", () => {
    const cells = Array.from({ length: 2000 }, (_, i) =>
      i % 2 ? used(i) : free,
    );
    expect(summaryRects(cells)).toHaveLength(2000);
  });

  it("merges runs in a large pool", () => {
    const cells = Array.from({ length: 300_000 }, (_, i) =>
      i < 5000 ? used(i) : free,
    );
    const rects = summaryRects(cells);
    expect(rects.map((r) => r.cls)).toEqual([
      "summary--shared",
      "summary--free",
    ]);
    covers(rects, cells.length);
  });

  it("bins a large pool whose runs are too many, by each bin's most common kind", () => {
    // Every 3rd block in use: 200,000 runs, and every bin mostly free.
    const cells = Array.from({ length: 300_000 }, (_, i) =>
      i % 3 ? free : used(i),
    );
    const rects = summaryRects(cells);
    expect(rects.length).toBeLessThanOrEqual(2000);
    expect(new Set(rects.map((r) => r.cls))).toEqual(
      new Set(["summary--free"]),
    );
    covers(rects, cells.length);
  });
});
