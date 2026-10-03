/**
 * Builds engine configs from the generated data. It lives outside src/sim,
 * which never imports src/data (docs/SIM.md §2.1), and takes the data as
 * arguments, so the CLI (Node) and the site (browser) share it.
 */
import type { CostConstants, GpuCost, ModelCost } from "./sim/index.ts";

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
