/**
 * Chapter 4's frames, rebuilt from the event log alone (CLAUDE.md: widgets
 * animate from the log). One frame per step holds what the grid draws: who
 * holds which blocks, each block's reference count and key, and each cached
 * block's place in the eviction order. The free queue is replayed by vLLM's
 * rules (SIM.md §8): allocation pops the head, and freed blocks go to the
 * front when unkeyed and to the tail when keyed.
 * tests/viz/cacheFrames.test.ts checks every frame against the engine's
 * snapshot.
 */
import {
  createSim,
  metrics,
  type SimConfig,
  type SimEvent,
  type SimMetrics,
} from "../../sim/index.ts";

export interface CacheHolder {
  req: number;
  /** DESIGN.md slot 1–8, taken at admission and kept until the request leaves. */
  slot: number;
  /** Tokens with KV. */
  computed: number;
  /** Physical blocks in logical order. */
  blocks: readonly number[];
}

export interface CacheFrame {
  step: number;
  /** Sim seconds at the end of the step. */
  t: number;
  running: number;
  waiting: number;
  holders: readonly CacheHolder[];
  /** Per block: requests whose tables hold it. */
  refCount: Uint8Array;
  /** Per block: its key, or NaN when it has none. */
  hash: Float64Array;
  /** Per block: 1 for the next to evict, 2 for the one after, …; 0 if not cached. */
  rank: Uint16Array;
  /** Blocks evicted in this step. */
  evicted: readonly number[];
  /** Prefix stats so far, first admissions only (as metrics() counts them). */
  hitTokens: number;
  queryTokens: number;
  evictions: number;
  preemptions: number;
  /** Prompt and recompute tokens computed so far, and tokens hit so far. */
  prefillTokens: number;
  savedTokens: number;
}

/** One admission's lookup: the blocks it hit, then the blocks it took. */
export interface Lookup {
  step: number;
  t: number;
  req: number;
  hit: readonly number[];
  hitTokens: number;
  allocated: readonly number[];
}

export interface CacheRun {
  config: SimConfig;
  events: readonly SimEvent[];
  m: SimMetrics;
  frames: CacheFrame[];
  lookups: Lookup[];
  duration: number;
}

const MAX_SLOTS = 8;

export function simulateCache(config: SimConfig): CacheRun {
  const sim = createSim(config);
  sim.run();
  const events = sim.events();
  return {
    config,
    events,
    m: metrics(events, config),
    frames: buildCacheFrames(events, config),
    lookups: lookupsOf(events),
    duration: events.at(-1)?.t ?? 0,
  };
}

