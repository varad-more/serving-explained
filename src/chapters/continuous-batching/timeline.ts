/**
 * Chapter 3's timeline, rebuilt from the event log alone (CLAUDE.md: widgets
 * animate from the log). A request takes the lowest free slot when it is
 * admitted and keeps it until it finishes or is preempted (DESIGN.md).
 * tests/viz/timeline.test.ts checks it against the engine.
 */
import {
  createSim,
  metrics,
  type SimConfig,
  type SimEvent,
  type SimMetrics,
} from "../../sim/index.ts";
import { runConfig, type PresetKey, type RunOptions } from "./presets.ts";

/**
 * What a slot's request does in one step:
 * - prefill: computes prompt tokens (its first token may come out too)
 * - decode: makes one output token
 * - bubble: has made every token but holds its slot (static batching)
 * - held: holds its slot but was not scheduled this step
 */
export type Phase = "prefill" | "decode" | "bubble" | "held";

export interface Segment {
  slot: number;
  req: number;
  phase: Phase;
  t0: number;
  t1: number;
  /** The first segment since the request took this slot: it gets the tab. */
  first: boolean;
  /** When the request took this slot: one occupancy shares it. */
  start: number;
  /** The request was preempted at t1. */
  preempted: boolean;
}

export interface StepSpan {
  step: number;
  t0: number;
  t1: number;
  /** Long enough to get a labeled band: over STALL_FACTOR × the median step. */
  stall: boolean;
}

/** A step this many times the run's median step gets a labeled band. */
export const STALL_FACTOR = 5;

export interface Timeline {
  config: SimConfig;
  events: readonly SimEvent[];
  m: SimMetrics;
  /** Sim time of the last event. */
  duration: number;
  segments: Segment[];
  steps: StepSpan[];
  medianStep: number;
  /** Ends of every step, ascending: Step moves to the next one. */
  stepEnds: number[];
  /** Each request's time in the queue: [from, to) intervals. */
  queued: { req: number; from: number; to: number }[];
  /** Queue length changes: the count from each t on. */
  queue: { t: number; n: number }[];
  /**
   * Requests waiting at each step's end, held until the next: the queue the
   * prose measures (StepEnd.waiting).
   */
  stepQueue: { t: number; n: number }[];
  /** First tokens: when each came out, and its TTFT. Ascending by t. */
  firsts: { t: number; req: number; ttft: number }[];
  /** Later tokens: when each came out, and its gap. Ascending by t. */
  gaps: { t: number; req: number; itl: number }[];
  /** Every output token's time, ascending. */
  tokens: { t: number }[];
  /** The first arrival: throughput is measured from it, as metrics() does. */
  start: number;
  preemptions: { t: number; req: number }[];
  /** TTFTs in the order first tokens came out, with stats for every prefix. */
  ttft: PrefixStats;
  /** Gaps in the order tokens came out, with stats for every prefix. */
  itl: PrefixStats;
}

/**
 * Statistics of the first n values of a list, for every n, so a readout at
 * any playhead is a lookup. Entry 0 is NaN. Percentiles are nearest-rank, as
 * the sim's metrics use.
 */
export interface PrefixStats {
  values: readonly number[];
  mean: Float64Array;
  p50: Float64Array;
  p99: Float64Array;
}

/**
 * One pass in time order: each value goes into a Fenwick tree over its rank
 * among all the values, and the k-th smallest so far is found by walking the
 * tree. O(n log n) for every prefix's p50 and p99.
 */
export function prefixStats(values: readonly number[]): PrefixStats {
  const n = values.length;
  const at = (i: number) => values[i] ?? NaN;
  const order = values.map((_, i) => i).sort((a, b) => at(a) - at(b) || a - b);
  const rank = new Int32Array(n);
  order.forEach((i, r) => {
    rank[i] = r;
  });
  const tree = new Int32Array(n + 1);
  let top = 1;
  while (top * 2 <= n) top *= 2;
  /** The k-th smallest (1-based) of the values inserted so far. */
  const kth = (k: number) => {
    let pos = 0;
    let left = k;
    for (let step = top; step > 0; step >>= 1) {
      const next = pos + step;
      if (next <= n && (tree[next] ?? 0) < left) {
        pos = next;
        left -= tree[next] ?? 0;
      }
    }
    return at(order[pos] ?? 0);
  };
  const mean = new Float64Array(n + 1).fill(NaN);
  const p50 = new Float64Array(n + 1).fill(NaN);
  const p99 = new Float64Array(n + 1).fill(NaN);
  let sum = 0;
  for (let i = 0; i < n; i++) {
    for (let j = (rank[i] ?? 0) + 1; j <= n; j += j & -j)
      tree[j] = (tree[j] ?? 0) + 1;
    sum += at(i);
    const c = i + 1;
    mean[c] = sum / c;
    // The same rank as percentile() below: ceil(p / 100 × n), at least 1.
    p50[c] = kth(Math.max(1, Math.ceil((50 / 100) * c)));
    p99[c] = kth(Math.max(1, Math.ceil((99 / 100) * c)));
  }
  return { values, mean, p50, p99 };
}

