/**
 * Generates src/data/{models,gpus,roofline-ref,kv-ref}.json from llmsize
 * (varad-more/llm-calculator). It imports llmsize's TypeScript source
 * directly through Node's type stripping, so llmsize needs no build.
 *
 * Every number it writes is `computed`. Never edit the JSON by hand: rerun
 * `pnpm gen:data`. LLMSIZE_DIR overrides the checkout (default
 * ../llm-calculator), which must be clean so `_provenance` names a real commit.
 */
import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

/* The slice of llmsize's API this script uses (packages/core/src/index.ts). */
type KvDtype = "bf16" | "fp8";
interface Layer {
  kind: string;
  mlp: string;
}
interface ModelSpec {
  id: string;
  numLayers: number;
  layers: Layer[];
  numAttentionHeads: number;
  numKeyValueHeads: number;
  headDim: number;
  maxPositionEmbeddings: number;
  moe?: unknown;
  mla?: unknown;
  ssm?: unknown;
  warnings: { code: string }[];
}
interface GpuSpec {
  id: string;
  name: string;
  vramBytes: number;
  memBandwidthBytesPerSec: number;
  tflopsDense: { bf16?: number };
  reservedVramFraction?: number;
  source_url: string;
  notes?: string;
}
interface Assumption {
  value: number;
  source_url: string;
}
type Parallel = { tp: number; pp: number };
interface Llmsize {
  listModels(): string[];
  resolveModel(id: string): ModelSpec;
  parameterCounts(model: ModelSpec): { embedding: number; total: number };
  weightBytes(
    model: ModelSpec,
    opts: { quant: "bf16" },
  ): { totalBytes: number; method: "measured" | "derived" };
  kvBytesForSequence(
    model: ModelSpec,
    tokens: number,
    parallel: Parallel,
    opts: { kvDtype: KvDtype; blockSize: number },
  ): number;
  getGpu(id: string): GpuSpec;
  defaultAssumptions(): Record<string, Assumption>;
  usableVram(input: {
    gpu: GpuSpec;
    assumptions: Record<string, Assumption>;
  }): number;
  estimateThroughput(input: {
    model: ModelSpec;
    gpu: GpuSpec;
    parallel: Parallel;
    workload: {
      concurrency: number;
      avgSeqLen: number;
      maxModelLen: number;
      chunkTokens: number;
    };
    weightBytesPerDevice: number;
    kvBytesPerTokenPerDevice: number;
    kvDtype: KvDtype;
    assumptions: Record<string, Assumption>;
  }): { decode: { tokensPerSecond: number; stepSeconds: number } };
}

/** The GPUs the site uses (docs/SIM.md, chapter 1). */
export const GPU_IDS = [
  "a10g-24",
  "l4-24",
  "l40s-48",
  "h100-sxm-80",
  "m4-max-128",
] as const;

/** docs/SIM.md §10: the cross-check configs. */
export const ROOFLINE_CONFIGS = [
  { model: "meta-llama/Llama-3.1-8B-Instruct", gpu: "a10g-24", S: 8, l: 1024 },
  { model: "meta-llama/Llama-3.2-3B-Instruct", gpu: "l4-24", S: 16, l: 512 },
  { model: "Qwen/Qwen3-8B", gpu: "h100-sxm-80", S: 32, l: 2048 },
] as const;

/** Chapter 1's context slider stops (tasks/todo.md, MemoryBudget). */
export const CONTEXT_STOPS = [
  256, 384, 512, 768, 1024, 1536, 2048, 3072, 4096, 6144, 8192, 12288, 16384,
  24576, 32768, 49152, 65536, 98304, 131072,
];

const KV_BLOCK_SIZE = 16;
const ONE_DEVICE: Parallel = { tp: 1, pp: 1 };
const REPO = "https://github.com/varad-more/llm-calculator";

