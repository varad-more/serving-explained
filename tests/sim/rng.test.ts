import { describe, expect, it } from "vitest";
import {
  cos,
  exp,
  ln,
  makeRng,
  normal,
  sampleLength,
} from "../../src/sim/rng.ts";

const draws = (seed: number, name: string, n: number) => {
  const rng = makeRng(seed, name);
  return Array.from({ length: n }, () => rng());
};

describe("makeRng", () => {
  it("gives the same stream for the same seed and name", () => {
    expect(draws(7, "arrivals", 50)).toEqual(draws(7, "arrivals", 50));
  });

  it("gives independent streams for different names and seeds", () => {
    const a = draws(7, "arrivals", 50);
    expect(draws(7, "tokens", 50)).not.toEqual(a);
    expect(draws(8, "arrivals", 50)).not.toEqual(a);
  });

  it("draws uniforms in [0, 1) with a mean near 0.5", () => {
    const xs = draws(1, "u", 10_000);
    expect(Math.min(...xs)).toBeGreaterThanOrEqual(0);
    expect(Math.max(...xs)).toBeLessThan(1);
    expect(xs.reduce((s, x) => s + x, 0) / xs.length).toBeCloseTo(0.5, 1);
  });

  it("has golden values, so a changed generator is caught", () => {
    expect(draws(1, "golden", 3)).toEqual(GOLDEN_UNIFORMS);
  });
});

// Recorded from the first run; a change here changes every preset's log.
const GOLDEN_UNIFORMS = [
  0.575328472070396, 0.0825369618833065, 0.5922220710199326,
];

describe("portable math", () => {
  it("matches Math.log, Math.exp, and Math.cos closely", () => {
    for (const x of [1e-9, 0.001, 0.37, 1, 1.5, 2, 10, 12345.678]) {
      expect(Math.abs(ln(x) - Math.log(x))).toBeLessThan(
        1e-13 * Math.max(1, Math.abs(Math.log(x))),
      );
    }
    for (const x of [-30, -2.5, -0.1, 0, 0.3, 1, 5, 40]) {
      expect(Math.abs(exp(x) / Math.exp(x) - 1)).toBeLessThan(1e-13);
    }
    for (let i = 0; i <= 64; i++) {
      const x = (2 * Math.PI * i) / 64;
      expect(Math.abs(cos(x) - Math.cos(x))).toBeLessThan(1e-13);
    }
  });

  it("handles the edges", () => {
    expect(ln(0)).toBe(-Infinity);
    expect(ln(-1)).toBeNaN();
    expect(exp(1000)).toBe(Infinity);
    expect(exp(-1000)).toBe(0);
  });
});

describe("sampleLength", () => {
  it("lognormal: the sample median is near the median, within bounds", () => {
    const rng = makeRng(3, "lengths");
    const dist = {
      kind: "lognormal",
      median: 200,
      sigma: 0.8,
      min: 16,
      max: 2048,
    } as const;
    const xs = Array.from({ length: 10_000 }, () =>
      sampleLength(dist, rng),
    ).sort((a, b) => a - b);
    expect(xs[5000]).toBeGreaterThan(190);
    expect(xs[5000]).toBeLessThan(210);
    expect(xs[0]).toBeGreaterThanOrEqual(16);
    expect(xs.at(-1)).toBeLessThanOrEqual(2048);
    expect(xs.every(Number.isInteger)).toBe(true);
  });

  it("normal: mean near 0 and variance near 1", () => {
    const rng = makeRng(4, "z");
    const zs = Array.from({ length: 10_000 }, () => normal(rng));
    const mean = zs.reduce((s, z) => s + z, 0) / zs.length;
    const variance = zs.reduce((s, z) => s + (z - mean) ** 2, 0) / zs.length;
    expect(Math.abs(mean)).toBeLessThan(0.05);
    expect(Math.abs(variance - 1)).toBeLessThan(0.05);
  });

  it("uniform covers min..max inclusive", () => {
    const rng = makeRng(5, "u");
    const xs = new Set(
      Array.from({ length: 2000 }, () =>
        sampleLength({ kind: "uniform", min: 3, max: 6 }, rng),
      ),
    );
    expect([...xs].sort()).toEqual([3, 4, 5, 6]);
  });

  it("mixture picks parts by weight", () => {
    const rng = makeRng(6, "m");
    const dist = {
      kind: "mixture",
      parts: [
        { weight: 0.85, dist: { kind: "fixed", value: 1 } },
        { weight: 0.15, dist: { kind: "fixed", value: 2 } },
      ],
    } as const;
    const longs = Array.from({ length: 10_000 }, () =>
      sampleLength(dist, rng),
    ).filter((x) => x === 2).length;
    expect(longs / 10_000).toBeCloseTo(0.15, 1);
  });
});
