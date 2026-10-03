/**
 * The memory budget behind chapter 1, as pure functions. Every number is
 * `computed` from llmsize's data (src/data); tests check the arithmetic against
 * llmsize's own kvBytesForSequence (src/data/kv-ref.json).
 *
 * Free memory is llmsize's usable VRAM minus the weights. vLLM also holds back
 * 8% (gpu_memory_utilization 0.92) and reserves activation and CUDA-graph
 * memory, so max concurrency here is an upper bound (plan decision 4).
 */
import type { GpuEntry, ModelEntry } from "./data.ts";

export type KvDtype = "bf16" | "fp8";

/** Bytes per element: bf16 is 2, fp8 is 1 (llmsize-math, KV dtype). */
export const DTYPE_BYTES: Record<KvDtype, number> = { bf16: 2, fp8: 1 };

/** vLLM's default block size: requests are charged in steps of 16 tokens. */
export const BLOCK_SIZE = 16;

/** The context slider's log stops (tasks/todo.md, MemoryBudget). */
export const CONTEXT_STOPS = [
  256, 384, 512, 768, 1024, 1536, 2048, 3072, 4096, 6144, 8192, 12288, 16384,
  24576, 32768, 49152, 65536, 98304, 131072,
] as const;

/** The concurrency slider's log stops; a linear 1–512 slider is unusable. */
export const CONCURRENCY_STOPS = [
  1, 2, 3, 4, 6, 8, 12, 16, 24, 32, 48, 64, 96, 128, 192, 256, 384, 512,
] as const;

/** The stops a model can use: those up to its max context, plus the max. */
export function contextStops(maxContext: number): number[] {
  const stops: number[] = CONTEXT_STOPS.filter((c) => c <= maxContext);
  return stops.includes(maxContext) ? stops : [...stops, maxContext];
}

/** bytes per token = 2 × L × n_kv × d_h × s: keys and values, every layer. */
export function kvFormula(m: ModelEntry, dtype: KvDtype): number {
  return 2 * m.layers * m.kvHeads * m.headDim * DTYPE_BYTES[dtype];
}

export function kvBytesPerToken(m: ModelEntry, dtype: KvDtype): number {
  return dtype === "fp8" ? m.kvBytesPerTokenFp8 : m.kvBytesPerTokenBf16;
}

/** One request's KV at `context` tokens, in whole blocks of 16. */
export function kvBytesPerRequest(
  m: ModelEntry,
  dtype: KvDtype,
  context: number,
): number {
  return (
    Math.ceil(context / BLOCK_SIZE) * BLOCK_SIZE * kvBytesPerToken(m, dtype)
  );
}

/** Usable VRAM minus the weights; negative when the weights alone do not fit. */
export function freeBytes(g: GpuEntry, m: ModelEntry): number {
  return g.usableVramBytes - m.weightBytesBf16;
}

/** Max concurrency ≈ free memory ÷ KV bytes per request (an upper bound). */
export function maxConcurrency(
  g: GpuEntry,
  m: ModelEntry,
  dtype: KvDtype,
  context: number,
): number {
  const free = freeBytes(g, m);
  return free <= 0
    ? 0
    : Math.floor(free / kvBytesPerRequest(m, dtype, context));
}

export interface Budget {
  usable: number;
  weights: number;
  /** KV for every request. */
  kv: number;
  /** What is left; negative when it does not fit. */
  free: number;
  weightsFit: boolean;
  fits: boolean;
  maxConcurrency: number;
}

export function budget(
  g: GpuEntry,
  m: ModelEntry,
  dtype: KvDtype,
  context: number,
  concurrency: number,
): Budget {
  const weights = m.weightBytesBf16;
  const kv = concurrency * kvBytesPerRequest(m, dtype, context);
  const free = g.usableVramBytes - weights - kv;
  return {
    usable: g.usableVramBytes,
    weights,
    kv,
    free,
    weightsFit: weights < g.usableVramBytes,
    fits: free >= 0,
    maxConcurrency: maxConcurrency(g, m, dtype, context),
  };
}

export const GIB = 2 ** 30;
export const KIB = 2 ** 10;
