/**
 * Chapter 3's figures by key, and every number its prose quotes. The prose
 * renders these through <Num>, so it cannot drift from the sim or the data.
 */
import bench from "../../data/bench-ieb.json" with { type: "json" };
import { PRESETS } from "../../sim/index.ts";
import { COST_CONSTANTS } from "../../simConfig.ts";
import { budgetSweep, BudgetSweep } from "./BudgetSweep.tsx";
import { PhaseBars } from "./PhaseBars.tsx";
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
import { RequestTimeline } from "./RequestTimeline.tsx";
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
  stalls,
} from "./stats.ts";
import { runTimeline } from "./timeline.ts";
import "./continuous-batching.css";

/** Keys keep each mode's own state: the board reuses one slot for every step. */
export const figures = {
  phases: () => <PhaseBars />,
  static: () => <RequestTimeline key="static" mode="static" />,
  compare: () => <RequestTimeline key="policy" mode="policy" />,
  preemption: () => <RequestTimeline key="preemption" mode="preemption" />,
  stall: () => <RequestTimeline key="stall" mode="stall" />,
  chunking: () => <RequestTimeline key="chunking" mode="chunking" />,
  sweep: () => <BudgetSweep />,
};

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
    crossover: crossover(PHASE_DEFAULT.model, PHASE_DEFAULT.gpu),
  },
  mbu: COST_CONSTANTS.mbu.value,
  basics: {
    requests: basics.config.requests.length,
    rate: BASICS.rate,
    maxNumSeqs: BASICS.maxNumSeqs,
    outputMedian: lognormal(basicsWorkload.outputLen)?.median ?? 0,
    sigma: BASICS.sigma,
    window: BUBBLE_WINDOW_S,
    bubbles: 100 * bubbleShare(basicsStatic, BUBBLE_WINDOW_S),
    lastArrival: end,
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
    offMax: maxItl(off),
    onP99: on.m.summary.itl.p99,
    onMax: maxItl(on),
    a2fOff: longAdmitToFirstToken(off),
    a2fOn: longAdmitToFirstToken(on),
    ttftOff: longTtft(off),
    ttftOn: longTtft(on),
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
    vllmTputX: vllm64.outputTokPerS / vllm1.outputTokPerS,
    sglangTputX: sglang64.outputTokPerS / sglang1.outputTokPerS,
    vllmTtftX: vllm64.p50TtftMs / vllm1.p50TtftMs,
    sglangTtftX: sglang64.p50TtftMs / sglang1.p50TtftMs,
  },
};
