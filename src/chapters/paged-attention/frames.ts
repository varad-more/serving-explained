/**
 * Chapter 2's frames, rebuilt from the event log alone (CLAUDE.md: widgets
 * animate from the log). One frame per StepEnd holds what the grid draws:
 * who holds memory, in which blocks or region, and how much of it holds KV.
 * tests/viz/frames.test.ts checks every frame against the engine's snapshot.
 */
import {
  createSim,
  type KvCounts,
  type SimConfig,
  type SimEvent,
} from "../../sim/index.ts";

/** A request that holds KV memory at the end of a step. */
export interface Holder {
  req: number;
  /** DESIGN.md slot 1–8, taken at admission and kept until the request leaves. */
  slot: number;
  /** Positions that hold KV. */
  computed: number;
  /** Paged: physical block ids in logical order. */
  blocks: readonly number[];
  /** Contiguous: the reserved region. */
  region: { start: number; len: number } | null;
}

export interface Frame {
  step: number;
  /** Sim seconds at the end of the step. */
  t: number;
  duration: number;
  running: number;
  waiting: number;
  kv: KvCounts;
  /** Preemptions so far. */
  preemptions: number;
  /** Sorted by slot. */
  holders: readonly Holder[];
}

const MAX_SLOTS = 8;

export function buildFrames(
  events: readonly SimEvent[],
  config: SimConfig,
): Frame[] {
  const promptLen = new Map(
    config.requests.map((r) => [r.id, r.prompt.length]),
  );
  const blocks = new Map<number, number[]>();
  const regions = new Map<number, { start: number; len: number }>();
  const computed = new Map<number, number>();
  const slots = new Map<number, number>();
  let preemptions = 0;
  const frames: Frame[] = [];

  const takeSlot = (req: number) => {
    const used = new Set(slots.values());
    let slot = 1;
    while (used.has(slot) && slot <= MAX_SLOTS) slot++;
    slots.set(req, slot);
  };

  for (const e of events) {
    switch (e.type) {
      case "Admit":
        takeSlot(e.req);
        break;
      case "Allocate":
        if ("blocks" in e)
          blocks.set(e.req, [...(blocks.get(e.req) ?? []), ...e.blocks]);
        else regions.set(e.req, { ...e.region });
        break;
      case "CacheHit":
        blocks.set(e.req, [...(blocks.get(e.req) ?? []), ...e.blocks]);
        computed.set(e.req, e.tokens);
        break;
      case "PrefillChunk":
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
      case "Free":
        if ("blocks" in e) {
          const left = (blocks.get(e.req) ?? []).filter(
            (b) => !e.blocks.includes(b),
          );
          if (left.length > 0) blocks.set(e.req, left);
          else blocks.delete(e.req);
        } else regions.delete(e.req);
        break;
      case "StepEnd": {
        const reqs = new Set([...blocks.keys(), ...regions.keys()]);
        frames.push({
          step: e.step,
          t: e.t,
          duration: e.duration,
          running: e.running,
          waiting: e.waiting,
          kv: e.kv,
          preemptions,
          holders: [...reqs]
            .map((req) => ({
              req,
              slot: slots.get(req) ?? 0,
              computed: computed.get(req) ?? 0,
              blocks: blocks.get(req) ?? [],
              region: regions.get(req) ?? null,
            }))
            .sort((a, b) => a.slot - b.slot),
        });
        break;
      }
      default:
        break;
    }
  }
  return frames;
}

/** The latest frame at or before t, or null before the first step ends. */
export function frameAt(frames: readonly Frame[], t: number): Frame | null {
  let lo = 0;
  let hi = frames.length - 1;
  let found: Frame | null = null;
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

/**
 * Wasted share of the pool. Contiguous: reserved slots holding no KV, plus
 * free space too small for a region. Paged: empty slots in used blocks.
 */
export function wasteShare(f: Frame): number {
  const { capacity, allocated, tokens, unusable } = f.kv;
  return (allocated - tokens + unusable) / capacity;
}

/** Table length (blocks) per request holding memory; null if none does. */
export function meanTableLength(f: Frame): number | null {
  const held = f.holders.filter((h) => h.blocks.length > 0);
  if (held.length === 0) return null;
  return held.reduce((s, h) => s + h.blocks.length, 0) / held.length;
}

/** Duration-weighted mean of `value` over the steps that end by `until`. */
export function meanOver(
  frames: readonly Frame[],
  value: (f: Frame) => number | null,
  until = Infinity,
): number {
  let weight = 0;
  let sum = 0;
  for (const f of frames) {
    if (f.t > until) break;
    const v = value(f);
    if (v === null) continue;
    weight += f.duration;
    sum += v * f.duration;
  }
  return weight > 0 ? sum / weight : 0;
}

export function peakRunning(
  frames: readonly Frame[],
  until = Infinity,
): number {
  return Math.max(
    0,
    ...frames.filter((f) => f.t <= until).map((f) => f.running),
  );
}

/** Runs a config to the end and returns its frames. */
export function simulate(config: SimConfig): Frame[] {
  const sim = createSim(config);
  sim.run();
  return buildFrames(sim.events(), config);
}
