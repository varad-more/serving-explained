/**
 * The chapter's figures by key, and every number its prose quotes. The prose
 * renders these through <Num>, so it cannot drift from data or the sim.
 */
import {
  budget,
  freeBytes,
  GIB,
  KIB,
  kvBytesPerRequest,
  kvBytesPerToken,
  maxConcurrency,
} from "./budget.ts";
import { CONTRAST, gpu, model, MODELS } from "./data.ts";
import { GqaContrast } from "./GqaContrast.tsx";
import { KvFormula, modelName } from "./KvFormula.tsx";
import { MemoryBudget } from "./MemoryBudget.tsx";
import {
  BIG_GPU,
  CHECK_YOURSELF as Q,
  MEMORY_BUDGET_DEFAULTS as D,
  GQA_CONTRAST,
} from "./presets.ts";
import { FRAMES, LAYERS, OUTPUT_LEN, PROMPT_LEN } from "./gridFrames.ts";
import { TokenGrid } from "./TokenGrid.tsx";
import "./kv-cache.css";

export const figures = {
  "no-cache": () => <TokenGrid mode="no-cache" />,
  cache: () => <TokenGrid mode="cache" />,
  formula: () => <KvFormula />,
  gqa: () => <GqaContrast />,
  budget: () => <MemoryBudget />,
};

const first = FRAMES[0];
const last = FRAMES[FRAMES.length - 1];
if (!first || !last) throw new Error("TokenGrid run has no steps");

const llama = model(D.model);
const a10g = gpu(D.gpu);
const h100 = gpu(BIG_GPU.gpu);
const mha = model(CONTRAST.mha);
const gqa = model(CONTRAST.gqa);
const big = maxConcurrency(h100, llama, "bf16", BIG_GPU.context);
const qwen = model(Q.model);
const qwenGpu = gpu(Q.gpu);

const fitsAt = (context: number) => ({
  context,
  fits: maxConcurrency(a10g, llama, "bf16", context),
});

/** "A10G" from "NVIDIA A10G 24GB". */
const gpuName = (name: string) =>
  name.replace(/^NVIDIA /, "").replace(/ \d+GB$/, "");

/** Names and numbers the prose quotes, all `simulated` (grid) or `computed` (data). */
export const F = {
  grid: {
    prompt: PROMPT_LEN,
    outputs: OUTPUT_LEN,
    layers: LAYERS,
    tokens: PROMPT_LEN + OUTPUT_LEN,
    noCacheFirst: first.noCache,
    noCacheLast: last.noCache,
    noCacheTotal: last.totalNoCache,
    cacheFirst: first.end - first.start,
    cacheTotal: last.totalCache,
  },
  models: MODELS.length,
  gpu: gpuName(a10g.name),
  bigGpu: gpuName(h100.name),
  llama: {
    name: modelName(llama.id),
    layers: llama.layers,
    kvHeads: llama.kvHeads,
    headDim: llama.headDim,
    bytesPerToken: kvBytesPerToken(llama, "bf16"),
    kibPerToken: kvBytesPerToken(llama, "bf16") / KIB,
    weightsGib: llama.weightBytesBf16 / GIB,
    usableGib: a10g.usableVramBytes / GIB,
    weightsPercent: (100 * llama.weightBytesBf16) / a10g.usableVramBytes,
  },
  /** Step 6: max concurrency at three context lengths, each double or more. */
  takeaway: { short: fitsAt(4096), mid: fitsAt(8192), long: fitsAt(32768) },
  gqa: {
    mhaName: modelName(mha.id),
    gqaName: modelName(gqa.id),
    mhaHeads: mha.attentionHeads,
    mhaKvHeads: mha.kvHeads,
    gqaHeads: gqa.attentionHeads,
    gqaKvHeads: gqa.kvHeads,
    kvHeadRatio: mha.kvHeads / gqa.kvHeads,
    mhaLayers: mha.layers,
    gqaLayers: gqa.layers,
    mhaHeadDim: mha.headDim,
    gqaHeadDim: gqa.headDim,
    mhaKib: mha.kvBytesPerTokenBf16 / KIB,
    gqaKib: gqa.kvBytesPerTokenBf16 / KIB,
    kvRatio: mha.kvBytesPerTokenBf16 / gqa.kvBytesPerTokenBf16,
    weightRatio: mha.weightBytesBf16 / gqa.weightBytesBf16,
    context: GQA_CONTRAST.context,
    mhaFit: maxConcurrency(
      gpu(GQA_CONTRAST.gpu),
      mha,
      "bf16",
      GQA_CONTRAST.context,
    ),
    gqaFit: maxConcurrency(
      gpu(GQA_CONTRAST.gpu),
      gqa,
      "bf16",
      GQA_CONTRAST.context,
    ),
  },
  budget: {
    context: D.context,
    concurrency: D.concurrency,
    overflow: D.overflow,
    bigRequests: big,
    bigKvGib: budget(h100, llama, "bf16", BIG_GPU.context, big).kv / GIB,
    bigRatio:
      budget(h100, llama, "bf16", BIG_GPU.context, big).kv /
      llama.weightBytesBf16,
  },
  check: {
    name: modelName(qwen.id),
    weightsGib: qwen.weightBytesBf16 / GIB,
    usableGib: qwenGpu.usableVramBytes / GIB,
    kibPerToken: kvBytesPerToken(qwen, "bf16") / KIB,
    context: Q.context,
    freeGib: freeBytes(qwenGpu, qwen) / GIB,
    perRequestGib: kvBytesPerRequest(qwen, "bf16", Q.context) / GIB,
    perRequestFp8Gib: kvBytesPerRequest(qwen, "fp8", Q.context) / GIB,
    bf16: maxConcurrency(qwenGpu, qwen, "bf16", Q.context),
    fp8: maxConcurrency(qwenGpu, qwen, "fp8", Q.context),
  },
};
