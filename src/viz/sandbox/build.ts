/**
 * A sandbox config as an engine config (docs/SIM.md §12.1), or a plain
 * reason it cannot run even one request, stated with `computed` numbers.
 */
import gpus from "../../data/gpus.json" with { type: "json" };
import models from "../../data/models.json" with { type: "json" };
import { generateWorkload, type SimConfig } from "../../sim/index.ts";
import {
  blocksFromGpu,
  COST_CONSTANTS,
  gpuCost,
  modelCost,
} from "../../simConfig.ts";
import type { SandboxConfig } from "./params.ts";

/** llmsize's math, the source of every `computed` number here. */
export const LLMSIZE_URL =
  "https://github.com/varad-more/llm-calculator/blob/2cef2affe9ecc69f9acec3e8765ce454a9339c04/docs/MATH.md";

export type Built =
  | {
      ok: true;
      config: SimConfig;
      numBlocks: number;
      /** KV pool in tokens. */
      capacity: number;
      /** Weights, the GPU's budget, and the KV pool, in bytes (`computed`). */
      bytes: { weights: number; budget: number; usable: number; kv: number };
    }
  | {
      ok: false;
      code: "weights-exceed-budget" | "kv-smaller-than-max-model-len";
      message: string;
    };

const GIB = 2 ** 30;
const gib = (b: number) => `${(b / GIB).toFixed(1)} GiB`;
const n = (x: number) => x.toLocaleString("en-US");

/** "Llama-3.1-70B" from "meta-llama/Llama-3.1-70B-Instruct". */
export const modelName = (id: string) =>
  id
    .slice(id.indexOf("/") + 1)
    .replace("-Instruct", "")
    .replace("-instruct", "");

export function buildConfig(c: SandboxConfig): Built {
  const m = models.models.find((x) => x.slug === c.m) ?? models.models[0];
  const g = gpus.gpus.find((x) => x.id === c.g) ?? gpus.gpus[0];
  if (!m || !g) throw new Error("src/data has no models or GPUs");
  const model = modelCost(m, c.kd);
  const budget = g.usableVramBytes * c.gf;
  if (model.weightBytes >= budget) {
    return {
      ok: false,
      code: "weights-exceed-budget",
      message: `${modelName(m.id)}'s weights (${gib(model.weightBytes)}) need more than this GPU's ${gib(budget)} budget (${gib(g.usableVramBytes)} × ${String(c.gf)}).`,
    };
  }
  const numBlocks =
    c.cap === "gpu" ? blocksFromGpu(g, model, c.bs, c.gf) : c.cap;
  const capacity = numBlocks * c.bs;
  if (capacity < c.ml) {
    return {
      ok: false,
      code: "kv-smaller-than-max-model-len",
      message:
        c.cap === "gpu"
          ? `After the weights, the KV pool holds ${n(capacity)} tokens, but one request may need ${n(c.ml)} (max_model_len). ${c.kd === "fp8" ? "Lower max_model_len or pick a bigger GPU." : "Lower max_model_len, switch KV to fp8, or pick a bigger GPU."}`
          : `The KV pool holds ${n(capacity)} tokens, but one request may need ${n(c.ml)} (max_model_len). Lower max_model_len or give the pool more blocks.`,
    };
  }
  const sharedPrefix =
    c.sp.groups > 0 && c.sp.length > 0 && c.sp.fraction > 0 ? c.sp : undefined;
  const config: SimConfig = {
    seed: c.s,
    requests: generateWorkload(
      {
        count: c.n,
        arrival:
          c.r === "burst"
            ? { kind: "burst" }
            : { kind: "poisson", ratePerS: c.r },
        promptLen: c.pl,
        outputLen: c.ol,
        ...(sharedPrefix ? { sharedPrefix } : {}),
        maxModelLen: c.ml,
      },
      c.s,
    ),
    model,
    gpu: gpuCost(g),
    cost: COST_CONSTANTS,
    kv: {
      allocator: c.al,
      numBlocks,
      blockSize: c.bs,
      prefixCaching: c.al === "paged" && c.pc,
    },
    scheduler: {
      policy: c.sc,
      maxNumSeqs: c.ns,
      // vLLM raises an unset budget to max_model_len when chunking is off.
      maxNumBatchedTokens: c.cp ? c.bt : Math.max(c.bt, c.ml),
      chunkedPrefill: c.cp,
      maxModelLen: c.ml,
    },
  };
  return {
    ok: true,
    config,
    numBlocks,
    capacity,
    bytes: {
      weights: model.weightBytes,
      budget,
      usable: g.usableVramBytes,
      kv: capacity * model.kvBytesPerToken,
    },
  };
}
