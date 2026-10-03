/**
 * Golden scenarios G1–G7 (docs/SIM.md §10). Every expected event list was
 * worked out by hand from the spec before the engine ran. The toy model costs
 * nothing and every step adds 1 s of overhead, so step n runs from t = n to
 * t = n + 1. B is the block size.
 */
import { describe, expect, it } from "vitest";
import { createSim } from "../../src/sim/engine.ts";
import { blockKeys } from "../../src/sim/hash.ts";
import type { SimConfig } from "../../src/sim/types.ts";
import { req, toyConfig } from "./helpers.ts";

/* Event builders: step first, then the event's own time. */
const arrive = (step: number, t: number, r: number) => ({
  type: "Arrive",
  step,
  t,
  req: r,
});
const admit = (step: number, r: number, cachedTokens = 0) => ({
  type: "Admit",
  step,
  t: step,
  req: r,
  cachedTokens,
});
const hit = (step: number, r: number, blocks: number[], tokens: number) => ({
  type: "CacheHit",
  step,
  t: step,
  req: r,
  blocks,
  tokens,
});
const alloc = (step: number, r: number, blocks: number[]) => ({
  type: "Allocate",
  step,
  t: step,
  req: r,
  blocks,
});
const allocRegion = (step: number, r: number, start: number, len: number) => ({
  type: "Allocate",
  step,
  t: step,
  req: r,
  region: { start, len },
});
const evict = (step: number, block: number, hash: number) => ({
  type: "Evict",
  step,
  t: step,
  block,
  hash,
});
const insert = (step: number, r: number, block: number, hash: number) => ({
  type: "CacheInsert",
  step,
  t: step,
  req: r,
  block,
  hash,
});
const preempt = (
  step: number,
  r: number,
  blocks: number[],
  lostTokens: number,
) => ({ type: "Preempt", step, t: step, req: r, blocks, lostTokens });
const freeAt = (t: number) => (step: number, r: number, blocks: number[]) => ({
  type: "Free",
  step,
  t,
  req: r,
  blocks,
});
const prefill = (step: number, r: number, start: number, tokens: number) => ({
  type: "PrefillChunk",
  step,
  t: step + 1,
  req: r,
  start,
  tokens,
});
const decode = (step: number, r: number, index: number) => ({
  type: "DecodeToken",
  step,
  t: step + 1,
  req: r,
  index,
});
const finish = (step: number, r: number) => ({
  type: "Finish",
  step,
  t: step + 1,
  req: r,
});
const free = (step: number, r: number, blocks: number[]) =>
  freeAt(step + 1)(step, r, blocks);
const freeRegion = (step: number, r: number, start: number, len: number) => ({
  type: "Free",
  step,
  t: step + 1,
  req: r,
  region: { start, len },
});
/** StepEnd; kv is [allocated, cached, tokens, unusable]. */
const end = (
  step: number,
  capacity: number,
  tokens: number,
  batch: number,
  waiting: number,
  running: number,
  kv: [number, number, number, number],
) => ({
  type: "StepEnd",
  step,
  t: step + 1,
  duration: 1,
  computeS: 0,
  memoryS: 0,
  overheadS: 1,
  bound: "memory",
  tokens,
  batch,
  waiting,
  running,
  kv: {
    capacity,
    allocated: kv[0],
    cached: kv[1],
    tokens: kv[2],
    unusable: kv[3],
  },
});

function run(config: SimConfig) {
  const sim = createSim(config);
  sim.run();
  return { events: sim.events(), snap: sim.snapshot() };
}

