/**
 * The numbers chapter 3's prose quotes, computed from a run's event log. The
 * prose and tests/chapters/continuous-batching.test.ts both use these.
 */
import type { SimConfig, SimEvent, SimMetrics } from "../../sim/index.ts";
import { LONG_PROMPT } from "./presets.ts";

type StepEnd = Extract<SimEvent, { type: "StepEnd" }>;
export interface Run {
  config: SimConfig;
  events: readonly SimEvent[];
  m: SimMetrics;
}

export const stepEnds = (events: readonly SimEvent[]) =>
  events.filter((e): e is StepEnd => e.type === "StepEnd");

const mean = (xs: readonly number[]) =>
  xs.reduce((s, x) => s + x, 0) / xs.length;

/** Time-averaged queue length over [a, b): StepEnd.waiting over each step. */
export function meanQueue(events: readonly SimEvent[], a: number, b: number) {
  let area = 0;
  for (const e of stepEnds(events)) {
    const t0 = Math.max(e.t - e.duration, a);
    const t1 = Math.min(e.t, b);
    if (t1 > t0) area += e.waiting * (t1 - t0);
  }
  return area / (b - a);
}

export const lastArrival = (config: SimConfig) =>
  Math.max(...config.requests.map((r) => r.arrival));

/** Ids of the requests whose prompt is at least LONG_PROMPT tokens. */
export const longIds = (config: SimConfig) =>
  new Set(
    config.requests
      .filter((q) => q.prompt.length >= LONG_PROMPT)
      .map((q) => q.id),
  );

/** Mean TTFT of the long prompts. */
export function longTtft(r: Run) {
  const long = longIds(r.config);
  return mean(r.m.requests.filter((q) => long.has(q.id)).map((q) => q.ttft));
}

/** Mean time from a long prompt's first admission to its first token. */
export function longAdmitToFirstToken(r: Run) {
  const long = longIds(r.config);
  const admit = new Map<number, number>();
  const first = new Map<number, number>();
  for (const e of r.events) {
    if (e.type === "Admit" && !admit.has(e.req)) admit.set(e.req, e.t);
    if (e.type === "DecodeToken" && e.index === 0) first.set(e.req, e.t);
  }
  return mean(
    [...long].map((id) => (first.get(id) ?? 0) - (admit.get(id) ?? 0)),
  );
}

/**
 * Stall steps: steps in which a long prompt does prefill work, so every
 * running request's next token waits for that prefill.
 */
export function stalls(r: Run) {
  const long = longIds(r.config);
  const stalled = new Set(
    r.events
      .filter((e) => e.type === "PrefillChunk" && long.has(e.req))
      .map((e) => e.step),
  );
  let gaps = 0;
  let stalledGaps = 0;
  for (const e of r.events) {
    if (e.type !== "DecodeToken" || e.index === 0) continue;
    gaps++;
    if (stalled.has(e.step)) stalledGaps++;
  }
  return {
    /** Share of steps that are stall steps. */
    stepShare: stalled.size / stepEnds(r.events).length,
    /** Share of inter-token gaps that end in a stall step. */
    gapShare: stalledGaps / gaps,
  };
}

/** The longest inter-token gap in the run: its worst stall. */
export const maxItl = (r: Run) =>
  Math.max(...r.m.requests.flatMap((q) => q.itl));

/** Sim time spent in memory-bound steps, and their share of all steps. */
export function memoryBound(r: Run) {
  const ends = stepEnds(r.events);
  const memory = ends.filter((e) => e.bound === "memory");
  return {
    seconds: memory.reduce((s, e) => s + e.duration, 0),
    stepShare: memory.length / ends.length,
  };
}
