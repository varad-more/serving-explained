/**
 * Chapter 4's figures by key, and every number its prose quotes. The prose
 * renders these through <Num>, so it cannot drift from the sim.
 */
import {
  createSim,
  metrics,
  PRESETS,
  type SimConfig,
  type SimEvent,
} from "../../sim/index.ts";
import { CacheFigure, cacheRun } from "./CacheFigure.tsx";
import { HashChain, sharedPrompt } from "./HashChain.tsx";
import { PartialBlocks, partialRows, sharedTokens } from "./PartialBlocks.tsx";
import {
  CAPACITIES,
  cacheConfig,
  CHECK,
  decodePair,
  FULL_HIT,
  PRESSURE,
  SELF_HIT,
  SHARED,
  sharers,
  SWEPT_FRACTIONS,
  SWEPT_PREFIX_LENS,
  UNIQUE,
  type CacheOptions,
  type PresetKey,
} from "./presets.ts";
import { RepeatedPrefill } from "./RepeatedPrefill.tsx";
import { decodeBatch, prefixPrefill, timeAverages } from "./stats.ts";
import "../paged-attention/paged-attention.css";
import "./prefix-caching.css";

/** Keys keep each mode's own state: the board reuses one slot for every step. */
export const figures = {
  repeated: () => <RepeatedPrefill />,
  chain: () => <HashChain />,
  hit: () => <CacheFigure key="hit" mode="hit" />,
  partial: () => <PartialBlocks />,
  pressure: () => <CacheFigure key="pressure" mode="pressure" />,
  compare: () => <CacheFigure key="compare" mode="compare" />,
};

interface Run {
  config: SimConfig;
  events: readonly SimEvent[];
  m: ReturnType<typeof metrics>;
}
const runs = new Map<string, Run>();
/** A run without frames, for numbers only. */
function run(preset: PresetKey, o: CacheOptions): Run {
  const key = JSON.stringify([preset, o]);
  let r = runs.get(key);
  if (!r) r = simulate(cacheConfig(preset, o));
  runs.set(key, r);
  return r;
}
function simulate(config: SimConfig): Run {
  const sim = createSim(config);
  sim.run();
  return { config, events: sim.events(), m: metrics(sim.events(), config) };
}

const on = run("shared-system-prompt", SHARED);
const off = run("shared-system-prompt", { ...SHARED, caching: false });
const pressure = run("cache-pressure", PRESSURE);
const L = SHARED.prefixLen;
const B = SHARED.blockSize;
const prefill = (r: Run) =>
  r.events.reduce((s, e) => s + (e.type === "PrefillChunk" ? e.tokens : 0), 0);
const hitRate = (r: Run) => r.m.summary.prefixHitRate ?? 0;
const repeated = prefixPrefill(off.config, off.events, L);
const memOn = timeAverages(on.events, B);
const memOff = timeAverages(off.events, B);

/** The most tables pointing at one block at once, over the run. */
function mostSharers() {
  let most = 0;
  for (const f of cacheRun("shared-system-prompt", SHARED).frames)
    for (const r of f.refCount) most = Math.max(most, r);
  return most;
}

/** Hit tokens per sharing request and the TTFT gap, per prefix length. */
const prefixSweep = SWEPT_PREFIX_LENS.map((prefixLen) => {
  const a = run("shared-system-prompt", { ...SHARED, prefixLen });
  const b = run("shared-system-prompt", {
    ...SHARED,
    prefixLen,
    caching: false,
  });
  const ids = new Set(
    [...sharers(a.config.requests, prefixLen).values()].flat().map((q) => q.id),
  );
  const first = new Map<number, number>();
  for (const e of a.events)
    if (e.type === "Admit" && !first.has(e.req))
      first.set(e.req, e.cachedTokens);
  const hits = [...ids].map((id) => first.get(id) ?? 0);
  return {
    prefixLen,
    hits: hits.length ? hits.reduce((s, x) => s + x, 0) / hits.length : 0,
    gap: b.m.summary.ttft.mean - a.m.summary.ttft.mean,
  };
});

