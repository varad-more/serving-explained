/**
 * The exact runs chapter 3 shows. The chapter and its tests
 * (tests/chapters/continuous-batching.test.ts) both import them.
 */
import gpus from "../../data/gpus.json" with { type: "json" };
import models from "../../data/models.json" with { type: "json" };
import {
  generateWorkload,
  PRESETS,
  type LengthDist,
  type SimConfig,
} from "../../sim/index.ts";
import {
  blocksFromGpu,
  COST_CONSTANTS,
  ENGINE_DEFAULTS,
  gpuCost,
  modelCost,
  presetConfig,
} from "../../simConfig.ts";

const DATA = { models: models.models, gpus: gpus.gpus };

export type PresetKey = "batching-basics" | "long-prompt-stall";
export type Policy = SimConfig["scheduler"]["policy"];

/** What the timeline's controls set. */
export interface RunOptions {
  policy: Policy;
  /** Poisson arrivals per second. */
  rate: number;
  /** Lognormal σ of output length; the median stays the preset's. */
  sigma: number;
  maxNumSeqs: number;
  /** max_num_batched_tokens while chunked prefill is on. */
  budget: number;
  chunked: boolean;
}

/** A preset's own settings, as SIM.md §7 tunes it, under continuous batching. */
function defaults(preset: PresetKey): RunOptions {
  const { workload } = PRESETS[preset];
  const { scheduler } = presetConfig(preset, DATA);
  return {
    policy: "continuous",
    rate: workload.arrival.kind === "poisson" ? workload.arrival.ratePerS : 0,
    sigma:
      workload.outputLen.kind === "lognormal" ? workload.outputLen.sigma : 0,
    maxNumSeqs: scheduler.maxNumSeqs,
    budget: scheduler.maxNumBatchedTokens,
    chunked: scheduler.chunkedPrefill,
  };
}

/** Steps 2–3 and CheckYourself: `batching-basics`. */
export const BASICS = defaults("batching-basics");
export const BASICS_STATIC: RunOptions = { ...BASICS, policy: "static" };
/** Steps 4–6: `long-prompt-stall`, chunked prefill on with budget 2048. */
export const STALL = defaults("long-prompt-stall");
/** Chunked prefill off: the budget is raised to max_model_len (decision 5). */
export const STALL_OFF: RunOptions = { ...STALL, chunked: false };

/** `bigger-batches-cost-latency`: max_num_batched_tokens from 512 up. */
export const BUDGETS = [512, 1024, 2048, 4096, 8192] as const;
/** Step 6's sweep, down to budgets small enough to be memory-bound. */
export const SWEEP_BUDGETS = [64, 128, 256, ...BUDGETS] as const;
/** CheckYourself: output-length spread (lognormal σ). */
export const SIGMAS = [0, 0.25, 0.5, 0.75, 1, 1.25, 1.5] as const;
/** A prompt this long or longer is one of `long-prompt-stall`'s long ones. */
export const LONG_PROMPT = (() => {
  const { promptLen } = PRESETS["long-prompt-stall"].workload;
  const long = promptLen.kind === "mixture" ? promptLen.parts.at(-1) : null;
  return long?.dist.kind === "uniform" ? long.dist.min : Infinity;
})();

/** `static-has-bubbles` measures the first 20 s. */
export const BUBBLE_WINDOW_S = 20;

/** The preemption step (AUDIT.md m15): `batching-basics` on a smaller pool. */
export const PREEMPT_POOL = { blocks: 80, blockSize: 16 } as const;
/** Decision 10: long prompts at 2% of requests instead of 15%. */
export const RARE_LONG_SHARE = 0.02;

interface Variant {
  /** KV blocks, in place of the preset's pool. */
  numBlocks?: number;
  /** The long prompts' share of the mixture (`long-prompt-stall` only). */
  longShare?: number;
}

