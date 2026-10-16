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

const held = (slot: number): Cell => ({
  kind: "held",
  req: slot,
  slot,
  fill: 4,
  logical: 0,
});

describe("the summary strip", () => {
  it("never tells requests apart by color alone (AUDIT.md C2-2)", () => {
    const cells = Array.from({ length: 64 }, (_, i) => held((i % 8) + 1));
    expect(new Set(summaryRects(cells).map((r) => r.cls))).toEqual(
      new Set(["summary--held"]),
    );
  });

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
