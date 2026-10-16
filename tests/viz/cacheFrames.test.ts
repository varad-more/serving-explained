/**
 * Chapter 4's frames (src/chapters/prefix-caching/cacheFrames.ts) are
 * rebuilt from the event log; here every frame is checked against the
 * engine's own snapshot after the same step.
 */
import { describe, expect, it } from "vitest";
import {
  buildCacheFrames,
  simulateCache,
} from "../../src/chapters/prefix-caching/cacheFrames.ts";
import { cacheCells } from "../../src/chapters/prefix-caching/cells.ts";
import {
  cacheConfig,
  PRESSURE,
  SELF_HIT,
  SHARED,
  UNIQUE,
} from "../../src/chapters/prefix-caching/presets.ts";
import {
  createSim,
  type PagedView,
  type SimConfig,
  type SimSnapshot,
} from "../../src/sim/index.ts";

const CONFIGS: Record<string, SimConfig> = {
  shared: cacheConfig("shared-system-prompt", SHARED),
  "shared, off": cacheConfig("shared-system-prompt", {
    ...SHARED,
    caching: false,
  }),
  "shared, B 8": cacheConfig("shared-system-prompt", {
    ...SHARED,
    blockSize: 8,
  }),
  pressure: cacheConfig("cache-pressure", PRESSURE),
  unique: cacheConfig("shared-system-prompt", UNIQUE),
  "self-hit": SELF_HIT,
};

describe("cache frames", () => {
  for (const [name, config] of Object.entries(CONFIGS)) {
    it(`${name}: every frame matches the engine's snapshot`, () => {
      const sim = createSim(config);
      const snaps: SimSnapshot[] = [];
      let done = false;
      while (!done) {
        done = sim.step().done;
        snaps.push(sim.snapshot());
      }
      const frames = buildCacheFrames(sim.events(), config);
      expect(frames).toHaveLength(snaps.length);
      frames.forEach((f, i) => {
        const snap = snaps[i];
        if (!snap) throw new Error("missing snapshot");
        const kv = snap.kv as PagedView;
        expect([...f.refCount]).toEqual(kv.refCount);
        expect([...f.hash].map((h) => (Number.isNaN(h) ? null : h))).toEqual(
          kv.hash,
        );
        const rank = new Array<number>(kv.numBlocks).fill(0);
        let r = 0;
        for (const b of kv.freeQueue) if (kv.hash[b] !== null) rank[b] = ++r;
        expect([...f.rank]).toEqual(rank);
        const held = snap.requests.filter(
          (q) => (q.blockTable?.length ?? 0) > 0,
        );
        expect(
          [...f.holders].sort((a, b) => a.req - b.req).map((h) => h.req),
        ).toEqual(held.map((q) => q.id));
        for (const h of f.holders) {
          const q = held.find((x) => x.id === h.req);
          expect(h.blocks).toEqual(q?.blockTable);
          expect(h.computed).toBe(q?.computedTokens);
        }
        expect(f.evictions).toBe(snap.counters.evictions);
        expect(f.preemptions).toBe(snap.counters.preemptions);
      });
    });
  }

  it("the last frame's hit rate is metrics()' prefixHitRate", () => {
    const run = simulateCache(CONFIGS.shared ?? SELF_HIT);
    const last = run.frames.at(-1);
    expect(last).toBeDefined();
    expect((last?.hitTokens ?? 0) / (last?.queryTokens ?? 1)).toBe(
      run.m.summary.prefixHitRate,
    );
  });

  it("cells agree with reference counts and keys", () => {
    const run = simulateCache(CONFIGS.pressure ?? SELF_HIT);
    const { numBlocks, blockSize } = run.config.kv;
    let shared = 0;
    let cached = 0;
    for (const f of run.frames) {
      const cells = cacheCells(f, numBlocks, blockSize);
      cells.forEach((c, b) => {
        const ref = f.refCount[b] ?? 0;
        if (c.kind === "shared") {
          shared++;
          expect(c.reqs).toHaveLength(ref);
        } else if (c.kind === "held") expect(ref).toBe(1);
        else if (c.kind === "cached") {
          cached++;
          expect(ref).toBe(0);
          expect(Number.isNaN(f.hash[b] ?? NaN)).toBe(false);
        } else expect(ref).toBe(0);
      });
    }
    expect(shared).toBeGreaterThan(0);
    expect(cached).toBeGreaterThan(0);
  });
});
