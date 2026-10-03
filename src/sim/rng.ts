/**
 * Seeded randomness (docs/SIM.md §7): sfc32 seeded through splitmix32, one
 * independent stream per (seed, stream name).
 *
 * The length samplers need ln, exp, and cos. Math.log and friends are
 * "implementation-approximated" in ECMAScript, so two browsers may differ in
 * the last bit and a share link would stop reproducing. These versions use
 * only +, −, ×, ÷, and Math.sqrt/Math.round, which every engine computes
 * identically.
 */
import { h53 } from "./hash.ts";
import type { LengthDist } from "./types.ts";

/** A uniform draw in [0, 1). */
export type Rng = () => number;

function splitmix32(seed: number): () => number {
  let a = seed | 0;
  return () => {
    a = (a + 0x9e3779b9) | 0;
    let t = a ^ (a >>> 16);
    t = Math.imul(t, 0x21f0aaad);
    t ^= t >>> 15;
    t = Math.imul(t, 0x735a2d97);
    return (t ^ (t >>> 15)) >>> 0;
  };
}

function sfc32(a: number, b: number, c: number, d: number): Rng {
  return () => {
    const t = (((a + b) | 0) + d) | 0;
    d = (d + 1) | 0;
    a = b ^ (b >>> 9);
    b = (c + (c << 3)) | 0;
    c = (c << 21) | (c >>> 11);
    c = (c + t) | 0;
    return (t >>> 0) / 4294967296;
  };
}

/** An independent stream for (seed, name). Changing one stream's use leaves the others alone. */
export function makeRng(seed: number, name: string): Rng {
  const codes = Array.from(name, (ch) => ch.charCodeAt(0));
  const mix = splitmix32(h53([seed >>> 0, ...codes]) % 4294967296);
  const rng = sfc32(mix(), mix(), mix(), mix());
  for (let i = 0; i < 12; i++) rng();
  return rng;
}

const LN2 = 0.6931471805599453;
const LN2_HI = 6.9314718036912381649e-1;
const LN2_LO = 1.90821492927058770002e-10;

/** Natural log for x > 0, bit-identical on every engine. */
export function ln(x: number): number {
  if (Number.isNaN(x) || x < 0) return NaN;
  if (x === 0) return -Infinity;
  if (x === Infinity) return Infinity;
  let e = 0;
  while (x >= 2) {
    x /= 2;
    e++;
  }
  while (x < 1) {
    x *= 2;
    e--;
  }
  if (x > Math.SQRT2) {
    x /= 2;
    e++;
  }
  // ln x = 2·atanh(s), with |s| ≤ 0.172, so 15 terms reach full precision.
  const s = (x - 1) / (x + 1);
  const s2 = s * s;
  let term = s;
  let sum = s;
  for (let k = 3; k <= 31; k += 2) {
    term *= s2;
    sum += term / k;
  }
  return e * LN2_HI + (e * LN2_LO + 2 * sum);
}

/** e^x, bit-identical on every engine. */
export function exp(x: number): number {
  if (Number.isNaN(x)) return NaN;
  if (x > 709.78) return Infinity;
  if (x < -745.2) return 0;
  const k = Math.round(x / LN2);
  const r = x - k * LN2_HI - k * LN2_LO;
  let term = 1;
  let sum = 1;
  for (let n = 1; n <= 20; n++) {
    term = (term * r) / n;
    sum += term;
  }
  const factor = k > 0 ? 2 : 0.5;
  for (let i = Math.abs(k); i > 0; i--) sum *= factor;
  return sum;
}

/** cos x for x in [0, 2π], bit-identical on every engine. */
export function cos(x: number): number {
  // cos x = −cos(x − π), and |x − π| ≤ π keeps the series short.
  const y = x - Math.PI;
  const y2 = y * y;
  let term = 1;
  let sum = 1;
  for (let n = 2; n <= 40; n += 2) {
    term = (-term * y2) / ((n - 1) * n);
    sum += term;
  }
  return -sum;
}

/** A standard normal draw (Box–Muller). Uses two uniforms. */
export function normal(rng: Rng): number {
  const u1 = 1 - rng(); // (0, 1], so ln is finite
  const u2 = rng();
  return Math.sqrt(-2 * ln(u1)) * cos(2 * Math.PI * u2);
}

/** One integer length from a distribution. */
export function sampleLength(dist: LengthDist, rng: Rng): number {
  switch (dist.kind) {
    case "fixed":
      return dist.value;
    case "uniform":
      return dist.min + Math.floor(rng() * (dist.max - dist.min + 1));
    case "lognormal": {
      const v = Math.round(dist.median * exp(dist.sigma * normal(rng)));
      return Math.min(dist.max, Math.max(dist.min, v));
    }
    case "mixture": {
      const total = dist.parts.reduce((s, p) => s + p.weight, 0);
      let u = rng() * total;
      for (const part of dist.parts) {
        u -= part.weight;
        if (u < 0) return sampleLength(part.dist, rng);
      }
      const last = dist.parts.at(-1);
      if (!last) throw new RangeError("a mixture needs at least one part");
      return sampleLength(last.dist, rng);
    }
  }
}
