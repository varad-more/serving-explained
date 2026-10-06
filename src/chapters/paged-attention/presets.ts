/**
 * The exact runs chapter 2 shows. The chapter and its tests
 * (tests/chapters/paged-attention.test.ts) both import them.
 */
import gpus from "../../data/gpus.json" with { type: "json" };
import models from "../../data/models.json" with { type: "json" };
import { generateWorkload, PRESETS, type SimConfig } from "../../sim/index.ts";
import { COST_CONSTANTS, presetConfig } from "../../simConfig.ts";
import { simulate, type Frame } from "./frames.ts";

const DATA = { models: models.models, gpus: gpus.gpus };
const PRESET = PRESETS["paged-vs-contiguous"];

export type Allocator = SimConfig["kv"]["allocator"];

/** What the compare widget's controls set. */
export interface CompareOptions {
  blockSize: number;
  /** Poisson arrivals per second. */
  rate: number;
  /** Lognormal σ of output length; the median stays 100. */
  sigma: number;
  maxModelLen: number;
}

/** The widget's opening state: the preset as SIM.md §7 tunes it. */
export const DEFAULTS: CompareOptions = {
  blockSize: 16,
  rate: 1.5,
  sigma: 0.6,
  maxModelLen: 512,
};

export const BLOCK_SIZES = [8, 16, 32, 64, 128] as const;
export const MAX_MODEL_LENS = [384, 512, 640, 768, 1024] as const;
/** The CheckYourself setting. */
export const RAISED_MAX_MODEL_LEN = 1024;
/** "Within 20 s": the window the chapter's waste numbers average over. */
export const WINDOW_S = 20;
/** KV pool in token slots, at every block size (1,280 / B blocks). */
export const CAPACITY =
  (PRESET.kv?.numBlocks ?? 0) * (PRESET.kv?.blockSize ?? 0);

/** `paged-vs-contiguous` with one allocator and the widget's settings. */
export function compareConfig(
  allocator: Allocator,
  options: CompareOptions = DEFAULTS,
): SimConfig {
  const base = presetConfig("paged-vs-contiguous", DATA, {
    allocator,
    blockSize: options.blockSize,
  });
  const { outputLen } = PRESET.workload;
  return {
    ...base,
    requests: generateWorkload(
      {
        ...PRESET.workload,
        arrival: { kind: "poisson", ratePerS: options.rate },
        outputLen:
          outputLen.kind === "lognormal"
            ? { ...outputLen, sigma: options.sigma }
            : outputLen,
      },
      base.seed,
    ),
    scheduler: { ...base.scheduler, maxModelLen: options.maxModelLen },
  };
}

const runs = new Map<string, Frame[]>();
/**
 * The frames of one allocator at the widget's settings, memoized: the prose,
 * the figures, and the charts read the same runs.
 */
export function compareFrames(
  allocator: Allocator,
  options: CompareOptions = DEFAULTS,
): Frame[] {
  const key = JSON.stringify([allocator, options]);
  let frames = runs.get(key);
  if (!frames) {
    frames = simulate(compareConfig(allocator, options));
    // ponytail: unbounded cache, fine for a few dozen slider positions.
    runs.set(key, frames);
  }
  return frames;
}

/** Step 4's figure: a request whose blocks are scattered, paused there. */
export const TABLE_FIGURE = { step: 150, req: 12 };

const base0 = compareConfig("paged");

/**
 * Step 7's teaser: block size 4, two requests sharing an 8-token prefix, with
 * prefix caching on. Both tables point at the prefix's two blocks.
 */
export const SHARED_BLOCKS: SimConfig = {
  seed: 1,
  requests: [
    {
      id: 0,
      arrival: 0,
      prompt: [11, 12, 13, 14, 15, 16, 17, 18, 21, 22, 23],
      outputLen: 4,
    },
    {
      id: 1,
      arrival: 0,
      prompt: [11, 12, 13, 14, 15, 16, 17, 18, 31, 32],
      outputLen: 4,
    },
  ],
  model: base0.model,
  gpu: base0.gpu,
  cost: COST_CONSTANTS,
  kv: { allocator: "paged", numBlocks: 12, blockSize: 4, prefixCaching: true },
  scheduler: {
    policy: "continuous",
    maxNumSeqs: 2,
    maxNumBatchedTokens: 2048,
    chunkedPrefill: true,
    maxModelLen: 32,
  },
};
