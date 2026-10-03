/**
 * A 53-bit non-cryptographic hash (cyrb53-style, Math.imul only), used for
 * prefix-cache block keys, synthetic output tokens, and event-log hashes
 * (docs/SIM.md §3). vLLM hashes with sha256 by default; a collision here costs
 * a missed cache hit, never a wrong one, because every hit is verified.
 */
import type { SimEvent } from "./types.ts";

/** Running hash state. Feed 32-bit integers or strings, then read a 53-bit digest. */
export class Hasher {
  private h1 = 0xdeadbeef;
  private h2 = 0x41c6ce57;

  int(v: number): this {
    this.h1 = Math.imul(this.h1 ^ v, 2654435761);
    this.h2 = Math.imul(this.h2 ^ v, 1597334677);
    return this;
  }

  /** A non-negative integer below 2^53, split into two words. */
  wide(v: number): this {
    return this.int(Math.floor(v / 4294967296)).int(v % 4294967296);
  }

  string(s: string): this {
    for (let i = 0; i < s.length; i++) this.int(s.charCodeAt(i));
    return this;
  }

  digest(): number {
    let h1 = this.h1;
    let h2 = this.h2;
    h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507);
    h1 ^= Math.imul(h2 ^ (h2 >>> 13), 3266489909);
    h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507);
    h2 ^= Math.imul(h1 ^ (h1 >>> 13), 3266489909);
    return 4294967296 * (2097151 & h2) + (h1 >>> 0);
  }
}

/** The 53-bit hash of a list of 32-bit integers. */
export function h53(values: readonly number[]): number {
  const h = new Hasher();
  for (const v of values) h.int(v);
  return h.digest();
}

/**
 * A block's key: its parent's key (NaN for a prompt's first block) and its
 * tokens, as vllm-apc-doc describes. No extra keys (LoRA, multimodal, salt).
 */
export function blockKey(
  parent: number,
  tokens: ArrayLike<number>,
  start: number,
  end: number,
): number {
  const h = new Hasher();
  if (Number.isNaN(parent)) h.int(0);
  else h.int(1).wide(parent);
  for (let i = start; i < end; i++) h.int(tokens[i] ?? 0);
  return h.digest();
}

/** Chained keys of the full blocks of `tokens`, as the prefix cache computes them. */
export function blockKeys(
  tokens: readonly number[],
  blockSize: number,
): number[] {
  const keys: number[] = [];
  let parent = NaN;
  for (let end = blockSize; end <= tokens.length; end += blockSize) {
    parent = blockKey(parent, tokens, end - blockSize, end);
    keys.push(parent);
  }
  return keys;
}

/** The vocabulary synthetic output tokens are drawn from (WorkloadSpec's default). */
export const OUTPUT_VOCAB = 32000;

/** Output token `j` of request `req`: needs no PRNG state (§3). */
export function outputToken(seed: number, req: number, j: number): number {
  return h53([seed >>> 0, req, j]) % OUTPUT_VOCAB;
}

/** A 14-hex-digit hash of the whole log. Equal logs give equal hashes on every engine. */
export function hashEvents(events: readonly SimEvent[]): string {
  const h = new Hasher();
  for (const e of events) h.string(JSON.stringify(e));
  return h.digest().toString(16).padStart(14, "0");
}
