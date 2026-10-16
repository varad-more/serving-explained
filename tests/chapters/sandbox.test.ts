/**
 * The sandbox's claims: each preset's description (src/viz/sandbox/
 * presets.tsx), tested on the preset's own settings. If a test fails, the
 * description is wrong (CLAUDE.md).
 */
import { describe, expect, it } from "vitest";
import { createSim, metrics, type PresetName } from "../../src/sim/index.ts";
import { buildConfig } from "../../src/viz/sandbox/build.ts";
import {
  PRESET_NAMES,
  presetSandbox,
  type SandboxConfig,
} from "../../src/viz/sandbox/params.ts";
import { claimId, DESCRIPTIONS } from "../../src/viz/sandbox/presets.tsx";

function run(c: SandboxConfig) {
  const built = buildConfig(c);
  if (!built.ok) throw new Error(built.message);
  const sim = createSim(built.config);
  sim.run();
  const events = sim.events();
  const m = metrics(events, built.config);
  const ends = events.filter((e) => e.type === "StepEnd");
  return {
    s: m.summary,
    maxRunning: Math.max(...ends.map((e) => e.running)),
    // Time-weighted: each step counts for as long as it took.
    meanRunning:
      ends.reduce((a, e) => a + e.running * e.duration, 0) /
      ends.reduce((a, e) => a + e.duration, 0),
    firstWaiting: ends[0]?.waiting ?? 0,
    prefill: events.reduce(
      (a, e) => a + (e.type === "PrefillChunk" ? e.tokens : 0),
      0,
    ),
  };
}
const preset = (name: PresetName) => presetSandbox(name);

const CLAIMS: Record<PresetName, () => void> = {
  chatbot: () => {
    const c = preset("chatbot");
    const on = run(c);
    expect([c.m, c.g]).toEqual(["llama-3.1-8b", "a10g-24"]);
    expect(c.sp).toEqual({ groups: 1, length: 128, fraction: 1 });
    expect(on.s.ttft.mean).toBeLessThan(run({ ...c, pc: false }).s.ttft.mean);
    expect(run({ ...c, sc: "static" }).s.ttft.mean).toBeGreaterThan(
      10 * on.s.ttft.mean,
    );
  },
  rag: () => {
    const c = preset("rag");
    expect(c.sp).toEqual({ groups: 8, length: 1024, fraction: 0.6 });
    expect(run(c).s.ttft.mean).toBeLessThan(
      0.5 * run({ ...c, pc: false }).s.ttft.mean,
    );
  },
  "batch-summarize": () => {
    const c = preset("batch-summarize");
    expect(c.r).toBe("burst");
    expect(c.n).toBe(64);
    const r = run(c);
    expect(r.firstWaiting).toBeGreaterThan(c.n / 2);
    expect(r.s.preemptions).toBeGreaterThan(0);
  },
  "agent-loop": () => {
    const c = preset("agent-loop");
    expect(c.sp).toEqual({ groups: 4, length: 2048, fraction: 0.9 });
    const on = run(c);
    expect(on.s.prefixHitRate).toBeGreaterThanOrEqual(0.9);
    expect(on.s.ttft.mean).toBeLessThan(1);
    expect(run({ ...c, pc: false }).s.ttft.mean).toBeGreaterThan(60);
  },
  "paged-vs-contiguous": () => {
    const c = preset("paged-vs-contiguous");
    expect(c.cap === "gpu" ? 0 : c.cap * c.bs).toBe(1280);
    const paged = run(c);
    const contiguous = run({ ...c, al: "contiguous-max" });
    expect(paged.maxRunning).toBeGreaterThan(contiguous.maxRunning);
    expect(paged.meanRunning).toBeGreaterThan(contiguous.meanRunning);
  },
  "batching-basics": () => {
    const c = preset("batching-basics");
    expect(run({ ...c, sc: "static" }).s.ttft.mean).toBeGreaterThan(
      100 * run(c).s.ttft.mean,
    );
  },
  "long-prompt-stall": () => {
    const c = preset("long-prompt-stall");
    expect(run({ ...c, cp: false }).s.itl.p99).toBeGreaterThan(
      3 * run(c).s.itl.p99,
    );
  },
  "shared-system-prompt": () => {
    const c = preset("shared-system-prompt");
    expect(c.sp).toEqual({ groups: 1, length: 600, fraction: 0.9 });
    const on = run(c);
    const off = run({ ...c, pc: false });
    expect(off.s.ttft.mean).toBeGreaterThan(8 * on.s.ttft.mean);
    expect(off.prefill).toBeGreaterThan(5 * on.prefill);
  },
  "cache-pressure": () => {
    const c = preset("cache-pressure");
    expect(c.sp).toEqual({ groups: 12, length: 256, fraction: 0.9 });
    expect(c.cap === "gpu" ? 0 : c.cap * c.bs).toBe(2048);
    const r = run(c);
    expect(r.s.evictions).toBeGreaterThan(0);
    const one = run({ ...c, sp: { ...c.sp, groups: 1 } });
    expect(r.s.prefixHitRate ?? 1).toBeLessThan(
      0.5 * (one.s.prefixHitRate ?? 0),
    );
  },
};

describe("sandbox preset descriptions", () => {
  for (const name of PRESET_NAMES)
    it(claimId(name), () => {
      CLAIMS[name]();
    });

  it("every preset has a description and a test (meta-test)", () => {
    expect(Object.keys(DESCRIPTIONS).sort()).toEqual([...PRESET_NAMES].sort());
    expect(Object.keys(CLAIMS).sort()).toEqual([...PRESET_NAMES].sort());
  });
});