const fullHit = simulate(FULL_HIT);
const selfHit = simulate(SELF_HIT);
const selfReadmit = (() => {
  const seen = new Set<number>();
  for (const e of selfHit.events)
    if (e.type === "Admit") {
      if (seen.has(e.req)) return { req: e.req, cached: e.cachedTokens };
      seen.add(e.req);
    }
  return { req: -1, cached: 0 };
})();
const unique = run("shared-system-prompt", UNIQUE);
const uniqueOff = run("shared-system-prompt", { ...UNIQUE, caching: false });
const pair = simulate(decodePair(true));
const sharedRows = partialRows();
const firstRow = sharedRows[0];
const lastRow = sharedRows.at(-1);

/** Names and numbers the prose quotes: all `simulated`. */
export const F = {
  requests: on.config.requests.length,
  rate: (() => {
    const { arrival } = PRESETS["shared-system-prompt"].workload;
    return arrival.kind === "poisson" ? arrival.ratePerS : 0;
  })(),
  prefixLen: L,
  fraction: 100 * SHARED.fraction,
  capacity: SHARED.capacity,
  blocks: SHARED.capacity / B,
  blockSize: B,
  maxNumSeqs: on.config.scheduler.maxNumSeqs,
  promptTokens: sharedPrompt().length,
  repeated: {
    sharers: repeated.sharers,
    preempted: repeated.preempted.length,
    times: repeated.sharers + repeated.preempted.length,
    tokens: repeated.tokens,
  },
  chain: {
    full: Math.floor(L / B),
    partial: L - Math.floor(L / B) * B,
  },
  hit: {
    ttftOn: on.m.summary.ttft.mean,
    ttftOff: off.m.summary.ttft.mean,
    prefillOn: prefill(on),
    prefillOff: prefill(off),
    perSharer: Math.floor(L / B) * B,
    mostSharers: mostSharers(),
    memOn: memOn.blocksPerRunning,
    memOff: memOff.blocksPerRunning,
    maxOn: memOn.maxRunning,
    maxOff: memOff.maxRunning,
    queueOn: memOn.queue,
    queueOff: memOff.queue,
    fractions: SWEPT_FRACTIONS.map((fraction) => ({
      fraction: 100 * fraction,
      rate: 100 * hitRate(run("shared-system-prompt", { ...SHARED, fraction })),
    })),
    sweep: prefixSweep,
  },
  partial: {
    rows: sharedRows,
    smallest: firstRow?.B ?? 0,
    largest: lastRow?.B ?? 0,
    sharedLargest: lastRow?.shared ?? 0,
    fullHitPrompt: FULL_HIT.requests[1]?.prompt.length ?? 0,
    fullHitTokens: (() => {
      for (const e of fullHit.events)
        if (e.type === "Admit" && e.req === 1) return e.cachedTokens;
      return 0;
    })(),
    fullHitBlock: FULL_HIT.kv.blockSize,
  },
  pressure: {
    prefixes: PRESSURE.groups,
    prefixLen: PRESSURE.prefixLen,
    capacity: PRESSURE.capacity,
    blocks: PRESSURE.capacity / PRESSURE.blockSize,
    needed: (PRESSURE.groups * PRESSURE.prefixLen) / PRESSURE.blockSize,
    rate: 100 * hitRate(pressure),
    sharedRate: 100 * hitRate(on),
    evictions: pressure.m.summary.evictions,
    capacities: CAPACITIES.map((capacity) => ({
      capacity,
      rate: 100 * hitRate(run("cache-pressure", { ...PRESSURE, capacity })),
    })),
  },
  myth: {
    uniquePreemptions:
      unique.m.summary.preemptions + uniqueOff.m.summary.preemptions,
    uniqueRate: 100 * hitRate(unique),
    selfReq: selfReadmit.req,
    selfCached: selfReadmit.cached,
    pairHit: (() => {
      for (const e of pair.events)
        if (e.type === "Admit" && e.req === 1) return e.cachedTokens;
      return 0;
    })(),
    p50On: on.m.summary.itl.p50,
    p50Off: off.m.summary.itl.p50,
    p99On: on.m.summary.itl.p99,
    p99Off: off.m.summary.itl.p99,
    batchOn: decodeBatch(on.events),
    batchOff: decodeBatch(off.events),
  },
  check: {
    prefixLen: CHECK.prefixLen,
    blockSize: CHECK.blockSize,
    shared: sharedTokens(CHECK.blockSize, CHECK.prefixLen),
  },
};
