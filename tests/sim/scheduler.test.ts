import { describe, expect, it } from "vitest";
import { schedule } from "../../src/sim/scheduler.ts";
import { applyWork, req, stateFor, toyConfig } from "./helpers.ts";

const ids = (xs: { spec: { id: number } }[]) => xs.map((r) => r.spec.id);
const work = (r: ReturnType<typeof schedule>) =>
  r.scheduled.map((w) => [w.req.spec.id, w.q]);

describe("schedule: caps and chunks", () => {
  it("stops admitting when the token budget is spent", () => {
    const s = stateFor(
      toyConfig({
        scheduler: { maxNumBatchedTokens: 16 },
        requests: [req(0, 10, 4), req(1, 10, 4), req(2, 10, 4)],
      }),
    );
    expect(work(schedule(s))).toEqual([
      [0, 10],
      [1, 6],
    ]);
    expect(ids(s.waiting)).toEqual([2]);
  });

  it("caps running requests at maxNumSeqs", () => {
    const s = stateFor(
      toyConfig({
        scheduler: { maxNumSeqs: 2 },
        requests: [req(0, 4, 4), req(1, 4, 4), req(2, 4, 4)],
      }),
    );
    expect(work(schedule(s))).toEqual([
      [0, 4],
      [1, 4],
    ]);
  });

  it("chunks a long prompt across steps, decodes taking 1 token first", () => {
    const s = stateFor(
      toyConfig({
        scheduler: { maxNumBatchedTokens: 4 },
        requests: [req(0, 2, 9), req(1, 10, 1, 0)],
      }),
    );
    const chunks: number[][] = [];
    for (let i = 0; i < 4; i++) {
      const r = schedule(s);
      chunks.push(r.scheduled.map((w) => w.q));
      applyWork(s, r.scheduled);
    }
    expect(chunks).toEqual([
      [2, 2],
      [1, 3],
      [1, 3],
      [1, 2],
    ]);
  });

  it("chunking off: a prompt over the budget blocks the queue (head of line)", () => {
    const s = stateFor(
      toyConfig({
        scheduler: { chunkedPrefill: false, maxNumBatchedTokens: 16 },
        requests: [req(0, 20, 1), req(1, 5, 1)],
      }),
    );
    expect(work(schedule(s))).toEqual([]);
    expect(ids(s.waiting)).toEqual([0, 1]);
  });

  it("memory: the whole sequence must fit, even though only the chunk is allocated", () => {
    // 4 blocks of 4. The head needs 5 blocks for its 20 tokens; the next needs 1.
    const s = stateFor(
      toyConfig({
        kv: { numBlocks: 4 },
        scheduler: { maxNumBatchedTokens: 4, maxModelLen: 16 },
        requests: [req(0, 13, 1), req(1, 3, 1)],
      }),
    );
    const r = schedule(s);
    expect(work(r)).toEqual([[0, 4]]);
    expect(s.running[0]!.table).toHaveLength(1);
    // Request 1 would fit, but 0 reserved its whole sequence first: 4 blocks.
    expect(ids(s.waiting)).toEqual([1]);
  });
});

describe("schedule: preemption", () => {
  // Two 8-token prompts fill 4 blocks of 4. Growing r0 needs a fifth block.
  const full = () => {
    const s = stateFor(
      toyConfig({
        kv: { numBlocks: 4 },
        scheduler: { maxModelLen: 16 },
        requests: [req(0, 8, 8), req(1, 8, 8), req(2, 1, 1, 0)],
      }),
    );
    applyWork(s, schedule(s).scheduled);
    return s;
  };

  it("preempts the last admitted request and puts it at the front of waiting", () => {
    const s = full();
    expect(ids(s.running)).toEqual([0, 1]);
    expect(ids(s.waiting)).toEqual([2]);
    const r = schedule(s);
    expect(r.preempted).toBe(true);
    expect(work(r)).toEqual([[0, 1]]);
    expect(ids(s.waiting)).toEqual([1, 2]);
    const pre = s.events.filter((e) => e.type === "Preempt");
    expect(pre).toMatchObject([{ req: 1, lostTokens: 8 }]);
    expect(s.waiting[0]!.computed).toBe(0);
  });

  it("skips the waiting phase in a step that preempted", () => {
    const s = full();
    schedule(s);
    // Request 2 needs 1 block and 1 is free after the preemption, but it waits.
    expect(s.running.map((r) => r.spec.id)).toEqual([0]);
    expect(
      s.events.filter((e) => e.type === "Admit").map((e) => e.req),
    ).toEqual([0, 1]);
  });

  it("preempts the request being scheduled when it is the last one", () => {
    const s = full();
    // Make r1 the one that grows first: r0 is done decoding.
    s.running[0]!.generated = 0;
    s.running.reverse();
    const r = schedule(s);
    expect(r.preempted).toBe(true);
    expect(
      s.events.filter((e) => e.type === "Preempt").map((e) => e.req),
    ).toEqual([0]);
  });
});

