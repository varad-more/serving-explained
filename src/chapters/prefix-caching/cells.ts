/**
 * Chapter 4's grid cells from a frame: free, held by one request, shared by
 * several (reference count ≥ 2), or cached (no references, still keyed),
 * with each cached block's place in the eviction order (DESIGN.md).
 */
import type { Cell } from "../paged-attention/cells.ts";
import type { CacheFrame } from "./cacheFrames.ts";

export function cacheCells(
  frame: CacheFrame | null,
  numBlocks: number,
  blockSize: number,
): Cell[] {
  const cells: Cell[] = Array.from({ length: numBlocks }, () => ({
    kind: "free",
  }));
  if (!frame) return cells;
  const users = new Map<number, { req: number; logical: number }[]>();
  for (const h of frame.holders)
    h.blocks.forEach((b, logical) => {
      users.set(b, [...(users.get(b) ?? []), { req: h.req, logical }]);
    });
  const holderOf = new Map(frame.holders.map((h) => [h.req, h]));
  for (let b = 0; b < numBlocks; b++) {
    const u = users.get(b) ?? [];
    if (u.length >= 2) {
      cells[b] = {
        kind: "shared",
        reqs: u.map((x) => x.req),
        logical: u.map((x) => x.logical),
      };
    } else if (u.length === 1 && u[0]) {
      const h = holderOf.get(u[0].req);
      const fill = Math.min(
        blockSize,
        Math.max(0, (h?.computed ?? 0) - u[0].logical * blockSize),
      );
      cells[b] = {
        kind: "held",
        req: u[0].req,
        slot: h?.slot ?? 1,
        fill,
        logical: u[0].logical,
      };
    } else if ((frame.rank[b] ?? 0) > 0) {
      cells[b] = { kind: "cached", rank: frame.rank[b] ?? 0 };
    }
  }
  return cells;
}

/** A block key as 6 hex digits: its low 24 bits, as every figure shows it. */
export const hex6 = (key: number) =>
  (key % 0x1000000).toString(16).padStart(6, "0");