const cache = new Map<string, Timeline>();
/**
 * A preset run under the timeline's settings, cached, so the prose and the
 * figures share runs. The oldest entry goes past 32.
 */
export function runTimeline(
  preset: PresetKey,
  o: RunOptions,
  variant: Parameters<typeof runConfig>[2] = {},
): Timeline {
  const key = JSON.stringify([preset, o, variant]);
  let tl = cache.get(key);
  if (!tl) {
    tl = simulateTimeline(runConfig(preset, o, variant));
    cache.set(key, tl);
    if (cache.size > 32) cache.delete(cache.keys().next().value ?? "");
  }
  return tl;
}

export function simulateTimeline(config: SimConfig): Timeline {
  const sim = createSim(config);
  sim.run();
  return buildTimeline(sim.events(), config);
}

export function buildTimeline(
  events: readonly SimEvent[],
  config: SimConfig,
): Timeline {
  const outputLen = new Map(config.requests.map((r) => [r.id, r.outputLen]));
  const arrival = new Map(config.requests.map((r) => [r.id, r.arrival]));
  const slots = new Map<number, number>();
  const fresh = new Set<number>();
  const since = new Map<number, number>();
  const generated = new Map<number, number>();
  const queuedFrom = new Map<number, number>();
  const lastToken = new Map<number, number>();
  const tl: Omit<Timeline, "medianStep" | "duration" | "m" | "ttft" | "itl"> = {
    config,
    events,
    segments: [],
    steps: [],
    stepEnds: [],
    queued: [],
    queue: [],
    stepQueue: [],
    firsts: [],
    gaps: [],
    tokens: [],
    start: Math.min(...config.requests.map((r) => r.arrival)),
    preemptions: [],
  };
  const open = new Map<number, Segment>();

  const takeSlot = (req: number) => {
    const used = new Set(slots.values());
    let slot = 1;
    while (used.has(slot)) slot++;
    slots.set(req, slot);
    fresh.add(req);
  };
  const close = (req: number, preempted = false) => {
    const seg = open.get(req);
    if (seg) {
      seg.preempted = preempted;
      tl.segments.push(seg);
      open.delete(req);
    }
  };
  const leaveQueue = (req: number, t: number) => {
    tl.queued.push({ req, from: queuedFrom.get(req) ?? t, to: t });
    queuedFrom.delete(req);
  };

  // One pass per step: its events, then StepEnd.
  let stepEvents: SimEvent[] = [];
  for (const e of events) {
    stepEvents.push(e);
    if (e.type !== "StepEnd") continue;
    // Back-to-back steps share an edge exactly, despite float rounding.
    const prev = tl.steps.at(-1);
    const t0 =
      prev && Math.abs(prev.t1 - (e.t - e.duration)) < 1e-9
        ? prev.t1
        : e.t - e.duration;
    const work = new Map<number, "prefill" | "decode">();
    for (const x of stepEvents) {
      if (x.type === "Arrive") queuedFrom.set(x.req, arrival.get(x.req) ?? x.t);
      if (x.type === "Admit") {
        leaveQueue(x.req, t0);
        takeSlot(x.req);
        since.set(x.req, t0);
      }
      if (x.type === "Preempt") {
        close(x.req, true);
        slots.delete(x.req);
        queuedFrom.set(x.req, t0);
        tl.preemptions.push({ t: t0, req: x.req });
      }
      if (x.type === "PrefillChunk") work.set(x.req, "prefill");
      if (x.type === "DecodeToken") {
        if (!work.has(x.req)) work.set(x.req, "decode");
        generated.set(x.req, x.index + 1);
        tl.tokens.push({ t: x.t });
        if (x.index === 0) {
          tl.firsts.push({
            t: x.t,
            req: x.req,
            ttft: x.t - (arrival.get(x.req) ?? 0),
          });
        } else {
          tl.gaps.push({
            t: x.t,
            req: x.req,
            itl: x.t - (lastToken.get(x.req) ?? x.t),
          });
        }
        lastToken.set(x.req, x.t);
      }
    }
    // Every slot holder's phase in this step.
    for (const [req, slot] of slots) {
      const done = (generated.get(req) ?? 0) >= (outputLen.get(req) ?? 0);
      const phase: Phase = work.get(req) ?? (done ? "bubble" : "held");
      const seg = open.get(req);
      if (seg && seg.phase === phase && seg.t1 === t0) {
        seg.t1 = e.t;
        continue;
      }
      close(req);
      open.set(req, {
        slot,
        req,
        phase,
        t0,
        t1: e.t,
        first: fresh.has(req),
        start: since.get(req) ?? t0,
        preempted: false,
      });
      fresh.delete(req);
    }
    // Finishes free their slots at the step's end.
    for (const x of stepEvents) {
      if (x.type === "Finish") {
        close(x.req);
        slots.delete(x.req);
      }
    }
    tl.steps.push({ step: e.step, t0, t1: e.t, stall: false });
    tl.stepQueue.push({ t: e.t, n: e.waiting });
    tl.stepEnds.push(e.t);
    stepEvents = [];
  }
  for (const req of [...open.keys()]) close(req);

  // The queue length over time, from the intervals.
  const changes: { t: number; d: number }[] = [];
  for (const q of tl.queued) {
    changes.push({ t: q.from, d: 1 }, { t: q.to, d: -1 });
  }
  changes.sort((a, b) => a.t - b.t || a.d - b.d);
  let n = 0;
  for (const c of changes) {
    n += c.d;
    const last = tl.queue.at(-1);
    if (last && last.t === c.t) last.n = n;
    else tl.queue.push({ t: c.t, n });
  }

  const durations = tl.steps.map((s) => s.t1 - s.t0).sort((a, b) => a - b);
  const medianStep = durations[Math.floor((durations.length - 1) / 2)] ?? 0;
  for (const s of tl.steps) s.stall = s.t1 - s.t0 > STALL_FACTOR * medianStep;
  tl.segments.sort((a, b) => a.t0 - b.t0 || a.slot - b.slot);
  return {
    ...tl,
    ttft: prefixStats(tl.firsts.map((f) => f.ttft)),
    itl: prefixStats(tl.gaps.map((g) => g.itl)),
    m: metrics(events, config),
    medianStep,
    duration: events.at(-1)?.t ?? 0,
  };
}