describe("schedule: static batches", () => {
  const cfg = (requests: ReturnType<typeof req>[]) =>
    toyConfig({ scheduler: { policy: "static", maxNumSeqs: 2 }, requests });

  it("forms a batch only when none is open", () => {
    const s = stateFor(cfg([req(0, 4, 2), req(1, 4, 6), req(2, 4, 2)]));
    const first = schedule(s);
    expect(work(first)).toEqual([
      [0, 4],
      [1, 4],
    ]);
    applyWork(s, first.scheduled);
    // The batch is open, so request 2 waits.
    expect(work(schedule(s))).toEqual([
      [0, 1],
      [1, 1],
    ]);
    expect(ids(s.waiting)).toEqual([2]);
    // Request 0 is done but holds its slot; the batch is still open.
    const r0 = s.running.shift()!;
    r0.state = "done-in-batch";
    expect(work(schedule(s))).toEqual([[1, 1]]);
    expect(ids(s.waiting)).toEqual([2]);
    // Only an empty batch admits.
    s.running = [];
    s.batch = [];
    expect(work(schedule(s))).toEqual([[2, 4]]);
  });
});

describe("schedule: prefix cache", () => {
  it("caps a full hit at len − 1 rounded down to a block", () => {
    const s = stateFor(
      toyConfig({
        kv: { prefixCaching: true },
        requests: [req(0, 8, 1, 0, 7), req(1, 8, 1, 0, 7)],
      }),
    );
    const r = schedule(s);
    // Request 1 is admitted in the same step and hits block 0 only: cap 7 → 4.
    expect(s.events.filter((e) => e.type === "CacheHit")).toMatchObject([
      { req: 1, tokens: 4 },
    ]);
    expect(work(r)).toEqual([
      [0, 8],
      [1, 4],
    ]);
  });

  it("counts hit blocks at refCount 0 against free blocks", () => {
    // 5 blocks of 4. Request 0 stores 12 tokens (3 keyed blocks) and finishes.
    const s = stateFor(
      toyConfig({
        kv: { numBlocks: 5, prefixCaching: true },
        scheduler: { maxModelLen: 20 },
        requests: [req(0, 12, 1, 0, 7), req(1, 2, 9)],
      }),
    );
    const [r0, filler] = s.waiting as [
      (typeof s.waiting)[0] & object,
      (typeof s.waiting)[0] & object,
    ];
    applyWork(s, schedule(s).scheduled);
    s.paged!.release(r0.table);
    s.running = [filler]; // holds 1 block, so 4 are free, 3 of them cached
    // The same 12 tokens plus 5: hits 3 blocks, needs 2 new for 17 tokens.
    // New blocks alone (2) would fit in 4; with the 3 touched hits it is 5 > 4.
    const again = {
      ...r0,
      spec: { ...r0.spec, id: 2, prompt: [...r0.spec.prompt, 1, 2, 3, 4, 5] },
      table: [],
      keys: [],
      keyedBlocks: 0,
      state: "waiting" as const,
      computed: 0,
      generated: 0,
      everAdmitted: false,
    };
    s.waiting = [again];
    expect(schedule(s).scheduled.map((w) => w.req.spec.id)).toEqual([1]);
    expect(ids(s.waiting)).toEqual([2]);
  });
});
