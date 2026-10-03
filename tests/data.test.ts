import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  CONTEXT_STOPS,
  GPU_IDS,
  ROOFLINE_CONFIGS,
  contextsFor,
  slugOf,
} from "../scripts/gen-data.ts";

const read = (name: string): unknown =>
  JSON.parse(readFileSync(`src/data/${name}`, "utf8"));

const count = z.number().int().nonnegative();
const positive = z.number().positive();
const commit = z.string().regex(/^[0-9a-f]{40}$/);

const provenance = z.strictObject({
  source: z.literal("llmsize"),
  repo: z.literal("https://github.com/varad-more/llm-calculator"),
  commit,
  math: z
    .string()
    .regex(
      /^https:\/\/github\.com\/varad-more\/llm-calculator\/blob\/[0-9a-f]{40}\/docs\/MATH\.md$/,
    ),
  functions: z.array(z.string()).nonempty(),
  generated_at: z.iso.datetime(),
  generator: z.literal("scripts/gen-data.ts"),
});

const model = z.strictObject({
  id: z.string(),
  slug: z.string().regex(/^[a-z0-9.-]+$/),
  attention: z.enum(["mha", "gqa", "mqa"]),
  layers: count,
  attentionHeads: count,
  kvHeads: count,
  headDim: count,
  params: count,
  embeddingParams: count,
  weightBytesBf16: positive,
  weightMethod: z.enum(["measured", "derived"]),
  kvBytesPerTokenBf16: count,
  kvBytesPerTokenFp8: count,
  maxContext: count,
});

const schemas = {
  "models.json": z.strictObject({
    _provenance: provenance,
    contrast: z.strictObject({
      rule: z.string(),
      mha: z.string(),
      gqa: z.string(),
    }),
    models: z.array(model),
  }),
  "gpus.json": z.strictObject({
    _provenance: provenance,
    gpus: z.array(
      z.strictObject({
        id: z.string(),
        name: z.string(),
        vramBytes: count,
        usableVramBytes: positive,
        reservedFraction: z.number().min(0).max(1),
        reservedFractionFrom: z.enum(["gpu", "assumption"]),
        memBandwidthBytesPerSec: positive,
        bf16Tflops: positive,
        source_url: z.url(),
        notes: z.string().nullable(),
      }),
    ),
  }),
  "roofline-ref.json": z.strictObject({
    _provenance: provenance,
    mbu_decode: z.strictObject({ value: positive, source_url: z.url() }),
    mfu_prefill: z.strictObject({ value: positive, source_url: z.url() }),
    configs: z.array(
      z.strictObject({
        model: z.string(),
        gpu: z.string(),
        concurrency: count,
        avgSeqLen: count,
        decodeTokensPerSecond: positive,
        decodeStepSeconds: positive,
      }),
    ),
  }),
  "kv-ref.json": z.strictObject({
    _provenance: provenance,
    blockSize: z.literal(16),
    entries: z.array(
      z.strictObject({
        model: z.string(),
        kvDtype: z.enum(["bf16", "fp8"]),
        tokens: count,
        bytes: count,
      }),
    ),
  }),
};

const data = {
  models: schemas["models.json"].parse(read("models.json")),
  gpus: schemas["gpus.json"].parse(read("gpus.json")),
  roofline: schemas["roofline-ref.json"].parse(read("roofline-ref.json")),
  kv: schemas["kv-ref.json"].parse(read("kv-ref.json")),
};

describe("generated data", () => {
  it("every file names the same llmsize commit", () => {
    const commits = new Set(
      Object.values(data).map((f) => f._provenance.commit),
    );
    expect(commits.size).toBe(1);
  });

  it("has the 10 dense models the plan names, with unique slugs", () => {
    expect(data.models.models.map((m) => m.id).sort()).toEqual([
      "Qwen/Qwen2.5-72B-Instruct",
      "Qwen/Qwen2.5-7B-Instruct",
      "Qwen/Qwen3-32B",
      "Qwen/Qwen3-8B",
      "meta-llama/Llama-3.1-405B-Instruct",
      "meta-llama/Llama-3.1-70B-Instruct",
      "meta-llama/Llama-3.1-8B-Instruct",
      "meta-llama/Llama-3.2-3B-Instruct",
      "microsoft/Phi-3.5-mini-instruct",
      "mistralai/Mistral-7B-Instruct-v0.3",
    ]);
    const slugs = data.models.models.map((m) => m.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it("contrasts Phi-3.5-mini (MHA) with Llama-3.2-3B (GQA)", () => {
    expect(data.models.contrast).toMatchObject({
      mha: "microsoft/Phi-3.5-mini-instruct",
      gqa: "meta-llama/Llama-3.2-3B-Instruct",
    });
  });

  it("stores fp8 KV at exactly half of bf16", () => {
    for (const m of data.models.models) {
      expect(m.kvBytesPerTokenFp8 * 2).toBe(m.kvBytesPerTokenBf16);
    }
  });

  it("has the 5 GPUs and the 3 cross-check configs, in order", () => {
    expect(data.gpus.gpus.map((g) => g.id)).toEqual([...GPU_IDS]);
    expect(
      data.roofline.configs.map((c) => [
        c.model,
        c.gpu,
        c.concurrency,
        c.avgSeqLen,
      ]),
    ).toEqual(ROOFLINE_CONFIGS.map((c) => [c.model, c.gpu, c.S, c.l]));
  });

  it("has a KV entry for every model, dtype, and context stop", () => {
    for (const m of data.models.models) {
      for (const kvDtype of ["bf16", "fp8"] as const) {
        const tokens = data.kv.entries
          .filter((e) => e.model === m.id && e.kvDtype === kvDtype)
          .map((e) => e.tokens);
        expect(tokens).toEqual(contextsFor(m.maxContext));
      }
    }
  });
});

describe("gen-data helpers", () => {
  it("slugs drop the org and the -instruct suffix", () => {
    expect(slugOf("meta-llama/Llama-3.1-8B-Instruct")).toBe("llama-3.1-8b");
    expect(slugOf("mistralai/Mistral-7B-Instruct-v0.3")).toBe(
      "mistral-7b-v0.3",
    );
    expect(slugOf("Qwen/Qwen3-8B")).toBe("qwen3-8b");
  });

  it("context stops stop at the model's max and include it", () => {
    expect(contextsFor(40960).at(-1)).toBe(40960);
    expect(contextsFor(40960).at(-2)).toBe(32768);
    expect(contextsFor(131072)).toEqual(CONTEXT_STOPS);
  });
});
