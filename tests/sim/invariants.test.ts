import { describe, expect, it } from "vitest";
import { createEngine, step } from "../../src/sim/engine.ts";
import { checkInvariants, InvariantError } from "../../src/sim/invariants.ts";
import { req, toyConfig } from "./helpers.ts";

/** Runs a step, corrupts the state, and returns the invariant that catches it. */
function caught(
  corrupt: (e: ReturnType<typeof createEngine>) => void,
  config = toyConfig({ requests: [req(0, 6, 4), req(1, 6, 4)] }),
) {
  const e = createEngine({ ...config, checkInvariants: false });
  step(e);
  corrupt(e);
  try {
    checkInvariants(e, []);
  } catch (err) {
    if (err instanceof InvariantError) return err.invariant;
    throw err;
  }
  return 0;
}

describe("invariants catch corrupted state", () => {
  it("passes on a healthy engine", () => {
    expect(caught(() => undefined)).toBe(0);
  });
  it("1: a used block in the free queue", () => {
    expect(
      caught((e) => {
        e.paged!.free.pushBack(e.running[0]!.table[0]!);
      }),
    ).toBe(1);
  });
  it("2: a reference count that does not match the tables", () => {
    expect(
      caught((e) => (e.paged!.refCount[e.running[0]!.table[0]!] = 2)),
    ).toBe(2);
  });
  it("3: a block over capacity", () => {
    expect(caught((e) => (e.paged!.filled[e.running[0]!.table[0]!] = 5))).toBe(
      3,
    );
  });
  it("4: computedTokens that disagree with the KV held", () => {
    expect(caught((e) => (e.running[0]!.computed += 1))).toBe(4);
  });
  it("5: a static batch that admits while open", () => {
    const e = createEngine(
      toyConfig({ scheduler: { policy: "static" }, requests: [req(0, 4, 4)] }),
    );
    step(e);
    e.batchOpenAtStart = true;
    expect(() => {
      checkInvariants(e, [
        { type: "Admit", step: 1, t: 1, req: 0, cachedTokens: 0 },
      ]);
    }).toThrow(InvariantError);
  });
  it("7: overlapping regions", () => {
    const config = toyConfig({
      kv: { allocator: "contiguous-max", numBlocks: 8 },
      scheduler: { maxModelLen: 8 },
      requests: [req(0, 3, 3), req(1, 3, 3)],
    });
    expect(caught((e) => (e.contiguous!.get(1)!.start = 4), config)).toBe(7);
  });
  it("8: a waiting queue out of arrival order", () => {
    const config = toyConfig({
      scheduler: { maxNumSeqs: 1 },
      requests: [req(0, 4, 4), req(1, 4, 4, 0), req(2, 4, 4, 0)],
    });
    expect(caught((e) => e.waiting.reverse(), config)).toBe(8);
  });
  it("9: a step over the token budget", () => {
    const e = createEngine(toyConfig({ requests: [req(0, 4, 4)] }));
    step(e);
    const end = {
      type: "StepEnd",
      step: 0,
      t: 1,
      duration: 1,
      computeS: 0,
      memoryS: 0,
      overheadS: 1,
      bound: "memory",
      tokens: 999,
      batch: 1,
      waiting: 0,
      running: 1,
      kv: { capacity: 0, allocated: 0, cached: 0, tokens: 0, unusable: 0 },
    } as const;
    expect(() => {
      checkInvariants(e, [end]);
    }).toThrow(/invariant 9/);
  });
});
