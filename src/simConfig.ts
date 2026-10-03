/**
 * Builds engine configs from the generated data. It lives outside src/sim,
 * which never imports src/data (docs/SIM.md §2.1), and takes the data as
 * arguments, so the CLI (Node) and the site (browser) share it.
 */
import {
  generateWorkload,
  PRESETS,
  type CostConstants,
  type GpuCost,
  type ModelCost,
  type PresetName,
  type SimConfig,
} from "./sim/index.ts";

/** docs/SIM.md §5. A test checks MFU and MBU against src/data/roofline-ref.json. */
export const COST_CONSTANTS: CostConstants = {
  mfu: { value: 0.45, source: "llmsize-math" },
  mbu: { value: 0.65, source: "llmsize-math" },
  overheadS: { value: 0, source: "teaching default" },
};

/** The fields of a src/data/models.json entry the engine uses. */
export interface ModelEntry {
  id: string;
  slug: string;
  params: number;
  embeddingParams: number;
  weightBytesBf16: number;
  layers: number;
  attentionHeads: number;
  headDim: number;
  kvBytesPerTokenBf16: number;
  kvBytesPerTokenFp8: number;
}

/** The fields of a src/data/gpus.json entry the engine uses. */
export interface GpuEntry {
  id: string;
  usableVramBytes: number;
  memBandwidthBytesPerSec: number;
  bf16Tflops: number;
}

export function modelCost(
  m: ModelEntry,
  kvDtype: "bf16" | "fp8" = "bf16",
): ModelCost {
  return {
    id: m.id,
    params: m.params,
    embeddingParams: m.embeddingParams,
    weightBytes: m.weightBytesBf16,
    layers: m.layers,
    attentionHeads: m.attentionHeads,
    headDim: m.headDim,
    kvBytesPerToken:
      kvDtype === "fp8" ? m.kvBytesPerTokenFp8 : m.kvBytesPerTokenBf16,
  };
}

export function gpuCost(g: GpuEntry): GpuCost {
  return {
    id: g.id,
    bf16Tflops: g.bf16Tflops,
    memBandwidthBytesPerSec: g.memBandwidthBytesPerSec,
  };
}

/** docs/SIM.md §7: what every preset runs on unless it overrides it. */
export const ENGINE_DEFAULTS = {
  model: "meta-llama/Llama-3.1-8B-Instruct",
  gpu: "a10g-24",
  /** vLLM's gpu_memory_utilization (vllm-src). */
  gpuMemoryFraction: 0.92,
  kv: { allocator: "paged", blockSize: 16, prefixCaching: true },
  scheduler: {
    policy: "continuous",
    maxNumSeqs: 256,
    maxNumBatchedTokens: 2048,
    chunkedPrefill: true,
    maxModelLen: 4096,
  },
} as const satisfies {
  kv: Omit<SimConfig["kv"], "numBlocks">;
  scheduler: SimConfig["scheduler"];
} & Record<string, unknown>;

/**
 * docs/SIM.md §12.1: the KV pool from GPU memory,
 * ⌊(usableVram × gf − weightBytes) / (blockSize × kvBytesPerToken)⌋.
 * Like chapter 1, it leaves out activations, CUDA graphs, and runtime
 * overhead, so it overstates vLLM's real pool.
 */
export function blocksFromGpu(
  gpu: GpuEntry,
  model: ModelCost,
  blockSize: number,
  gpuMemoryFraction: number = ENGINE_DEFAULTS.gpuMemoryFraction,
): number {
  return Math.floor(
    (gpu.usableVramBytes * gpuMemoryFraction - model.weightBytes) /
      (blockSize * model.kvBytesPerToken),
  );
}

export interface ConfigOverrides {
  policy?: SimConfig["scheduler"]["policy"];
  allocator?: SimConfig["kv"]["allocator"];
  prefixCaching?: boolean;
  chunkedPrefill?: boolean;
  numBlocks?: number;
  blockSize?: number;
  maxNumSeqs?: number;
  maxNumBatchedTokens?: number;
  /** A models.json id or slug. */
  model?: string;
  gpu?: string;
  seed?: number;
  /** Number of requests, in place of the preset's count. */
  count?: number;
}

export interface SimData {
  models: readonly ModelEntry[];
  gpus: readonly GpuEntry[];
}

/** The config for a preset, with any overrides (the CLI's flags). */
export function presetConfig(
  name: PresetName,
  data: SimData,
  over: ConfigOverrides = {},
): SimConfig {
  const preset = PRESETS[name];
  const seed = over.seed ?? preset.seed;
  const modelId = over.model ?? ENGINE_DEFAULTS.model;
  const m = data.models.find((x) => x.id === modelId || x.slug === modelId);
  const g = data.gpus.find((x) => x.id === (over.gpu ?? ENGINE_DEFAULTS.gpu));
  if (!m) throw new RangeError(`unknown model ${modelId}`);
  if (!g) throw new RangeError(`unknown GPU ${String(over.gpu)}`);
  const model = modelCost(m);
  const kv = { ...ENGINE_DEFAULTS.kv, ...preset.kv };
  const sc = { ...ENGINE_DEFAULTS.scheduler, ...preset.scheduler };

  const blockSize = over.blockSize ?? kv.blockSize;
  let numBlocks: number;
  if (over.numBlocks !== undefined) numBlocks = over.numBlocks;
  else if (preset.kv?.numBlocks !== undefined) {
    // A chapter's toy pool keeps its tokens when the block size changes.
    numBlocks = Math.floor((preset.kv.numBlocks * kv.blockSize) / blockSize);
  } else numBlocks = blocksFromGpu(g, model, blockSize);

  const allocator = over.allocator ?? kv.allocator;
  const chunkedPrefill = over.chunkedPrefill ?? sc.chunkedPrefill;
  return {
    seed,
    requests: generateWorkload(
      { ...preset.workload, count: over.count ?? preset.workload.count },
      seed,
    ),
    model,
    gpu: gpuCost(g),
    cost: COST_CONSTANTS,
    kv: {
      allocator,
      numBlocks,
      blockSize,
      prefixCaching:
        over.prefixCaching ?? (allocator === "paged" && kv.prefixCaching),
    },
    scheduler: {
      policy: over.policy ?? sc.policy,
      maxNumSeqs: over.maxNumSeqs ?? sc.maxNumSeqs,
      // vLLM raises an unset budget to max_model_len when chunking is off.
      maxNumBatchedTokens:
        over.maxNumBatchedTokens ??
        (chunkedPrefill
          ? sc.maxNumBatchedTokens
          : Math.max(sc.maxNumBatchedTokens, sc.maxModelLen)),
      chunkedPrefill,
      maxModelLen: sc.maxModelLen,
    },
  };
}