/** Dense full-attention text models: no MoE, MLA, SSM, sliding window, or vision tower. */
export function qualifies(m: ModelSpec): boolean {
  return (
    !m.moe &&
    !m.mla &&
    !m.ssm &&
    m.layers.every(
      (l) => ["mha", "gqa", "mqa"].includes(l.kind) && l.mlp === "dense",
    ) &&
    !m.warnings.some((w) => w.code === "vision_tower_excluded")
  );
}

/** "meta-llama/Llama-3.1-8B-Instruct" → "llama-3.1-8b", for short share links. */
export function slugOf(id: string): string {
  const name = id.slice(id.indexOf("/") + 1).toLowerCase();
  return name.replace("-instruct", "");
}

/** The stops a model can use, plus its own max if that is not a stop. */
export function contextsFor(maxContext: number): number[] {
  const stops = CONTEXT_STOPS.filter((c) => c <= maxContext);
  return stops.includes(maxContext) ? stops : [...stops, maxContext];
}

function git(dir: string, ...args: string[]): string {
  return execFileSync("git", ["-C", dir, ...args], { encoding: "utf8" }).trim();
}

async function main(): Promise<void> {
  const dir = resolve(process.env.LLMSIZE_DIR ?? "../llm-calculator");
  const dirty = git(dir, "status", "--porcelain");
  if (dirty) {
    throw new Error(
      `gen-data: ${dir} has uncommitted changes, so _provenance would name the wrong commit:\n${dirty}`,
    );
  }
  const commit = git(dir, "rev-parse", "HEAD");
  const entry = pathToFileURL(resolve(dir, "packages/core/src/index.ts")).href;
  let core: Llmsize;
  try {
    core = (await import(entry)) as Llmsize;
  } catch (error) {
    throw new Error(
      `gen-data: could not import llmsize from ${entry}. Node 24 runs its TypeScript directly; check LLMSIZE_DIR.`,
      { cause: error },
    );
  }

  const provenance = (functions: string[]) => ({
    source: "llmsize",
    repo: REPO,
    commit,
    math: `${REPO}/blob/${commit}/docs/MATH.md`,
    functions,
    generated_at: new Date().toISOString(),
    generator: "scripts/gen-data.ts",
  });
  const assumptions = core.defaultAssumptions();
  const constant = (key: string) => {
    const a = assumptions[key];
    if (!a) throw new Error(`gen-data: llmsize has no assumption ${key}`);
    return { value: a.value, source_url: a.source_url };
  };

  const dense = core
    .listModels()
    .map((id) => core.resolveModel(id))
    .filter(qualifies);
  const models = dense.map((m) => {
    const params = core.parameterCounts(m);
    const weights = core.weightBytes(m, { quant: "bf16" });
    const kv = (kvDtype: KvDtype) =>
      core.kvBytesForSequence(m, 1, ONE_DEVICE, { kvDtype, blockSize: 1 });
    const attention = m.layers[0]?.kind;
    if (attention !== "mha" && attention !== "gqa" && attention !== "mqa") {
      throw new Error(`gen-data: ${m.id} has attention ${String(attention)}`);
    }
    return {
      id: m.id,
      slug: slugOf(m.id),
      attention,
      layers: m.numLayers,
      attentionHeads: m.numAttentionHeads,
      kvHeads: m.numKeyValueHeads,
      headDim: m.headDim,
      params: params.total,
      embeddingParams: params.embedding,
      weightBytesBf16: weights.totalBytes,
      weightMethod: weights.method,
      kvBytesPerTokenBf16: kv("bf16"),
      kvBytesPerTokenFp8: kv("fp8"),
      maxContext: m.maxPositionEmbeddings,
    };
  });

  // Chapter 1's GQA step: the only MHA model, against the GQA model nearest in size.
  const mha = models.filter((m) => m.attention === "mha");
  const [mhaModel] = mha;
  if (mha.length !== 1 || !mhaModel) {
    throw new Error(
      `gen-data: expected exactly one MHA model, found ${String(mha.length)}`,
    );
  }
  const gqaModel = models
    .filter((m) => m.attention === "gqa")
    .sort(
      (a, b) =>
        Math.abs(a.params - mhaModel.params) -
        Math.abs(b.params - mhaModel.params),
    )[0];
  if (!gqaModel) throw new Error("gen-data: no GQA model to contrast");

  const gpus = GPU_IDS.map((id) => {
    const g = core.getGpu(id);
    const bf16 = g.tflopsDense.bf16;
    if (bf16 === undefined)
      throw new Error(`gen-data: ${id} has no bf16 TFLOPS`);
    return {
      id: g.id,
      name: g.name,
      vramBytes: g.vramBytes,
      usableVramBytes: core.usableVram({ gpu: g, assumptions }),
      reservedFraction:
        g.reservedVramFraction ??
        constant("driver_reserved_vram_fraction").value,
      reservedFractionFrom:
        g.reservedVramFraction === undefined ? "assumption" : "gpu",
      memBandwidthBytesPerSec: g.memBandwidthBytesPerSec,
      bf16Tflops: bf16,
      source_url: g.source_url,
      notes: g.notes ?? null,
    };
  });

  const configs = ROOFLINE_CONFIGS.map((c) => {
    const model = core.resolveModel(c.model);
    const gpu = core.getGpu(c.gpu);
    const est = core.estimateThroughput({
      model,
      gpu,
      parallel: ONE_DEVICE,
      workload: {
        concurrency: c.S,
        avgSeqLen: c.l,
        maxModelLen: c.l,
        chunkTokens: 2048,
      },
      weightBytesPerDevice: core.weightBytes(model, { quant: "bf16" })
        .totalBytes,
      kvBytesPerTokenPerDevice: core.kvBytesForSequence(model, 1, ONE_DEVICE, {
        kvDtype: "bf16",
        blockSize: 1,
      }),
      kvDtype: "bf16",
      assumptions,
    });
    return {
      model: c.model,
      gpu: c.gpu,
      concurrency: c.S,
      avgSeqLen: c.l,
      decodeTokensPerSecond: est.decode.tokensPerSecond,
      decodeStepSeconds: est.decode.stepSeconds,
    };
  });

  const kvEntries = dense.flatMap((m) =>
    (["bf16", "fp8"] as const).flatMap((kvDtype) =>
      contextsFor(m.maxPositionEmbeddings).map((tokens) => ({
        model: m.id,
        kvDtype,
        tokens,
        bytes: core.kvBytesForSequence(m, tokens, ONE_DEVICE, {
          kvDtype,
          blockSize: KV_BLOCK_SIZE,
        }),
      })),
    ),
  );

  const files = {
    "models.json": {
      _provenance: provenance([
        "listModels",
        "resolveModel",
        "parameterCounts",
        "weightBytes(bf16)",
        "kvBytesForSequence(tokens 1, block size 1)",
      ]),
      contrast: {
        rule: "the only MHA model, against the GQA model with the closest parameter count",
        mha: mhaModel.id,
        gqa: gqaModel.id,
      },
      models,
    },
    "gpus.json": {
      _provenance: provenance(["getGpu", "usableVram", "defaultAssumptions"]),
      gpus,
    },
    "roofline-ref.json": {
      _provenance: provenance([
        "estimateThroughput (bf16 weights and KV, tp 1, chunk 2048)",
      ]),
      mbu_decode: constant("mbu_decode"),
      mfu_prefill: constant("mfu_prefill"),
      configs,
    },
    "kv-ref.json": {
      _provenance: provenance(["kvBytesForSequence"]),
      blockSize: KV_BLOCK_SIZE,
      entries: kvEntries,
    },
  };
  for (const [name, data] of Object.entries(files)) {
    writeFileSync(`src/data/${name}`, `${JSON.stringify(data, null, 2)}\n`);
  }
  console.log(
    `gen-data: llmsize ${commit.slice(0, 7)}: ${String(models.length)} models, ${String(gpus.length)} GPUs, ${String(configs.length)} roofline configs, ${String(kvEntries.length)} KV entries`,
  );
}

if (import.meta.main) await main();
