/**
 * The worker's KV state at any step, rebuilt from the event log by vLLM's
 * rules (docs/SIM.md §8), as chapter 4's frames are: hits touch blocks,
 * allocation pops the free queue's head, and freed blocks go to the front
 * when unkeyed and to the tail when keyed. The free queue is a linked list,
 * so each operation is O(1) at 262,144 blocks.
 *
 * Keyframes every K steps keep scrubbing fast; K doubles whenever the
 * keyframes would pass 32 MB. tests/sandbox/worker.test.ts checks frames
 * against the engine's snapshot.
 */
import type { SimConfig, SimEvent } from "../../sim/index.ts";
import type { FrameCells, FrameHolder } from "./protocol.ts";

const KEYFRAME_BUDGET = 32 * 2 ** 20;

interface State {
  refCount: Uint16Array;
  hash: Float64Array;
  prev: Int32Array;
  next: Int32Array;
  head: number;
  tail: number;
  tables: Map<number, number[]>;
  regions: Map<number, { start: number; len: number }>;
  computed: Map<number, number>;
  slots: Map<number, number>;
  /** Index of the next event to apply. */
  at: number;
  step: number;
}

function fresh(n: number): State {
  const prev = new Int32Array(n);
  const next = new Int32Array(n);
  for (let b = 0; b < n; b++) {
    prev[b] = b - 1;
    next[b] = b + 1 < n ? b + 1 : -1;
  }
  return {
    refCount: new Uint16Array(n),
    hash: new Float64Array(n).fill(NaN),
    prev,
    next,
    head: n > 0 ? 0 : -1,
    tail: n - 1,
    tables: new Map(),
    regions: new Map(),
    computed: new Map(),
    slots: new Map(),
    at: 0,
    step: -1,
  };
}

function clone(s: State): State {
  return {
    ...s,
    refCount: s.refCount.slice(),
    hash: s.hash.slice(),
    prev: s.prev.slice(),
    next: s.next.slice(),
    // Tables are replaced, never edited in place, so a shallow copy is safe.
    tables: new Map(s.tables),
    regions: new Map(s.regions),
    computed: new Map(s.computed),
    slots: new Map(s.slots),
  };
}

/** Bytes a keyframe holds, roughly. */
const sizeOf = (n: number) => n * (2 + 8 + 4 + 4);

export class Replayer {
  private readonly keys: State[] = [];
  private every = 64;
  private readonly live: State;
  private readonly n: number;
  private readonly promptLen: Map<number, number>;
  private readonly maxSlots: number;
  /** Event index just past each StepEnd, by step. */
  readonly stepEnds: number[] = [];
  /** Each step's end time. */
  readonly times: number[] = [];

  private readonly events: readonly SimEvent[];
  readonly config: SimConfig;

  constructor(events: readonly SimEvent[], config: SimConfig) {
    this.events = events;
    this.config = config;
    this.n = config.kv.numBlocks;
    this.promptLen = new Map(
      config.requests.map((r) => [r.id, r.prompt.length]),
    );
    this.maxSlots = config.scheduler.maxNumSeqs;
    this.live = fresh(this.n);
    this.keys.push(clone(this.live));
  }

  /** Applies events up to the log's current end; keeps keyframes. */
  advance(): void {
    const s = this.live;
    while (s.at < this.events.length) {
      const e = this.events[s.at];
      s.at++;
      if (!e) continue;
      apply(s, e, this.promptLen, this.maxSlots);
      if (e.type !== "StepEnd") continue;
      s.step = e.step;
      this.stepEnds.push(s.at);
      this.times.push(e.t);
      if (e.step % this.every === this.every - 1) {
        this.keys.push(clone(s));
        if (this.keys.length * sizeOf(this.n) > KEYFRAME_BUDGET) {
          // Thin: keep every other keyframe and double the spacing.
          const kept = this.keys.filter((_, i) => i % 2 === 0);
          this.keys.length = 0;
          this.keys.push(...kept);
          this.every *= 2;
        }
      }
    }
  }

