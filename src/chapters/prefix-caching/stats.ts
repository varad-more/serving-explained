/**
 * The numbers chapter 4's prose quotes, computed from a run's event log. The
 * prose and tests/chapters/prefix-caching.test.ts both use these.
 */
import type { SimConfig, SimEvent } from "../../sim/index.ts";
import { sharers } from "./presets.ts";

type StepEnd = Extract<SimEvent, { type: "StepEnd" }>;

/**
 * Prefix tokens computed by the requests that share the single prefix of
 * `length` tokens, and which of them were preempted.
 */
export function prefixPrefill(
  config: SimConfig,
  events: readonly SimEvent[],
  length: number,
) {
  const members = [...sharers(config.requests, length).values()].flat();
  const ids = new Set(members.map((m) => m.id));
  let tokens = 0;
  const preempted = new Set<number>();
  for (const e of events) {
    if (e.type === "PrefillChunk" && ids.has(e.req))
      tokens += Math.max(0, Math.min(e.start + e.tokens, length) - e.start);
    if (e.type === "Preempt" && ids.has(e.req)) preempted.add(e.req);
  }
  return { sharers: ids.size, preempted: [...preempted], tokens };
}

/**
 * Averages over sim time while at least one request runs. Each step's end
 * state is weighted by how long it stays on screen in playback: until the
 * next step ends.
 * - blocksPerRunning: physical blocks in use (each shared block counted
 *   once) divided by running requests
 * - queue: waiting requests
 */
export function timeAverages(events: readonly SimEvent[], blockSize: number) {
  const ends = events.filter((e): e is StepEnd => e.type === "StepEnd");
  let time = 0;
  let blocks = 0;
  let queue = 0;
  ends.forEach((e, i) => {
    const next = ends[i + 1];
    if (!next || e.running === 0) return;
    const dt = next.t - e.t;
    time += dt;
    blocks += (dt * e.kv.allocated) / blockSize / e.running;
    queue += dt * e.waiting;
  });
  return {
    blocksPerRunning: blocks / time,
    queue: queue / time,
    maxRunning: Math.max(0, ...ends.map((e) => e.running)),
  };
}

/** Mean requests in the batch, over steps that produce a decode token. */
export function decodeBatch(events: readonly SimEvent[]): number {
  const decoding = new Set<number>();
  for (const e of events) if (e.type === "DecodeToken") decoding.add(e.step);
  const sizes = events
    .filter((e): e is StepEnd => e.type === "StepEnd" && decoding.has(e.step))
    .map((e) => e.batch);
  return sizes.reduce((s, x) => s + x, 0) / sizes.length;
}
