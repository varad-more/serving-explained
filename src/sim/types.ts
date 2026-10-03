/**
 * Types for the toy serving engine. docs/SIM.md is the spec; section numbers
 * below refer to it. Everything here is plain data, so a snapshot or an event
 * can be posted to a Web Worker.
 */

/* ---------- config (§2.1) ---------- */

export interface SimConfig {
  /** Also seeds the synthetic output token ids. */
  seed: number;
  requests: readonly RequestSpec[];
  model: ModelCost;
  gpu: GpuCost;
  cost: CostConstants;
  kv: {
    allocator: "paged" | "contiguous-max";
    /** Capacity is numBlocks × blockSize token slots, for both allocators. */
    numBlocks: number;
    /** Tokens per block (vLLM default: 16). */
    blockSize: number;
    /** Paged only. */
    prefixCaching: boolean;
  };
  scheduler: {
    policy: "static" | "continuous";
    maxNumSeqs: number;
    /** The per-step token budget. */
    maxNumBatchedTokens: number;
    chunkedPrefill: boolean;
    /** contiguous-max reserves this many slots per request. */
    maxModelLen: number;
  };
  /** True in tests and dev builds (§6). */
  checkInvariants?: boolean;
}

/** One models.json entry, as plain numbers (§2.1). */
export interface ModelCost {
  id: string;
  params: number;
  embeddingParams: number;
  /** bf16 */
  weightBytes: number;
  layers: number;
  attentionHeads: number;
  headDim: number;
  /** All layers. */
  kvBytesPerToken: number;
}

export interface GpuCost {
  id: string;
  bf16Tflops: number;
  memBandwidthBytesPerSec: number;
}

/** A constant and where it comes from: a SOURCES.md id, or "teaching default". */
export interface Sourced {
  value: number;
  source: string;
}

export interface CostConstants {
  mfu: Sourced;
  mbu: Sourced;
  overheadS: Sourced;
}

export interface RequestSpec {
  id: number;
  /** Seconds. */
  arrival: number;
  /** Synthetic token ids. */
  prompt: readonly number[];
  /** The "model" stops here; the scheduler never reads it. */
  outputLen: number;
}

export type ConfigErrorCode =
  | "caching-needs-paged"
  | "request-too-long"
  | "kv-smaller-than-max-model-len"
  | "budget-below-max-model-len"
  | "bad-requests";

/* ---------- events (§2.2) ---------- */

interface At {
  /** Engine iteration index. */
  step: number;
  /** Sim seconds. */
  t: number;
}

export interface Region {
  start: number;
  len: number;
}

export interface KvCounts {
  capacity: number;
  allocated: number;
  cached: number;
  tokens: number;
  unusable: number;
}

export type SimEvent =
  | (At & { type: "Arrive"; req: number })
  | (At & { type: "Admit"; req: number; cachedTokens: number })
  | (At & { type: "CacheHit"; req: number; blocks: number[]; tokens: number })
  | (At & { type: "Allocate"; req: number; blocks: number[] })
  | (At & { type: "Allocate"; req: number; region: Region })
  | (At & { type: "Evict"; block: number; hash: number })
  | (At & { type: "CacheInsert"; req: number; block: number; hash: number })
  | (At & { type: "PrefillChunk"; req: number; start: number; tokens: number })
  | (At & { type: "DecodeToken"; req: number; index: number })
  | (At & {
      type: "Preempt";
      req: number;
      blocks: number[];
      lostTokens: number;
    })
  | (At & { type: "Free"; req: number; blocks: number[] })
  | (At & { type: "Free"; req: number; region: Region })
  | (At & { type: "Finish"; req: number })
  | (At & { type: "Reject"; req: number; reason: string })
  | (At & {
      type: "StepEnd";
      duration: number;
      computeS: number;
      memoryS: number;
      overheadS: number;
      bound: "compute" | "memory";
      tokens: number;
      batch: number;
      waiting: number;
      running: number;
      kv: KvCounts;
    });

export type SimEventType = SimEvent["type"];

/* ---------- run state (§2) ---------- */

export interface StepInfo {
  step: number;
  time: number;
  waiting: number;
  running: number;
  done: boolean;
}

export interface Sim {
  /** One engine iteration. Throws if the run is already done. */
  step(): StepInfo;
  /** Step until `until(info)` is true, the run is done, or maxSteps is reached. */
  run(until?: (info: StepInfo) => boolean, maxSteps?: number): StepInfo;
  /** Plain, structured-clone-safe copy of the current state. */
  snapshot(): SimSnapshot;
  /** The append-only event log (a read-only view, not a copy). */
  events(): readonly SimEvent[];
}

