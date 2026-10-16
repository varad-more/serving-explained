/**
 * Every stop of every control in chapter 4's grid figures builds a run, and
 * no stop clips a prompt: a sharing request always keeps its prefix and at
 * least the shortest body. (The plan's 1,500-token stop crashed Figure 4.5.)
 */
import { describe, expect, it } from "vitest";
import {
  BLOCK_SIZES,
  CAPACITIES,
  cacheConfig,
  PREFIX_STOPS,
  PRESSURE,
  SHARED,
  type CacheOptions,
  type PresetKey,
} from "../../src/chapters/prefix-caching/presets.ts";
import { createSim, PRESETS } from "../../src/sim/index.ts";

const MODES: [PresetKey, CacheOptions][] = [
  ["shared-system-prompt", SHARED],
  ["cache-pressure", PRESSURE],
];

function check(preset: PresetKey, o: CacheOptions) {
  const config = cacheConfig(preset, o);
  const sim = createSim(config);
  sim.run();
  expect(sim.snapshot().done).toBe(true);
  const { promptLen } = PRESETS[preset].workload;
  const shortest = promptLen.kind === "uniform" ? promptLen.min : 1;
  for (const r of config.requests)
    expect(r.prompt.length).toBeGreaterThanOrEqual(
      o.fraction > 0 && r.prompt.length > shortest ? shortest : 1,
    );
}

describe("chapter 4 grid controls", () => {
  for (const [preset, base] of MODES) {
    it(`${preset}: every stop of every control runs`, () => {
      const options: Partial<CacheOptions>[] = [
        ...PREFIX_STOPS[preset].map((prefixLen) => ({ prefixLen })),
        ...Array.from({ length: 16 }, (_, i) => ({ groups: i + 1 })),
        ...Array.from({ length: 11 }, (_, i) => ({ fraction: i / 10 })),
        ...CAPACITIES.map((capacity) => ({ capacity })),
        ...BLOCK_SIZES.map((blockSize) => ({ blockSize })),
      ];
      for (const patch of options)
        for (const caching of [true, false])
          check(preset, { ...base, ...patch, caching });
    });

    it(`${preset}: the longest prefix keeps every body whole`, () => {
      const prefixLen = Math.max(...PREFIX_STOPS[preset]);
      const config = cacheConfig(preset, { ...base, prefixLen, fraction: 1 });
      const { promptLen } = PRESETS[preset].workload;
      const min = promptLen.kind === "uniform" ? promptLen.min : 1;
      for (const r of config.requests)
        expect(r.prompt.length - prefixLen).toBeGreaterThanOrEqual(min);
      // The extremes together: the smallest pool, the biggest blocks.
      check(preset, {
        ...base,
        prefixLen,
        capacity: CAPACITIES[0],
        blockSize: BLOCK_SIZES.at(-1) ?? 128,
      });
    });
  }
});