/** The budget a run uses: with chunking off, raised to max_model_len. */
export function budgetOf(preset: PresetKey, o: RunOptions): number {
  const { maxModelLen } = presetConfig(preset, DATA).scheduler;
  return o.chunked ? o.budget : Math.max(o.budget, maxModelLen);
}

/** A preset under the timeline's settings. */
export function runConfig(
  preset: PresetKey,
  o: RunOptions,
  variant: Variant = {},
): SimConfig {
  const base = presetConfig(preset, DATA, {
    policy: o.policy,
    chunkedPrefill: o.chunked,
    maxNumSeqs: o.maxNumSeqs,
    maxNumBatchedTokens: budgetOf(preset, o),
    numBlocks: variant.numBlocks,
  });
  const { workload } = PRESETS[preset];
  const { outputLen, promptLen } = workload;
  const share = variant.longShare;
  return {
    ...base,
    requests: generateWorkload(
      {
        ...workload,
        arrival: { kind: "poisson", ratePerS: o.rate },
        outputLen:
          outputLen.kind === "lognormal"
            ? { ...outputLen, sigma: o.sigma }
            : outputLen,
        promptLen:
          share !== undefined && promptLen.kind === "mixture"
            ? withLongShare(promptLen, share)
            : promptLen,
      },
      base.seed,
    ),
  };
}

function withLongShare(
  mixture: Extract<LengthDist, { kind: "mixture" }>,
  share: number,
): LengthDist {
  const [short, long] = mixture.parts;
  if (!short || !long) return mixture;
  return {
    kind: "mixture",
    parts: [
      { weight: 1 - share, dist: short.dist },
      { weight: share, dist: long.dist },
    ],
  };
}

/** Step 1: one request on the picked model and GPU. */
export const PHASE_REQUEST = { prompt: 1024, output: 4 } as const;
export const PHASE_DEFAULT = {
  model: "llama-3.1-8b",
  gpu: "a10g-24",
} as const;

export type PhaseRun =
  | { fits: true; config: SimConfig }
  /** The weights leave too little memory for this request's KV. */
  | { fits: false; weightBytes: number; budgetBytes: number };

/**
 * Step 1's run: one request of PHASE_REQUEST on a model × GPU pair, with the
 * KV pool llmsize leaves after the weights (SIM.md §12.1). `prompt` changes
 * the prompt length, to find where prefill turns compute-bound.
 */
export function phaseRun(
  modelSlug: string,
  gpuId: string,
  prompt: number = PHASE_REQUEST.prompt,
): PhaseRun {
  const m = models.models.find((x) => x.slug === modelSlug);
  const g = gpus.gpus.find((x) => x.id === gpuId);
  if (!m || !g) throw new RangeError(`unknown pair ${modelSlug}, ${gpuId}`);
  const model = modelCost(m);
  const blockSize = 16;
  const numBlocks = blocksFromGpu(g, model, blockSize);
  const len = prompt + PHASE_REQUEST.output;
  if (numBlocks * blockSize < len)
    return {
      fits: false,
      weightBytes: model.weightBytes,
      budgetBytes: g.usableVramBytes * ENGINE_DEFAULTS.gpuMemoryFraction,
    };
  return {
    fits: true,
    config: {
      seed: 1,
      requests: [
        {
          id: 0,
          arrival: 0,
          prompt: Array.from({ length: prompt }, (_, i) => i + 1),
          outputLen: PHASE_REQUEST.output,
        },
      ],
      model,
      gpu: gpuCost(g),
      cost: COST_CONSTANTS,
      kv: { allocator: "paged", numBlocks, blockSize, prefixCaching: false },
      scheduler: {
        policy: "continuous",
        maxNumSeqs: 1,
        maxNumBatchedTokens: 2048,
        chunkedPrefill: true,
        maxModelLen: len,
      },
    },
  };
}

export const MODEL_SLUGS = models.models.map((m) => m.slug);
export const GPU_IDS = gpus.gpus.map((g) => g.id);
