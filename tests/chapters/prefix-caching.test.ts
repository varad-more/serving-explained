/**
 * Chapter 4's claims (tasks/todo.md, "Prompt 6: prefix caching chapter").
 * One test per <Claim id>, each run on the exact configs the chapter imports.
 * If a test fails, the prose is wrong: never reword a claim or loosen a test
 * to make it pass (CLAUDE.md).
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  BLOCK_SIZES,
  CAPACITIES,
  cacheConfig,
  CHECK,
  decodePair,
  FULL_HIT,
  PRESSURE,
  REPEATED_FIGURE,
  SELF_HIT,
  SHARED,
  sharers,
  SWEPT_FRACTIONS,
  SWEPT_PREFIX_LENS,
  UNIQUE,
  type CacheOptions,
  type PresetKey,
} from "../../src/chapters/prefix-caching/presets.ts";
import {
  decodeBatch,
  prefixPrefill,
  timeAverages,
} from "../../src/chapters/prefix-caching/stats.ts";
import {
  blockKeys,
  createSim,
  metrics,
  type PagedView,
  type SimConfig,
  type SimEvent,
} from "../../src/sim/index.ts";

type Ev<T extends SimEvent["type"]> = Extract<SimEvent, { type: T }>;

function simulate(config: SimConfig) {
  const sim = createSim({ ...config, checkInvariants: true });
  sim.run();
  const events = sim.events();
  return { config, events, m: metrics(events, config) };
}
type Run = ReturnType<typeof simulate>;

const runs = new Map<string, Run>();
function run(preset: PresetKey, o: CacheOptions): Run {
  const key = JSON.stringify([preset, o]);
  let r = runs.get(key);
  if (!r) {
    r = simulate(cacheConfig(preset, o));
    runs.set(key, r);
  }
  return r;
}

/** Every step's snapshot, with that step's events. */
function* stepped(config: SimConfig) {
  const sim = createSim(config);
  let done = false;
  let from = 0;
  while (!done) {
    done = sim.step().done;
    const all = sim.events();
    const events = all.slice(from);
    from = all.length;
    yield { snap: sim.snapshot(), events };
  }
}

const strictly = (xs: readonly number[]) =>
  xs.every((x, i) => i === 0 || x > (xs[i - 1] ?? 0));
const mean = (xs: readonly number[]) =>
  xs.length === 0 ? 0 : xs.reduce((s, x) => s + x, 0) / xs.length;
const ofType = <T extends SimEvent["type"]>(
  events: readonly SimEvent[],
  type: T,
) => events.filter((e): e is Ev<T> => e.type === type);

/** The members of the single shared prefix, and its tokens. */
function onePrefix(config: SimConfig, length: number) {
  const groups = [...sharers(config.requests, length).values()];
  expect(groups.length).toBe(1);
  const members = groups[0] ?? [];
  return {
    members,
    ids: new Set(members.map((m) => m.id)),
    tokens: members[0]?.prompt.slice(0, length) ?? [],
  };
}

/** Each request's cached tokens at its first admission. */
function firstHits(events: readonly SimEvent[]) {
  const hit = new Map<number, number>();
  for (const e of ofType(events, "Admit"))
    if (!hit.has(e.req)) hit.set(e.req, e.cachedTokens);
  return hit;
}

/**
 * Replays the free queue from the log (head first) and checks it against the
 * engine's snapshot after every step. `onPop` sees each popped block, the
 * keyed (cached) blocks, and the queue just before the pop. Popping a keyed
 * block is an eviction.
 */
