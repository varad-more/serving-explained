import { describe, expect, it } from "vitest";
import { blockKeys } from "../../src/sim/hash.ts";
import { PagedPool } from "../../src/sim/paged.ts";

const noEvict = () => {
  throw new Error("unexpected eviction");
};

/** Allocates blocks for `tokens`, fills them, and keys every full block. */
function store(pool: PagedPool, tokens: number[]) {
  const B = pool.blockSize;
  const blocks = pool.allocate(Math.ceil(tokens.length / B), noEvict);
  const keys = blockKeys(tokens, B);
  blocks.forEach((b, i) => {
    pool.filled[b] = Math.min(B, tokens.length - i * B);
    const key = keys[i];
    if (key !== undefined) {
      pool.insert(
        b,
        i === 0 ? NaN : keys[i - 1]!,
        key,
        (p) => tokens[p]!,
        i * B,
      );
    }
  });
  return { blocks, keys };
}

describe("PagedPool", () => {
  it("allocates from the head and frees in reverse table order", () => {
    const pool = new PagedPool(6, 4, false);
    const blocks = pool.allocate(2, noEvict);
    expect(blocks).toEqual([0, 1]);
    expect(pool.free.toArray()).toEqual([2, 3, 4, 5]);
    expect(pool.release(blocks)).toEqual([1, 0]);
    // Unkeyed blocks go to the front, keeping release order (vLLM prepend_n).
    expect(pool.free.toArray()).toEqual([1, 0, 2, 3, 4, 5]);
  });

  it("sends keyed blocks to the tail and unkeyed ones to the front", () => {
    const pool = new PagedPool(6, 4, true);
    const { blocks } = store(pool, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(blocks).toEqual([0, 1, 2]);
    expect(pool.isHashed(0) && pool.isHashed(1) && !pool.isHashed(2)).toBe(
      true,
    );
    pool.release(blocks);
    expect(pool.free.toArray()).toEqual([2, 3, 4, 5, 1, 0]);
    expect(pool.cachedCount()).toBe(2);
  });

  it("touch takes a cached block out of the free queue and counts references", () => {
    const pool = new PagedPool(4, 4, true);
    const { blocks } = store(pool, [1, 2, 3, 4]);
    pool.touch(blocks);
    expect(pool.refCount[0]).toBe(2);
    pool.release(blocks);
    pool.release(blocks);
    expect(pool.refCount[0]).toBe(0);
    pool.touch([0]);
    expect(pool.free.has(0)).toBe(false);
    expect(pool.refCount[0]).toBe(1);
  });

  it("evicts a cached block when allocation pops it", () => {
    const pool = new PagedPool(2, 4, true);
    const { blocks, keys } = store(pool, [1, 2, 3, 4, 5, 6, 7, 8]);
    pool.release(blocks);
    const evicted: [number, number][] = [];
    expect(pool.allocate(1, (b, h) => evicted.push([b, h]))).toEqual([1]);
    expect(evicted).toEqual([[1, keys[1]]]);
    expect(pool.isHashed(1)).toBe(false);
    expect(pool.lookup(keys, 2, (p) => [1, 2, 3, 4, 5, 6, 7, 8][p]!)).toEqual([
      0,
    ]);
  });

  it("finds the longest verified chain and stops at maxBlocks", () => {
    const pool = new PagedPool(8, 4, true);
    const tokens = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
    const { keys } = store(pool, tokens);
    const at = (p: number) => tokens[p]!;
    expect(pool.lookup(keys, 3, at)).toEqual([0, 1, 2]);
    // The full-hit cap: the caller passes floor((len - 1) / B).
    expect(pool.lookup(keys, Math.floor((12 - 1) / 4), at)).toEqual([0, 1]);
    const changed = [1, 2, 3, 4, 5, 0, 7, 8, 9, 10, 11, 12];
    expect(pool.lookup(blockKeys(changed, 4), 3, (p) => changed[p]!)).toEqual([
      0,
    ]);
  });

  it("verifies tokens, so a key collision is a miss, never a wrong hit", () => {
    const pool = new PagedPool(4, 4, true);
    const { keys } = store(pool, [1, 2, 3, 4]);
    // Same key, different tokens: as if two sequences collided.
    expect(pool.lookup(keys, 1, (p) => [9, 9, 9, 9][p]!)).toEqual([]);
  });

  it("keeps duplicate full blocks and hits the first", () => {
    const pool = new PagedPool(4, 4, true);
    const a = store(pool, [1, 2, 3, 4]);
    const b = store(pool, [1, 2, 3, 4]);
    expect(a.blocks).toEqual([0]);
    expect(b.blocks).toEqual([1]);
    expect(pool.lookup(a.keys, 1, (p) => [1, 2, 3, 4][p]!)).toEqual([0]);
  });

  it("refuses to allocate more than is free, and double frees", () => {
    const pool = new PagedPool(2, 4, false);
    expect(() => pool.allocate(3, noEvict)).toThrow();
    const blocks = pool.allocate(1, noEvict);
    pool.release(blocks);
    expect(() => pool.release(blocks)).toThrow();
  });
});
