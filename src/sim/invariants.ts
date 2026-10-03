/**
 * Invariants (docs/SIM.md §6), checked after every step when
 * `config.checkInvariants` is on, and always in property tests. A violation
 * throws InvariantError with its number. Invariant 6 (determinism) is a test,
 * not a per-step check.
 */
import type { Engine } from "./engine.ts";
import { seqLen, type Req } from "./scheduler.ts";
import type { SimEvent } from "./types.ts";

export class InvariantError extends Error {
  readonly invariant: number;
  readonly step: number;
  constructor(invariant: number, step: number, detail: string) {
    super(
      `invariant ${String(invariant)} failed at step ${String(step)}: ${detail}`,
    );
    this.name = "InvariantError";
    this.invariant = invariant;
    this.step = step;
  }
}

/** Throws on the first violation. `stepEvents` are the events of the step just run. */
export function checkInvariants(
  e: Engine,
  stepEvents: readonly SimEvent[],
): void {
  const fail = (n: number, detail: string): never => {
    throw new InvariantError(n, e.step, detail);
  };
  const holders = new Set<Req>([...e.running, ...e.batch]);
  const { blockSize: B } = e.config.kv;

  const pool = e.paged;
  if (pool) {
    // 1. Block accounting: the free queue holds exactly the blocks with
    //    refCount 0 (cached or free), each once.
    let zero = 0;
    for (let b = 0; b < pool.numBlocks; b++) {
      const rc = pool.refCount[b] ?? 0;
      if (rc < 0) fail(1, `block ${String(b)} has refCount ${String(rc)}`);
      if (rc === 0) zero++;
      if ((rc === 0) !== pool.free.has(b)) {
        fail(
          1,
          `block ${String(b)} (refCount ${String(rc)}) is ${pool.free.has(b) ? "" : "not "}in the free queue`,
        );
      }
    }
    if (zero !== pool.free.size) {
      fail(
        1,
        `${String(zero)} unused blocks but a free queue of ${String(pool.free.size)}`,
      );
    }

    // 2. Reference counts equal the block tables that hold each block.
    const counts = new Int32Array(pool.numBlocks);
    for (const r of holders) {
      for (const b of r.table) counts[b] = (counts[b] ?? 0) + 1;
    }
    for (let b = 0; b < pool.numBlocks; b++) {
      if (counts[b] !== pool.refCount[b]) {
        fail(
          2,
          `block ${String(b)}: refCount ${String(pool.refCount[b])}, held by ${String(counts[b])} tables`,
        );
      }
    }

    // 3. Block capacity: 0 ≤ filled ≤ B; every table block but the last is full.
    for (let b = 0; b < pool.numBlocks; b++) {
      const f = pool.filled[b] ?? 0;
      if (f < 0 || f > B)
        fail(3, `block ${String(b)} holds ${String(f)} of ${String(B)}`);
    }
    for (const r of holders) {
      r.table.slice(0, -1).forEach((b) => {
        if (pool.filled[b] !== B) {
          fail(
            3,
            `request ${String(r.spec.id)}: block ${String(b)} is not full but is not the last`,
          );
        }
      });
    }
  }

  // 4. KV tokens of every running request equal computedTokens, which is at
  //    most the sequence; a decoding request holds prompt + generated − 1.
  for (const r of e.running) {
    const held = pool
      ? r.table.reduce((s, b) => s + (pool.filled[b] ?? 0), 0)
      : (r.region?.used ?? 0);
    const id = String(r.spec.id);
    if (held !== r.computed) {
      fail(
        4,
        `request ${id} holds ${String(held)} tokens of KV but computed ${String(r.computed)}`,
      );
    }
    if (r.computed > seqLen(r))
      fail(4, `request ${id} computed past its sequence`);
    if (
      !r.prefilling &&
      r.computed !== r.spec.prompt.length + r.generated - 1
    ) {
      fail(
        4,
        `decoding request ${id} has computed ${String(r.computed)}, not prompt + generated − 1`,
      );
    }
  }

  // 5. Static never admits mid-batch.
  if (
    e.config.scheduler.policy === "static" &&
    e.batchOpenAtStart &&
    stepEvents.some((ev) => ev.type === "Admit")
  ) {
    fail(5, "a static batch admitted a request while open");
  }

  // 7. Contiguous regions do not overlap, sit inside capacity, and used ≤ len.
  if (e.contiguous) {
    let end = 0;
    for (const r of e.contiguous.view()) {
      if (r.start < end) fail(7, `region of request ${String(r.req)} overlaps`);
      if (r.start + r.len > e.contiguous.capacity)
        fail(7, "a region runs past capacity");
      if (r.used > r.len)
        fail(7, `request ${String(r.req)} used more than its region`);
      end = r.start + r.len;
    }
  }

  // 8. Queue discipline: preempted requests first, the most recent at the
  //    front (vLLM prepends each one); then the rest in (arrival, id) order.
  let seenFresh = false;
  let prev: Req | undefined;
  for (const r of e.waiting) {
    const fresh = r.preemptions === 0;
    if (!fresh && seenFresh)
      fail(8, `preempted request ${String(r.spec.id)} is behind a new one`);
    if (prev) {
      const ok = fresh
        ? prev.preemptions > 0 ||
          prev.spec.arrival < r.spec.arrival ||
          (prev.spec.arrival === r.spec.arrival && prev.spec.id < r.spec.id)
        : prev.preemptSeq > r.preemptSeq;
      if (!ok)
        fail(8, `request ${String(r.spec.id)} is out of order in waiting`);
    }
    seenFresh ||= fresh;
    prev = r;
  }

  // 9. Limits: tokens and requests per step.
  const sc = e.config.scheduler;
  for (const ev of stepEvents) {
    if (ev.type !== "StepEnd") continue;
    if (ev.tokens > sc.maxNumBatchedTokens)
      fail(9, `scheduled ${String(ev.tokens)} tokens`);
    if (ev.batch > sc.maxNumSeqs)
      fail(9, `scheduled ${String(ev.batch)} requests`);
  }
  const seats = sc.policy === "static" ? e.batch.length : e.running.length;
  if (seats > sc.maxNumSeqs) fail(9, `${String(seats)} requests hold seats`);
}
