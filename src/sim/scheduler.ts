/**
 * Scheduling for one engine step (docs/SIM.md §4.1–4.4), modeled on vLLM V1's
 * Scheduler.schedule at cfd54ca8: no prefill or decode phase, running requests
 * first in admission order, then waiting requests front first, all under one
 * token budget.
 *
 * Scheduling events carry the step's start time (§2.2) and come out in the
 * order they happen: Preempt then Free, Admit, CacheHit, Evict, Allocate,
 * CacheInsert.
 */
import type { ContiguousPool, Reservation } from "./contiguous.ts";
import { blockKey, outputToken } from "./hash.ts";
import type { PagedPool } from "./paged.ts";
import type {
  RequestSpec,
  RequestState,
  SimConfig,
  SimEvent,
} from "./types.ts";

/** A request's mutable engine state (§3). */
export interface Req {
  readonly spec: RequestSpec;
  state: RequestState;
  /** Tokens whose KV is stored. */
  computed: number;
  /** Output tokens sampled. */
  generated: number;
  /** True from admission until the step that samples its next token: prompt or recompute work. */
  prefilling: boolean;
  /** Admission counter, for the preemption victim. */
  admitOrder: number;
  everAdmitted: boolean;
  /** Paged: physical block ids in logical order. */
  table: number[];
  /** Keys of the sequence's full blocks, computed as needed. */
  keys: number[];
  /** Leading table blocks already keyed in the cache. */
  keyedBlocks: number;
  /** Contiguous: the reserved region. */
  region: Reservation | null;
  preemptions: number;
  /** Order of the latest preemption, for queue checks. */
  preemptSeq: number;
}

export interface EngineState {
  config: SimConfig;
  step: number;
  /** Sim time; during scheduling, the step's start. */
  clock: number;
  waiting: Req[];
  /** Requests that are computing, in admission order. */
  running: Req[];
  /** Static only: the open batch's members, done-in-batch ones included. */
  batch: Req[];
  paged: PagedPool | null;
  contiguous: ContiguousPool | null;
  events: SimEvent[];
  counters: {
    preemptions: number;
    evictions: number;
    hitTokens: number;
    queryTokens: number;
    preemptedHitTokens: number;
    preemptedQueryTokens: number;
  };
  admitCounter: number;
  preemptCounter: number;
}

/** One request's work this step: `q` tokens at positions [start, start + q). */
export interface Scheduled {
  req: Req;
  q: number;
  start: number;
  prefill: boolean;
}

export function newReq(spec: RequestSpec): Req {
  return {
    spec,
    state: "waiting",
    computed: 0,
    generated: 0,
    prefilling: false,
    admitOrder: -1,
    everAdmitted: false,
    table: [],
    keys: [],
    keyedBlocks: 0,
    region: null,
    preemptions: 0,
    preemptSeq: 0,
  };
}

/** Tokens known so far: the prompt plus the sampled outputs. */
export function seqLen(r: Req): number {
  return r.spec.prompt.length + r.generated;
}

export function tokenAt(s: EngineState, r: Req, position: number): number {
  const p = r.spec.prompt;
  return position < p.length
    ? (p[position] ?? 0)
    : outputToken(s.config.seed, r.spec.id, position - p.length);
}

type Unstamped<E> = E extends unknown ? Omit<E, "step" | "t"> : never;
/** An event before it is stamped with the step and time. */
export type EventInput = Unstamped<SimEvent>;

/** Appends an event stamped with the current step and clock. */
export function emit(s: EngineState, e: EventInput): void {
  // Key order is part of the log hash: type, step, t, then the payload.
  const { type, ...payload } = e;
  s.events.push({ type, step: s.step, t: s.clock, ...payload } as SimEvent);
}

