/**
 * Every number chapter 3's prose quotes, computed from the sim and the data.
 * Only `pnpm gen:figures` and the staleness test run this; the page reads
 * the generated src/data/figures-continuous-batching.json (AUDIT.md P1).
 */
import bench from "../../data/bench-ieb.json" with { type: "json" };
import { PRESETS } from "../../sim/index.ts";
import { COST_CONSTANTS } from "../../simConfig.ts";
import { budgetSweep } from "./BudgetSweep.tsx";
import {
  BASICS,
  BASICS_STATIC,
  BUBBLE_WINDOW_S,
  BUDGETS,
  LONG_PROMPT,
  PHASE_DEFAULT,
  PHASE_REQUEST,
  PREEMPT_POOL,
  RARE_LONG_SHARE,
  SIGMAS,
  STALL,
  STALL_OFF,
  SWEEP_BUDGETS,
} from "./presets.ts";
import {
  bubbleShare,
  crossover,
  lastArrival,
  longAdmitToFirstToken,
  longIds,
  longTtft,
  maxItl,
  meanQueue,
  memoryBound,
  phaseSteps,
  sharedWork,
  stalls,
} from "./stats.ts";
import { runTimeline } from "./timeline.ts";

const basics = runTimeline("batching-basics", BASICS);
const basicsStatic = runTimeline("batching-basics", BASICS_STATIC);
const preempt = runTimeline("batching-basics", BASICS, {
  numBlocks: PREEMPT_POOL.blocks,
});
const on = runTimeline("long-prompt-stall", STALL);
const off = runTimeline("long-prompt-stall", STALL_OFF);
const rare = { longShare: RARE_LONG_SHARE };
const rareOn = runTimeline("long-prompt-stall", STALL, rare);
const rareOff = runTimeline("long-prompt-stall", STALL_OFF, rare);
const phase = phaseSteps(PHASE_DEFAULT.model, PHASE_DEFAULT.gpu);
if (!phase) throw new Error("step 1's default pair does not fit");
const sweep = budgetSweep();
const at = (budget: number) => {
  const d = sweep.find((x) => x.budget === budget);
  if (!d) throw new Error(`no sweep run at ${String(budget)}`);
  return d;
};
const smallest = at(SWEEP_BUDGETS[0]);
const best = sweep.reduce((a, d) => (d.throughput > a.throughput ? d : a));
const budgetRun = (budget: number) =>
  runTimeline("long-prompt-stall", { ...STALL, budget });
const gap = (sigma: number) =>
  runTimeline("batching-basics", { ...BASICS_STATIC, sigma }).m.summary.ttft
    .mean -
  runTimeline("batching-basics", { ...BASICS, sigma }).m.summary.ttft.mean;
const end = lastArrival(basics.config);
/** Mean output length of `batching-basics` at a spread σ. */
const meanOutput = (sigma: number) => {
  const reqs = runTimeline("batching-basics", { ...BASICS, sigma }).config
    .requests;
  return reqs.reduce((s, r) => s + r.outputLen, 0) / reqs.length;
};
const stall = PRESETS["long-prompt-stall"].workload;
const basicsWorkload = PRESETS["batching-basics"].workload;
const lognormal = (d: typeof basicsWorkload.outputLen) =>
  d.kind === "lognormal" ? d : null;

/** A bench-ieb file at the pinned commit, at a line if given. */
const fileUrl = (path: string, line?: number) =>
  `https://github.com/${bench._provenance.repo}/blob/${bench._provenance.commit}/${path}${line ? `#L${String(line)}` : ""}`;

/** One concurrency level of the measured ramp. */
const level = (engine: string, c: number) => {
  const e = bench.engines.find((x) => x.engine === engine);
  const l = e?.levels.find((x) => x.concurrency === c);
  if (!e || !l) throw new Error(`no ${engine} level ${String(c)}`);
  return {
    ...l,
    file: fileUrl(e.file),
    log: fileUrl(bench.log, l.logLines[0]),
    image: e.image,
    imageLine: fileUrl(bench.log, e.imageLine),
  };
};
const vllm1 = level("vLLM", 1);
const vllm64 = level("vLLM", 64);
const sglang1 = level("SGLang", 1);
const sglang64 = level("SGLang", 64);