describe("G1: one request, paged", () => {
  // Prompt 6, output 3, B 4, 12 blocks, caching off. Two blocks hold the 6
  // prompt tokens; the request ends with 8 tokens of KV, so it never needs a
  // third block: the last sampled token never gets KV.
  const config = toyConfig({
    kv: { numBlocks: 12 },
    scheduler: { maxModelLen: 48 },
    requests: [req(0, 6, 3)],
  });
  const C = 48;

  it("emits the expected log", () => {
    expect(run(config).events).toEqual([
      arrive(0, 0, 0),
      admit(0, 0),
      alloc(0, 0, [0, 1]),
      prefill(0, 0, 0, 6),
      decode(0, 0, 0),
      end(0, C, 6, 1, 0, 1, [8, 0, 6, 0]),
      decode(1, 0, 1),
      end(1, C, 1, 1, 0, 1, [8, 0, 7, 0]),
      decode(2, 0, 2),
      finish(2, 0),
      free(2, 0, [1, 0]),
      end(2, C, 1, 1, 0, 0, [0, 0, 0, 0]),
    ]);
  });

  it("frees [1, 0] to the front: the queue becomes 1, 0, 2, 3, …", () => {
    const { snap } = run(config);
    expect(snap.kv.kind === "paged" && snap.kv.freeQueue).toEqual([
      1, 0, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11,
    ]);
  });
});

describe("G2: static vs. continuous", () => {
  // Three requests at t = 0, prompt 4, outputs 2, 6, and 2, maxNumSeqs 2.
  const requests = [req(0, 4, 2), req(1, 4, 6), req(2, 4, 2)];
  const C = 256;

  it("static: r2 waits for the whole batch; admitted in step 6, TTFT 7 s, 8 steps", () => {
    // r0 finishes in step 1 but holds its slot until r1, the longest, ends
    // in step 5. Both are returned together; only then does r2 start.
    const { events } = run(
      toyConfig({ scheduler: { policy: "static", maxNumSeqs: 2 }, requests }),
    );
    expect(events).toEqual([
      arrive(0, 0, 0),
      arrive(0, 0, 1),
      arrive(0, 0, 2),
      admit(0, 0),
      admit(0, 1),
      alloc(0, 0, [0]),
      alloc(0, 1, [1]),
      prefill(0, 0, 0, 4),
      decode(0, 0, 0),
      prefill(0, 1, 0, 4),
      decode(0, 1, 0),
      end(0, C, 8, 2, 1, 2, [8, 0, 8, 0]),
      alloc(1, 0, [2]),
      alloc(1, 1, [3]),
      decode(1, 0, 1),
      decode(1, 1, 1),
      end(1, C, 2, 2, 1, 1, [16, 0, 10, 0]),
      decode(2, 1, 2),
      end(2, C, 1, 1, 1, 1, [16, 0, 11, 0]),
      decode(3, 1, 3),
      end(3, C, 1, 1, 1, 1, [16, 0, 12, 0]),
      decode(4, 1, 4),
      end(4, C, 1, 1, 1, 1, [16, 0, 13, 0]),
      alloc(5, 1, [4]),
      decode(5, 1, 5),
      finish(5, 0),
      free(5, 0, [2, 0]),
      finish(5, 1),
      free(5, 1, [4, 3, 1]),
      end(5, C, 1, 1, 1, 0, [0, 0, 0, 0]),
      admit(6, 2),
      alloc(6, 2, [4]),
      prefill(6, 2, 0, 4),
      decode(6, 2, 0),
      end(6, C, 4, 1, 0, 1, [4, 0, 4, 0]),
      alloc(7, 2, [3]),
      decode(7, 2, 1),
      finish(7, 2),
      free(7, 2, [3, 4]),
      end(7, C, 1, 1, 0, 0, [0, 0, 0, 0]),
    ]);
  });

  it("continuous: r2 joins as soon as r0 leaves; admitted in step 2, TTFT 3 s, 6 steps", () => {
    const { events } = run(
      toyConfig({
        scheduler: { policy: "continuous", maxNumSeqs: 2 },
        requests,
      }),
    );
    expect(events).toEqual([
      arrive(0, 0, 0),
      arrive(0, 0, 1),
      arrive(0, 0, 2),
      admit(0, 0),
      alloc(0, 0, [0]),
      admit(0, 1),
      alloc(0, 1, [1]),
      prefill(0, 0, 0, 4),
      decode(0, 0, 0),
      prefill(0, 1, 0, 4),
      decode(0, 1, 0),
      end(0, C, 8, 2, 1, 2, [8, 0, 8, 0]),
      alloc(1, 0, [2]),
      alloc(1, 1, [3]),
      decode(1, 0, 1),
      decode(1, 1, 1),
      finish(1, 0),
      free(1, 0, [2, 0]),
      end(1, C, 2, 2, 1, 1, [8, 0, 5, 0]),
      admit(2, 2),
      alloc(2, 2, [2]),
      decode(2, 1, 2),
      prefill(2, 2, 0, 4),
      decode(2, 2, 0),
      end(2, C, 5, 2, 0, 2, [12, 0, 10, 0]),
      alloc(3, 2, [0]),
      decode(3, 1, 3),
      decode(3, 2, 1),
      finish(3, 2),
      free(3, 2, [0, 2]),
      end(3, C, 2, 2, 0, 1, [8, 0, 7, 0]),
      decode(4, 1, 4),
      end(4, C, 1, 1, 0, 1, [8, 0, 8, 0]),
      alloc(5, 1, [0]),
      decode(5, 1, 5),
      finish(5, 1),
      free(5, 1, [0, 3, 1]),
      end(5, C, 1, 1, 0, 0, [0, 0, 0, 0]),
    ]);
  });
});