export function schedule(s: EngineState): {
  scheduled: Scheduled[];
  preempted: boolean;
} {
  const sc = s.config.scheduler;
  const scheduled: Scheduled[] = [];
  let budget = sc.maxNumBatchedTokens;
  let preempted = false;

  if (sc.policy === "static" && s.batch.length === 0) formBatch(s);

  // Running requests, in admission order.
  for (let i = 0; i < s.running.length && budget > 0;) {
    const r = s.running[i];
    if (!r) break;
    const remaining = seqLen(r) - r.computed;
    const q = sc.chunkedPrefill ? Math.min(remaining, budget) : remaining;
    if (q > budget) {
      i++;
      continue;
    }
    let selfPreempted = false;
    while (!canGrow(s, r, r.computed + q)) {
      const victim = s.running.at(-1);
      if (!victim) break;
      preempt(s, victim);
      preempted = true;
      if (victim === r) {
        selfPreempted = true;
        break;
      }
    }
    if (selfPreempted) break;
    scheduled.push({ req: r, q, start: r.computed, prefill: r.prefilling });
    grow(s, r, r.computed + q);
    keyFullBlocks(s, r, r.computed + q);
    budget -= q;
    i++;
  }

  // Waiting requests, front first. Skipped after any preemption, and only
  // for the continuous policy: a static batch admits only when it forms.
  if (sc.policy === "continuous" && !preempted) {
    while (s.waiting.length > 0) {
      if (s.running.length >= sc.maxNumSeqs || budget === 0) break;
      const r = s.waiting[0];
      if (!r) break;
      const len = seqLen(r);
      const hits = lookup(s, r, len);
      const cached = hits.length * s.config.kv.blockSize;
      const remaining = len - cached;
      if (!sc.chunkedPrefill && remaining > budget) break;
      const q = Math.min(remaining, budget);
      if (!fitsWhole(s, len, hits, 0)) break; // head-of-line blocking
      s.waiting.shift();
      admit(s, r, hits);
      scheduled.push({ req: r, q, start: cached, prefill: true });
      grow(s, r, cached + q);
      keyFullBlocks(s, r, cached + q);
      budget -= q;
    }
  }
  return { scheduled, preempted };
}

/**
 * Static (§4.1): when no batch is open, admit waiting requests front first
 * until maxNumSeqs or memory runs out. Memory counts every member's whole
 * sequence, since the batch must hold them all; the running loop then
 * schedules their tokens under the budget.
 */
function formBatch(s: EngineState): void {
  let reserved = 0;
  while (
    s.waiting.length > 0 &&
    s.batch.length < s.config.scheduler.maxNumSeqs
  ) {
    const r = s.waiting[0];
    if (!r) break;
    const len = seqLen(r);
    const hits = lookup(s, r, len);
    if (!fitsWhole(s, len, hits, reserved)) break;
    s.waiting.shift();
    admit(s, r, hits);
    if (s.paged) {
      reserved += Math.ceil(len / s.config.kv.blockSize) - hits.length;
    }
  }
}

/** Cached full blocks for the sequence, capped so at least one token is computed. */
function lookup(s: EngineState, r: Req, len: number): number[] {
  const pool = s.paged;
  if (!pool?.caching) return [];
  const B = s.config.kv.blockSize;
  // Full-hit rule: at most len − 1 tokens, rounded down to a block.
  const maxBlocks = Math.floor((len - 1) / B);
  ensureKeys(s, r, maxBlocks);
  return pool.lookup(r.keys, maxBlocks, (p) => tokenAt(s, r, p));
}

/**
 * vLLM's scheduler_reserve_full_isl: the blocks for the whole sequence must
 * fit, counting hit blocks at refCount 0, since touching them uses free
 * capacity. Only this step's chunk is allocated.
 */
function fitsWhole(
  s: EngineState,
  len: number,
  hits: readonly number[],
  reserved: number,
): boolean {
  if (s.contiguous) return s.contiguous.canReserve();
  const pool = s.paged;
  if (!pool) return false;
  const newBlocks = Math.ceil(len / pool.blockSize) - hits.length;
  const atZero = hits.filter((b) => pool.refCount[b] === 0).length;
  return newBlocks + atZero + reserved <= pool.free.size;
}

