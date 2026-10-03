/**
 * The exact configurations chapter 1 shows. The chapter and its tests
 * (tests/chapters/kv-cache.test.ts) both import them.
 */
import type { SimConfig } from "../../sim/index.ts";
import { COST_CONSTANTS, gpuCost, modelCost } from "../../simConfig.ts";
import { gpu, model } from "./data.ts";
import type { KvDtype } from "./budget.ts";

/**
 * Figure A (steps 1–2): one request with a 6-token prompt and 6 outputs,
 * Llama-3.1-8B on an A10G, run through the engine. Steps 0–5.
 */
export const TOKEN_GRID: SimConfig = {
  seed: 1,
  requests: [
    { id: 0, arrival: 0, prompt: [101, 102, 103, 104, 105, 106], outputLen: 6 },
  ],
  model: modelCost(model("llama-3.1-8b")),
  gpu: gpuCost(gpu("a10g-24")),
  cost: COST_CONSTANTS,
  kv: { allocator: "paged", numBlocks: 4, blockSize: 16, prefixCaching: false },
  scheduler: {
    policy: "continuous",
    maxNumSeqs: 1,
    maxNumBatchedTokens: 2048,
    chunkedPrefill: true,
    maxModelLen: 64,
  },
};

/** The memory budget's opening state: it fits. At 8 requests it does not. */
export const MEMORY_BUDGET_DEFAULTS: {
  model: string;
  gpu: string;
  dtype: KvDtype;
  context: number;
  concurrency: number;
  /** The first concurrency stop past the limit: "drag to 8". */
  overflow: number;
} = {
  model: "llama-3.1-8b",
  gpu: "a10g-24",
  dtype: "bf16",
  context: 8192,
  concurrency: 4,
  overflow: 8,
};

/** Step 5: the same model on a bigger GPU, where KV outgrows the weights. */
export const BIG_GPU = { gpu: "h100-sxm-80", context: 8192 } as const;

/** Step 4: GQA vs. MHA at 8K tokens on the default GPU. */
export const GQA_CONTRAST = { gpu: "a10g-24", context: 8192 } as const;

/** The CheckYourself question: Qwen2.5-7B, 16K tokens, A10G. */
export const CHECK_YOURSELF = {
  model: "qwen2.5-7b",
  gpu: "a10g-24",
  context: 16384,
} as const;
