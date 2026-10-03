/**
 * Property tests (docs/SIM.md §10): random small configs and workloads, with
 * every invariant checked after every step.
 */
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { createSim } from "../../src/sim/engine.ts";
import { hashEvents } from "../../src/sim/hash.ts";
import type { RequestSpec, SimConfig } from "../../src/sim/types.ts";
import { toyConfig } from "./helpers.ts";

/** A valid config: block size 1–8, 4–64 blocks, every allocator, policy, and toggle. */
const configs = fc
  .record({
    blockSize: fc.integer({ min: 1, max: 8 }),
    numBlocks: fc.integer({ min: 4, max: 64 }),
    allocator: fc.constantFrom("paged", "contiguous-max"),
    policy: fc.constantFrom("static", "continuous"),
    caching: fc.boolean(),
    chunked: fc.boolean(),
    maxNumSeqs: fc.integer({ min: 1, max: 16 }),
    budgetExtra: fc.integer({ min: 0, max: 48 }),
    seed: fc.integer({ min: 0, max: 1000 }),
  })
  .chain((c) => {
    const capacity = c.blockSize * c.numBlocks;
    return fc.record({
      c: fc.constant(c),
      // Often near the pool's size, so whole sequences compete for memory.
      maxModelLen: fc.oneof(
        fc.integer({ min: 2, max: Math.min(capacity, 96) }),
        fc.integer({
          min: Math.max(2, Math.min(capacity, 96) - 8),
          max: Math.min(capacity, 96),
        }),
      ),
    });
  })
  .chain(({ c, maxModelLen }) =>
    fc
      .array(
        fc.record({
          arrival: fc.integer({ min: 0, max: 16 }).map((x) => x / 4),
          // Short prompts with long outputs grow past memory after admission.
          promptLen: fc.oneof(
            fc.integer({ min: 1, max: maxModelLen - 1 }),
            fc.integer({
              min: 1,
              max: Math.max(1, Math.floor(maxModelLen / 4)),
            }),
          ),
          outputFrac: fc.oneof(
            fc.double({ min: 0, max: 1, noNaN: true }),
            fc.double({ min: 0.7, max: 1, noNaN: true }),
          ),
          // A tiny vocabulary, so prompts share prefixes and the cache gets hits.
          tokens: fc.array(fc.integer({ min: 0, max: 2 }), {
            minLength: 96,
            maxLength: 96,
          }),
        }),
        // Biased toward many requests, so memory fills and preemption happens.
        { minLength: 1, maxLength: 40, size: "max" },
      )
      .map((rs): SimConfig => {
        const requests: RequestSpec[] = rs.map((r, id) => ({
          id,
          arrival: r.arrival,
          prompt: r.tokens.slice(0, r.promptLen),
          outputLen:
            1 + Math.floor(r.outputFrac * (maxModelLen - r.promptLen - 1)),
        }));
        const budget = c.chunked
          ? 1 + c.budgetExtra
          : maxModelLen + c.budgetExtra;
        return toyConfig({
          seed: c.seed,
          requests,
          kv: {
            allocator: c.allocator,
            numBlocks: c.numBlocks,
            blockSize: c.blockSize,
            prefixCaching: c.allocator === "paged" && c.caching,
          },
          scheduler: {
            policy: c.policy,
            maxNumSeqs: c.maxNumSeqs,
            maxNumBatchedTokens: budget,
            chunkedPrefill: c.chunked,
            maxModelLen,
          },
        });
      }),
  );

describe("properties", () => {
  it("every invariant holds after every step, every request finishes, all tokens are decoded", () => {
    const seen = {
      preempt: 0,
      hit: 0,
      evict: 0,
      static: 0,
      contiguous: 0,
      chunked: 0,
    };
    fc.assert(
      fc.property(configs, (config) => {
        const sim = createSim({ ...config, checkInvariants: true });
        const end = sim.run(undefined, 200_000);
        expect(end.done).toBe(true);
        const events = sim.events();
        expect(events.filter((e) => e.type === "Reject")).toEqual([]);
        expect(events.filter((e) => e.type === "Finish")).toHaveLength(
          config.requests.length,
        );
        const decoded = events.filter((e) => e.type === "DecodeToken").length;
        expect(decoded).toBe(
          config.requests.reduce((s, r) => s + r.outputLen, 0),
        );
        if (events.some((e) => e.type === "Preempt")) seen.preempt++;
        if (events.some((e) => e.type === "CacheHit")) seen.hit++;
        if (events.some((e) => e.type === "Evict")) seen.evict++;
        if (config.scheduler.policy === "static") seen.static++;
        if (config.kv.allocator === "contiguous-max") seen.contiguous++;
        if (events.some((e) => e.type === "PrefillChunk" && e.start > 0)) {
          seen.chunked++;
        }
      }),
      { numRuns: 300 },
    );
    // The generator must reach the interesting paths, not just easy runs.
    console.log(`properties: runs with ${JSON.stringify(seen)}`);
    for (const n of Object.values(seen)) expect(n).toBeGreaterThan(10);
  });

  it("is deterministic: two runs of the same config give the same log hash (invariant 6)", () => {
    fc.assert(
      fc.property(configs, (config) => {
        const a = createSim(config);
        const b = createSim(config);
        a.run();
        b.run();
        expect(hashEvents(a.events())).toBe(hashEvents(b.events()));
      }),
      { numRuns: 100 },
    );
  });
});
