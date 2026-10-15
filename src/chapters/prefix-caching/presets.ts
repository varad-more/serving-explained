/**
 * The exact runs chapter 4 shows. The chapter and its tests
 * (tests/chapters/prefix-caching.test.ts) both import them.
 */
import gpus from "../../data/gpus.json" with { type: "json" };
import models from "../../data/models.json" with { type: "json" };
import {
  generateWorkload,
  PRESETS,
  type RequestSpec,
  type SimConfig,
} from "../../sim/index.ts";
import { COST_CONSTANTS, presetConfig } from "../../simConfig.ts";

const DATA = { models: models.models, gpus: gpus.gpus };

export type PresetKey = "shared-system-prompt" | "cache-pressure";

/** What the grid's controls set. */
export interface CacheOptions {
  caching: boolean;
  /** Tokens in each shared prefix. */
  prefixLen: number;
  /** Distinct prefixes. */
  groups: number;
  /** Share of requests that start with a shared prefix. */
  fraction: number;
  /** KV pool in tokens; it stays fixed when the block size changes (decision 6). */
  capacity: number;
  blockSize: number;
}

/** A preset's own settings, as SIM.md §7 tunes it. */
function defaults(preset: PresetKey): CacheOptions {
  const { workload, kv } = PRESETS[preset];
  const sp = workload.sharedPrefix;
  const blockSize = kv?.blockSize ?? 16;
  return {
    caching: kv?.prefixCaching ?? true,
    prefixLen: sp?.length ?? 0,
    groups: sp?.groups ?? 1,
    fraction: sp?.fraction ?? 0,
    capacity: (kv?.numBlocks ?? 0) * blockSize,
    blockSize,
  };
}

/** Steps 1–4: one 600-token system prompt shared by 90% of requests. */
export const SHARED = defaults("shared-system-prompt");
/** Step 5: 12 prefixes competing for a small pool. */
export const PRESSURE = defaults("cache-pressure");
/** The misconception: no shared prefix at all (decision 3). */
export const UNIQUE: CacheOptions = { ...SHARED, fraction: 0 };

/** The prefix-length control's stops. */
export const PREFIX_LENS = [0, 100, 250, 600, 1000, 1500] as const;
/** `longer-prefix-saves-more` sweeps these (the plan's range). */
export const SWEPT_PREFIX_LENS = [0, 100, 250, 600, 1000] as const;
/** `share-fraction-raises-hits` sweeps these. */
export const SWEPT_FRACTIONS = [0.25, 0.5, 0.75, 1] as const;
/** The capacity control's stops, in tokens. */
export const CAPACITIES = [2048, 3072, 4096, 6144, 8192] as const;
export const BLOCK_SIZES = [8, 16, 32, 64, 128] as const;
/** CheckYourself: a 100-token prefix at block size 64. */
export const CHECK = { prefixLen: 100, blockSize: 64 } as const;
/** Step 1's figure shows the first requests of the caching-off run. */
export const REPEATED_FIGURE = { requests: 12 } as const;

/** A preset under the grid's settings, its workload regenerated from the same seed. */
export function cacheConfig(preset: PresetKey, o: CacheOptions): SimConfig {
  const base = presetConfig(preset, DATA, {
    prefixCaching: o.caching,
    blockSize: o.blockSize,
    numBlocks: o.capacity / o.blockSize,
  });
  const { workload } = PRESETS[preset];
  return {
    ...base,
    requests: generateWorkload(
      {
        ...workload,
        sharedPrefix: {
          groups: o.groups,
          length: o.prefixLen,
          fraction: o.fraction,
        },
      },
      base.seed,
    ),
  };
}

/**
 * The requests that start with a shared prefix of `length` tokens, by prefix.
 * A prefix is shared when two or more prompts start with it.
 */
export function sharers(
  requests: readonly RequestSpec[],
  length: number,
): Map<string, RequestSpec[]> {
  const groups = new Map<string, RequestSpec[]>();
  if (length === 0) return groups;
  for (const r of requests) {
    if (r.prompt.length <= length) continue;
    const key = r.prompt.slice(0, length).join(",");
    groups.set(key, [...(groups.get(key) ?? []), r]);
  }
  for (const [key, members] of groups)
    if (members.length < 2) groups.delete(key);
  return groups;
}

const base = presetConfig("shared-system-prompt", DATA);
const tiny = (
  requests: RequestSpec[],
  kv: Partial<SimConfig["kv"]>,
  maxModelLen: number,
): SimConfig => ({
  seed: 1,
  requests,
  model: base.model,
  gpu: base.gpu,
  cost: COST_CONSTANTS,
  kv: {
    allocator: "paged",
    numBlocks: 32,
    blockSize: 16,
    prefixCaching: true,
    ...kv,
  },
  scheduler: {
    policy: "continuous",
    maxNumSeqs: 8,
    maxNumBatchedTokens: 2048,
    chunkedPrefill: true,
    maxModelLen,
  },
});
const tokens = (from: number, n: number) =>
  Array.from({ length: n }, (_, i) => from + i);

/**
 * The full-hit cap: the same 64-token prompt twice, the second after the first
 * finishes. Block size 16, so the prompt fills exactly 4 blocks.
 */
export const FULL_HIT = tiny(
  [
    { id: 0, arrival: 0, prompt: tokens(1, 64), outputLen: 4 },
    { id: 1, arrival: 1, prompt: tokens(1, 64), outputLen: 4 },
  ],
  {},
  128,
);

/**
 * A self-hit after preemption: two unrelated 8-token prompts that each grow to
 * 16 tokens, in 6 blocks of 4. Both cannot finish together, so the later one
 * is preempted; its full blocks keep their keys.
 */
export const SELF_HIT = tiny(
  [
    { id: 0, arrival: 0, prompt: tokens(1, 8), outputLen: 8 },
    { id: 1, arrival: 0, prompt: tokens(101, 8), outputLen: 8 },
  ],
  { numBlocks: 6, blockSize: 4 },
  16,
);

/**
 * Decode cost with and without a hit: B starts with A's 64 tokens and arrives
 * after A finishes. With caching on, those 64 come from a hit.
 */
export function decodePair(caching: boolean): SimConfig {
  return tiny(
    [
      {
        id: 0,
        arrival: 0,
        prompt: [...tokens(1, 64), ...tokens(201, 16)],
        outputLen: 8,
      },
      {
        id: 1,
        arrival: 1,
        prompt: [...tokens(1, 64), ...tokens(301, 16)],
        outputLen: 8,
      },
    ],
    { prefixCaching: caching },
    128,
  );
}