  /** The state at the end of the last step ending at or before t. */
  stateAt(t: number): { state: State; evicted: number[] } {
    let lo = 0;
    let hi = this.times.length - 1;
    let step = -1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if ((this.times[mid] ?? Infinity) <= t) {
        step = mid;
        lo = mid + 1;
      } else hi = mid - 1;
    }
    let key = this.keys[0] ?? fresh(this.n);
    for (const k of this.keys) if (k.step <= step) key = k;
    const s = clone(key);
    const end = step >= 0 ? (this.stepEnds[step] ?? 0) : 0;
    const from = step >= 0 ? (this.stepEnds[step - 1] ?? 0) : 0;
    const evicted: number[] = [];
    while (s.at < end) {
      const e = this.events[s.at];
      s.at++;
      if (!e) continue;
      if (e.type === "Evict" && s.at > from) evicted.push(e.block);
      apply(s, e, this.promptLen, this.maxSlots);
      if (e.type === "StepEnd") s.step = e.step;
    }
    return { state: s, evicted };
  }

  /** What the grid draws at t, as typed arrays. */
  frameAt(t: number): {
    cells: FrameCells;
    holders: FrameHolder[];
    evicted: number[];
  } {
    const { state: s, evicted } = this.stateAt(t);
    const n = this.n;
    const B = this.config.kv.blockSize;
    const cells: FrameCells = {
      kind: new Uint8Array(n),
      req: new Int32Array(n).fill(-1),
      slot: new Uint8Array(n),
      fill: new Uint32Array(n),
      logical: new Uint32Array(n),
      count: new Uint32Array(n),
    };
    const holders: FrameHolder[] = [];
    const slotOf = (req: number) => s.slots.get(req) ?? 0;
    const shown = (slot: number) => (slot >= 1 && slot <= 8 ? slot : 0);
    if (this.config.kv.allocator === "contiguous-max") {
      for (const [req, r] of s.regions) {
        const computed = s.computed.get(req) ?? 0;
        holders.push({
          req,
          slot: slotOf(req),
          computed,
          blocks: [],
          region: r,
        });
        const first = Math.floor(r.start / B);
        for (let i = 0; i < r.len / B; i++) {
          const b = first + i;
          cells.kind[b] = 1;
          cells.req[b] = req;
          cells.slot[b] = shown(slotOf(req));
          cells.fill[b] = Math.min(B, Math.max(0, computed - i * B));
          cells.logical[b] = i;
        }
      }
      // Runs of free blocks shorter than a region are a gap (SIM.md §3).
      const region = Math.ceil(this.config.scheduler.maxModelLen / B);
      let i = 0;
      while (i < n) {
        if (cells.kind[i] !== 0) {
          i++;
          continue;
        }
        let j = i;
        while (j < n && cells.kind[j] === 0) j++;
        if (j - i < region) cells.kind.fill(4, i, j);
        i = j;
      }
      return { cells, holders, evicted };
    }
    for (const [req, blocks] of s.tables) {
      const computed = s.computed.get(req) ?? 0;
      holders.push({ req, slot: slotOf(req), computed, blocks, region: null });
      blocks.forEach((b, i) => {
        if (cells.req[b] === -1) {
          cells.req[b] = req;
          cells.logical[b] = i;
          cells.slot[b] = shown(slotOf(req));
          cells.fill[b] = Math.min(B, Math.max(0, computed - i * B));
        }
      });
    }
    for (let b = 0; b < n; b++) {
      const ref = s.refCount[b] ?? 0;
      if (ref >= 2) {
        cells.kind[b] = 2;
        cells.count[b] = ref;
        cells.fill[b] = B;
      } else if (ref === 1) cells.kind[b] = 1;
    }
    let rank = 0;
    for (let b = s.head; b !== -1; b = s.next[b] ?? -1)
      if (!Number.isNaN(s.hash[b] ?? NaN)) {
        cells.kind[b] = 3;
        cells.count[b] = ++rank;
      }
    holders.sort((a, b) => a.slot - b.slot || a.req - b.req);
    return { cells, holders, evicted };
  }
}

function unlink(s: State, b: number): void {
  const p = s.prev[b] ?? -1;
  const q = s.next[b] ?? -1;
  if (p === -1) s.head = q;
  else s.next[p] = q;
  if (q === -1) s.tail = p;
  else s.prev[q] = p;
  s.prev[b] = -1;
  s.next[b] = -1;
}

function pushFront(s: State, b: number): void {
  s.prev[b] = -1;
  s.next[b] = s.head;
  if (s.head !== -1) s.prev[s.head] = b;
  else s.tail = b;
  s.head = b;
}

function pushBack(s: State, b: number): void {
  s.next[b] = -1;
  s.prev[b] = s.tail;
  if (s.tail !== -1) s.next[s.tail] = b;
  else s.head = b;
  s.tail = b;
}

function apply(
  s: State,
  e: SimEvent,
  promptLen: Map<number, number>,
  maxSlots: number,
): void {
  switch (e.type) {
    case "Admit": {
      const used = new Set(s.slots.values());
      let slot = 1;
      while (used.has(slot) && slot <= maxSlots) slot++;
      s.slots.set(e.req, slot);
      break;
    }
    case "CacheHit":
      for (const b of e.blocks) {
        if (s.refCount[b] === 0) unlink(s, b);
        s.refCount[b] = (s.refCount[b] ?? 0) + 1;
      }
      s.tables.set(e.req, [...e.blocks]);
      s.computed.set(e.req, e.tokens);
      break;
    case "Evict":
      s.hash[e.block] = NaN;
      break;
    case "Allocate":
      if ("blocks" in e) {
        for (const b of e.blocks) {
          unlink(s, b);
          s.refCount[b] = 1;
        }
        s.tables.set(e.req, [...(s.tables.get(e.req) ?? []), ...e.blocks]);
      } else s.regions.set(e.req, { start: e.region.start, len: e.region.len });
      break;
    case "CacheInsert":
      s.hash[e.block] = e.hash;
      break;
    case "PrefillChunk":
      s.computed.set(e.req, e.start + e.tokens);
      break;
    case "DecodeToken":
      s.computed.set(e.req, (promptLen.get(e.req) ?? 0) + e.index);
      break;
    case "Preempt":
    case "Finish":
      s.computed.delete(e.req);
      s.slots.delete(e.req);
      break;
    case "Free":
      if ("blocks" in e) {
        const front: number[] = [];
        for (const b of e.blocks) {
          s.refCount[b] = (s.refCount[b] ?? 1) - 1;
          if (s.refCount[b] !== 0) continue;
          if (Number.isNaN(s.hash[b] ?? NaN)) front.push(b);
          else pushBack(s, b);
        }
        // The unkeyed group goes to the front, in its own order.
        for (let i = front.length - 1; i >= 0; i--) pushFront(s, front[i] ?? 0);
        s.tables.delete(e.req);
      } else s.regions.delete(e.req);
      break;
    default:
      break;
  }
}