function admit(s: EngineState, r: Req, hits: number[]): void {
  const B = s.config.kv.blockSize;
  const len = seqLen(r);
  const cached = hits.length * B;
  r.state = "running";
  r.admitOrder = s.admitCounter++;
  r.computed = cached;
  r.prefilling = true;
  r.table = [...hits];
  r.keyedBlocks = hits.length;
  s.running.push(r);
  if (s.config.scheduler.policy === "static") s.batch.push(r);
  // Prefix stats, in tokens, on first admission only (as vLLM counts them).
  if (r.everAdmitted) {
    s.counters.preemptedQueryTokens += len;
    s.counters.preemptedHitTokens += cached;
  } else {
    s.counters.queryTokens += len;
    s.counters.hitTokens += cached;
  }
  r.everAdmitted = true;
  emit(s, { type: "Admit", req: r.spec.id, cachedTokens: cached });
  if (hits.length > 0) {
    s.paged?.touch(hits);
    emit(s, {
      type: "CacheHit",
      req: r.spec.id,
      blocks: [...hits],
      tokens: cached,
    });
  }
  if (s.contiguous) {
    const region = s.contiguous.reserve(r.spec.id);
    if (!region) throw new Error("admitted without a region");
    r.region = region;
    emit(s, {
      type: "Allocate",
      req: r.spec.id,
      region: { start: region.start, len: region.len },
    });
  }
}

/** Whether `r` can hold `tokens` tokens of KV after allocating. */
function canGrow(s: EngineState, r: Req, tokens: number): boolean {
  if (!s.paged) return true; // a region always holds maxModelLen
  const need = Math.ceil(tokens / s.paged.blockSize) - r.table.length;
  return need <= s.paged.free.size;
}

/** Allocates just enough blocks to hold `tokens` tokens (no lookahead, §4.3). */
function grow(s: EngineState, r: Req, tokens: number): void {
  const pool = s.paged;
  if (!pool) return;
  const need = Math.ceil(tokens / pool.blockSize) - r.table.length;
  if (need <= 0) return;
  const blocks = pool.allocate(need, (block, hash) => {
    s.counters.evictions++;
    emit(s, { type: "Evict", block, hash });
  });
  r.table.push(...blocks);
  emit(s, { type: "Allocate", req: r.spec.id, blocks });
}

/** Keys of the first `n` full blocks of the sequence. */
function ensureKeys(s: EngineState, r: Req, n: number): void {
  const B = s.config.kv.blockSize;
  for (let k = r.keys.length; k < n; k++) {
    const parent = k === 0 ? NaN : (r.keys[k - 1] ?? NaN);
    const tokens = Array.from({ length: B }, (_, j) =>
      tokenAt(s, r, k * B + j),
    );
    r.keys.push(blockKey(parent, tokens, 0, B));
  }
}

/**
 * Every block that will be full once this step's tokens are written gets its
 * key and joins the cache now, so a later request in the same step can hit it
 * (vLLM caches inside allocate_slots).
 */
function keyFullBlocks(s: EngineState, r: Req, tokens: number): void {
  const pool = s.paged;
  if (!pool?.caching) return;
  const B = pool.blockSize;
  const full = Math.floor(tokens / B);
  ensureKeys(s, r, full);
  for (let k = r.keyedBlocks; k < full; k++) {
    const block = r.table[k];
    const key = r.keys[k];
    if (block === undefined || key === undefined) break;
    const parent = k === 0 ? NaN : (r.keys[k - 1] ?? NaN);
    pool.insert(block, parent, key, (p) => tokenAt(s, r, p), k * B);
    emit(s, { type: "CacheInsert", req: r.spec.id, block, hash: key });
  }
  r.keyedBlocks = Math.max(r.keyedBlocks, full);
}

/**
 * Recompute preemption (§4.4): the victim, the last running request, loses
 * its KV and goes to the front of waiting. Its blocks keep their keys.
 */
export function preempt(s: EngineState, victim: Req): void {
  const i = s.running.lastIndexOf(victim);
  if (i !== -1) s.running.splice(i, 1);
  const inBatch = s.batch.indexOf(victim);
  if (inBatch !== -1) s.batch.splice(inBatch, 1);
  const id = victim.spec.id;
  emit(s, {
    type: "Preempt",
    req: id,
    blocks: [...victim.table],
    lostTokens: victim.computed,
  });
  if (s.paged) {
    emit(s, { type: "Free", req: id, blocks: s.paged.release(victim.table) });
  }
  victim.table = [];
  victim.keyedBlocks = 0;
  victim.computed = 0;
  victim.prefilling = false;
  victim.state = "waiting";
  victim.preemptions++;
  victim.preemptSeq = ++s.preemptCounter;
  s.counters.preemptions++;
  // vLLM prepends each preempted request: the most recent one is first.
  s.waiting.unshift(victim);
}