describe("G3: preemption by recompute", () => {
  // B 4, 4 blocks, two requests with prompt 4 and output 10. In step 5, r0
  // needs a third block and none is free, so r1, the last admitted, is
  // preempted. Its 8 tokens of KV are lost; its blocks go to the front.
  // r1's whole sequence (9 tokens, 3 blocks) must fit before it returns, so
  // it waits until r0 finishes in step 9, then recomputes all 9 tokens.
  const config = toyConfig({
    kv: { numBlocks: 4 },
    scheduler: { maxModelLen: 16, maxNumBatchedTokens: 16 },
    requests: [req(0, 4, 10), req(1, 4, 10)],
  });
  const C = 16;

  it("emits the expected log, with exactly one preemption", () => {
    const { events } = run(config);
    const decodes = (step: number, index: number) => [
      decode(step, 0, index),
      decode(step, 1, index),
      end(step, C, 2, 2, 0, 2, [16, 0, 8 + 2 * index, 0]),
    ];
    expect(events).toEqual([
      arrive(0, 0, 0),
      arrive(0, 0, 1),
      admit(0, 0),
      alloc(0, 0, [0]),
      admit(0, 1),
      alloc(0, 1, [1]),
      prefill(0, 0, 0, 4),
      decode(0, 0, 0),
      prefill(0, 1, 0, 4),
      decode(0, 1, 0),
      end(0, C, 8, 2, 0, 2, [8, 0, 8, 0]),
      alloc(1, 0, [2]),
      alloc(1, 1, [3]),
      ...decodes(1, 1),
      ...decodes(2, 2),
      ...decodes(3, 3),
      ...decodes(4, 4),
      preempt(5, 1, [1, 3], 8),
      freeAt(5)(5, 1, [3, 1]),
      alloc(5, 0, [3]),
      decode(5, 0, 5),
      end(5, C, 1, 1, 1, 1, [12, 0, 9, 0]),
      decode(6, 0, 6),
      end(6, C, 1, 1, 1, 1, [12, 0, 10, 0]),
      decode(7, 0, 7),
      end(7, C, 1, 1, 1, 1, [12, 0, 11, 0]),
      decode(8, 0, 8),
      end(8, C, 1, 1, 1, 1, [12, 0, 12, 0]),
      alloc(9, 0, [1]),
      decode(9, 0, 9),
      finish(9, 0),
      free(9, 0, [1, 3, 2, 0]),
      end(9, C, 1, 1, 1, 0, [0, 0, 0, 0]),
      admit(10, 1),
      alloc(10, 1, [1, 3, 2]),
      prefill(10, 1, 0, 9),
      decode(10, 1, 5),
      end(10, C, 9, 1, 0, 1, [12, 0, 9, 0]),
      decode(11, 1, 6),
      end(11, C, 1, 1, 0, 1, [12, 0, 10, 0]),
      decode(12, 1, 7),
      end(12, C, 1, 1, 0, 1, [12, 0, 11, 0]),
      decode(13, 1, 8),
      end(13, C, 1, 1, 0, 1, [12, 0, 12, 0]),
      alloc(14, 1, [0]),
      decode(14, 1, 9),
      finish(14, 1),
      free(14, 1, [0, 2, 3, 1]),
      end(14, C, 1, 1, 0, 0, [0, 0, 0, 0]),
    ]);
    expect(events.filter((e) => e.type === "Preempt")).toHaveLength(1);
  });
});

