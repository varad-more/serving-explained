import { describe, expect, it } from "vitest";
import { ContiguousPool } from "../../src/sim/contiguous.ts";

describe("ContiguousPool", () => {
  it("places regions first-fit and reports the tail gap as unusable", () => {
    const pool = new ContiguousPool(20, 8);
    expect(pool.reserve(0)).toMatchObject({ start: 0, len: 8 });
    expect(pool.reserve(1)).toMatchObject({ start: 8, len: 8 });
    expect(pool.reserve(2)).toBeNull();
    expect(pool.canReserve()).toBe(false);
    expect(pool.allocatedSlots()).toBe(16);
    expect(pool.unusableSlots()).toBe(4);
  });

  it("reuses a freed region", () => {
    const pool = new ContiguousPool(24, 8);
    pool.reserve(0);
    pool.reserve(1);
    pool.reserve(2);
    pool.release(1);
    expect(pool.unusableSlots()).toBe(0);
    expect(pool.reserve(3)).toMatchObject({ start: 8 });
  });

  it("reports reserved-unused waste through used slots", () => {
    const pool = new ContiguousPool(20, 8);
    pool.reserve(0)!.used = 3;
    pool.reserve(1)!.used = 3;
    expect(pool.allocatedSlots() - pool.usedSlots()).toBe(10);
  });

  it("refuses to release a region it does not hold", () => {
    expect(() => new ContiguousPool(8, 8).release(0)).toThrow();
  });
});