/** Requests waiting in the queue at time t, in queue order. */
export function queueAt(tl: Timeline, t: number): number[] {
  return tl.queued
    .filter((q) => q.from <= t && t < q.to)
    .sort((a, b) => a.from - b.from || a.req - b.req)
    .map((q) => q.req);
}

/** The count of entries in an ascending list with t ≤ time. */
export function countTo(times: readonly { t: number }[], time: number) {
  let lo = 0;
  let hi = times.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if ((times[mid]?.t ?? Infinity) <= time) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/** Nearest-rank percentile, as the sim's metrics use; NaN when empty. */
export function percentile(sorted: readonly number[], p: number): number {
  if (sorted.length === 0) return NaN;
  return sorted[Math.max(0, Math.ceil((p / 100) * sorted.length) - 1)] ?? NaN;
}

export interface Readout {
  /** Output tokens per second from the first arrival to t. */
  throughput: number;
  ttftMean: number;
  ttftP99: number;
  itlP50: number;
  itlP99: number;
  tokens: number;
}

/**
 * The readouts so far, at time t: lookups into the prefix stats. Past the
 * run's end (a longer run sets the playhead), they stay at the end values.
 */
export function readoutAt(tl: Timeline, time: number): Readout {
  const t = Math.min(time, tl.duration);
  const firsts = countTo(tl.firsts, t);
  const gaps = countTo(tl.gaps, t);
  const tokens = countTo(tl.tokens, t);
  return {
    throughput: t > tl.start ? tokens / (t - tl.start) : 0,
    ttftMean: tl.ttft.mean[firsts] ?? NaN,
    ttftP99: tl.ttft.p99[firsts] ?? NaN,
    itlP50: tl.itl.p50[gaps] ?? NaN,
    itlP99: tl.itl.p99[gaps] ?? NaN,
    tokens,
  };
}