export type RequestState =
  "waiting" | "running" | "done-in-batch" | "finished" | "rejected";

/* ---------- snapshot (§2.3) ---------- */

export interface RequestView {
  id: number;
  state: RequestState;
  computedTokens: number;
  generated: number;
  /** Paged: physical block ids in logical order. */
  blockTable: number[] | null;
  /** Contiguous: the reserved region and the slots used. */
  region: (Region & { used: number }) | null;
  preemptions: number;
}

export interface PagedView {
  kind: "paged";
  numBlocks: number;
  blockSize: number;
  refCount: number[];
  filled: number[];
  hash: (number | null)[];
  /** Head (next to evict) first. */
  freeQueue: number[];
}

export interface ContiguousView {
  kind: "contiguous";
  capacity: number;
  regions: { req: number; start: number; len: number; used: number }[];
}

export interface SimSnapshot {
  step: number;
  time: number;
  done: boolean;
  /** Request ids, in queue order. Requests that have not arrived are left out. */
  waiting: number[];
  running: number[];
  finished: number[];
  requests: RequestView[];
  kv: PagedView | ContiguousView;
  counters: {
    preemptions: number;
    evictions: number;
    hitTokens: number;
    queryTokens: number;
  };
}

/* ---------- metrics (§2.4) ---------- */

/** Nearest-rank percentiles. NaN when there are no values. */
export interface Dist {
  mean: number;
  p50: number;
  p90: number;
  p99: number;
}

export interface RequestMetrics {
  id: number;
  arrival: number;
  /** DecodeToken index 0 time − arrival. */
  ttft: number;
  /** Gaps between consecutive DecodeToken times. */
  itl: number[];
  /** Finish time − arrival. */
  e2e: number;
  preemptions: number;
  /** Cached tokens at the first admission. */
  cachedTokens: number;
}

export interface SimMetrics {
  provenance: "simulated";
  /** Id order. */
  requests: RequestMetrics[];
  summary: {
    /** Last Finish − first Arrive, seconds. */
    makespan: number;
    /** DecodeToken count / makespan. */
    outputTokensPerS: number;
    requestsPerS: number;
    ttft: Dist;
    e2e: Dist;
    /** Pooled over every inter-token gap of every request. */
    itl: Dist;
    /** hitTokens / queryTokens, first admissions only; null with caching off. */
    prefixHitRate: number | null;
    preemptions: number;
    evictions: number;
  };
  /** One entry per step, from StepEnd. */
  series: {
    t: number[];
    /** kv.tokens / kv.capacity */
    kvUtilization: number[];
    /** kv.allocated − kv.tokens */
    waste: number[];
    /** kv.unusable */
    unusable: number[];
    waiting: number[];
    running: number[];
  };
}

/* ---------- workloads and presets (§7) ---------- */

export type BaseLengthDist =
  | { kind: "fixed"; value: number }
  | { kind: "uniform"; min: number; max: number }
  | {
      kind: "lognormal";
      median: number;
      sigma: number;
      min: number;
      max: number;
    };

export type LengthDist =
  | BaseLengthDist
  | {
      kind: "mixture";
      parts: readonly { weight: number; dist: BaseLengthDist }[];
    };

export interface WorkloadSpec {
  count: number;
  /** burst = all at t = 0 */
  arrival: { kind: "poisson"; ratePerS: number } | { kind: "burst" };
  /** The body, after any shared prefix. */
  promptLen: LengthDist;
  outputLen: LengthDist;
  /** k prefixes of L tokens; each request joins one with probability p. */
  sharedPrefix?: { groups: number; length: number; fraction: number };
  /** The body is clipped first, then the output. */
  maxModelLen: number;
  /** Default 32000. */
  vocabSize?: number;
}

export type PresetName =
  | "chatbot"
  | "rag"
  | "batch-summarize"
  | "agent-loop"
  | "paged-vs-contiguous"
  | "batching-basics"
  | "long-prompt-stall"
  | "shared-system-prompt"
  | "cache-pressure";

export interface Preset {
  workload: WorkloadSpec;
  description: string;
  /** Fixed per preset. */
  seed: number;
  /** Overrides of the engine defaults (§7). */
  kv?: Partial<SimConfig["kv"]>;
  scheduler?: Partial<SimConfig["scheduler"]>;
}
