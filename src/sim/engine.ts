/**
 * The engine: state, the step loop, and the event log (docs/SIM.md §4).
 *
 *   1. intake     arrivals join waiting; jump the clock if the engine is idle
 *   2. schedule   policy-specific (scheduler.ts)
 *   3. cost       the step's roofline duration (cost.ts)
 *   4. advance    clock += duration
 *   5. apply      write KV; PrefillChunk for prompt or recompute work; a
 *                 request whose KV covers its whole sequence samples a token
 *   6. finish     continuous: Finish, then Free. static: done-in-batch, and
 *                 the batch returns as a unit when its last member is done
 *   7. StepEnd    the cost breakdown and KV counts
 */
import { ContiguousPool } from "./contiguous.ts";
import { stepCost } from "./cost.ts";
import { PagedPool } from "./paged.ts";
import {
  emit,
  newReq,
  schedule,
  seqLen,
  type EngineState,
  type Req,
} from "./scheduler.ts";
import type {
  ConfigErrorCode,
  KvCounts,
  RequestView,
  Sim,
  SimConfig,
  SimSnapshot,
  StepInfo,
} from "./types.ts";

/** Bumped whenever the same config can produce a different log. */
export const ENGINE_VERSION = 1;

export class ConfigError extends Error {
  readonly code: ConfigErrorCode;
  constructor(code: ConfigErrorCode, message: string) {
    super(message);
    this.name = "ConfigError";
    this.code = code;
  }
}

/** The engine's full state: the scheduler's view plus what only the loop needs. */
export interface Engine extends EngineState {
  /** Not yet arrived, in (arrival, id) order. */
  pending: Req[];
  finished: Req[];
  /** Every request, by id. */
  byId: Map<number, Req>;
  done: boolean;
  /** Invariant 5: whether a static batch was open when the step began. */
  batchOpenAtStart: boolean;
}

export function createEngine(config: SimConfig): Engine {
  validate(config);
  const { kv } = config;
  const reqs = config.requests.map(newReq);
  const pending = [...reqs].sort(
    (a, b) => a.spec.arrival - b.spec.arrival || a.spec.id - b.spec.id,
  );
  return {
    config,
    step: 0,
    clock: 0,
    waiting: [],
    running: [],
    batch: [],
    paged:
      kv.allocator === "paged"
        ? new PagedPool(kv.numBlocks, kv.blockSize, kv.prefixCaching)
        : null,
    contiguous:
      kv.allocator === "contiguous-max"
        ? new ContiguousPool(
            kv.numBlocks * kv.blockSize,
            config.scheduler.maxModelLen,
          )
        : null,
    events: [],
    counters: {
      preemptions: 0,
      evictions: 0,
      hitTokens: 0,
      queryTokens: 0,
      preemptedHitTokens: 0,
      preemptedQueryTokens: 0,
    },
    admitCounter: 0,
    preemptCounter: 0,
    pending,
    finished: [],
    byId: new Map(reqs.map((r) => [r.spec.id, r])),
    done: reqs.length === 0,
    batchOpenAtStart: false,
  };
}

export function createSim(config: SimConfig): Sim {
  const e = createEngine(config);
  let last: StepInfo = info(e, -1);
  return {
    step() {
      last = step(e);
      return last;
    },
    run(until, maxSteps = Infinity) {
      for (let n = 0; !e.done && n < maxSteps; n++) {
        last = step(e);
        if (until?.(last)) break;
      }
      return last;
    },
    snapshot: () => snapshot(e),
    events: () => e.events,
  };
}

function info(e: Engine, stepIndex: number): StepInfo {
  return {
    step: stepIndex,
    time: e.clock,
    waiting: e.waiting.length,
    running: e.running.length,
    done: e.done,
  };
}

