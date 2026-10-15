/**
 * Chapter 2's claims (tasks/todo.md, "Prompt 4: paged attention chapter").
 * One test per <Claim id>, each run on the exact configs the chapter imports.
 * If a test fails, the prose is wrong: never reword a claim or loosen a test
 * to make it pass (CLAUDE.md).
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  buildFrames,
  meanOver,
  meanTableLength,
  peakRunning,
  wasteShare,
  type Frame,
} from "../../src/chapters/paged-attention/frames.ts";
import {
  BLOCK_SIZES,
  compareConfig,
  MAX_MODEL_LENS,
  DEFAULTS,
  RAISED_MAX_MODEL_LEN,
  SHARED_BLOCKS,
  TABLE_FIGURE,
  WINDOW_S,
  type Allocator,
  type CompareOptions,
} from "../../src/chapters/paged-attention/presets.ts";
import {
  createSim,
  hashEvents,
  type ContiguousView,
  type PagedView,
  type SimConfig,
  type SimEvent,
  type SimSnapshot,
} from "../../src/sim/index.ts";

function run(allocator: Allocator, options: CompareOptions = DEFAULTS) {
  const config = compareConfig(allocator, options);
  const sim = createSim({ ...config, checkInvariants: true });
  sim.run();
  const events = sim.events();
  return { config, events, frames: buildFrames(events, config) };
}

/** Every step's snapshot, with the step's own StepEnd. */
function* stepped(config: SimConfig) {
  const sim = createSim(config);
  let done = false;
  while (!done) {
    done = sim.step().done;
    const end = sim.events().at(-1) as Extract<SimEvent, { type: "StepEnd" }>;
    yield { snap: sim.snapshot(), end };
  }
}

const paged = run("paged");
const contiguous = run("contiguous-max");
const meanWaste = (frames: readonly Frame[]) =>
  meanOver(frames, wasteShare, WINDOW_S);
/** The last frame at or before t. */
const at = (frames: readonly Frame[], t: number) =>
  frames.filter((f) => f.t <= t).at(-1);
const strictly = (xs: number[], dir: 1 | -1) =>
  xs.every((x, i) => i === 0 || dir * (x - (xs[i - 1] ?? 0)) > 0);

