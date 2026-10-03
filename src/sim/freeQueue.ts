/**
 * The free-block queue (docs/SIM.md §3): a doubly linked list over typed
 * arrays. Allocation pops the head; removing a block from the middle (a cache
 * hit "touching" it) is O(1). Mirrors vLLM's FreeKVCacheBlockQueue.
 */
export class FreeQueue {
  private readonly prev: Int32Array;
  private readonly next: Int32Array;
  private readonly inQueue: Uint8Array;
  private head = -1;
  private tail = -1;
  size = 0;

  /** Starts with every block, in id order. */
  constructor(numBlocks: number) {
    this.prev = new Int32Array(numBlocks);
    this.next = new Int32Array(numBlocks);
    this.inQueue = new Uint8Array(numBlocks);
    for (let b = 0; b < numBlocks; b++) this.pushBack(b);
  }

  has(block: number): boolean {
    return this.inQueue[block] === 1;
  }

  /** The head, or -1 when empty. */
  peek(): number {
    return this.head;
  }

  popFront(): number {
    const b = this.head;
    if (b !== -1) this.remove(b);
    return b;
  }

  remove(block: number): void {
    if (!this.has(block)) throw new Error(`block ${String(block)} is not free`);
    const p = this.prev[block] ?? -1;
    const n = this.next[block] ?? -1;
    if (p === -1) this.head = n;
    else this.next[p] = n;
    if (n === -1) this.tail = p;
    else this.prev[n] = p;
    this.inQueue[block] = 0;
    this.size--;
  }

  pushBack(block: number): void {
    this.link(block, this.tail, -1);
  }

  /** Puts `blocks` at the front, keeping their order (vLLM's prepend_n). */
  prependN(blocks: readonly number[]): void {
    for (let i = blocks.length - 1; i >= 0; i--) {
      this.link(blocks[i] ?? -1, -1, this.head);
    }
  }

  /** Puts `blocks` at the back, keeping their order (vLLM's append_n). */
  appendN(blocks: readonly number[]): void {
    for (const b of blocks) this.pushBack(b);
  }

  /** Head first. */
  toArray(): number[] {
    const out: number[] = [];
    for (let b = this.head; b !== -1; b = this.next[b] ?? -1) out.push(b);
    return out;
  }

  private link(block: number, before: number, after: number): void {
    if (block < 0 || block >= this.inQueue.length) {
      throw new RangeError(`no block ${String(block)}`);
    }
    if (this.has(block))
      throw new Error(`block ${String(block)} is already free`);
    this.prev[block] = before;
    this.next[block] = after;
    if (before === -1) this.head = block;
    else this.next[before] = block;
    if (after === -1) this.tail = block;
    else this.prev[after] = block;
    this.inQueue[block] = 1;
    this.size++;
  }
}