/** One engine iteration. */
export function step(e: Engine): StepInfo {
  if (e.done) throw new Error("the run is done");

  // 1. intake. A step never runs empty: an idle engine jumps to the next arrival.
  intake(e);
  const idle = () =>
    e.waiting.length === 0 && e.running.length === 0 && e.batch.length === 0;
  const next = e.pending[0];
  if (idle() && next) {
    e.clock = Math.max(e.clock, next.spec.arrival);
    intake(e);
  }
  e.batchOpenAtStart = e.batch.length > 0;

  // 2. schedule
  const { scheduled, preempted } = schedule(e);
  if (scheduled.length === 0 && !preempted) {
    const head = e.waiting[0];
    if (!head || e.running.length > 0 || e.batch.length > 0) {
      throw new Error("engine stalled with work held");
    }
    // §4.6: the config checks make this impossible; it exists for safety.
    e.waiting.shift();
    head.state = "rejected";
    emit(e, {
      type: "Reject",
      req: head.spec.id,
      reason: "cannot be scheduled on an empty engine",
    });
  }

  // 3. cost, 4. advance
  const cost = stepCost(
    scheduled.map((w) => ({ q: w.q, c: w.start })),
    e.config.model,
    e.config.gpu,
    e.config.cost,
  );
  e.clock += cost.duration;

  // 5. apply
  for (const w of scheduled) {
    const r = w.req;
    writeKv(e, r, w.start, w.q);
    r.computed += w.q;
    if (w.prefill) {
      emit(e, {
        type: "PrefillChunk",
        req: r.spec.id,
        start: w.start,
        tokens: w.q,
      });
    }
    if (r.computed === seqLen(r)) {
      emit(e, { type: "DecodeToken", req: r.spec.id, index: r.generated });
      r.generated++;
      r.prefilling = false;
    }
  }

  // 6. finish
  const continuous = e.config.scheduler.policy === "continuous";
  for (const { req: r } of scheduled) {
    if (r.generated !== r.spec.outputLen || r.state !== "running") continue;
    e.running.splice(e.running.indexOf(r), 1);
    if (continuous) finish(e, r);
    else r.state = "done-in-batch";
  }
  if (!continuous && e.running.length === 0 && e.batch.length > 0) {
    // Request-level batching returns the batch as a unit.
    for (const r of e.batch) finish(e, r);
    e.batch = [];
  }

  // 7. StepEnd
  emit(e, {
    type: "StepEnd",
    duration: cost.duration,
    computeS: cost.computeS,
    memoryS: cost.memoryS,
    overheadS: cost.overheadS,
    bound: cost.bound,
    tokens: scheduled.reduce((s, w) => s + w.q, 0),
    batch: scheduled.length,
    waiting: e.waiting.length,
    running: e.running.length,
    kv: kvCounts(e),
  });
  e.done =
    e.pending.length === 0 &&
    e.waiting.length === 0 &&
    e.running.length === 0 &&
    e.batch.length === 0;

  const result = info(e, e.step);
  e.step++;
  return result;
}

function intake(e: Engine): void {
  let next = e.pending[0];
  while (next && next.spec.arrival <= e.clock) {
    e.pending.shift();
    e.waiting.push(next);
    // Arrive keeps the request's true arrival time (§4.5).
    e.events.push({
      type: "Arrive",
      step: e.step,
      t: next.spec.arrival,
      req: next.spec.id,
    });
    next = e.pending[0];
  }
}

/** Positions [start, start + q) now hold KV. */
function writeKv(e: Engine, r: Req, start: number, q: number): void {
  if (e.paged) {
    const B = e.paged.blockSize;
    for (let p = start; p < start + q; p++) {
      const block = r.table[Math.floor(p / B)];
      if (block === undefined) throw new Error("KV written past the table");
      e.paged.filled[block] = (p % B) + 1;
    }
  } else if (r.region) {
    r.region.used = start + q;
  }
}

function finish(e: Engine, r: Req): void {
  const id = r.spec.id;
  emit(e, { type: "Finish", req: id });
  if (e.paged) {
    emit(e, { type: "Free", req: id, blocks: e.paged.release(r.table) });
  } else if (e.contiguous) {
    const { start, len } = e.contiguous.release(id);
    emit(e, { type: "Free", req: id, region: { start, len } });
  }
  r.table = [];
  r.region = null;
  r.state = "finished";
  e.finished.push(r);
}

/** §2.2: KV in token slots, so both allocators report the same quantities. */
export function kvCounts(e: Engine): KvCounts {
  const { numBlocks, blockSize } = e.config.kv;
  const capacity = numBlocks * blockSize;
  if (e.contiguous) {
    return {
      capacity,
      allocated: e.contiguous.allocatedSlots(),
      cached: 0,
      tokens: e.contiguous.usedSlots(),
      unusable: e.contiguous.unusableSlots(),
    };
  }
  const pool = e.paged;
  if (!pool) throw new Error("no KV pool");
  let used = 0;
  let cached = 0;
  let tokens = 0;
  for (let b = 0; b < numBlocks; b++) {
    if ((pool.refCount[b] ?? 0) > 0) {
      used++;
      tokens += pool.filled[b] ?? 0;
    } else if (pool.isHashed(b)) {
      cached++;
    }
  }
  return {
    capacity,
    allocated: used * blockSize,
    cached: cached * blockSize,
    tokens,
    unusable: 0,
  };
}

