/**
 * frames-match-snapshots (tasks/todo.md, Prompt 4; AUDIT.md m18): chapter 2's
 * frames are rebuilt from the event log alone. At every step they must match
 * the engine's own snapshot, so the grid draws what the engine did. Not a
 * claim test, so it sits outside the chapter's meta-test.
 */
import { describe, expect, it } from "vitest";
import { buildFrames } from "../../src/chapters/paged-attention/frames.ts";
import {
  BLOCK_SIZES,
  compareConfig,
  DEFAULTS,
  SHARED_BLOCKS,
} from "../../src/chapters/paged-attention/presets.ts";
import {
  createSim,
  type PagedView,
  type SimConfig,
} from "../../src/sim/index.ts";

function check(config: SimConfig) {
  const sim = createSim(config);
  const snaps = [];
  let done = false;
  while (!done) {
    done = sim.step().done;
    snaps.push(sim.snapshot());
  }
  const frames = buildFrames(sim.events(), config);
  expect(frames).toHaveLength(snaps.length);
  const B = config.kv.blockSize;

  snaps.forEach((snap, i) => {
    const f = frames[i];
    if (!f) throw new Error(`no frame ${String(i)}`);
    // A snapshot's step counts the steps run; a StepEnd's is its index.
    expect(f.step + 1).toBe(snap.step);
    expect(f.t).toBe(snap.time);
    expect(f.running).toBe(snap.running.length);
    expect(f.waiting).toBe(snap.waiting.length);
    expect(f.preemptions).toBe(snap.counters.preemptions);

    const holding = snap.requests.filter(
      (r) => (r.blockTable?.length ?? 0) > 0 || r.region !== null,
    );
    expect(f.holders.map((h) => h.req).sort((a, b) => a - b)).toEqual(
      holding.map((r) => r.id).sort((a, b) => a - b),
    );
    for (const r of holding) {
      const h = f.holders.find((x) => x.req === r.id);
      expect(h?.computed).toBe(r.computedTokens);
      if (r.region) {
        expect(h?.region).toEqual({ start: r.region.start, len: r.region.len });
      } else {
        expect(h?.blocks).toEqual(r.blockTable);
        // Each block's fill, as the grid computes it, matches the pool.
        const kv = snap.kv as PagedView;
        h?.blocks.forEach((block, j) => {
          const fill = Math.min(B, Math.max(0, h.computed - j * B));
          expect(fill).toBe(kv.filled[block]);
        });
      }
    }
    // Slots are 1–8 and never shared by two live requests.
    const slots = f.holders.map((h) => h.slot);
    expect(new Set(slots).size).toBe(slots.length);
    expect(slots.every((s) => s >= 1 && s <= 8)).toBe(true);
  });
}

describe("frames-match-snapshots", () => {
  it("contiguous, at the default settings", () => {
    check(compareConfig("contiguous-max"));
  });
  for (const blockSize of BLOCK_SIZES) {
    it(`paged, at block size ${String(blockSize)}`, () => {
      check(compareConfig("paged", { ...DEFAULTS, blockSize }));
    });
  }
  it("paged, with a busier, more varied workload (preemptions)", () => {
    check(compareConfig("paged", { ...DEFAULTS, rate: 3, sigma: 1 }));
  });
  it("the shared-blocks teaser, with prefix caching on", () => {
    check(SHARED_BLOCKS);
  });
});
