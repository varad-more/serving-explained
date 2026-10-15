/**
 * Chapter 3's claims (tasks/todo.md, "Prompt 5: continuous batching
 * chapter"). One test per <Claim id>, each run on the exact configs the
 * chapter imports. If a test fails, the prose is wrong: never reword a claim
 * or loosen a test to make it pass (CLAUDE.md).
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  BASICS,
  BASICS_STATIC,
  BUBBLE_WINDOW_S,
  BUDGETS,
  GPU_IDS,
  MODEL_SLUGS,
  PHASE_DEFAULT,
  phaseRun,
  PREEMPT_POOL,
  RARE_LONG_SHARE,
  runConfig,
  SIGMAS,
  STALL,
  STALL_OFF,
  SWEEP_BUDGETS,
  type PresetKey,
  type RunOptions,
} from "../../src/chapters/continuous-batching/presets.ts";
import {
  bubbleShare,
  crossover,
  lastArrival,
  longAdmitToFirstToken,
  longTtft,
  maxItl,
  meanQueue,
  memoryBound,
  phaseSteps,
  sharedWork,
  stalls,
  stepEnds,
} from "../../src/chapters/continuous-batching/stats.ts";
import { createSim, metrics, type SimConfig } from "../../src/sim/index.ts";

function simulate(config: SimConfig) {
  const sim = createSim({ ...config, checkInvariants: true });
  sim.run();
  const events = sim.events();
  return { config, events, m: metrics(events, config) };
}
type Run = ReturnType<typeof simulate>;

const runs = new Map<string, Run>();
function run(
  preset: PresetKey,
  o: RunOptions,
  variant: Parameters<typeof runConfig>[2] = {},
): Run {
  const key = JSON.stringify([preset, o, variant]);
  let r = runs.get(key);
  if (!r) {
    r = simulate(runConfig(preset, o, variant));
    runs.set(key, r);
  }
  return r;
}

const strictly = (xs: readonly number[], dir: 1 | -1) =>
  xs.every((x, i) => i === 0 || dir * (x - (xs[i - 1] ?? 0)) > 0);

/** Every model × GPU pair whose KV pool fits step 1's request. */
function phaseRuns() {
  const out: Run[] = [];
  for (const model of MODEL_SLUGS)
    for (const gpu of GPU_IDS) {
      const p = phaseRun(model, gpu);
      if (p.fits) out.push(simulate(p.config));
    }
  expect(out.length).toBeGreaterThan(10);
  return out;
}

const basics = () => run("batching-basics", BASICS);
const basicsStatic = () => run("batching-basics", BASICS_STATIC);