describe("G4: prefix hit and LRU eviction", () => {
  // B 4, 6 blocks, caching on; one request per second, each with output 1.
  const T8 = [11, 12, 13, 14, 15, 16, 17, 18];
  const r2Prompt = Array.from({ length: 20 }, (_, i) => 500 + i);
  const config = toyConfig({
    kv: { numBlocks: 6, prefixCaching: true },
    scheduler: { maxModelLen: 24 },
    requests: [
      { id: 0, arrival: 0, prompt: T8, outputLen: 1 },
      { id: 1, arrival: 1, prompt: [...T8, 91, 92], outputLen: 1 },
      { id: 2, arrival: 2, prompt: r2Prompt, outputLen: 1 },
      { id: 3, arrival: 3, prompt: T8, outputLen: 1 },
    ],
  });
  const C = 24;
  const [kA0, kA1] = blockKeys(T8, 4) as [number, number];
  const k2 = blockKeys(r2Prompt, 4);

  it("emits the expected log", () => {
    const { events } = run(config);
    expect(events).toEqual([
      // r0 keys blocks 0 and 1 at schedule time. Both are keyed, so on
      // finish they go to the tail: 2, 3, 4, 5, 1, 0.
      arrive(0, 0, 0),
      admit(0, 0),
      alloc(0, 0, [0, 1]),
      insert(0, 0, 0, kA0),
      insert(0, 0, 1, kA1),
      prefill(0, 0, 0, 8),
      decode(0, 0, 0),
      finish(0, 0),
      free(0, 0, [1, 0]),
      end(0, C, 8, 1, 0, 0, [0, 8, 0, 0]),
      // r1 (the same 8 tokens plus 2) hits blocks 0 and 1 and allocates
      // block 2, which stays partial and unkeyed. Freed: 2 to the front,
      // 1 and 0 to the tail: 2, 3, 4, 5, 1, 0.
      arrive(1, 1, 1),
      admit(1, 1, 8),
      hit(1, 1, [0, 1], 8),
      alloc(1, 1, [2]),
      prefill(1, 1, 8, 2),
      decode(1, 1, 0),
      finish(1, 1),
      free(1, 1, [2, 1, 0]),
      end(1, C, 2, 1, 0, 0, [0, 8, 0, 0]),
      // r2 (20 unrelated tokens) pops 2, 3, 4, 5, then 1, which evicts it.
      arrive(2, 2, 2),
      admit(2, 2),
      evict(2, 1, kA1),
      alloc(2, 2, [2, 3, 4, 5, 1]),
      insert(2, 2, 2, k2[0]!),
      insert(2, 2, 3, k2[1]!),
      insert(2, 2, 4, k2[2]!),
      insert(2, 2, 5, k2[3]!),
      insert(2, 2, 1, k2[4]!),
      prefill(2, 2, 0, 20),
      decode(2, 2, 0),
      finish(2, 2),
      free(2, 2, [1, 5, 4, 3, 2]),
      end(2, C, 20, 1, 0, 0, [0, 24, 0, 0]),
      // r3 (r0's prompt again) hits block 0 only: the full-hit cap is 8 − 1,
      // rounded down to one block, and block 1 is gone anyway. It recomputes
      // tokens 4–7 into block 1, popped from the head, evicting one of r2's.
      arrive(3, 3, 3),
      admit(3, 3, 4),
      hit(3, 3, [0], 4),
      evict(3, 1, k2[4]!),
      alloc(3, 3, [1]),
      insert(3, 3, 1, kA1),
      prefill(3, 3, 4, 4),
      decode(3, 3, 0),
      finish(3, 3),
      free(3, 3, [1, 0]),
      end(3, C, 4, 1, 0, 0, [0, 24, 0, 0]),
    ]);
  });

  it("checks the free-queue order after every step", () => {
    const sim = createSim(config);
    const queues: number[][] = [];
    while (!sim.snapshot().done) {
      sim.step();
      const kv = sim.snapshot().kv;
      if (kv.kind === "paged") queues.push(kv.freeQueue);
    }
    expect(queues).toEqual([
      [2, 3, 4, 5, 1, 0],
      [2, 3, 4, 5, 1, 0],
      [0, 1, 5, 4, 3, 2],
      [5, 4, 3, 2, 1, 0],
    ]);
  });
});

