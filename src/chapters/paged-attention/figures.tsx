/**
 * Chapter 2's figures by key, and every number its prose quotes. The prose
 * renders these through <Num>, so it cannot drift from data or the sim.
 */
import gpus from "../../data/gpus.json" with { type: "json" };
import models from "../../data/models.json" with { type: "json" };
import { PRESETS } from "../../sim/index.ts";
import { COST_CONSTANTS } from "../../simConfig.ts";
import { meanOver, peakRunning, wasteShare } from "./frames.ts";
import { blockSizeSeries, PagedFigure } from "./PagedFigure.tsx";
import {
  CAPACITY,
  compareConfig,
  compareFrames,
  DEFAULTS,
  RAISED_MAX_MODEL_LEN,
  SHARED_BLOCKS,
  TABLE_FIGURE,
  WINDOW_S,
} from "./presets.ts";
import { SharedBlocks } from "./SharedBlocks.tsx";
import { tableFigure, TokenStrip } from "./TokenStrip.tsx";
import "./paged-attention.css";

export const figures = {
  contiguous: () => <PagedFigure mode="contiguous" />,
  paged: () => <PagedFigure mode="paged" />,
  table: () => <TokenStrip />,
  compare: () => <PagedFigure mode="compare" />,
  "block-size": () => <PagedFigure mode="block-size" />,
  shared: () => <SharedBlocks />,
};

const llama = models.models.find((m) => m.slug === "llama-3.1-8b");
const a10g = gpus.gpus.find((g) => g.id === "a10g-24");
if (!llama || !a10g) throw new Error("chapter 2 data is missing");

const paged = compareFrames("paged");
const contiguous = compareFrames("contiguous-max");
const series = blockSizeSeries();
const first = series[0];
const lastB = series.at(-1);
if (!first || !lastB) throw new Error("no block-size runs");
const table = tableFigure();
const raised = { ...DEFAULTS, maxModelLen: RAISED_MAX_MODEL_LEN };
const freeTokens = Math.floor(
  (a10g.usableVramBytes - llama.weightBytesBf16) / llama.kvBytesPerTokenBf16,
);
const lengths = compareConfig("paged").requests.map(
  (r) => r.prompt.length + r.outputLen,
);
const at = (frames: typeof paged, t: number) =>
  frames.filter((f) => f.t <= t).at(-1);

/** How many leading tokens the teaser's two prompts share. */
function sharedPrefix() {
  const [a, b] = SHARED_BLOCKS.requests.map((r) => r.prompt);
  let n = 0;
  while (a && b && n < a.length && a[n] === b[n]) n++;
  return n;
}

/** Names and numbers the prose quotes: `computed` (data) or `simulated`. */
export const F = {
  kibPerToken: llama.kvBytesPerTokenBf16 / 1024,
  freeTokens,
  toyShare: freeTokens / CAPACITY,
  capacity: CAPACITY,
  maxNumSeqs: compareConfig("paged").scheduler.maxNumSeqs,
  requests: lengths.length,
  shortest: Math.min(...lengths),
  longest: Math.max(...lengths),
  meanLength: lengths.reduce((s, n) => s + n, 0) / lengths.length,
  outputMedian:
    PRESETS["paged-vs-contiguous"].workload.outputLen.kind === "lognormal"
      ? PRESETS["paged-vs-contiguous"].workload.outputLen.median
      : 0,
  mbu: COST_CONSTANTS.mbu.value,
  blockSize: DEFAULTS.blockSize,
  blocks: CAPACITY / DEFAULTS.blockSize,
  maxModelLen: DEFAULTS.maxModelLen,
  regions: Math.floor(CAPACITY / DEFAULTS.maxModelLen),
  gap: CAPACITY % DEFAULTS.maxModelLen,
  gapPercent: (100 * (CAPACITY % DEFAULTS.maxModelLen)) / CAPACITY,
  window: WINDOW_S,
  contiguousWaste: 100 * meanOver(contiguous, wasteShare, WINDOW_S),
  pagedWaste: 100 * meanOver(paged, wasteShare, WINDOW_S),
  contiguousPeak: peakRunning(contiguous),
  pagedPeak: peakRunning(paged),
  waitingAt10: at(contiguous, WINDOW_S / 2)?.waiting ?? 0,
  waitingAt20: at(contiguous, WINDOW_S)?.waiting ?? 0,
  pagedPeak20: peakRunning(paged, WINDOW_S),
  contiguousPeak20: peakRunning(contiguous, WINDOW_S),
  preemptions: paged.at(-1)?.preemptions ?? 0,
  table: {
    req: table.holder.req,
    t: table.frame.t,
    blocks: table.holder.blocks.length,
    step: TABLE_FIGURE.step,
  },
  bs: {
    smallest: first.B,
    largest: lastB.B,
    wasteSmallest: 100 * first.waste,
    wasteLargest: 100 * lastB.waste,
    tableSmallest: first.table,
    tableLargest: lastB.table,
  },
  shared: {
    blockSize: SHARED_BLOCKS.kv.blockSize,
    prefix: sharedPrefix(),
  },
  check: {
    raised: RAISED_MAX_MODEL_LEN,
    gap: CAPACITY % RAISED_MAX_MODEL_LEN,
    contiguousPeak: peakRunning(compareFrames("contiguous-max", raised)),
    pagedPeak: peakRunning(compareFrames("paged", raised)),
  },
};