const CLAIMS: Record<string, () => void> = {
  "prefill-compute-bound": () => {
    // For every pair that fits, the step that runs the 1,024-token prompt is
    // compute-bound.
    for (const r of phaseRuns()) {
      const [first] = stepEnds(r.events);
      expect(first?.tokens).toBe(1024);
      expect(first?.bound).toBe("compute");
    }
    // The default pair's crossover: one token fewer, and prefill is
    // memory-bound.
    const { model, gpu } = PHASE_DEFAULT;
    const k = crossover(model, gpu);
    expect(phaseSteps(model, gpu, k)?.prefill.bound).toBe("compute");
    expect(phaseSteps(model, gpu, k - 1)?.prefill.bound).toBe("memory");
    for (const n of [k + 1, 2 * k, 512])
      expect(phaseSteps(model, gpu, n)?.prefill.bound).toBe("compute");
  },

  "decode-memory-bound": () => {
    // For every pair that fits, each decode step (one token) is memory-bound.
    for (const r of phaseRuns()) {
      const decodes = stepEnds(r.events).filter((e) => e.tokens === 1);
      expect(decodes.length).toBeGreaterThan(0);
      for (const e of decodes) expect(e.bound).toBe("memory");
    }
  },

  "static-never-admits-mid-batch": () => {
    // Re-derived from the log, apart from the engine's invariant 5: an Admit
    // happens only in a step that began with no request admitted and not yet
    // finished or preempted.
    const open = new Set<number>();
    const openAtStart = new Map<number, number>();
    let blocked = 0;
    for (const e of basicsStatic().events) {
      if (!openAtStart.has(e.step)) openAtStart.set(e.step, open.size);
      if (e.type === "Admit") {
        expect(openAtStart.get(e.step)).toBe(0);
        open.add(e.req);
      }
      if (e.type === "Finish" || e.type === "Preempt") open.delete(e.req);
      if (
        e.type === "StepEnd" &&
        e.waiting > 0 &&
        (openAtStart.get(e.step) ?? 0) > 0
      )
        blocked++;
    }
    // The rule was tested: requests waited while a batch was open.
    expect(blocked).toBeGreaterThan(100);
  },

  "static-has-bubbles": () => {
    // In the first 20 s, slots held by requests that have made every output
    // token are more than 25% of held slot-seconds.
    const r = basicsStatic();
    expect(r.events.some((e) => e.type === "Preempt")).toBe(false);
    expect(bubbleShare(r, BUBBLE_WINDOW_S)).toBeGreaterThan(0.25);
  },

  "static-queue-grows": () => {
    // Static's time-averaged queue is longer in the second half of the
    // arrivals than in the first.
    const { events, config } = basicsStatic();
    const end = lastArrival(config);
    expect(meanQueue(events, end / 2, end)).toBeGreaterThan(
      meanQueue(events, 0, end / 2),
    );
  },

  "continuous-shorter-queue": () => {
    // Over the arrivals, continuous's time-averaged queue is shorter.
    const end = lastArrival(basics().config);
    expect(meanQueue(basics().events, 0, end)).toBeLessThan(
      meanQueue(basicsStatic().events, 0, end),
    );
  },

  "continuous-lower-ttft": () => {
    const c = basics().m.summary.ttft;
    const s = basicsStatic().m.summary.ttft;
    expect(c.mean).toBeLessThan(s.mean);
    expect(c.p99).toBeLessThan(s.p99);
  },

  "continuous-higher-throughput": () => {
    expect(basics().m.summary.outputTokensPerS).toBeGreaterThan(
      basicsStatic().m.summary.outputTokensPerS,
    );
  },

  "continuous-admits-promptly": () => {
    // Whenever a request waits at the start of a step and a slot is free, a
    // request is admitted in that step.
    const { events, config } = basics();
    const cap = config.scheduler.maxNumSeqs;
    let waiting = 0;
    let running = 0;
    let step = -1;
    let start = { waiting: 0, running: 0, admits: 0 };
    let checked = 0;
    const close = () => {
      if (step < 0 || start.waiting === 0 || start.running >= cap) return;
      checked++;
      expect(start.admits).toBeGreaterThan(0);
    };
    for (const e of events) {
      if (e.step !== step) {
        close();
        step = e.step;
        start = { waiting, running, admits: 0 };
      }
      if (e.type === "Arrive") {
        waiting++;
        start.waiting++;
      }
      if (e.type === "Admit") {
        waiting--;
        running++;
        start.admits++;
      }
      if (e.type === "Preempt") {
        running--;
        waiting++;
      }
      if (e.type === "Finish") running--;
    }
    close();
    expect(checked).toBeGreaterThanOrEqual(config.requests.length / 2);
  },

  "preemption-recomputes": () => {
    // On a 1,280-token pool, continuous batching preempts. Each time the
    // victim is the most recently admitted running request; it goes to the
    // front of the queue; and once readmitted it computes its prompt and
    // every output token it had made again before its next token.
    const r = run("batching-basics", BASICS, {
      numBlocks: PREEMPT_POOL.blocks,
    });
    const prompt = new Map(
      r.config.requests.map((q) => [q.id, q.prompt.length]),
    );
    const running: number[] = [];
    const generated = new Map<number, number>();
    const front: number[] = [];
    const redo = new Map<number, number>();
    let preemptions = 0;
    for (const e of r.events) {
      if (e.type === "Admit") {
        if (front.length > 0) expect(e.req).toBe(front.shift());
        running.push(e.req);
      }
      if (e.type === "Preempt") {
        preemptions++;
        expect(e.req).toBe(running.at(-1));
        running.pop();
        // vLLM prepends each victim to the waiting queue, so the latest
        // victim is first in line.
        front.unshift(e.req);
        redo.set(e.req, 0);
      }
      if (e.type === "PrefillChunk" && redo.has(e.req))
        redo.set(e.req, (redo.get(e.req) ?? 0) + e.tokens);
      if (e.type === "DecodeToken") {
        if (redo.has(e.req)) {
          expect(redo.get(e.req)).toBe(
            (prompt.get(e.req) ?? 0) + (generated.get(e.req) ?? 0),
          );
          redo.delete(e.req);
        }
        generated.set(e.req, e.index + 1);
      }
      if (e.type === "Finish") running.splice(running.indexOf(e.req), 1);
    }
    expect(preemptions).toBeGreaterThan(0);
    expect(redo.size).toBe(0);
  },

  "long-prefill-stalls": () => {
    // Without chunking, p99 ITL is at least 20× p50 ITL.
    const { itl } = run("long-prompt-stall", STALL_OFF).m.summary;
    expect(itl.p99).toBeGreaterThanOrEqual(20 * itl.p50);
  },

  "chunking-lowers-p99-itl": () => {
    expect(run("long-prompt-stall", STALL).m.summary.itl.p99).toBeLessThan(
      run("long-prompt-stall", STALL_OFF).m.summary.itl.p99,
    );
  },

  "chunking-slows-long-prefill": () => {
    // Once admitted, a long prompt takes longer to reach its first token with
    // chunking, because its chunks share steps with decodes. Its total TTFT,
    // queueing included, changes by less than 5% on this workload.
    const on = run("long-prompt-stall", STALL);
    const off = run("long-prompt-stall", STALL_OFF);
    expect(on.m.summary.preemptions).toBe(0);
    expect(off.m.summary.preemptions).toBe(0);
    expect(longAdmitToFirstToken(on)).toBeGreaterThan(
      longAdmitToFirstToken(off),
    );
    expect(Math.abs(longTtft(on) / longTtft(off) - 1)).toBeLessThan(0.05);
    // The cause: with chunking, a long prompt's chunks share steps with other
    // prompts' prefill chunks, far more than with decodes, and far more than
    // its single step does with chunking off.
    const shared = sharedWork(on);
    expect(shared.otherPrefill).toBeGreaterThan(10 * shared.decodes);
    expect(shared.otherPrefill).toBeGreaterThan(
      10 * sharedWork(off).otherPrefill,
    );
  },

  "chunking-spreads-stalls": () => {
    // Decision 10, at 2% long prompts: chunking turns one big stall per long
    // prompt into several smaller ones. The share of stall steps rises, and
    // the worst stall (max ITL) falls. Stalls stay under 1% of inter-token
    // gaps in both runs, too rare for p99 ITL to show.
    const rare = { longShare: RARE_LONG_SHARE };
    const on = run("long-prompt-stall", STALL, rare);
    const off = run("long-prompt-stall", STALL_OFF, rare);
    expect(stalls(on).stepShare).toBeGreaterThan(stalls(off).stepShare);
    expect(maxItl(on)).toBeLessThan(maxItl(off));
    expect(stalls(on).gapShare).toBeLessThan(0.01);
    expect(stalls(off).gapShare).toBeLessThan(0.01);
    // So p99 ITL misses the stalls: in both runs it is below the shortest
    // gap that ends in a stall step, and with chunking it even rises.
    for (const r of [on, off])
      expect(r.m.summary.itl.p99).toBeLessThan(stalls(r).minGap);
    expect(on.m.summary.itl.p99).toBeGreaterThan(off.m.summary.itl.p99);
  },

  "no-free-setting": () => {
    // On long-prompt-stall, over budgets 64–8,192:
    const sweep = SWEEP_BUDGETS.map((budget) =>
      run("long-prompt-stall", { ...STALL, budget }),
    );
    const tput = (r: Run) => r.m.summary.outputTokensPerS;
    // Too large brings back stalls: p99 ITL rises at every step up.
    expect(
      strictly(
        sweep.map((r) => r.m.summary.itl.p99),
        1,
      ),
    ).toBe(true);
    // Too small costs throughput and the long prompts' TTFT: at 64 every
    // step is memory-bound, so 64 loses to 128 on both.
    const [smallest, next] = sweep;
    if (!smallest || !next) throw new Error("sweep too short");
    expect(memoryBound(smallest).stepShare).toBe(1);
    expect(crossover(PHASE_DEFAULT.model, PHASE_DEFAULT.gpu)).toBeGreaterThan(
      SWEEP_BUDGETS[0],
    );
    expect(tput(smallest)).toBeLessThan(tput(next));
    expect(longTtft(smallest)).toBeGreaterThan(longTtft(next));
    // Above that, smaller budgets fill idle decode compute with prefill:
    // memory-bound time falls at every step down to 128.
    const above = sweep.slice(1).map((r) => memoryBound(r).seconds);
    expect(strictly(above, 1)).toBe(true);
    // At the largest budget, steps with no prefill work are memory-bound.
    const largest = sweep.at(-1);
    if (!largest) throw new Error("sweep too short");
    const prefillSteps = new Set(
      largest.events
        .filter((e) => e.type === "PrefillChunk")
        .map((e) => e.step),
    );
    const decodeOnly = stepEnds(largest.events).filter(
      (e) => !prefillSteps.has(e.step),
    );
    expect(decodeOnly.length).toBeGreaterThan(0);
    for (const e of decodeOnly) expect(e.bound).toBe("memory");
    // Every budget does the same compute.
    const compute = (r: Run) =>
      stepEnds(r.events).reduce((s, e) => s + e.computeS, 0);
    for (const r of sweep) expect(compute(r)).toBeCloseTo(compute(smallest), 9);
    // The best throughput and long-prompt TTFT sit between the ends.
    const argBest = (f: (r: Run) => number) => {
      const xs = sweep.map(f);
      return xs.indexOf(Math.min(...xs));
    };
    for (const i of [argBest((r) => -tput(r)), argBest(longTtft)]) {
      expect(i).toBeGreaterThan(0);
      expect(i).toBeLessThan(sweep.length - 1);
    }
    // It depends on the workload: batching-basics has short prompts, so
    // every budget from 512 up gives the same run.
    const basicsRuns = BUDGETS.map(
      (budget) => run("batching-basics", { ...BASICS, budget }).m.summary,
    );
    for (const s of basicsRuns) expect(s).toEqual(basicsRuns[0]);
  },

  "bigger-batches-cost-latency": () => {
    // Decision 9 (Build 2 result): raising the budget from 512 to 8,192
    // raises mean TTFT, p99 TTFT, and p99 ITL at every step up.
    const sweep = BUDGETS.map(
      (budget) => run("long-prompt-stall", { ...STALL, budget }).m.summary,
    );
    expect(
      strictly(
        sweep.map((s) => s.ttft.mean),
        1,
      ),
    ).toBe(true);
    expect(
      strictly(
        sweep.map((s) => s.ttft.p99),
        1,
      ),
    ).toBe(true);
    expect(
      strictly(
        sweep.map((s) => s.itl.p99),
        1,
      ),
    ).toBe(true);
  },

  "spread-widens-gap": () => {
    // Static's mean TTFT minus continuous's grows with every step up in σ.
    const gaps = SIGMAS.map(
      (sigma) =>
        run("batching-basics", { ...BASICS_STATIC, sigma }).m.summary.ttft
          .mean -
        run("batching-basics", { ...BASICS, sigma }).m.summary.ttft.mean,
    );
    expect(strictly(gaps, 1)).toBe(true);
  },
};

describe("chapter 3 claims", () => {
  for (const [id, test] of Object.entries(CLAIMS)) it(id, test);
});

describe("chapter 3 claim ids", () => {
  it("match the <Claim> ids in the chapter exactly (meta-test)", () => {
    const mdx = readFileSync(
      "src/chapters/continuous-batching/index.mdx",
      "utf8",
    );
    const used = new Set(
      [...mdx.matchAll(/<Claim\s+id="([^"]+)"/g)].map((m) => m[1]),
    );
    expect([...used].sort()).toEqual(Object.keys(CLAIMS).sort());
  });
});
