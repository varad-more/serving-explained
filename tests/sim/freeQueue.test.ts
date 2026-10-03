import { describe, expect, it } from "vitest";
import { FreeQueue } from "../../src/sim/freeQueue.ts";

describe("FreeQueue", () => {
  it("starts with every block in id order", () => {
    const q = new FreeQueue(4);
    expect(q.toArray()).toEqual([0, 1, 2, 3]);
    expect(q.size).toBe(4);
  });

  it("pops the head", () => {
    const q = new FreeQueue(3);
    expect(q.popFront()).toBe(0);
    expect(q.toArray()).toEqual([1, 2]);
    expect(q.popFront()).toBe(1);
    expect(q.popFront()).toBe(2);
    expect(q.popFront()).toBe(-1);
    expect(q.size).toBe(0);
  });

  it("removes from the middle, the head, and the tail", () => {
    const q = new FreeQueue(5);
    q.remove(2);
    expect(q.toArray()).toEqual([0, 1, 3, 4]);
    q.remove(0);
    expect(q.toArray()).toEqual([1, 3, 4]);
    q.remove(4);
    expect(q.toArray()).toEqual([1, 3]);
    expect(q.has(2)).toBe(false);
    expect(q.size).toBe(2);
  });

  it("prependN and appendN keep the given order (vLLM prepend_n, append_n)", () => {
    const q = new FreeQueue(6);
    for (let i = 0; i < 6; i++) q.popFront();
    q.appendN([2, 3]);
    q.prependN([1, 0]);
    expect(q.toArray()).toEqual([1, 0, 2, 3]);
    q.appendN([5, 4]);
    expect(q.toArray()).toEqual([1, 0, 2, 3, 5, 4]);
  });

  it("refuses double frees and unknown blocks", () => {
    const q = new FreeQueue(2);
    expect(() => {
      q.pushBack(0);
    }).toThrow();
    expect(() => {
      q.remove(5);
    }).toThrow();
  });
});
