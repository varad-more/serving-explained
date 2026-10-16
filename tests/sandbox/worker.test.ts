/**
 * The sandbox worker's handler, called directly: the message order, frames
 * equal to the engine's snapshot at the same step, event windows, and the
 * done message's log hash.
 */
import { describe, expect, it } from "vitest";
import {
  createSim,
  hashEvents,
  type ContiguousView,
  type PagedView,
  type SimSnapshot,
} from "../../src/sim/index.ts";
import { buildConfig } from "../../src/viz/sandbox/build.ts";
import {
  presetSandbox,
  V1_DEFAULTS,
  type SandboxConfig,
} from "../../src/viz/sandbox/params.ts";
import type { FromWorker } from "../../src/viz/sandbox/protocol.ts";
import { createRunner } from "../../src/viz/sandbox/runner.ts";

/** A fake clock that moves 10 ms per read, so runs split into many slices. */
function fakeEnv() {
  let now = 0;
  return {
    now: () => (now += 10),
    yield: () => Promise.resolve(),
  };
}

async function runAll(config: SandboxConfig) {
  const out: FromWorker[] = [];
  const handle = createRunner((m) => out.push(m), fakeEnv());
  await handle({ type: "run", config });
  return { out, handle };
}

function snapshots(config: SandboxConfig) {
  const built = buildConfig(config);
  if (!built.ok) throw new Error(built.message);
  const sim = createSim(built.config);
  const snaps: SimSnapshot[] = [];
  let done = false;
  while (!done) {
    done = sim.step().done;
    snaps.push(sim.snapshot());
  }
  return { snaps, hash: hashEvents(sim.events()) };
}

const CONFIGS: Record<string, SandboxConfig> = {
  "shared-system-prompt": presetSandbox("shared-system-prompt"),
  "cache-pressure": presetSandbox("cache-pressure"),
  "contiguous-max": {
    ...presetSandbox("paged-vs-contiguous"),
    al: "contiguous-max",
  },
  "the defaults, 120 requests": { ...V1_DEFAULTS, n: 120 },
};

describe("sandbox worker", () => {
  for (const [name, config] of Object.entries(CONFIGS)) {
    it(`${name}: progress and batches, then done with the run's hash`, async () => {
      const { out } = await runAll(config);
      const types = out.map((m) => m.type);
      expect(types.at(-1)).toBe("done");
      // Pairs of progress and batch, then done, and nothing after it.
      const body = types.slice(0, -1);
      expect(body.length).toBeGreaterThanOrEqual(4);
      body.forEach((t, i) => {
        expect(t).toBe(i % 2 === 0 ? "progress" : "batch");
      });
      const done = out.at(-1);
      if (done?.type !== "done") throw new Error("no done");
      expect(done.hash).toBe(snapshots(config).hash);
      // The batches together hold one row per step.
      const rows = out.reduce(
        (s, m) => s + (m.type === "batch" ? m.series.t.length : 0),
        0,
      );
      expect(rows).toBe(done.steps);
    });

    it(`${name}: frames match the engine's snapshot`, async () => {
      const { out, handle } = await runAll(config);
      const { snaps } = snapshots(config);
      const done = out.at(-1);
      if (done?.type !== "done") throw new Error("no done");
      const picks = [
        0,
        1,
        7,
        Math.floor(snaps.length / 3),
        Math.floor(snaps.length / 2),
        snaps.length - 1,
      ];
      for (const i of picks) {
        const snap = snaps[i];
        if (!snap) continue;
        out.length = 0;
        await handle({ type: "frame", t: snap.time });
        const f = out[0];
        if (f?.type !== "frame") throw new Error("no frame");
        if (snap.kv.kind === "paged") {
          const kv: PagedView = snap.kv;
          let rank = 0;
          const ranks = new Map<number, number>();
          for (const b of kv.freeQueue)
            if (kv.hash[b] !== null) ranks.set(b, ++rank);
          for (let b = 0; b < kv.numBlocks; b++) {
            const ref = kv.refCount[b] ?? 0;
            const kind = ref >= 2 ? 2 : ref === 1 ? 1 : ranks.has(b) ? 3 : 0;
            expect(
              f.cells.kind[b],
              `step ${String(i)} block ${String(b)}`,
            ).toBe(kind);
            if (kind === 2) expect(f.cells.count[b]).toBe(ref);
            if (kind === 3) expect(f.cells.count[b]).toBe(ranks.get(b));
          }
          const held = snap.requests.filter(
            (q) => (q.blockTable?.length ?? 0) > 0,
          );
          expect(f.holders.map((h) => h.req).sort((a, b) => a - b)).toEqual(
            held.map((q) => q.id),
          );
          for (const h of f.holders)
            expect(h.blocks).toEqual(
              held.find((q) => q.id === h.req)?.blockTable,
            );
        } else {
          const kv: ContiguousView = snap.kv;
          expect(
            f.holders
              .map((h) => [h.req, h.region?.start, h.region?.len])
              .sort((a, b) => (a[0] ?? 0) - (b[0] ?? 0)),
          ).toEqual(
            kv.regions
              .map((r) => [r.req, r.start, r.len])
              .sort((a, b) => (a[0] ?? 0) - (b[0] ?? 0)),
          );
        }
        expect(f.running).toBe(snap.running.length);
        expect(f.waiting).toBe(snap.waiting.length);
      }
    });
  }

  it("an event window holds exactly the events in it", async () => {
    const config = CONFIGS["shared-system-prompt"] ?? V1_DEFAULTS;
    const { out, handle } = await runAll(config);
    const done = out.at(-1);
    if (done?.type !== "done") throw new Error("no done");
    out.length = 0;
    await handle({ type: "events", t0: 5, t1: 5.5 });
    const msg = out[0];
    if (msg?.type !== "events") throw new Error("no events");
    const built = buildConfig(config);
    if (!built.ok) throw new Error(built.message);
    const sim = createSim(built.config);
    sim.run();
    const want = sim.events().filter((e) => e.t >= 5 && e.t <= 5.5);
    expect(msg.columns.t.length).toBe(want.length);
    expect([...msg.columns.step]).toEqual(want.map((e) => e.step));
    expect(msg.columns.truncated).toBe(false);
  });

  it("a config that cannot fit one request gives its error, not a run", async () => {
    const { out } = await runAll({ ...V1_DEFAULTS, m: "llama-3.1-70b" });
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({
      type: "error",
      code: "weights-exceed-budget",
    });
  });
});
