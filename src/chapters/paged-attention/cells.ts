/**
 * What each grid cell shows. One cell is one block of B slots for both
 * allocators, so the contiguous and paged grids line up cell for cell.
 */
import type { Frame } from "./frames.ts";
import type { Allocator } from "./presets.ts";

export type Cell =
  | { kind: "free" }
  /** Free space too small for a region (contiguous only). */
  | { kind: "gap" }
  /** Held by a request; `fill` of B slots hold KV. */
  | { kind: "held"; req: number; slot: number; fill: number; logical: number }
  /**
   * Chapter 4: held by two or more requests. `reqs[i]` maps it at its logical
   * block `logical[i]`. A shared block is always full.
   */
  | { kind: "shared"; reqs: number[]; logical: number[] }
  /** Chapter 4: no request holds it, but it keeps its key. 1 = next to evict. */
  | { kind: "cached"; rank: number };

export interface GridSpec {
  allocator: Allocator;
  blockSize: number;
  capacity: number;
  maxModelLen: number;
}

export function cellsOf(frame: Frame | null, spec: GridSpec): Cell[] {
  const { blockSize: B, capacity, maxModelLen } = spec;
  const n = capacity / B;
  const cells: Cell[] = Array.from({ length: n }, () => ({ kind: "free" }));
  if (!frame)
    return spec.allocator === "contiguous-max"
      ? withGaps(cells, B, maxModelLen)
      : cells;
  for (const h of frame.holders) {
    if (h.region) {
      const first = h.region.start / B;
      for (let i = 0; i < h.region.len / B; i++) {
        const fill = clamp(h.computed - i * B, B);
        cells[first + i] = {
          kind: "held",
          req: h.req,
          slot: h.slot,
          fill,
          logical: i,
        };
      }
    } else {
      h.blocks.forEach((block, i) => {
        cells[block] = {
          kind: "held",
          req: h.req,
          slot: h.slot,
          fill: clamp(h.computed - i * B, B),
          logical: i,
        };
      });
    }
  }
  return spec.allocator === "contiguous-max"
    ? withGaps(cells, B, maxModelLen)
    : cells;
}

const clamp = (x: number, max: number) => Math.min(max, Math.max(0, x));

/** Marks runs of free cells shorter than a region as gap (SIM.md §3, Q4). */
function withGaps(cells: Cell[], B: number, maxModelLen: number): Cell[] {
  let i = 0;
  while (i < cells.length) {
    if (cells[i]?.kind !== "free") {
      i++;
      continue;
    }
    let j = i;
    while (j < cells.length && cells[j]?.kind === "free") j++;
    if ((j - i) * B < maxModelLen)
      for (let k = i; k < j; k++) cells[k] = { kind: "gap" };
    i = j;
  }
  return cells;
}

/** One sentence for the canvas's accessible name and the live region. */
export function describe(frame: Frame | null, spec: GridSpec): string {
  const name = spec.allocator === "paged" ? "Paged" : "Contiguous";
  if (!frame) return `${name}: no requests yet.`;
  const cells = cellsOf(frame, spec);
  const held = cells.filter((c) => c.kind === "held").length;
  const B = spec.blockSize;
  const held_ =
    spec.allocator === "paged"
      ? `${String(held)} of ${String(cells.length)} blocks held`
      : `${String(held * B)} of ${String(spec.capacity)} slots reserved`;
  return `${name} at ${frame.t.toFixed(2)} s: ${String(frame.running)} running, ${String(frame.waiting)} waiting; ${held_}.`;
}