const CLAIMS: Record<string, () => void> = {
  "contiguous-wastes-most": () => {
    // Over the first 20 s, contiguous wastes more than half of the pool.
    expect(meanWaste(contiguous.frames)).toBeGreaterThan(0.5);
  },

  "contiguous-waste-split": () => {
    // Contiguous waste = reserved slots holding no KV + free space too small
    // for a region. The total comes independently from the snapshot regions:
    // capacity − tokens held − free space that can still take a region.
    const M = DEFAULTS.maxModelLen;
    for (const { snap, end } of stepped(compareConfig("contiguous-max"))) {
      const kv = snap.kv as ContiguousView;
      const regions = [...kv.regions].sort((a, b) => a.start - b.start);
      let usableFree = 0;
      let from = 0;
      for (const r of [...regions, { start: kv.capacity, len: 0 }]) {
        if (r.start - from >= M) usableFree += r.start - from;
        from = r.start + r.len;
      }
      const held = regions.reduce((s, r) => s + r.used, 0);
      const split = end.kv.allocated - end.kv.tokens + end.kv.unusable;
      expect(split).toBe(kv.capacity - held - usableFree);
    }
  },

  "only-tail-gap": () => {
    // At every max_model_len option and every step, the only free space too
    // small for a region is the leftover at the end of the pool.
    for (const M of MAX_MODEL_LENS) {
      const config = compareConfig("contiguous-max", {
        ...DEFAULTS,
        maxModelLen: M,
      });
      for (const { snap, end } of stepped(config)) {
        const kv = snap.kv as ContiguousView;
        const regions = [...kv.regions].sort((a, b) => a.start - b.start);
        let from = 0;
        for (const r of regions) {
          // Every space between regions fits a region exactly.
          expect((r.start - from) % M).toBe(0);
          from = r.start + r.len;
        }
        expect([0, kv.capacity % M]).toContain(end.kv.unusable);
      }
    }
  },

  "paged-on-demand": () => {
    // At every step, every block in a table except the last is full.
    const B = DEFAULTS.blockSize;
    for (const { snap } of stepped(compareConfig("paged"))) {
      const kv = snap.kv as PagedView;
      for (const r of snap.requests) {
        for (const b of (r.blockTable ?? []).slice(0, -1)) {
          expect(kv.filled[b]).toBe(B);
        }
      }
    }
  },

  "paged-waste-bound": () => {
    // At every step and every block size, a request's empty slots are at
    // most B − 1: blocks × B − tokens held ≤ B − 1.
    for (const B of BLOCK_SIZES) {
      const config = compareConfig("paged", { ...DEFAULTS, blockSize: B });
      for (const { snap } of stepped(config)) {
        for (const r of snap.requests) {
          const n = r.blockTable?.length ?? 0;
          if (n === 0) continue;
          expect(n * B - r.computedTokens).toBeLessThanOrEqual(B - 1);
          expect(n * B - r.computedTokens).toBeGreaterThanOrEqual(0);
        }
      }
    }
  },

  "table-scattered": () => {
    // At the step-4 figure's step, no two of the request's physical blocks
    // are neighbors in memory.
    const f = paged.frames.find((x) => x.step === TABLE_FIGURE.step);
    const h = f?.holders.find((x) => x.req === TABLE_FIGURE.req);
    expect(h?.blocks.length).toBeGreaterThanOrEqual(3);
    const blocks = [...(h?.blocks ?? [])].sort((a, b) => a - b);
    for (let i = 1; i < blocks.length; i++) {
      expect((blocks[i] ?? 0) - (blocks[i - 1] ?? 0)).toBeGreaterThan(1);
    }
  },

  "paged-admits-more": () => {
    // Paged reaches the max_num_seqs cap; contiguous runs at most 2 and
    // never preempts.
    expect(peakRunning(paged.frames)).toBe(
      compareConfig("paged").scheduler.maxNumSeqs,
    );
    expect(peakRunning(contiguous.frames)).toBe(2);
    expect(contiguous.frames.at(-1)?.preemptions).toBe(0);
  },

  "paged-less-waste": () => {
    // Over the first 20 s, paged wastes less than contiguous.
    expect(meanWaste(paged.frames)).toBeLessThan(meanWaste(contiguous.frames));
  },

  "visible-in-20s": () => {
    // docs/SIM.md §7's three targets: within 20 s, contiguous peaks at 2
    // running with a growing queue; paged reaches at least 6 running; paged
    // preempts at most twice over the whole run.
    expect(peakRunning(contiguous.frames, 20)).toBe(2);
    const q10 = at(contiguous.frames, 10)?.waiting ?? 0;
    const q20 = at(contiguous.frames, 20)?.waiting ?? 0;
    expect(q10).toBeGreaterThan(0);
    expect(q20).toBeGreaterThan(q10);
    expect(peakRunning(paged.frames, 20)).toBeGreaterThanOrEqual(6);
    expect(paged.frames.at(-1)?.preemptions).toBeLessThanOrEqual(2);
  },

  "block-size-raises-waste": () => {
    // Mean paged waste over the first 20 s rises strictly with block size.
    const waste = BLOCK_SIZES.map((B) =>
      meanWaste(run("paged", { ...DEFAULTS, blockSize: B }).frames),
    );
    expect(strictly(waste, 1)).toBe(true);
  },

  "block-size-shortens-tables": () => {
    // Mean table length per request holding blocks falls as B rises.
    const lengths = BLOCK_SIZES.map((B) =>
      meanOver(
        run("paged", { ...DEFAULTS, blockSize: B }).frames,
        meanTableLength,
        WINDOW_S,
      ),
    );
    expect(strictly(lengths, -1)).toBe(true);
  },

  "max-model-len-hurts-contiguous-only": () => {
    // At max_model_len 1024, contiguous runs at most 1 request, and the paged
    // run is the same event for event as at 512.
    const raised = { ...DEFAULTS, maxModelLen: RAISED_MAX_MODEL_LEN };
    expect(peakRunning(run("contiguous-max", raised).frames)).toBe(1);
    expect(hashEvents(run("paged", raised).events)).toBe(
      hashEvents(paged.events),
    );
  },

  "checkyourself-block-size": () => {
    // At the largest block size, no request holds more than B − 1 empty
    // slots; mean waste is higher and tables are shorter than at the default.
    const B = BLOCK_SIZES[BLOCK_SIZES.length - 1] ?? 0;
    const big = { ...DEFAULTS, blockSize: B };
    for (const { snap } of stepped(compareConfig("paged", big))) {
      for (const r of snap.requests) {
        const n = r.blockTable?.length ?? 0;
        if (n > 0) expect(n * B - r.computedTokens).toBeLessThanOrEqual(B - 1);
      }
    }
    const atDefault = run("paged").frames;
    const atBig = run("paged", big).frames;
    expect(meanWaste(atBig)).toBeGreaterThan(meanWaste(atDefault));
    expect(meanOver(atBig, meanTableLength, WINDOW_S)).toBeLessThan(
      meanOver(atDefault, meanTableLength, WINDOW_S),
    );
  },

  "shared-refcount": () => {
    // While both requests run, their tables share the prefix's two blocks,
    // each with reference count 2.
    let both = 0;
    for (const { snap } of stepped(SHARED_BLOCKS)) {
      const running = snap.requests.filter((r) => r.state === "running");
      if (running.length < 2) continue;
      both++;
      const [a, b] = running as [
        SimSnapshot["requests"][number],
        SimSnapshot["requests"][number],
      ];
      const shared = (a.blockTable ?? []).slice(0, 2);
      expect((b.blockTable ?? []).slice(0, 2)).toEqual(shared);
      const kv = snap.kv as PagedView;
      for (const block of shared) expect(kv.refCount[block]).toBe(2);
    }
    expect(both).toBeGreaterThan(0);
  },
};

describe("chapter 2 claims", () => {
  for (const [id, test] of Object.entries(CLAIMS)) it(id, test);
});

describe("chapter 2 claim ids", () => {
  it("match the <Claim> ids in the chapter exactly (meta-test)", () => {
    const mdx = readFileSync("src/chapters/paged-attention/index.mdx", "utf8");
    const used = new Set(
      [...mdx.matchAll(/<Claim\s+id="([^"]+)"/g)].map((m) => m[1]),
    );
    expect([...used].sort()).toEqual(Object.keys(CLAIMS).sort());
  });
});
