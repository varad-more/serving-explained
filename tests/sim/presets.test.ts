/**
 * The chapter presets' tuning targets (docs/SIM.md §7). Each target is
 * asserted exactly as written; a preset's tentative parameters are tuned
 * until it holds, and never the target. Where the wording leaves room, the
 * stricter reading is used and noted.
 */
import { describe, expect, it } from "vitest";
import { createSim } from "../../src/sim/engine.ts";
import { metrics } from "../../src/sim/metrics.ts";
import type { SimConfig, SimEvent } from "../../src/sim/types.ts";
import { presetConfig, type ConfigOverrides } from "../../src/simConfig.ts";
import { loadData } from "./helpers.ts";

const data = loadData();

function runPreset(
  name: Parameters<typeof presetConfig>[0],
  over: ConfigOverrides = {},
) {
  const config = presetConfig(name, data, over);
  const sim = createSim(config);
  sim.run();
  const events = sim.events();
  return { config, events, m: metrics(events, config) };
}

type End = Extract<SimEvent, { type: "StepEnd" }>;
const ends = (events: readonly SimEvent[]) =>
  events.filter((e): e is End => e.type === "StepEnd");
/** The last StepEnd at or before t. */
const at = (events: readonly SimEvent[], t: number) =>
  ends(events)
    .filter((e) => e.t <= t)
    .at(-1);
const peakRunning = (events: readonly SimEvent[], until: number) =>
  Math.max(
    ...ends(events)
      .filter((e) => e.t <= until)
      .map((e) => e.running),
  );
/** Time-averaged queue length over the run. */
function meanWaiting(events: readonly SimEvent[]): number {
  const es = ends(events);
  const total = es.reduce((s, e) => s + e.duration, 0);
  return es.reduce((s, e) => s + e.waiting * e.duration, 0) / total;
}

describe("paged-vs-contiguous", () => {
  const contiguous = runPreset("paged-vs-contiguous", {
    allocator: "contiguous-max",
  });
  const paged = runPreset("paged-vs-contiguous");

  it("within 20 s, contiguous peaks at 2 running with a growing queue", () => {
    expect(peakRunning(contiguous.events, 20)).toBe(2);
    const q10 = at(contiguous.events, 10)!.waiting;
    const q20 = at(contiguous.events, 20)!.waiting;
    expect(q20).toBeGreaterThan(q10);
    expect(q10).toBeGreaterThan(0);
  });

  it("within 20 s, paged reaches at least 6 running", () => {
    expect(peakRunning(paged.events, 20)).toBeGreaterThanOrEqual(6);
  });

  it("paged preempts at most twice (over the whole run, the stricter reading)", () => {
    expect(paged.m.summary.preemptions).toBeLessThanOrEqual(2);
  });
});

describe("batching-basics", () => {
  const continuous = runPreset("batching-basics");
  const stat = runPreset("batching-basics", { policy: "static" });

  it("continuous has lower mean and p99 TTFT and higher throughput than static", () => {
    expect(continuous.m.summary.ttft.mean).toBeLessThan(
      stat.m.summary.ttft.mean,
    );
    expect(continuous.m.summary.ttft.p99).toBeLessThan(stat.m.summary.ttft.p99);
    expect(continuous.m.summary.outputTokensPerS).toBeGreaterThan(
      stat.m.summary.outputTokensPerS,
    );
  });

  it("static shows idle slots within 20 s: a finished request holds its slot", () => {
    const lastToken = new Map<number, number>();
    const finish = new Map<number, number>();
    for (const e of stat.events) {
      if (e.type === "DecodeToken") lastToken.set(e.req, e.t);
      if (e.type === "Finish") finish.set(e.req, e.t);
    }
    const idle = [...lastToken].filter(
      ([req, t]) => t <= 20 && (finish.get(req) ?? 0) > t,
    );
    expect(idle.length).toBeGreaterThan(0);
  });
});

describe("long-prompt-stall", () => {
  /** Inter-token gaps that end in a step where a long prompt did prefill work. */
  function stallShare(config: SimConfig, events: readonly SimEvent[]) {
    const long = new Set(
      config.requests.filter((r) => r.prompt.length >= 6000).map((r) => r.id),
    );
    const stalledSteps = new Set(
      events
        .filter((e) => e.type === "PrefillChunk" && long.has(e.req))
        .map((e) => e.step),
    );
    let gaps = 0;
    let stalls = 0;
    for (const e of events) {
      if (e.type !== "DecodeToken" || e.index === 0) continue;
      gaps++;
      if (stalledSteps.has(e.step)) stalls++;
    }
    return { stalls, gaps, share: stalls / gaps, long: long.size };
  }

  it("long prompts' stalls are more than 1% of all inter-token gaps, with and without chunking", () => {
    const on = runPreset("long-prompt-stall");
    const off = runPreset("long-prompt-stall", {
      chunkedPrefill: false,
      maxNumBatchedTokens: 8192,
    });
    const sOn = stallShare(on.config, on.events);
    const sOff = stallShare(off.config, off.events);
    console.log(
      `long-prompt-stall: ${String(sOn.long)} long prompts; stalls ${String(sOn.stalls)}/${String(sOn.gaps)} gaps with chunking, ${String(sOff.stalls)}/${String(sOff.gaps)} without`,
    );
    expect(sOn.share).toBeGreaterThan(0.01);
    expect(sOff.share).toBeGreaterThan(0.01);
  });
});

describe("shared-system-prompt", () => {
  it("with caching off, fewer fit, so the off run also queues more", () => {
    const on = runPreset("shared-system-prompt");
    const off = runPreset("shared-system-prompt", { prefixCaching: false });
    expect(on.m.summary.prefixHitRate).toBeGreaterThan(0);
    expect(meanWaiting(off.events)).toBeGreaterThan(meanWaiting(on.events));
  });
});

describe("cache-pressure", () => {
  it("evicts, and its hit rate is below shared-system-prompt's", () => {
    const pressure = runPreset("cache-pressure");
    const shared = runPreset("shared-system-prompt");
    expect(pressure.m.summary.evictions).toBeGreaterThan(0);
    expect(pressure.m.summary.prefixHitRate!).toBeLessThan(
      shared.m.summary.prefixHitRate!,
    );
  });
});
