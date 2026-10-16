/**
 * The sandbox worker's message handler, apart from the Worker global so
 * tests can call it directly (tests/sandbox/worker.test.ts). It runs the sim
 * in slices of about 50 ms, posting progress and per-step series as it goes,
 * then the lanes, metrics, histograms, and log hash. Frames and event windows
 * are answered from the log, which never leaves the worker. Cancel is
 * worker.terminate() on the page's side.
 */
import {
  ConfigError,
  createSim,
  ENGINE_VERSION,
  hashEvents,
  metrics,
  type SimEvent,
} from "../../sim/index.ts";
import { buildLanes } from "../../chapters/continuous-batching/timeline.ts";
import { logEdges } from "../../chapters/continuous-batching/charts.tsx";
import { buildConfig } from "./build.ts";
import { LIMITS } from "./params.ts";
import {
  EVENT_TYPES,
  type EventColumns,
  type FromWorker,
  type Histogram,
  type Series,
  type ToWorker,
} from "./protocol.ts";
import { Replayer } from "./replay.ts";

export type Post = (msg: FromWorker, transfer?: Transferable[]) => void;

const SLICE_MS = 50;
const EVENT_CAP = 50_000;
export const TTFT_EDGES = logEdges(0.01, 1000, 4);
export const ITL_EDGES = logEdges(0.001, 100, 4);

/** A clock and a yield, swappable so tests run without timers. */
export interface Env {
  now: () => number;
  yield: () => Promise<void>;
}

const defaultEnv: Env = {
  now: () => performance.now(),
  yield: () =>
    new Promise((resolve) => {
      setTimeout(resolve, 0);
    }),
};

export function createRunner(post: Post, env: Env = defaultEnv) {
  let events: readonly SimEvent[] = [];
  let replayer: Replayer | null = null;

  async function run(msg: Extract<ToWorker, { type: "run" }>) {
    const built = buildConfig(msg.config);
    if (!built.ok) {
      post({ type: "error", code: built.code, message: built.message });
      return;
    }
    let sim;
    try {
      sim = createSim(built.config);
    } catch (e) {
      post({
        type: "error",
        code: e instanceof ConfigError ? e.code : "bad-config",
        message: e instanceof Error ? e.message : String(e),
      });
      return;
    }
    const config = built.config;
    events = sim.events();
    replayer = new Replayer(events, config);
    const total = config.requests.length;
    let finished = 0;
    let sent = 0;
    let done = false;
    let steps = 0;
    while (!done) {
      const until = env.now() + SLICE_MS;
      while (!done && env.now() < until) {
        const info = sim.step();
        done = info.done;
        steps++;
        if (steps > LIMITS.steps) {
          post({
            type: "error",
            code: "too-many-steps",
            message: `The run stopped after ${LIMITS.steps.toLocaleString("en-US")} steps. Try fewer requests or a faster setup.`,
          });
          return;
        }
      }
      events = sim.events();
      for (let i = sent; i < events.length; i++)
        if (events[i]?.type === "Finish") finished++;
      const series = seriesOf(events, sent);
      sent = events.length;
      replayer.advance();
      post({ type: "progress", simTime: sim.snapshot().time, finished, total });
      post({ type: "batch", series }, transferables(series));
      if (!done) await env.yield();
    }
    const m = metrics(events, config);
    const lanes = buildLanes(events, config);
    const segs = lanes.segments;
    const segments = {
      slot: Uint32Array.from(segs, (s) => s.slot),
      req: Int32Array.from(segs, (s) => s.req),
      phase: Uint8Array.from(segs, (s) =>
        s.phase === "prefill"
          ? 0
          : s.phase === "decode"
            ? 1
            : s.phase === "bubble"
              ? 2
              : 3,
      ),
      t0: Float64Array.from(segs, (s) => s.t0),
      t1: Float64Array.from(segs, (s) => s.t1),
      start: Float64Array.from(segs, (s) => s.start),
      first: Uint8Array.from(segs, (s) => (s.first ? 1 : 0)),
      preempted: Uint8Array.from(segs, (s) => (s.preempted ? 1 : 0)),
    };
    const queued = {
      req: Int32Array.from(lanes.queued, (q) => q.req),
      from: Float64Array.from(lanes.queued, (q) => q.from),
      to: Float64Array.from(lanes.queued, (q) => q.to),
    };
    const stalls = lanes.steps.filter((s) => s.stall);
    const stallSteps = Float64Array.from(stalls, (s) => s.t0);
    const stallEnds = Float64Array.from(stalls, (s) => s.t1);
    post(
      {
        type: "done",
        summary: m.summary,
        requests: total,
        ttft: histogram(
          m.requests.map((r) => r.ttft),
          TTFT_EDGES,
        ),
        itl: histogram(
          m.requests.flatMap((r) => r.itl),
          ITL_EDGES,
        ),
        hash: hashEvents(events),
        engineVersion: ENGINE_VERSION,
        duration: events.at(-1)?.t ?? 0,
        steps: replayer.times.length,
        numBlocks: config.kv.numBlocks,
        blockSize: config.kv.blockSize,
        maxNumSeqs: config.scheduler.maxNumSeqs,
        allocator: config.kv.allocator,
        maxModelLen: config.scheduler.maxModelLen,
        segments,
        queued,
        stallSteps,
        stallEnds,
      },
      [
        ...Object.values(segments).map((a) => a.buffer),
        ...Object.values(queued).map((a) => a.buffer),
        stallSteps.buffer,
        stallEnds.buffer,
      ],
    );
  }

  function frame(t: number) {
    if (!replayer) return;
    const { cells, holders, evicted } = replayer.frameAt(t);
    const i = lastAtOrBefore(replayer.times, t);
    const end = events[(replayer.stepEnds[i] ?? 1) - 1];
    post(
      {
        type: "frame",
        t,
        cells,
        holders,
        running: end?.type === "StepEnd" ? end.running : 0,
        waiting: end?.type === "StepEnd" ? end.waiting : 0,
        evicted,
        kv:
          end?.type === "StepEnd"
            ? { allocated: end.kv.allocated, tokens: end.kv.tokens }
            : { allocated: 0, tokens: 0 },
      },
      Object.values(cells).map((a) => (a as Uint8Array).buffer),
    );
  }

  function eventsIn(t0: number, t1: number) {
    const picked: SimEvent[] = [];
    let truncated = false;
    for (const e of events) {
      if (e.t < t0 || e.t > t1) continue;
      if (picked.length >= EVENT_CAP) {
        truncated = true;
        break;
      }
      picked.push(e);
    }
    const columns: EventColumns = {
      t: Float64Array.from(picked, (e) => e.t),
      step: Uint32Array.from(picked, (e) => e.step),
      type: Uint8Array.from(picked, (e) =>
        Math.max(
          0,
          EVENT_TYPES.indexOf(e.type),
        ),
      ),
      req: Int32Array.from(picked, (e) => ("req" in e ? e.req : -1)),
      value: Float64Array.from(picked, valueOf),
      truncated,
    };
    post({ type: "events", t0, t1, columns }, [
      columns.t.buffer,
      columns.step.buffer,
      columns.type.buffer,
      columns.req.buffer,
      columns.value.buffer,
    ]);
  }

  return async function handle(msg: ToWorker): Promise<void> {
    try {
      if (msg.type === "run") await run(msg);
      else if (msg.type === "frame") frame(msg.t);
      else eventsIn(msg.t0, msg.t1);
    } catch (e) {
      post({
        type: "error",
        code: "internal",
        message: e instanceof Error ? e.message : String(e),
      });
    }
  };
}