function snapshot(e: Engine): SimSnapshot {
  const view = (r: Req): RequestView => ({
    id: r.spec.id,
    state: r.state,
    computedTokens: r.computed,
    generated: r.generated,
    blockTable: e.paged ? [...r.table] : null,
    region: r.region ? { ...r.region } : null,
    preemptions: r.preemptions,
  });
  const pending = new Set(e.pending);
  const arrived = [...e.byId.values()].filter((r) => !pending.has(r));
  const pool = e.paged;
  return {
    step: e.step,
    time: e.clock,
    done: e.done,
    waiting: e.waiting.map((r) => r.spec.id),
    running: e.running.map((r) => r.spec.id),
    finished: e.finished.map((r) => r.spec.id),
    requests: arrived.sort((a, b) => a.spec.id - b.spec.id).map(view),
    kv: pool
      ? {
          kind: "paged",
          numBlocks: pool.numBlocks,
          blockSize: pool.blockSize,
          refCount: Array.from(pool.refCount),
          filled: Array.from(pool.filled),
          hash: Array.from(pool.hash, (h) => (Number.isNaN(h) ? null : h)),
          freeQueue: pool.free.toArray(),
        }
      : {
          kind: "contiguous",
          capacity: e.config.kv.numBlocks * e.config.kv.blockSize,
          regions: (e.contiguous?.view() ?? []).map(
            ({ req, start, len, used }) => ({ req, start, len, used }),
          ),
        },
    counters: {
      preemptions: e.counters.preemptions,
      evictions: e.counters.evictions,
      hitTokens: e.counters.hitTokens,
      queryTokens: e.counters.queryTokens,
    },
  };
}

/** §2.1: createSim refuses a config that could never serve a request. */
function validate(config: SimConfig): void {
  const { kv, scheduler: sc } = config;
  const whole = (n: number, min: number) => Number.isInteger(n) && n >= min;
  if (
    !whole(kv.numBlocks, 1) ||
    !whole(kv.blockSize, 1) ||
    !whole(sc.maxNumSeqs, 1) ||
    !whole(sc.maxNumBatchedTokens, 1) ||
    !whole(sc.maxModelLen, 2)
  ) {
    throw new RangeError(
      "numBlocks, blockSize, maxNumSeqs, and maxNumBatchedTokens must be whole numbers ≥ 1, and maxModelLen ≥ 2",
    );
  }
  if (kv.prefixCaching && kv.allocator === "contiguous-max") {
    throw new ConfigError(
      "caching-needs-paged",
      "Prefix caching needs the paged allocator.",
    );
  }
  if (sc.maxModelLen > kv.numBlocks * kv.blockSize) {
    throw new ConfigError(
      "kv-smaller-than-max-model-len",
      `The KV pool holds ${String(kv.numBlocks * kv.blockSize)} tokens, but one request may need ${String(sc.maxModelLen)} (max_model_len).`,
    );
  }
  if (!sc.chunkedPrefill && sc.maxNumBatchedTokens < sc.maxModelLen) {
    throw new ConfigError(
      "budget-below-max-model-len",
      `With chunked prefill off, the token budget (${String(sc.maxNumBatchedTokens)}) must be at least max_model_len (${String(sc.maxModelLen)}).`,
    );
  }
  const ids = new Set<number>();
  for (const r of config.requests) {
    const bad =
      ids.has(r.id) ||
      !Number.isFinite(r.arrival) ||
      r.arrival < 0 ||
      r.prompt.length < 1 ||
      !whole(r.outputLen, 1);
    if (bad) {
      throw new ConfigError(
        "bad-requests",
        `Request ${String(r.id)} is malformed: ids must be unique, arrivals finite and ≥ 0, prompts non-empty, and outputs ≥ 1 token.`,
      );
    }
    ids.add(r.id);
    if (r.prompt.length + r.outputLen > sc.maxModelLen) {
      throw new ConfigError(
        "request-too-long",
        `Request ${String(r.id)} needs ${String(r.prompt.length + r.outputLen)} tokens, more than max_model_len (${String(sc.maxModelLen)}).`,
      );
    }
  }
}
