import { readFileSync } from "node:fs";
import { ContiguousPool } from "../../src/sim/contiguous.ts";
import { PagedPool } from "../../src/sim/paged.ts";
import {
  newReq,
  type EngineState,
  type Scheduled,
} from "../../src/sim/scheduler.ts";
import type { RequestSpec, SimConfig } from "../../src/sim/types.ts";

/** The golden toy model (docs/SIM.md §10): zero cost, 1 s overhead per step. */
export function toyConfig(over: {
  kv?: Partial<SimConfig["kv"]>;
  scheduler?: Partial<SimConfig["scheduler"]>;
  requests?: readonly RequestSpec[];
  seed?: number;
}): SimConfig {
  return {
    seed: over.seed ?? 1,
    requests: over.requests ?? [],
    model: {
      id: "toy",
      params: 0,
      embeddingParams: 0,
      weightBytes: 0,
      layers: 0,
      attentionHeads: 0,
      headDim: 0,
      kvBytesPerToken: 0,
    },
    gpu: { id: "toy", bf16Tflops: 1, memBandwidthBytesPerSec: 1 },
    cost: {
      mfu: { value: 1, source: "teaching default" },
      mbu: { value: 1, source: "teaching default" },
      overheadS: { value: 1, source: "teaching default" },
    },
    kv: {
      allocator: "paged",
      numBlocks: 64,
      blockSize: 4,
      prefixCaching: false,
      ...over.kv,
    },
    scheduler: {
      policy: "continuous",
      maxNumSeqs: 8,
      maxNumBatchedTokens: 64,
      chunkedPrefill: true,
      maxModelLen: 64,
      ...over.scheduler,
    },
    checkInvariants: true,
  };
}

/** Requests with sequential token ids, so prompts never collide by accident. */
export function req(
  id: number,
  promptLen: number,
  outputLen: number,
  arrival = 0,
  base = 1000 * (id + 1),
): RequestSpec {
  return {
    id,
    arrival,
    prompt: Array.from({ length: promptLen }, (_, i) => base + i),
    outputLen,
  };
}

/** Engine state with every request already waiting, for scheduler tests. */
export function stateFor(config: SimConfig): EngineState {
  const { kv } = config;
  return {
    config,
    step: 0,
    clock: 0,
    waiting: config.requests.map(newReq),
    running: [],
    batch: [],
    paged:
      kv.allocator === "paged"
        ? new PagedPool(kv.numBlocks, kv.blockSize, kv.prefixCaching)
        : null,
    contiguous:
      kv.allocator === "contiguous-max"
        ? new ContiguousPool(
            kv.numBlocks * kv.blockSize,
            config.scheduler.maxModelLen,
          )
        : null,
    events: [],
    counters: {
      preemptions: 0,
      evictions: 0,
      hitTokens: 0,
      queryTokens: 0,
      preemptedHitTokens: 0,
      preemptedQueryTokens: 0,
    },
    admitCounter: 0,
    preemptCounter: 0,
  };
}

/** The minimal "apply" for scheduler tests: KV is written; a completed sequence samples a token. */
export function applyWork(s: EngineState, work: Scheduled[]): void {
  for (const { req: r, q } of work) {
    r.computed += q;
    if (s.paged) {
      for (let p = r.computed - q; p < r.computed; p++) {
        const b = r.table[Math.floor(p / s.paged.blockSize)]!;
        s.paged.filled[b] = (p % s.paged.blockSize) + 1;
      }
    }
    if (r.computed === r.spec.prompt.length + r.generated) {
      r.generated++;
      r.prefilling = false;
    }
  }
}

/** src/data, read the way the CLI reads it. */
export function loadData(): {
  models: import("../../src/simConfig.ts").ModelEntry[];
  gpus: import("../../src/simConfig.ts").GpuEntry[];
  roofline: {
    configs: {
      model: string;
      gpu: string;
      concurrency: number;
      avgSeqLen: number;
      decodeTokensPerSecond: number;
    }[];
  };
} {
  const read = (f: string): unknown =>
    JSON.parse(readFileSync(`src/data/${f}`, "utf8"));
  const models = (read("models.json") as { models: never[] }).models;
  const gpus = (read("gpus.json") as { gpus: never[] }).gpus;
  return { models, gpus, roofline: read("roofline-ref.json") as never };
}