export function buildCacheFrames(
  events: readonly SimEvent[],
  config: SimConfig,
): CacheFrame[] {
  const n = config.kv.numBlocks;
  const promptLen = new Map(
    config.requests.map((r) => [r.id, r.prompt.length]),
  );
  const refCount = new Uint8Array(n);
  const hash = new Float64Array(n).fill(NaN);
  let queue = Array.from({ length: n }, (_, b) => b);
  const tables = new Map<number, number[]>();
  const computed = new Map<number, number>();
  const slots = new Map<number, number>();
  const admitted = new Set<number>();
  const frames: CacheFrame[] = [];
  let evicted: number[] = [];
  let hitTokens = 0;
  let queryTokens = 0;
  let evictions = 0;
  let preemptions = 0;
  let prefillTokens = 0;
  let savedTokens = 0;

  for (const e of events) {
    switch (e.type) {
      case "Admit": {
        const used = new Set(slots.values());
        let slot = 1;
        while (used.has(slot) && slot <= MAX_SLOTS) slot++;
        slots.set(e.req, slot);
        if (!admitted.has(e.req)) {
          admitted.add(e.req);
          queryTokens += promptLen.get(e.req) ?? 0;
          hitTokens += e.cachedTokens;
        }
        break;
      }
      case "CacheHit":
        for (const b of e.blocks) {
          if (refCount[b] === 0) queue = queue.filter((x) => x !== b);
          refCount[b] = (refCount[b] ?? 0) + 1;
        }
        tables.set(e.req, [...e.blocks]);
        computed.set(e.req, e.tokens);
        savedTokens += e.tokens;
        break;
      case "Evict":
        hash[e.block] = NaN;
        evicted.push(e.block);
        evictions++;
        break;
      case "Allocate":
        if (!("blocks" in e)) break;
        for (const b of e.blocks) {
          if (queue[0] === b) queue.shift();
          else queue = queue.filter((x) => x !== b);
          refCount[b] = 1;
        }
        tables.set(e.req, [...(tables.get(e.req) ?? []), ...e.blocks]);
        break;
      case "CacheInsert":
        hash[e.block] = e.hash;
        break;
      case "PrefillChunk":
        prefillTokens += e.tokens;
        computed.set(e.req, e.start + e.tokens);
        break;
      case "DecodeToken":
        computed.set(e.req, (promptLen.get(e.req) ?? 0) + e.index);
        break;
      case "Preempt":
        preemptions++;
        computed.delete(e.req);
        slots.delete(e.req);
        break;
      case "Finish":
        computed.delete(e.req);
        slots.delete(e.req);
        break;
      case "Free": {
        if (!("blocks" in e)) break;
        const front: number[] = [];
        const back: number[] = [];
        for (const b of e.blocks) {
          refCount[b] = (refCount[b] ?? 1) - 1;
          if (refCount[b] === 0)
            (Number.isNaN(hash[b] ?? NaN) ? front : back).push(b);
        }
        queue = [...front, ...queue, ...back];
        tables.delete(e.req);
        break;
      }
      case "StepEnd": {
        const rank = new Uint16Array(n);
        let r = 0;
        for (const b of queue) if (!Number.isNaN(hash[b] ?? NaN)) rank[b] = ++r;
        frames.push({
          step: e.step,
          t: e.t,
          running: e.running,
          waiting: e.waiting,
          holders: [...tables.keys()]
            .map((req) => ({
              req,
              slot: slots.get(req) ?? 0,
              computed: computed.get(req) ?? 0,
              blocks: tables.get(req) ?? [],
            }))
            .sort((a, b) => a.slot - b.slot),
          refCount: refCount.slice(),
          hash: hash.slice(),
          rank,
          evicted,
          hitTokens,
          queryTokens,
          evictions,
          preemptions,
          prefillTokens,
          savedTokens,
        });
        evicted = [];
        break;
      }
      default:
        break;
    }
  }
  return frames;
}

function lookupsOf(events: readonly SimEvent[]): Lookup[] {
  const out: Lookup[] = [];
  const open = new Map<string, Lookup>();
  for (const e of events) {
    if (e.type === "Admit") {
      const l: Lookup = {
        step: e.step,
        t: e.t,
        req: e.req,
        hit: [],
        hitTokens: 0,
        allocated: [],
      };
      out.push(l);
      open.set(`${String(e.step)}:${String(e.req)}`, l);
    }
    const l =
      "req" in e ? open.get(`${String(e.step)}:${String(e.req)}`) : undefined;
    if (!l) continue;
    if (e.type === "CacheHit") {
      l.hit = e.blocks;
      l.hitTokens = e.tokens;
    }
    if (e.type === "Allocate" && "blocks" in e)
      l.allocated = [...l.allocated, ...e.blocks];
  }
  return out;
}

/** The latest frame at or before t, or null before the first step ends. */
export function frameAt(
  frames: readonly CacheFrame[],
  t: number,
): CacheFrame | null {
  let lo = 0;
  let hi = frames.length - 1;
  let found: CacheFrame | null = null;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const f = frames[mid];
    if (f && f.t <= t) {
      found = f;
      lo = mid + 1;
    } else hi = mid - 1;
  }
  return found;
}

/** The latest lookup at or before t. */
export function lookupAt(run: CacheRun, t: number): Lookup | null {
  let found: Lookup | null = null;
  for (const l of run.lookups) {
    if (l.t > t) break;
    found = l;
  }
  return found;
}
