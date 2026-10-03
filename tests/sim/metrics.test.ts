import { describe, expect, it } from "vitest";
import { createSim } from "../../src/sim/engine.ts";
import { dist, metrics } from "../../src/sim/metrics.ts";
import type { KvCounts, SimEvent } from "../../src/sim/types.ts";
import { req, toyConfig } from "./helpers.ts";

const kv = (allocated: number, tokens: number): KvCounts => ({
  capacity: 100,
  allocated,
  cached: 0,
  tokens,
  unusable: 0,
});
const stepEnd = (
  step: number,
  t: number,
  k: KvCounts,
  waiting: number,
  running: number,
): SimEvent => ({
  type: "StepEnd",
  step,
  t,
  duration: 0.5,
  computeS: 0,
  memoryS: 0.5,
  overheadS: 0,
  bound: "memory",
  tokens: 1,
  batch: 1,
  waiting,
  running,
  kv: k,
});

// A handwritten log: r0 arrives at 0, r1 at 1 with a 4-token hit.
const log: SimEvent[] = [
  { type: "Arrive", step: 0, t: 0, req: 0 },
  { type: "Admit", step: 0, t: 0, req: 0, cachedTokens: 0 },
  { type: "DecodeToken", step: 0, t: 0.5, req: 0, index: 0 },
  stepEnd(0, 0.5, kv(16, 9), 0, 1),
  { type: "DecodeToken", step: 1, t: 1, req: 0, index: 1 },
  stepEnd(1, 1, kv(16, 10), 0, 1),
  { type: "Arrive", step: 2, t: 1, req: 1 },
  { type: "Admit", step: 2, t: 1, req: 1, cachedTokens: 4 },
  { type: "Evict", step: 2, t: 1, block: 3, hash: 99 },
  { type: "DecodeToken", step: 2, t: 1.5, req: 1, index: 0 },
  stepEnd(2, 1.5, kv(32, 19), 0, 2),
  { type: "DecodeToken", step: 3, t: 2, req: 0, index: 2 },
  { type: "Finish", step: 3, t: 2, req: 0 },
  { type: "Preempt", step: 4, t: 2, req: 1, blocks: [5], lostTokens: 9 },
  { type: "Admit", step: 4, t: 2, req: 1, cachedTokens: 8 },
  { type: "DecodeToken", step: 4, t: 2.5, req: 1, index: 1 },
  { type: "Finish", step: 4, t: 2.5, req: 1 },
];
const config = toyConfig({
  kv: { prefixCaching: true },
  requests: [req(0, 8, 3), req(1, 8, 2, 1)],
});

describe("metrics on a handwritten log", () => {
  const m = metrics(log, config);

  it("per request: TTFT, ITL, E2E, preemptions, cached tokens", () => {
    expect(m.provenance).toBe("simulated");
    expect(m.requests).toEqual([
      {
        id: 0,
        arrival: 0,
        ttft: 0.5,
        itl: [0.5, 1],
        e2e: 2,
        preemptions: 0,
        cachedTokens: 0,
      },
      {
        id: 1,
        arrival: 1,
        ttft: 0.5,
        itl: [1],
        e2e: 1.5,
        preemptions: 1,
        cachedTokens: 4,
      },
    ]);
  });

  it("summary: throughput over the makespan, nearest-rank distributions", () => {
    expect(m.summary.makespan).toBe(2.5);
    expect(m.summary.outputTokensPerS).toBe(5 / 2.5);
    expect(m.summary.requestsPerS).toBe(2 / 2.5);
    expect(m.summary.ttft).toEqual({ mean: 0.5, p50: 0.5, p90: 0.5, p99: 0.5 });
    expect(m.summary.e2e).toEqual({ mean: 1.75, p50: 1.5, p90: 2, p99: 2 });
    expect(m.summary.itl).toEqual({ mean: 2.5 / 3, p50: 1, p90: 1, p99: 1 });
    expect(m.summary.preemptions).toBe(1);
    expect(m.summary.evictions).toBe(1);
  });

  it("hit rate counts first admissions only: (0 + 4) / (8 + 8)", () => {
    expect(m.summary.prefixHitRate).toBe(0.25);
    expect(
      metrics(log, toyConfig({ requests: config.requests })).summary
        .prefixHitRate,
    ).toBeNull();
  });

  it("series come from StepEnd: utilization and waste", () => {
    expect(m.series.t).toEqual([0.5, 1, 1.5]);
    expect(m.series.kvUtilization).toEqual([0.09, 0.1, 0.19]);
    expect(m.series.waste).toEqual([7, 6, 13]);
    expect(m.series.running).toEqual([1, 1, 2]);
  });
});

describe("dist", () => {
  it("uses nearest rank and is NaN when empty", () => {
    expect(dist([5, 1, 4, 2, 3])).toEqual({ mean: 3, p50: 3, p90: 5, p99: 5 });
    expect(dist(Array.from({ length: 100 }, (_, i) => i + 1))).toMatchObject({
      p50: 50,
      p90: 90,
      p99: 99,
    });
    expect(dist([]).mean).toBeNaN();
  });
});

describe("metrics on G2", () => {
  const requests = [req(0, 4, 2), req(1, 4, 6), req(2, 4, 2)];
  const ttft2 = (policy: "static" | "continuous") => {
    const cfg = toyConfig({ scheduler: { policy, maxNumSeqs: 2 }, requests });
    const sim = createSim(cfg);
    sim.run();
    return metrics(sim.events(), cfg).requests[2]!.ttft;
  };

  it("TTFT(r2) is 7 s static and 3 s continuous", () => {
    expect(ttft2("static")).toBe(7);
    expect(ttft2("continuous")).toBe(3);
  });
});