/** Names and numbers the prose quotes: `simulated` unless marked. */
export const F = {
  phase: {
    prompt: PHASE_REQUEST.prompt,
    prefillCompute: phase.prefill.computeS,
    prefillMemory: phase.prefill.memoryS,
    decodeCompute: phase.decode.computeS,
    decodeMemory: phase.decode.memoryS,
    /** One request alone: one token per decode step. */
    decodeRate: 1 / phase.decode.duration,
    crossover: crossover(PHASE_DEFAULT.model, PHASE_DEFAULT.gpu),
  },
  mbu: COST_CONSTANTS.mbu.value,
  mfu: COST_CONSTANTS.mfu.value,
  basics: {
    requests: basics.config.requests.length,
    rate: BASICS.rate,
    maxNumSeqs: BASICS.maxNumSeqs,
    outputMedian: lognormal(basicsWorkload.outputLen)?.median ?? 0,
    sigma: BASICS.sigma,
    window: BUBBLE_WINDOW_S,
    bubbles: 100 * bubbleShare(basicsStatic, BUBBLE_WINDOW_S),
    lastArrival: end,
    halfWindow: end / 2,
    queueFirstHalf: meanQueue(basicsStatic.events, 0, end / 2),
    queueSecondHalf: meanQueue(basicsStatic.events, end / 2, end),
    queueStatic: meanQueue(basicsStatic.events, 0, end),
    queueContinuous: meanQueue(basics.events, 0, end),
    ttftStatic: basicsStatic.m.summary.ttft,
    ttftContinuous: basics.m.summary.ttft,
    tputStatic: basicsStatic.m.summary.outputTokensPerS,
    tputContinuous: basics.m.summary.outputTokensPerS,
  },
  preempt: {
    blocks: PREEMPT_POOL.blocks,
    blockSize: PREEMPT_POOL.blockSize,
    tokens: PREEMPT_POOL.blocks * PREEMPT_POOL.blockSize,
    count: preempt.m.summary.preemptions,
  },
  stall: {
    requests: off.config.requests.length,
    long: longIds(off.config).size,
    longShare:
      stall.promptLen.kind === "mixture"
        ? 100 * (stall.promptLen.parts.at(-1)?.weight ?? 0)
        : 0,
    longFrom: LONG_PROMPT,
    longTo:
      stall.promptLen.kind === "mixture" &&
      stall.promptLen.parts.at(-1)?.dist.kind === "uniform"
        ? (stall.promptLen.parts.at(-1)?.dist as { max: number }).max
        : 0,
    budget: STALL.budget,
    maxModelLen: off.config.scheduler.maxModelLen,
    offP50: off.m.summary.itl.p50,
    offP99: off.m.summary.itl.p99,
    ratio: off.m.summary.itl.p99 / off.m.summary.itl.p50,
    offMax: maxItl(off),
    onP99: on.m.summary.itl.p99,
    onMax: maxItl(on),
    a2fOff: longAdmitToFirstToken(off),
    a2fOn: longAdmitToFirstToken(on),
    ttftOff: longTtft(off),
    ttftOn: longTtft(on),
    sharedOn: sharedWork(on),
    sharedOff: sharedWork(off),
  },
  rare: {
    share: 100 * RARE_LONG_SHARE,
    long: longIds(rareOff.config).size,
    stepShareOff: 100 * stalls(rareOff).stepShare,
    stepShareOn: 100 * stalls(rareOn).stepShare,
    gapShareOff: 100 * stalls(rareOff).gapShare,
    gapShareOn: 100 * stalls(rareOn).gapShare,
    maxOff: maxItl(rareOff),
    maxOn: maxItl(rareOn),
    p99Off: rareOff.m.summary.itl.p99,
    p99On: rareOn.m.summary.itl.p99,
  },
  sweep: {
    /** Figure 3.7's points, so the figure runs no sims to mount. */
    points: sweep,
    count: SWEEP_BUDGETS.length,
    smallest: smallest.budget,
    largest: SWEEP_BUDGETS.at(-1) ?? 0,
    smallestTput: smallest.throughput,
    smallestTtft: smallest.longTtft,
    smallestP99: smallest.p99Itl,
    best: best.budget,
    bestTput: best.throughput,
    bestTtft: best.longTtft,
    largestP99: at(SWEEP_BUDGETS.at(-1) ?? 0).p99Itl,
    memLargest: memoryBound(budgetRun(SWEEP_BUDGETS.at(-1) ?? 0)).seconds,
    memBest: memoryBound(budgetRun(best.budget)).seconds,
    from: BUDGETS[0],
    to: BUDGETS.at(-1) ?? 0,
    ttftFrom: budgetRun(BUDGETS[0]).m.summary.ttft,
    ttftTo: budgetRun(BUDGETS.at(-1) ?? 0).m.summary.ttft,
    p99From: budgetRun(BUDGETS[0]).m.summary.itl.p99,
    p99To: budgetRun(BUDGETS.at(-1) ?? 0).m.summary.itl.p99,
  },
  check: {
    from: SIGMAS[0],
    to: SIGMAS.at(-1) ?? 0,
    gapFrom: gap(SIGMAS[0]),
    gapTo: gap(SIGMAS.at(-1) ?? 0),
    meanFrom: meanOutput(SIGMAS[0]),
    meanTo: meanOutput(SIGMAS.at(-1) ?? 0),
  },
  measured: {
    gpu: bench.gpu,
    gpuLine: fileUrl(bench.log, bench.gpuLine),
    model: bench.model,
    modelLine: fileUrl(bench.log, bench.modelLine),
    vllm1,
    vllm64,
    sglang1,
    sglang64,
    prompts: bench.engines[0]?.prompts ?? 0,
    promptWords: bench.engines[0]?.promptWords ?? { min: 0, max: 0 },
    vllmTputX: vllm64.outputTokPerS / vllm1.outputTokPerS,
    sglangTputX: sglang64.outputTokPerS / sglang1.outputTokPerS,
    vllmTtftX: vllm64.p50TtftMs / vllm1.p50TtftMs,
    sglangTtftX: sglang64.p50TtftMs / sglang1.p50TtftMs,
  },
};
