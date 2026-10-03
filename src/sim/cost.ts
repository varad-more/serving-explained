/**
 * Step cost (docs/SIM.md §5): a roofline. Each scheduled request computes
 * `q` new tokens over `c` tokens already in KV (cache hits included).
 *
 *   T         = Σ q
 *   F_dense   = 2 · P · T
 *   F_attn    = Σ 4 · L · n_h · d_h · (q·c + q(q+1)/2)
 *   t_compute = (F_dense + F_attn) / (TF · 1e12 · MFU)
 *   B_stream  = B_w · (1 − P_emb / P)
 *   B_kv      = b_tok · Σ (c + q)
 *   t_memory  = (B_stream + B_kv) / (BW · MBU)
 *   t_step    = max(t_compute, t_memory) + t_overhead
 */
import type { CostConstants, GpuCost, ModelCost } from "./types.ts";

export interface Work {
  q: number;
  c: number;
}

export interface StepCost {
  duration: number;
  computeS: number;
  memoryS: number;
  overheadS: number;
  bound: "compute" | "memory";
}

export function stepCost(
  work: readonly Work[],
  model: ModelCost,
  gpu: GpuCost,
  cost: CostConstants,
): StepCost {
  const overheadS = cost.overheadS.value;
  // A step that schedules nothing (a static batch emptied by preemption)
  // runs no forward pass, so it costs only the overhead.
  if (work.length === 0) {
    return {
      duration: overheadS,
      computeS: 0,
      memoryS: 0,
      overheadS,
      bound: "memory",
    };
  }
  const width = 4 * model.layers * model.attentionHeads * model.headDim;
  let tokens = 0;
  let attn = 0;
  let context = 0;
  for (const { q, c } of work) {
    tokens += q;
    attn += width * (q * c + (q * (q + 1)) / 2);
    context += c + q;
  }
  const dense = 2 * model.params * tokens;
  const computeS = (dense + attn) / (gpu.bf16Tflops * 1e12 * cost.mfu.value);
  const embedShare =
    model.params > 0 ? model.embeddingParams / model.params : 0;
  const streamed = model.weightBytes * (1 - embedShare);
  const memoryS =
    (streamed + model.kvBytesPerToken * context) /
    (gpu.memBandwidthBytesPerSec * cost.mbu.value);
  return {
    duration: Math.max(computeS, memoryS) + overheadS,
    computeS,
    memoryS,
    overheadS,
    bound: computeS > memoryS ? "compute" : "memory",
  };
}