describe("G5: chunked prefill alongside a decode", () => {
  // Budget 4, chunking on. r0 decodes one token a step while r1's 10-token
  // prompt runs in chunks of 3, 3, 3, and 1 in the budget left over.
  const config = toyConfig({
    kv: { numBlocks: 16 },
    scheduler: { maxModelLen: 16, maxNumBatchedTokens: 4 },
    requests: [req(0, 4, 5), req(1, 10, 1, 1)],
  });
  const C = 64;

  it("emits the expected log; PrefillChunk starts are 0, 3, 6, 9", () => {
    const { events } = run(config);
    expect(events).toEqual([
      arrive(0, 0, 0),
      admit(0, 0),
      alloc(0, 0, [0]),
      prefill(0, 0, 0, 4),
      decode(0, 0, 0),
      end(0, C, 4, 1, 0, 1, [4, 0, 4, 0]),
      arrive(1, 1, 1),
      alloc(1, 0, [1]),
      admit(1, 1),
      alloc(1, 1, [2]),
      decode(1, 0, 1),
      prefill(1, 1, 0, 3),
      end(1, C, 4, 2, 0, 2, [12, 0, 8, 0]),
      alloc(2, 1, [3]),
      decode(2, 0, 2),
      prefill(2, 1, 3, 3),
      end(2, C, 4, 2, 0, 2, [16, 0, 12, 0]),
      alloc(3, 1, [4]),
      decode(3, 0, 3),
      prefill(3, 1, 6, 3),
      end(3, C, 4, 2, 0, 2, [20, 0, 16, 0]),
      decode(4, 0, 4),
      prefill(4, 1, 9, 1),
      decode(4, 1, 0),
      finish(4, 0),
      free(4, 0, [1, 0]),
      finish(4, 1),
      free(4, 1, [4, 3, 2]),
      end(4, C, 2, 2, 0, 0, [0, 0, 0, 0]),
    ]);
  });
});

