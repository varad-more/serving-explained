import { describe, expect, it } from "vitest";
import {
  blockKey,
  blockKeys,
  h53,
  hashEvents,
  outputToken,
} from "../../src/sim/hash.ts";

describe("h53", () => {
  it("has stable golden values", () => {
    expect(h53([])).toBe(GOLDEN.empty);
    expect(h53([1, 2, 3])).toBe(GOLDEN.oneTwoThree);
  });

  it("stays below 2^53 and depends on order", () => {
    expect(h53([1, 2, 3])).toBeLessThan(2 ** 53);
    expect(h53([1, 2, 3])).not.toBe(h53([3, 2, 1]));
  });
});

// Recorded from the first run; a change here changes every log hash.
const GOLDEN = {
  empty: 3338908027751811,
  oneTwoThree: 4235446385759781,
  keys: [1514248172805596, 7229538749712892],
};

describe("block keys", () => {
  it("chain: a block's key depends on its parent", () => {
    const tokens = [1, 2, 3, 4, 5, 6, 7, 8];
    const [k0, k1] = blockKeys(tokens, 4);
    expect(k1).toBe(blockKey(k0 ?? NaN, tokens, 4, 8));
    expect(k1).not.toBe(blockKey(NaN, tokens, 4, 8));
    expect(blockKeys(tokens, 4)).toEqual(GOLDEN.keys);
  });

  it("only full blocks get keys", () => {
    expect(blockKeys([1, 2, 3, 4, 5, 6, 7], 4)).toHaveLength(1);
    expect(blockKeys([1, 2, 3], 4)).toHaveLength(0);
  });

  it("a changed token changes that block's key and every later one", () => {
    const a = blockKeys([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12], 4);
    const b = blockKeys([1, 2, 3, 4, 5, 0, 7, 8, 9, 10, 11, 12], 4);
    expect(b[0]).toBe(a[0]);
    expect(b[1]).not.toBe(a[1]);
    expect(b[2]).not.toBe(a[2]);
  });
});

describe("outputToken", () => {
  it("is deterministic and inside the vocabulary", () => {
    expect(outputToken(1, 2, 3)).toBe(outputToken(1, 2, 3));
    expect(outputToken(1, 2, 3)).not.toBe(outputToken(1, 2, 4));
    expect(outputToken(1, 2, 3)).toBeLessThan(32000);
  });
});

describe("hashEvents", () => {
  it("is 14 hex digits and changes when any field changes", () => {
    const a = hashEvents([{ type: "Arrive", step: 0, t: 0, req: 1 }]);
    expect(a).toMatch(/^[0-9a-f]{14}$/);
    expect(hashEvents([{ type: "Arrive", step: 0, t: 0, req: 2 }])).not.toBe(a);
    expect(hashEvents([{ type: "Arrive", step: 0, t: 0.5, req: 1 }])).not.toBe(
      a,
    );
  });
});
