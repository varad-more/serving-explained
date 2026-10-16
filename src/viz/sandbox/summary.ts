/**
 * The sandbox's summary numbers (all `simulated`) and the A/B diff
 * (tasks/todo.md, Prompt 7, "Views"). Pure, so the diff rules are tested.
 */
import type { Done, Series } from "./protocol.ts";

export interface Metric {
  key: string;
  label: string;
  value: number | null;
  format: (x: number) => string;
  /** A share of the pool: differences are in percentage points. */
  share?: boolean;
}

const secs = (x: number) =>
  x < 1 ? `${(x * 1000).toFixed(x < 0.01 ? 1 : 0)} ms` : `${x.toFixed(2)} s`;
const pct = (x: number) => `${(100 * x).toFixed(1)}%`;
const num = (digits: number) => (x: number) =>
  x.toLocaleString("en-US", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });

/** Time-weighted mean and peak of a per-step ratio. */
function overTime(series: Series, value: (i: number) => number) {
  let weight = 0;
  let sum = 0;
  let peak = 0;
  for (let i = 0; i < series.t.length; i++) {
    const d = series.duration[i] ?? 0;
    const v = value(i);
    weight += d;
    sum += v * d;
    peak = Math.max(peak, v);
  }
  return { mean: weight > 0 ? sum / weight : 0, peak };
}

export function summarize(done: Done, series: Series): Metric[] {
  const capacity = done.numBlocks * done.blockSize;
  const used = overTime(series, (i) => (series.tokens[i] ?? 0) / capacity);
  const waste = overTime(
    series,
    (i) =>
      ((series.allocated[i] ?? 0) -
        (series.tokens[i] ?? 0) +
        (series.unusable[i] ?? 0)) /
      capacity,
  );
  const s = done.summary;
  return [
    {
      key: "throughput",
      label: "Output tokens per second",
      value: s.outputTokensPerS,
      format: num(1),
    },
    { key: "ttft-mean", label: "Mean TTFT", value: s.ttft.mean, format: secs },
    { key: "ttft-p50", label: "p50 TTFT", value: s.ttft.p50, format: secs },
    { key: "ttft-p99", label: "p99 TTFT", value: s.ttft.p99, format: secs },
    { key: "itl-p50", label: "p50 ITL", value: s.itl.p50, format: secs },
    { key: "itl-p99", label: "p99 ITL", value: s.itl.p99, format: secs },
    {
      key: "kv-mean",
      label: "KV in use, mean",
      value: used.mean,
      format: pct,
      share: true,
    },
    {
      key: "kv-peak",
      label: "KV in use, peak",
      value: used.peak,
      format: pct,
      share: true,
    },
    {
      key: "waste",
      label: "KV wasted, mean",
      value: waste.mean,
      format: pct,
      share: true,
    },
    {
      key: "hit-rate",
      label: "Prefix hit rate",
      value: s.prefixHitRate,
      format: pct,
      share: true,
    },
    {
      key: "preemptions",
      label: "Preemptions",
      value: s.preemptions,
      format: num(0),
    },
    {
      key: "evictions",
      label: "Evictions",
      value: s.evictions,
      format: num(0),
    },
  ];
}

export interface DiffRow {
  key: string;
  label: string;
  a: string;
  b: string;
  /** "same", "identical (same log hash)", or a signed difference. */
  delta: string;
  deltaPct: string;
  /** ▲ or ▼ in ink only: whether a change is better depends on the metric. */
  arrow: "▲" | "▼" | "";
}

export function diff(
  a: { done: Done; series: Series },
  b: { done: Done; series: Series },
): DiffRow[] {
  const ma = summarize(a.done, a.series);
  const mb = summarize(b.done, b.series);
  const identical = a.done.hash === b.done.hash;
  return ma.map((x, i) => {
    const y = mb[i];
    const fa = x.value === null ? "–" : x.format(x.value);
    const fb = y?.value == null ? "–" : y.format(y.value);
    const row = { key: x.key, label: x.label, a: fa, b: fb };
    if (identical)
      return {
        ...row,
        delta: "identical (same log hash)",
        deltaPct: "",
        arrow: "",
      };
    if (
      x.value === null ||
      y?.value == null ||
      !Number.isFinite(x.value) ||
      !Number.isFinite(y.value)
    )
      return { ...row, delta: "–", deltaPct: "", arrow: "" };
    const d = y.value - x.value;
    // A share's change is in percentage points: "+5.0 pp", not "+5.0%".
    if (x.share) {
      if (Math.abs(d) < 0.001)
        return { ...row, delta: "same", deltaPct: "", arrow: "" };
      return {
        ...row,
        delta: `${d > 0 ? "+" : "−"}${(100 * Math.abs(d)).toFixed(1)} pp`,
        deltaPct: "",
        arrow: d > 0 ? "▲" : "▼",
      };
    }
    const rel =
      x.value === 0 ? (d === 0 ? 0 : Infinity) : d / Math.abs(x.value);
    if (Math.abs(rel) < 0.01)
      return { ...row, delta: "same", deltaPct: "", arrow: "" };
    return {
      ...row,
      delta: `${d > 0 ? "+" : "−"}${x.format(Math.abs(d))}`,
      deltaPct: Number.isFinite(rel)
        ? `${d > 0 ? "+" : "−"}${(100 * Math.abs(rel)).toFixed(1)}%`
        : "",
      arrow: d > 0 ? "▲" : "▼",
    };
  });
}

/** The summary's rows, in order, with each label's glossary entry. */
export const LABELS: readonly { key: string; label: string; term?: string }[] =
  [
    {
      key: "throughput",
      label: "Output tokens per second",
      term: "throughput",
    },
    { key: "ttft-mean", label: "Mean TTFT", term: "ttft" },
    { key: "ttft-p50", label: "p50 TTFT", term: "percentile" },
    { key: "ttft-p99", label: "p99 TTFT", term: "percentile" },
    { key: "itl-p50", label: "p50 ITL", term: "itl" },
    { key: "itl-p99", label: "p99 ITL", term: "percentile" },
    { key: "kv-mean", label: "KV in use, mean", term: "kv-cache" },
    { key: "kv-peak", label: "KV in use, peak" },
    { key: "waste", label: "KV wasted, mean", term: "kv-wasted" },
    { key: "hit-rate", label: "Prefix hit rate", term: "hit-rate" },
    { key: "preemptions", label: "Preemptions", term: "preemption" },
    { key: "evictions", label: "Evictions", term: "eviction" },
  ];