describe("G6: contiguous-max vs. paged at equal capacity", () => {
  // 20 slots (B 4, 5 blocks), max_model_len 8, three requests with prompt 3
  // and output 2.
  const requests = [req(0, 3, 2), req(1, 3, 2), req(2, 3, 2)];
  const C = 20;

  it("contiguous admits 2: 10 slots reserved but unused, a tail gap of 4; r2 waits until step 2", () => {
    const { events } = run(
      toyConfig({
        kv: { allocator: "contiguous-max", numBlocks: 5 },
        scheduler: { maxModelLen: 8 },
        requests,
      }),
    );
    expect(events).toEqual([
      arrive(0, 0, 0),
      arrive(0, 0, 1),
      arrive(0, 0, 2),
      admit(0, 0),
      allocRegion(0, 0, 0, 8),
      admit(0, 1),
      allocRegion(0, 1, 8, 8),
      prefill(0, 0, 0, 3),
      decode(0, 0, 0),
      prefill(0, 1, 0, 3),
      decode(0, 1, 0),
      end(0, C, 6, 2, 1, 2, [16, 0, 6, 4]),
      decode(1, 0, 1),
      decode(1, 1, 1),
      finish(1, 0),
      freeRegion(1, 0, 0, 8),
      finish(1, 1),
      freeRegion(1, 1, 8, 8),
      end(1, C, 2, 2, 1, 0, [0, 0, 0, 0]),
      admit(2, 2),
      allocRegion(2, 2, 0, 8),
      prefill(2, 2, 0, 3),
      decode(2, 2, 0),
      end(2, C, 3, 1, 0, 1, [8, 0, 3, 0]),
      decode(3, 2, 1),
      finish(3, 2),
      freeRegion(3, 2, 0, 8),
      end(3, C, 1, 1, 0, 0, [0, 0, 0, 0]),
    ]);
  });

  it("paged with B 4 and 5 blocks admits all 3, with 3 slots of partial-block waste", () => {
    const { events } = run(
      toyConfig({
        kv: { numBlocks: 5 },
        scheduler: { maxModelLen: 8 },
        requests,
      }),
    );
    expect(events).toEqual([
      arrive(0, 0, 0),
      arrive(0, 0, 1),
      arrive(0, 0, 2),
      admit(0, 0),
      alloc(0, 0, [0]),
      admit(0, 1),
      alloc(0, 1, [1]),
      admit(0, 2),
      alloc(0, 2, [2]),
      prefill(0, 0, 0, 3),
      decode(0, 0, 0),
      prefill(0, 1, 0, 3),
      decode(0, 1, 0),
      prefill(0, 2, 0, 3),
      decode(0, 2, 0),
      end(0, C, 9, 3, 0, 3, [12, 0, 9, 0]),
      decode(1, 0, 1),
      decode(1, 1, 1),
      decode(1, 2, 1),
      finish(1, 0),
      free(1, 0, [0]),
      finish(1, 1),
      free(1, 1, [1]),
      finish(1, 2),
      free(1, 2, [2]),
      end(1, C, 3, 3, 0, 0, [0, 0, 0, 0]),
    ]);
  });
});

describe("G7: hit inside one batch", () => {
  // B 4. Two identical 9-token prompts at t = 0. r0 keys blocks 0 and 1 at
  // schedule time, so r1, admitted in the same step, hits them.
  const T9 = [21, 22, 23, 24, 25, 26, 27, 28, 29];
  const config = toyConfig({
    kv: { numBlocks: 16, prefixCaching: true },
    scheduler: { maxModelLen: 16 },
    requests: [
      { id: 0, arrival: 0, prompt: T9, outputLen: 1 },
      { id: 1, arrival: 0, prompt: T9, outputLen: 1 },
    ],
  });
  const [k0, k1] = blockKeys(T9, 4) as [number, number];

  it("emits the expected log", () => {
    const { events } = run(config);
    expect(events).toEqual([
      arrive(0, 0, 0),
      arrive(0, 0, 1),
      admit(0, 0),
      alloc(0, 0, [0, 1, 2]),
      insert(0, 0, 0, k0),
      insert(0, 0, 1, k1),
      admit(0, 1, 8),
      hit(0, 1, [0, 1], 8),
      alloc(0, 1, [3]),
      prefill(0, 0, 0, 9),
      decode(0, 0, 0),
      prefill(0, 1, 8, 1),
      decode(0, 1, 0),
      finish(0, 0),
      free(0, 0, [2, 1, 0]),
      finish(0, 1),
      free(0, 1, [3, 1, 0]),
      end(0, 64, 10, 2, 0, 0, [0, 8, 0, 0]),
    ]);
  });

  it("counts 18 query tokens and 8 hit tokens", () => {
    expect(run(config).snap.counters).toMatchObject({
      queryTokens: 18,
      hitTokens: 8,
    });
  });
});