/** The value an events list shows for each type. */
function valueOf(e: SimEvent): number {
  switch (e.type) {
    case "Admit":
      return e.cachedTokens;
    case "CacheHit":
      return e.tokens;
    case "PrefillChunk":
      return e.tokens;
    case "DecodeToken":
      return e.index;
    case "StepEnd":
      return e.duration;
    case "Allocate":
      return "blocks" in e ? e.blocks.length : e.region.len;
    case "Evict":
    case "CacheInsert":
      return e.block;
    default:
      return NaN;
  }
}

function seriesOf(events: readonly SimEvent[], from: number): Series {
  const ends = [];
  for (let i = from; i < events.length; i++) {
    const e = events[i];
    if (e?.type === "StepEnd") ends.push(e);
  }
  return {
    t: Float64Array.from(ends, (e) => e.t),
    duration: Float64Array.from(ends, (e) => e.duration),
    running: Uint32Array.from(ends, (e) => e.running),
    waiting: Uint32Array.from(ends, (e) => e.waiting),
    allocated: Float64Array.from(ends, (e) => e.kv.allocated),
    tokens: Float64Array.from(ends, (e) => e.kv.tokens),
    cached: Float64Array.from(ends, (e) => e.kv.cached),
  };
}

const transferables = (s: Series) =>
  Object.values(s).map((a) => (a as Float64Array).buffer);

function histogram(
  values: readonly number[],
  edges: readonly number[],
): Histogram {
  const counts = new Array<number>(edges.length - 1).fill(0);
  for (const v of values) {
    if (!Number.isFinite(v)) continue;
    let b = edges.findIndex((e) => v < e) - 1;
    if (b < 0) b = v < (edges[0] ?? 0) ? 0 : counts.length - 1;
    counts[b] = (counts[b] ?? 0) + 1;
  }
  return { edges: [...edges], counts };
}

function lastAtOrBefore(times: readonly number[], t: number): number {
  let lo = 0;
  let hi = times.length - 1;
  let found = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if ((times[mid] ?? Infinity) <= t) {
      found = mid;
      lo = mid + 1;
    } else hi = mid - 1;
  }
  return found;
}
