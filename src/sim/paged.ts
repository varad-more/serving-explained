/**
 * The paged block pool and prefix cache (docs/SIM.md §3, §4.3), modeled on
 * vLLM V1's BlockPool at cfd54ca8.
 *
 * Block states: `used` (refCount > 0), `cached` (refCount 0 with a key, so it
 * can be evicted), and `free` (refCount 0, no key). Cached and free blocks
 * share one free queue. Allocation pops the head; popping a cached block
 * evicts it.
 */
import { FreeQueue } from "./freeQueue.ts";

export class PagedPool {
  readonly refCount: Int32Array;
  readonly filled: Int16Array;
  /** The block's key, NaN if none. */
  readonly hash: Float64Array;
  /** The parent block's key, NaN for a sequence's first block or no key. */
  readonly parentHash: Float64Array;
  /** Token ids of keyed blocks, used to verify every hit. Empty with caching off. */
  readonly tokens: Int32Array;
  readonly free: FreeQueue;
  /** Key → block ids. Duplicates are kept, as V1's tables are append-only. */
  private readonly cache = new Map<number, number[]>();

  readonly numBlocks: number;
  readonly blockSize: number;
  readonly caching: boolean;

  constructor(numBlocks: number, blockSize: number, caching: boolean) {
    this.numBlocks = numBlocks;
    this.blockSize = blockSize;
    this.caching = caching;
    this.refCount = new Int32Array(numBlocks);
    this.filled = new Int16Array(numBlocks);
    this.hash = new Float64Array(numBlocks).fill(NaN);
    this.parentHash = new Float64Array(numBlocks).fill(NaN);
    this.tokens = new Int32Array(caching ? numBlocks * blockSize : 0);
    this.free = new FreeQueue(numBlocks);
  }

  isHashed(block: number): boolean {
    return !Number.isNaN(this.hash[block] ?? NaN);
  }

  /** Blocks with refCount 0 and a key. */
  cachedCount(): number {
    let n = 0;
    for (let b = 0; b < this.numBlocks; b++) {
      if (this.refCount[b] === 0 && this.isHashed(b)) n++;
    }
    return n;
  }

  /**
   * The longest chain of cached full blocks for a sequence whose block keys
   * are `keys`, up to `maxBlocks`. A key match counts only if the stored
   * parent key and tokens agree, so a hash collision costs a missed hit.
   */
  lookup(
    keys: readonly number[],
    maxBlocks: number,
    tokenAt: (position: number) => number,
  ): number[] {
    const B = this.blockSize;
    const hits: number[] = [];
    for (let i = 0; i < Math.min(keys.length, maxBlocks); i++) {
      const key = keys[i] ?? NaN;
      const block = this.cache.get(key)?.[0];
      if (block === undefined) break;
      const parent = i === 0 ? NaN : (keys[i - 1] ?? NaN);
      if (!Object.is(this.parentHash[block], parent)) break;
      let same = true;
      for (let j = 0; j < B && same; j++) {
        same = this.tokens[block * B + j] === tokenAt(i * B + j);
      }
      if (!same) break;
      hits.push(block);
    }
    return hits;
  }

  /** A hit: each block gets a reference, and leaves the free queue if it was unused. */
  touch(blocks: readonly number[]): void {
    for (const b of blocks) {
      if (this.refCount[b] === 0) this.free.remove(b);
      this.refCount[b] = (this.refCount[b] ?? 0) + 1;
    }
  }

  /**
   * Pops `n` blocks from the head of the free queue. A popped cached block is
   * evicted: it loses its key, and `onEvict` hears about it. The caller checks
   * `free.size` first.
   */
  allocate(
    n: number,
    onEvict: (block: number, hash: number) => void,
  ): number[] {
    if (n > this.free.size) {
      throw new Error(
        `cannot allocate ${String(n)} of ${String(this.free.size)} free blocks`,
      );
    }
    const blocks: number[] = [];
    for (let k = 0; k < n; k++) {
      const b = this.free.popFront();
      if (this.isHashed(b)) {
        const key = this.hash[b] ?? NaN;
        this.uncache(b, key);
        onEvict(b, key);
      }
      this.filled[b] = 0;
      this.refCount[b] = 1;
      blocks.push(b);
    }
    return blocks;
  }

  /**
   * Drops one reference from each block of `table`, in reverse table order, and
   * returns that order. A block that reaches 0 goes to the front of the free
   * queue if it has no key (reused first) or to the tail if it has one (evicted
   * in LRU order), as vLLM's BlockPool.free_blocks does.
   */
  release(table: readonly number[]): number[] {
    const order = [...table].reverse();
    const front: number[] = [];
    const back: number[] = [];
    for (const b of order) {
      const rc = (this.refCount[b] ?? 0) - 1;
      if (rc < 0) throw new Error(`block ${String(b)} released twice`);
      this.refCount[b] = rc;
      if (rc === 0) (this.isHashed(b) ? back : front).push(b);
    }
    this.free.prependN(front);
    this.free.appendN(back);
    return order;
  }

  /** Gives a block that will be full its key and adds it to the cache. */
  insert(
    block: number,
    parentKey: number,
    key: number,
    tokenAt: (position: number) => number,
    firstPosition: number,
  ): void {
    const B = this.blockSize;
    this.hash[block] = key;
    this.parentHash[block] = parentKey;
    for (let j = 0; j < B; j++) {
      this.tokens[block * B + j] = tokenAt(firstPosition + j);
    }
    const ids = this.cache.get(key);
    if (ids) ids.push(block);
    else this.cache.set(key, [block]);
  }

  private uncache(block: number, key: number): void {
    const ids = this.cache.get(key) ?? [];
    const rest = ids.filter((b) => b !== block);
    if (rest.length > 0) this.cache.set(key, rest);
    else this.cache.delete(key);
    this.hash[block] = NaN;
    this.parentHash[block] = NaN;
  }
}
