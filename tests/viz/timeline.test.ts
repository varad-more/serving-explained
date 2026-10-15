/**
 * Chapter 3's timeline (src/chapters/continuous-batching/timeline.ts) agrees
 * with the engine: slots never collide, every step's work is drawn, and the
 * readouts at the end of a run equal metrics().
 */
import { describe, expect, it } from "vitest";
import {
  BASICS,
  BASICS_STATIC,
  PREEMPT_POOL,
  RARE_LONG_SHARE,
  runConfig,
  STALL,
  STALL_OFF,
} from "../../src/chapters/continuous-batching/presets.ts";
import {
  percentile,
  prefixStats,
  queueAt,
  readoutAt,
  simulateTimeline,
} from "../../src/chapters/continuous-batching/timeline.ts";

const CONFIGS = {
  static: runConfig("batching-basics", BASICS_STATIC),
  continuous: runConfig("batching-basics", BASICS),
  preemption: runConfig("batching-basics", BASICS, {
    numBlocks: PREEMPT_POOL.blocks,
  }),
  "chunking on": runConfig("long-prompt-stall", STALL),
  "chunking off": runConfig("long-prompt-stall", STALL_OFF),
  "rare, on": runConfig("long-prompt-stall", STALL, {
    longShare: RARE_LONG_SHARE,
  }),
};

describe("timeline", () => {
  for (const [name, config] of Object.entries(CONFIGS)) {
    it(`${name}: slots never collide, and every token is drawn`, () => {
      const tl = simulateTimeline(config);
      const cap = config.scheduler.maxNumSeqs;
      const bySlot = new Map<number, typeof tl.segments>();
      for (const s of tl.segments) {
        expect(s.slot).toBeGreaterThanOrEqual(1);
        expect(s.slot).toBeLessThanOrEqual(cap);
        expect(s.t1).toBeGreaterThan(s.t0);
        bySlot.set(s.slot, [...(bySlot.get(s.slot) ?? []), s]);
      }
      for (const segs of bySlot.values()) {
        const sorted = [...segs].sort((a, b) => a.t0 - b.t0);
        sorted.forEach((s, i) => {
          if (i > 0) expect(s.t0).toBeGreaterThanOrEqual(sorted[i - 1]!.t1);
        });
      }
      // Each token falls at the end of a prefill or decode segment's step.
      for (const e of tl.events) {
        if (e.type !== "DecodeToken" && e.type !== "PrefillChunk") continue;
        const covered = tl.segments.some(
          (s) =>
            s.req === e.req &&
            (s.phase === "prefill" || s.phase === "decode") &&
            s.t0 < e.t &&
            e.t <= s.t1 + 1e-12,
        );
        expect(covered).toBe(true);
      }
      // Every admission ends one queue interval, and the queue empties.
      const admits = tl.events.filter((e) => e.type === "Admit").length;
      expect(tl.queued).toHaveLength(admits);
      expect(tl.queue.at(-1)?.n).toBe(0);
      expect(queueAt(tl, tl.duration)).toEqual([]);
    });

    it(`${name}: readouts at the end equal metrics()`, () => {
      const tl = simulateTimeline(config);
      const r = readoutAt(tl, tl.duration);
      const s = tl.m.summary;
      expect(r.throughput).toBeCloseTo(s.outputTokensPerS, 9);
      expect(r.ttftMean).toBeCloseTo(s.ttft.mean, 9);
      expect(r.ttftP99).toBe(s.ttft.p99);
      expect(r.itlP50).toBe(s.itl.p50);
      expect(r.itlP99).toBe(s.itl.p99);
    });
  }

  it("prefix stats match sorting every prefix, ties included", () => {
    // Deterministic values with repeats, in no particular order.
    const values = Array.from({ length: 300 }, (_, i) => (i * 37) % 23);
    const stats = prefixStats(values);
    for (let n = 1; n <= values.length; n++) {
      const sorted = values.slice(0, n).sort((a, b) => a - b);
      expect(stats.p50[n]).toBe(percentile(sorted, 50));
      expect(stats.p99[n]).toBe(percentile(sorted, 99));
      expect(stats.mean[n]).toBeCloseTo(
        sorted.reduce((a, b) => a + b, 0) / n,
        9,
      );
    }
    expect(Number.isNaN(stats.p50[0])).toBe(true);
  });

  it("static batching shows bubbles; continuous shows none", () => {
    const phases = (c: (typeof CONFIGS)["static"]) =>
      new Set(simulateTimeline(c).segments.map((s) => s.phase));
    expect(phases(CONFIGS.static).has("bubble")).toBe(true);
    expect(phases(CONFIGS.continuous).has("bubble")).toBe(false);
  });

  it("chunking off gives stall bands; preemption is drawn", () => {
    const off = simulateTimeline(CONFIGS["chunking off"]);
    expect(off.steps.some((s) => s.stall)).toBe(true);
    const pre = simulateTimeline(CONFIGS.preemption);
    expect(pre.preemptions.length).toBeGreaterThan(0);
    expect(pre.segments.some((s) => s.preempted)).toBe(true);
  });
});