function replayFreeQueue(
  config: SimConfig,
  onPop: (
    block: number,
    keyed: ReadonlySet<number>,
    queue: readonly number[],
  ) => void,
) {
  const n = config.kv.numBlocks;
  let queue = Array.from({ length: n }, (_, b) => b);
  const ref = new Array<number>(n).fill(0);
  const keyed = new Set<number>();
  let evictions = 0;
  for (const { snap, events } of stepped(config)) {
    for (const e of events) {
      if (e.type === "CacheHit")
        for (const b of e.blocks) {
          if (ref[b] === 0) queue = queue.filter((x) => x !== b);
          ref[b] = (ref[b] ?? 0) + 1;
        }
      if (e.type === "Evict") evictions++;
      if (e.type === "Allocate" && "blocks" in e)
        for (const b of e.blocks) {
          expect(queue[0]).toBe(b);
          onPop(b, keyed, queue);
          queue.shift();
          keyed.delete(b);
          ref[b] = 1;
        }
      if (e.type === "CacheInsert") keyed.add(e.block);
      if (e.type === "Free" && "blocks" in e) {
        const front: number[] = [];
        const back: number[] = [];
        for (const b of e.blocks) {
          ref[b] = (ref[b] ?? 0) - 1;
          if (ref[b] === 0) (keyed.has(b) ? back : front).push(b);
        }
        queue = [...front, ...queue, ...back];
      }
    }
    expect(queue).toEqual((snap.kv as PagedView).freeQueue);
  }
  return evictions;
}

const shared = () => run("shared-system-prompt", SHARED);
const sharedOff = () =>
  run("shared-system-prompt", { ...SHARED, caching: false });
const pressure = () => run("cache-pressure", PRESSURE);
const L = SHARED.prefixLen;

