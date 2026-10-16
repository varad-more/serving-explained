/**
 * Messages between the sandbox page and its worker (tasks/todo.md, Prompt
 * 7, "Architecture"). Bulk data travels as typed arrays, transferred, not
 * copied. The full event log never leaves the worker.
 */
import type { SimMetrics } from "../../sim/index.ts";
import type { SandboxConfig } from "./params.ts";

export type ToWorker =
  | { type: "run"; config: SandboxConfig }
  | { type: "frame"; t: number }
  | { type: "events"; t0: number; t1: number };

/** Per-step series: row i is step i's end state. */
export interface Series {
  t: Float64Array;
  duration: Float64Array;
  running: Uint32Array;
  waiting: Uint32Array;
  /** KV slots held, and slots that hold KV (tokens). */
  allocated: Float64Array;
  tokens: Float64Array;
  cached: Float64Array;
}

/** Timeline lanes, one row per segment (ch3's timeline, as columns). */
export interface Segments {
  slot: Uint32Array;
  req: Int32Array;
  /** 0 prefill, 1 decode, 2 bubble, 3 held. */
  phase: Uint8Array;
  t0: Float64Array;
  t1: Float64Array;
  start: Float64Array;
  first: Uint8Array;
  preempted: Uint8Array;
}

/** Each request's time in the queue. */
export interface Queued {
  req: Int32Array;
  from: Float64Array;
  to: Float64Array;
}

export interface Histogram {
  edges: number[];
  counts: number[];
}

/** One grid cell per block: what BlockGrid draws (see frame.ts). */
export interface FrameCells {
  /** 0 free, 1 held, 2 shared, 3 cached, 4 gap. */
  kind: Uint8Array;
  /** The holder (held), or −1. */
  req: Int32Array;
  slot: Uint8Array;
  fill: Uint32Array;
  logical: Uint32Array;
  /** Shared: references. Cached: eviction order (1 goes next). */
  count: Uint32Array;
}

export interface FrameHolder {
  req: number;
  slot: number;
  computed: number;
  blocks: number[];
  region: { start: number; len: number } | null;
}

/** Raw events in a window, as columns, capped at 50,000. */
export interface EventColumns {
  t: Float64Array;
  step: Uint32Array;
  /** An index into EVENT_TYPES. */
  type: Uint8Array;
  req: Int32Array;
  /** tokens, cached tokens, blocks, or duration, by type; NaN if none. */
  value: Float64Array;
  truncated: boolean;
}

export const EVENT_TYPES = [
  "Arrive",
  "Admit",
  "CacheHit",
  "Allocate",
  "Evict",
  "CacheInsert",
  "PrefillChunk",
  "DecodeToken",
  "Preempt",
  "Free",
  "Finish",
  "Reject",
  "StepEnd",
] as const;

export interface Done {
  type: "done";
  summary: SimMetrics["summary"];
  requests: number;
  ttft: Histogram;
  itl: Histogram;
  /** hashEvents of the whole log; links carry its first 8 hex digits. */
  hash: string;
  engineVersion: number;
  duration: number;
  steps: number;
  numBlocks: number;
  blockSize: number;
  maxNumSeqs: number;
  allocator: "paged" | "contiguous-max";
  maxModelLen: number;
  segments: Segments;
  queued: Queued;
  stallSteps: Float64Array;
  /** Each step's start and end, for the long-step bands. */
  stallEnds: Float64Array;
}

export type FromWorker =
  | { type: "progress"; simTime: number; finished: number; total: number }
  | { type: "batch"; series: Series }
  | Done
  | {
      type: "frame";
      t: number;
      cells: FrameCells;
      holders: FrameHolder[];
      running: number;
      waiting: number;
      evicted: number[];
      kv: { allocated: number; tokens: number };
    }
  | { type: "events"; t0: number; t1: number; columns: EventColumns }
  | { type: "error"; code: string; message: string };
