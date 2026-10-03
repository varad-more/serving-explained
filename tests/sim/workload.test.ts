import { describe, expect, it } from "vitest";
import { generateWorkload, PRESETS } from "../../src/sim/workload.ts";
import type { WorkloadSpec } from "../../src/sim/types.ts";

const spec: WorkloadSpec = {
  count: 500,
  arrival: { kind: "poisson", ratePerS: 2 },
  promptLen: { kind: "uniform", min: 32, max: 256 },
  outputLen: { kind: "lognormal", median: 100, sigma: 0.6, min: 16, max: 256 },
  sharedPrefix: { groups: 3, length: 40, fraction: 0.7 },
  maxModelLen: 384,
};

describe("generateWorkload", () => {
  it("makes `count` requests with ids in arrival order", () => {
    const reqs = generateWorkload(spec, 1);
    expect(reqs).toHaveLength(500);
    expect(reqs.map((r) => r.id)).toEqual([...Array(500).keys()]);
    for (let i = 1; i < reqs.length; i++) {
      expect(reqs[i]!.arrival).toBeGreaterThanOrEqual(reqs[i - 1]!.arrival);
    }
  });

  it("is deterministic for a seed and differs across seeds", () => {
    expect(generateWorkload(spec, 1)).toEqual(generateWorkload(spec, 1));
    expect(generateWorkload(spec, 2)).not.toEqual(generateWorkload(spec, 1));
  });

  it("keeps lengths in bounds and within maxModelLen", () => {
    for (const r of generateWorkload(spec, 3)) {
      expect(r.outputLen).toBeGreaterThanOrEqual(1);
      expect(r.prompt.length + r.outputLen).toBeLessThanOrEqual(384);
      expect(
        r.prompt.every((t) => Number.isInteger(t) && t >= 0 && t < 32000),
      ).toBe(true);
    }
  });

  it("has a Poisson mean inter-arrival near 1/rate", () => {
    const reqs = generateWorkload({ ...spec, count: 5000 }, 4);
    const mean = reqs.at(-1)!.arrival / reqs.length;
    expect(mean).toBeGreaterThan(0.45);
    expect(mean).toBeLessThan(0.55);
  });

  it("burst puts every arrival at t = 0", () => {
    const reqs = generateWorkload({ ...spec, arrival: { kind: "burst" } }, 5);
    expect(reqs.every((r) => r.arrival === 0)).toBe(true);
  });

  it("group members share their leading L tokens; non-members do not", () => {
    const reqs = generateWorkload(spec, 6);
    const heads = reqs.map((r) => r.prompt.slice(0, 40).join(","));
    const counts = new Map<string, number>();
    for (const h of heads) counts.set(h, (counts.get(h) ?? 0) + 1);
    const shared = [...counts.values()].filter((n) => n > 1);
    expect(shared).toHaveLength(3);
    const members = shared.reduce((s, n) => s + n, 0);
    expect(members / reqs.length).toBeGreaterThan(0.6);
    expect(members / reqs.length).toBeLessThan(0.8);
  });

  it("changing the output distribution leaves arrivals and prompts unchanged", () => {
    // maxModelLen 600 > 40 + 256 + 256, so nothing is clipped.
    const wide = { ...spec, maxModelLen: 600 };
    const a = generateWorkload(wide, 7);
    const b = generateWorkload(
      { ...wide, outputLen: { kind: "fixed", value: 9 } },
      7,
    );
    expect(b.map((r) => r.arrival)).toEqual(a.map((r) => r.arrival));
    expect(b.map((r) => r.prompt)).toEqual(a.map((r) => r.prompt));
  });

  it("clips the body before the output", () => {
    const reqs = generateWorkload(
      {
        count: 50,
        arrival: { kind: "burst" },
        promptLen: { kind: "fixed", value: 300 },
        outputLen: { kind: "fixed", value: 50 },
        maxModelLen: 320,
      },
      8,
    );
    expect(
      reqs.every((r) => r.prompt.length === 270 && r.outputLen === 50),
    ).toBe(true);
  });

  it("rejects specs that cannot be served", () => {
    expect(() =>
      generateWorkload(
        { ...spec, sharedPrefix: { groups: 1, length: 384, fraction: 1 } },
        1,
      ),
    ).toThrow(RangeError);
    expect(() =>
      generateWorkload(
        { ...spec, arrival: { kind: "poisson", ratePerS: 0 } },
        1,
      ),
    ).toThrow(RangeError);
  });
});

describe("PRESETS (docs/SIM.md §7)", () => {
  it("has the nine presets, each with a fixed seed", () => {
    expect(Object.keys(PRESETS).sort()).toEqual([
      "agent-loop",
      "batch-summarize",
      "batching-basics",
      "cache-pressure",
      "chatbot",
      "long-prompt-stall",
      "paged-vs-contiguous",
      "rag",
      "shared-system-prompt",
    ]);
    expect(
      Object.fromEntries(Object.entries(PRESETS).map(([k, p]) => [k, p.seed])),
    ).toMatchObject({
      "paged-vs-contiguous": 7,
      "batching-basics": 11,
      "long-prompt-stall": 13,
      "shared-system-prompt": 17,
      "cache-pressure": 19,
    });
  });

  it("matches the §7 table's counts and shared prefixes", () => {
    const shape = Object.fromEntries(
      Object.entries(PRESETS).map(([k, p]) => [
        k,
        [
          p.workload.count,
          p.workload.sharedPrefix
            ? [
                p.workload.sharedPrefix.groups,
                p.workload.sharedPrefix.length,
                p.workload.sharedPrefix.fraction,
              ]
            : null,
        ],
      ]),
    );
    expect(shape).toEqual({
      chatbot: [200, [1, 128, 1]],
      rag: [100, [8, 1024, 0.6]],
      "batch-summarize": [64, [1, 64, 1]],
      "agent-loop": [150, [4, 2048, 0.9]],
      "paged-vs-contiguous": [40, null],
      "batching-basics": [48, null],
      "shared-system-prompt": [60, [1, 600, 0.9]],
      "cache-pressure": [80, [12, 256, 0.9]],
      "long-prompt-stall": [80, null],
    });
  });

  it("every preset's requests fit its engine max_model_len", () => {
    for (const [name, p] of Object.entries(PRESETS)) {
      const maxModelLen = p.scheduler?.maxModelLen ?? 4096;
      for (const r of generateWorkload(p.workload, p.seed)) {
        expect(r.prompt.length + r.outputLen, name).toBeLessThanOrEqual(
          maxModelLen,
        );
      }
    }
  });

  it("long-prompt-stall draws about 15% long prompts", () => {
    const p = PRESETS["long-prompt-stall"];
    const reqs = generateWorkload(p.workload, p.seed);
    const long = reqs.filter((r) => r.prompt.length >= 6000).length;
    expect(long).toBeGreaterThan(4);
    expect(long).toBeLessThan(24);
  });
});
