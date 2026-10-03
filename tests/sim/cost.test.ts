import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { stepCost } from "../../src/sim/cost.ts";
import type { CostConstants, GpuCost, ModelCost } from "../../src/sim/types.ts";
import {
  COST_CONSTANTS,
  gpuCost,
  modelCost,
  type GpuEntry,
  type ModelEntry,
} from "../../src/simConfig.ts";

// Round numbers, so every expected value below is worked out by hand.
const model: ModelCost = {
  id: "round",
  params: 1e9,
  embeddingParams: 1e8,
  weightBytes: 2e9,
  layers: 2,
  attentionHeads: 4,
  headDim: 8,
  kvBytesPerToken: 100,
};
const gpu: GpuCost = {
  id: "round",
  bf16Tflops: 1,
  memBandwidthBytesPerSec: 1e9,
};
const cost: CostConstants = {
  mfu: { value: 0.5, source: "test" },
  mbu: { value: 0.5, source: "test" },
  overheadS: { value: 0.01, source: "test" },
};
// 4·L·n_h·d_h = 4·2·4·8 = 256. B_stream = 2e9·(1 − 0.1) = 1.8e9.

describe("stepCost", () => {
  it("one decode token over 9 tokens of context is memory-bound", () => {
    const c = stepCost([{ q: 1, c: 9 }], model, gpu, cost);
    // F = 2e9·1 + 256·(9 + 1) = 2,000,002,560 → / 5e11
    expect(c.computeS).toBeCloseTo(0.00400000512, 12);
    // (1.8e9 + 100·10) / 5e8
    expect(c.memoryS).toBeCloseTo(3.600002, 9);
    expect(c.bound).toBe("memory");
    expect(c.duration).toBeCloseTo(3.610002, 9);
  });

  it("a 1000-token prefill is compute-bound", () => {
    const c = stepCost([{ q: 1000, c: 0 }], model, gpu, cost);
    // F = 2e12 + 256·(1000·1001/2) = 2e12 + 128,128,000 → / 5e11
    expect(c.computeS).toBeCloseTo(4.000256256, 9);
    // (1.8e9 + 100·1000) / 5e8
    expect(c.memoryS).toBeCloseTo(3.6002, 9);
    expect(c.bound).toBe("compute");
    expect(c.duration).toBeCloseTo(4.010256256, 9);
  });

  it("sums a mixed batch: a decode plus a 3-token chunk after 5 cached tokens", () => {
    const c = stepCost(
      [
        { q: 1, c: 9 },
        { q: 3, c: 5 },
      ],
      model,
      gpu,
      cost,
    );
    // F = 2e9·4 + 256·((9 + 1) + (15 + 6)) = 8e9 + 7936
    expect(c.computeS).toBeCloseTo((8e9 + 7936) / 5e11, 15);
    // B_kv = 100·(10 + 8)
    expect(c.memoryS).toBeCloseTo((1.8e9 + 1800) / 5e8, 12);
  });

  it("a zero-parameter toy model costs only the overhead, with no NaN", () => {
    const toy = {
      ...model,
      params: 0,
      embeddingParams: 0,
      weightBytes: 0,
      layers: 0,
      kvBytesPerToken: 0,
    };
    const one = { ...cost, overheadS: { value: 1, source: "test" } };
    expect(stepCost([{ q: 5, c: 3 }], toy, gpu, one)).toEqual({
      duration: 1,
      computeS: 0,
      memoryS: 0,
      overheadS: 1,
      bound: "memory",
    });
    expect(stepCost([], model, gpu, one).duration).toBe(1);
  });
});

describe("cost constants", () => {
  const ref = JSON.parse(
    readFileSync("src/data/roofline-ref.json", "utf8"),
  ) as {
    mbu_decode: { value: number };
    mfu_prefill: { value: number };
    configs: {
      model: string;
      gpu: string;
      concurrency: number;
      avgSeqLen: number;
      decodeTokensPerSecond: number;
    }[];
  };
  const models = (
    JSON.parse(readFileSync("src/data/models.json", "utf8")) as {
      models: ModelEntry[];
    }
  ).models;
  const gpus = (
    JSON.parse(readFileSync("src/data/gpus.json", "utf8")) as {
      gpus: GpuEntry[];
    }
  ).gpus;

  it("MFU and MBU equal the values gen-data copied from llmsize", () => {
    expect(COST_CONSTANTS.mfu.value).toBe(ref.mfu_prefill.value);
    expect(COST_CONSTANTS.mbu.value).toBe(ref.mbu_decode.value);
    expect(COST_CONSTANTS.overheadS).toEqual({
      value: 0,
      source: "teaching default",
    });
  });

  it("steady decode reduces to llmsize's decode roofline", () => {
    for (const c of ref.configs) {
      const m = models.find((x) => x.id === c.model)!;
      const g = gpus.find((x) => x.id === c.gpu)!;
      const work = Array.from({ length: c.concurrency }, () => ({
        q: 1,
        c: c.avgSeqLen - 1,
      }));
      const step = stepCost(work, modelCost(m), gpuCost(g), COST_CONSTANTS);
      expect(step.bound).toBe("memory");
      const tps = c.concurrency / step.duration;
      expect(Math.abs(tps / c.decodeTokensPerSecond - 1)).toBeLessThan(0.15);
    }
  });
});