const CLAIMS: Record<string, () => void> = {
  "repeated-prefill": () => {
    // With caching off, 54 sharing requests compute the 600-token prefix, and
    // the 9 that get preempted compute it again: 600 × (54 + 9) = 37,800.
    const r = sharedOff();
    const p = prefixPrefill(r.config, r.events, L);
    expect(p.tokens).toBe(L * (p.sharers + p.preempted.length));
    expect(p.sharers).toBe(54);
    expect(p.preempted).toHaveLength(9);
    expect(p.tokens).toBe(37_800);
    // Step 1's figure labels request 9's second prefill as a recompute.
    expect(p.preempted).toContain(9);
    expect(9).toBeLessThan(REPEATED_FIGURE.requests);
  },

  "one-token-changes-chain": () => {
    // Changing token i keeps every key before block ⌊i/B⌋ and changes that
    // block's key and every later one.
    const prompt = Array.from({ length: 64 }, (_, i) => i + 1);
    for (const B of [4, 8, 16]) {
      const keys = blockKeys(prompt, B);
      expect(keys).toHaveLength(64 / B);
      for (let i = 0; i < prompt.length; i++) {
        const changed = prompt.map((t, j) => (j === i ? t + 1000 : t));
        const after = blockKeys(changed, B);
        const first = Math.floor(i / B);
        keys.forEach((k, b) => {
          if (b < first) expect(after[b]).toBe(k);
          else expect(after[b]).not.toBe(k);
        });
      }
    }
  },

  "full-blocks-only": () => {
    // Every CacheInsert is for a block that is full once its step ends.
    for (const [preset, o] of [
      ["shared-system-prompt", SHARED],
      ["cache-pressure", PRESSURE],
    ] as const) {
      let inserts = 0;
      for (const { snap, events } of stepped(cacheConfig(preset, o))) {
        const kv = snap.kv as PagedView;
        for (const e of ofType(events, "CacheInsert")) {
          inserts++;
          expect(kv.filled[e.block]).toBe(o.blockSize);
        }
      }
      expect(inserts).toBeGreaterThan(0);
    }
  },

  "caching-lowers-ttft-and-prefill": () => {
    const prefill = (r: Run) =>
      ofType(r.events, "PrefillChunk").reduce((s, e) => s + e.tokens, 0);
    expect(shared().m.summary.ttft.mean).toBeLessThan(
      sharedOff().m.summary.ttft.mean,
    );
    expect(prefill(shared())).toBeLessThan(prefill(sharedOff()));
  },

  "hit-walks-chain": () => {
    // Each sharing request after the first hits ⌊600/B⌋·B tokens whenever
    // every full prefix block is still cached at its admission.
    const r = shared();
    const B = SHARED.blockSize;
    const { ids, tokens } = onePrefix(r.config, L);
    const prefixKeys = blockKeys(tokens, B);
    const cached = new Map<number, number>();
    const seen = new Set<number>();
    let checked = 0;
    for (const e of r.events) {
      if (e.type === "CacheInsert")
        cached.set(e.hash, (cached.get(e.hash) ?? 0) + 1);
      if (e.type === "Evict") cached.set(e.hash, (cached.get(e.hash) ?? 0) - 1);
      if (e.type !== "Admit" || !ids.has(e.req) || seen.has(e.req)) continue;
      const first = seen.size === 0;
      seen.add(e.req);
      if (first) continue;
      if (prefixKeys.every((k) => (cached.get(k) ?? 0) > 0)) {
        checked++;
        expect(e.cachedTokens).toBe(Math.floor(L / B) * B);
      }
    }
    expect(checked).toBeGreaterThanOrEqual(ids.size - 2);
  },

  "refcount-counts-sharers": () => {
    // A prefix block's reference count equals the running requests whose
    // tables hold it.
    const B = SHARED.blockSize;
    const config = cacheConfig("shared-system-prompt", SHARED);
    const { ids } = onePrefix(config, L);
    let most = 0;
    for (const { snap } of stepped(config)) {
      const kv = snap.kv as PagedView;
      const running = snap.requests.filter((q) => q.state === "running");
      const users = new Map<number, number>();
      for (const q of running)
        for (const b of q.blockTable ?? [])
          users.set(b, (users.get(b) ?? 0) + 1);
      for (const q of running) {
        if (!ids.has(q.id)) continue;
        for (const b of (q.blockTable ?? []).slice(0, Math.floor(L / B))) {
          expect(kv.refCount[b]).toBe(users.get(b));
          most = Math.max(most, kv.refCount[b] ?? 0);
        }
      }
    }
    expect(most).toBeGreaterThanOrEqual(4);
  },

  "sharing-saves-memory": () => {
    // Physical blocks in use (each shared block once) per running request,
    // averaged over sim time while a request runs, are lower with caching
    // on. More requests run at once, and fewer wait.
    const on = timeAverages(shared().events, SHARED.blockSize);
    const off = timeAverages(sharedOff().events, SHARED.blockSize);
    expect(on.blocksPerRunning).toBeLessThan(off.blocksPerRunning);
    expect(on.maxRunning).toBe(8);
    expect(off.maxRunning).toBe(6);
    expect(on.queue).toBeLessThan(off.queue);
    // This preset's values, to one decimal.
    expect(on.blocksPerRunning).toBeCloseTo(24.0, 1);
    expect(off.blocksPerRunning).toBeCloseTo(46.9, 1);
    expect(on.queue).toBeCloseTo(2.4, 1);
    expect(off.queue).toBeCloseTo(13.2, 1);
  },

  "caching-raises-p50-itl": () => {
    // With caching on, p50 ITL is higher and p99 ITL is lower, because more
    // requests run in each decode step.
    const on = shared();
    const off = sharedOff();
    expect(on.m.summary.itl.p50).toBeGreaterThan(off.m.summary.itl.p50);
    expect(on.m.summary.itl.p99).toBeLessThan(off.m.summary.itl.p99);
    expect(decodeBatch(on.events)).toBeGreaterThan(decodeBatch(off.events));
  },

  "share-fraction-raises-hits": () => {
    const rates = SWEPT_FRACTIONS.map(
      (fraction) =>
        run("shared-system-prompt", { ...SHARED, fraction }).m.summary
          .prefixHitRate ?? 0,
    );
    expect(strictly(rates)).toBe(true);
  },

  "longer-prefix-saves-more": () => {
    // Over prefixes of 0–1,000 tokens, hit tokens per sharing request and the
    // TTFT gap (caching off minus on) both rise at every step.
    const hits: number[] = [];
    const gaps: number[] = [];
    for (const prefixLen of SWEPT_PREFIX_LENS) {
      const on = run("shared-system-prompt", { ...SHARED, prefixLen });
      const off = run("shared-system-prompt", {
        ...SHARED,
        prefixLen,
        caching: false,
      });
      const ids = new Set(
        [...sharers(on.config.requests, prefixLen).values()]
          .flat()
          .map((q) => q.id),
      );
      const first = firstHits(on.events);
      hits.push(mean([...ids].map((id) => first.get(id) ?? 0)));
      gaps.push(off.m.summary.ttft.mean - on.m.summary.ttft.mean);
    }
    expect(strictly(hits)).toBe(true);
    expect(strictly(gaps)).toBe(true);
  },

  "partial-not-reused": () => {
    // At every CacheHit, every hit block is full and hit tokens are a whole
    // number of blocks: on both presets at every block size.
    for (const [preset, o] of [
      ["shared-system-prompt", SHARED],
      ["cache-pressure", PRESSURE],
    ] as const) {
      for (const B of BLOCK_SIZES) {
        let hits = 0;
        for (const { snap, events } of stepped(
          cacheConfig(preset, { ...o, blockSize: B }),
        )) {
          const kv = snap.kv as PagedView;
          for (const e of ofType(events, "CacheHit")) {
            hits++;
            expect(e.tokens).toBe(e.blocks.length * B);
            for (const b of e.blocks) expect(kv.filled[b]).toBe(B);
          }
        }
        expect(hits).toBeGreaterThan(0);
      }
    }
  },

  "shared-tokens-floor": () => {
    // The 600-token prefix shares ⌊600/B⌋·B tokens: 600, 592, 576, 576, 512.
    for (const B of BLOCK_SIZES) {
      const hits = ofType(
        run("shared-system-prompt", { ...SHARED, blockSize: B }).events,
        "CacheHit",
      ).map((e) => e.tokens);
      expect(hits.length).toBeGreaterThan(0);
      expect(Math.max(...hits)).toBe(Math.floor(L / B) * B);
    }
  },

  "full-hit-cap": () => {
    // An identical 64-token prompt recomputes its last block: it hits
    // 64 − 16 = 48 tokens.
    const r = simulate(FULL_HIT);
    const [a, b] = FULL_HIT.requests;
    const finishA = ofType(r.events, "Finish").find((e) => e.req === a?.id);
    expect(finishA?.t).toBeLessThan(b?.arrival ?? 0);
    const len = b?.prompt.length ?? 0;
    expect(firstHits(r.events).get(b?.id ?? -1)).toBe(
      len - FULL_HIT.kv.blockSize,
    );
  },

  "pressure-lowers-hit-rate": () => {
    expect(pressure().m.summary.prefixHitRate ?? 1).toBeLessThan(
      shared().m.summary.prefixHitRate ?? 0,
    );
  },

  "evictions-happen": () => {
    expect(pressure().m.summary.evictions).toBeGreaterThan(0);
  },

  "lru-evicts-head": () => {
    // Every eviction pops the block at the head of the free queue (LRU
    // rank 1). The replayed queue matches the engine's after every step.
    let evicted = 0;
    const evictions = replayFreeQueue(
      cacheConfig("cache-pressure", PRESSURE),
      (block, keyed, queue) => {
        if (!keyed.has(block)) return;
        evicted++;
        expect(queue[0]).toBe(block);
      },
    );
    expect(evicted).toBe(evictions);
    expect(evicted).toBeGreaterThan(0);
  },

  "evict-only-when-needed": () => {
    // At every eviction, the free queue holds no unkeyed block.
    let checked = 0;
    replayFreeQueue(
      cacheConfig("cache-pressure", PRESSURE),
      (block, keyed, queue) => {
        if (!keyed.has(block)) return;
        checked++;
        expect(queue.every((b) => keyed.has(b))).toBe(true);
      },
    );
    expect(checked).toBeGreaterThan(0);
  },

  "more-blocks-more-hits": () => {
    // On cache-pressure, the hit rate never falls as capacity grows, and the
    // largest pool beats the smallest.
    const rates = CAPACITIES.map(
      (capacity) =>
        run("cache-pressure", { ...PRESSURE, capacity }).m.summary
          .prefixHitRate ?? 0,
    );
    rates.forEach((x, i) => {
      if (i > 0) expect(x).toBeGreaterThanOrEqual(rates[i - 1] ?? 0);
    });
    expect(rates.at(-1)).toBeGreaterThan(rates[0] ?? 1);
  },

  "unique-no-hits": () => {
    // No shared prefix and no preemption: no hits, and every TTFT is the same
    // with caching on and off.
    const on = run("shared-system-prompt", UNIQUE);
    const off = run("shared-system-prompt", { ...UNIQUE, caching: false });
    expect(on.m.summary.preemptions).toBe(0);
    expect(off.m.summary.preemptions).toBe(0);
    expect(on.m.summary.prefixHitRate).toBe(0);
    on.m.requests.forEach((q, i) => {
      expect(q.ttft === off.m.requests[i]?.ttft).toBe(true);
    });
  },

  "self-hit-after-preemption": () => {
    // Unique prompts get no hit on first admission, but a preempted request
    // hits its own blocks when it comes back.
    const r = simulate(SELF_HIT);
    const admits = ofType(r.events, "Admit");
    const preempted = ofType(r.events, "Preempt").map((e) => e.req);
    expect(preempted.length).toBeGreaterThan(0);
    const seen = new Set<number>();
    let rehits = 0;
    for (const e of admits) {
      if (!seen.has(e.req)) {
        seen.add(e.req);
        expect(e.cachedTokens).toBe(0);
      } else if (preempted.includes(e.req)) {
        expect(e.cachedTokens).toBeGreaterThan(0);
        rehits++;
      }
    }
    expect(rehits).toBeGreaterThan(0);
  },

  "decode-cost-unchanged": () => {
    // The second request's decode steps cost the same whether its first 64
    // tokens came from a hit or were computed.
    const decodeSteps = (r: Run) => {
      const steps = new Set(
        ofType(r.events, "DecodeToken")
          .filter((e) => e.req === 1 && e.index > 0)
          .map((e) => e.step),
      );
      return ofType(r.events, "StepEnd")
        .filter((e) => steps.has(e.step))
        .map((e) => e.duration);
    };
    const on = simulate(decodePair(true));
    const off = simulate(decodePair(false));
    expect(firstHits(on.events).get(1)).toBe(64);
    expect(firstHits(off.events).get(1)).toBe(0);
    const a = decodeSteps(on);
    expect(a.length).toBeGreaterThan(0);
    expect(a).toEqual(decodeSteps(off));
  },

  "checkyourself-100-at-64": () => {
    // A 100-token prefix at block size 64: every hit reuses 64 tokens.
    const r = run("shared-system-prompt", { ...SHARED, ...CHECK });
    const hits = ofType(r.events, "CacheHit").map((e) => e.tokens);
    expect(hits.length).toBeGreaterThan(0);
    for (const h of hits) expect(h).toBe(64);
  },
};

describe("chapter 4 claims", () => {
  for (const [id, test] of Object.entries(CLAIMS)) it(id, test);
});

describe("chapter 4 claim ids", () => {
  it("match the <Claim> ids in the chapter exactly (meta-test)", () => {
    const mdx = readFileSync("src/chapters/prefix-caching/index.mdx", "utf8");
    const used = new Set(
      [...mdx.matchAll(/<Claim\s+id="([^"]+)"/g)].map((m) => m[1]),
    );
    expect([...used].sort()).toEqual(Object.keys(CLAIMS).sort());
  });
});
