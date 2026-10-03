/**
 * Metrics from the event log alone (docs/SIM.md §2.4), so a number on screen
 * cannot disagree with the animation drawn from the same log. Every number
 * here is `simulated`.
 */
import type {
  Dist,
  RequestMetrics,
  SimConfig,
  SimEvent,
  SimMetrics,
} from "./types.ts";

/** Nearest-rank percentiles; NaN for an empty list. */
export function dist(values: readonly number[]): Dist {
  if (values.length === 0) return { mean: NaN, p50: NaN, p90: NaN, p99: NaN };
  const sorted = [...values].sort((a, b) => a - b);
  const at = (p: number) =>
    sorted[Math.max(0, Math.ceil((p / 100) * sorted.length) - 1)] ?? NaN;
  return {
    mean: sorted.reduce((s, v) => s + v, 0) / sorted.length,
    p50: at(50),
    p90: at(90),
    p99: at(99),
  };
}

interface Tracked {
  arrival: number;
  firstToken: number;
  lastToken: number;
  itl: number[];
  finish: number;
  preemptions: number;
  /** Cached tokens at the first admission; NaN before it. */
  cachedTokens: number;
}

export function metrics(
  events: readonly SimEvent[],
  config: SimConfig,
): SimMetrics {
  const promptLen = new Map(
    config.requests.map((r) => [r.id, r.prompt.length]),
  );
  const byId = new Map<number, Tracked>();
  const series: SimMetrics["series"] = {
    t: [],
    kvUtilization: [],
    waste: [],
    unusable: [],
    waiting: [],
    running: [],
  };
  let decoded = 0;
  let finished = 0;
  let preemptions = 0;
  let evictions = 0;
  let queryTokens = 0;
  let hitTokens = 0;
  const get = (id: number): Tracked => {
    let r = byId.get(id);
    if (!r) {
      r = {
        arrival: NaN,
        firstToken: NaN,
        lastToken: NaN,
        itl: [],
        finish: NaN,
        preemptions: 0,
        cachedTokens: NaN,
      };
      byId.set(id, r);
    }
    return r;
  };

  for (const e of events) {
    switch (e.type) {
      case "Arrive":
        get(e.req).arrival = e.t;
        break;
      case "Admit": {
        const r = get(e.req);
        if (Number.isNaN(r.cachedTokens)) {
          // Prefix stats count first admissions only, as vLLM does.
          r.cachedTokens = e.cachedTokens;
          queryTokens += promptLen.get(e.req) ?? 0;
          hitTokens += e.cachedTokens;
        }
        break;
      }
      case "DecodeToken": {
        const r = get(e.req);
        decoded++;
        if (e.index === 0) r.firstToken = e.t;
        else r.itl.push(e.t - r.lastToken);
        r.lastToken = e.t;
        break;
      }
      case "Finish":
        get(e.req).finish = e.t;
        finished++;
        break;
      case "Preempt":
        get(e.req).preemptions++;
        preemptions++;
        break;
      case "Evict":
        evictions++;
        break;
      case "StepEnd":
        series.t.push(e.t);
        series.kvUtilization.push(e.kv.tokens / e.kv.capacity);
        series.waste.push(e.kv.allocated - e.kv.tokens);
        series.unusable.push(e.kv.unusable);
        series.waiting.push(e.waiting);
        series.running.push(e.running);
        break;
      default:
        break;
    }
  }

  const requests: RequestMetrics[] = [...byId.entries()]
    .sort(([a], [b]) => a - b)
    .map(([id, r]) => ({
      id,
      arrival: r.arrival,
      ttft: r.firstToken - r.arrival,
      itl: r.itl,
      e2e: r.finish - r.arrival,
      preemptions: r.preemptions,
      cachedTokens: Number.isNaN(r.cachedTokens) ? 0 : r.cachedTokens,
    }));
  const finite = (xs: number[]) => xs.filter(Number.isFinite);
  const arrivals = finite(requests.map((r) => r.arrival));
  const finishes = finite([...byId.values()].map((r) => r.finish));
  const makespan =
    arrivals.length > 0 && finishes.length > 0
      ? Math.max(...finishes) - Math.min(...arrivals)
      : 0;
  const per = (n: number) => (makespan > 0 ? n / makespan : 0);
  const caching = config.kv.prefixCaching && config.kv.allocator === "paged";

  return {
    provenance: "simulated",
    requests,
    summary: {
      makespan,
      outputTokensPerS: per(decoded),
      requestsPerS: per(finished),
      ttft: dist(finite(requests.map((r) => r.ttft))),
      e2e: dist(finite(requests.map((r) => r.e2e))),
      itl: dist(requests.flatMap((r) => r.itl)),
      prefixHitRate:
        caching && queryTokens > 0 ? hitTokens / queryTokens : null,
      preemptions,
      evictions,
    },
    series,
  };
}
