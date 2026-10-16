import { useEffect, useMemo, useState } from "react";
import {
  Histogram,
  QueueChart,
} from "../../chapters/continuous-batching/charts.tsx";
import {
  Lanes,
  MAX_LANES,
} from "../../chapters/continuous-batching/RequestTimeline.tsx";
import type {
  Segment,
  StepSpan,
} from "../../chapters/continuous-batching/timeline.ts";
import { BlockGrid } from "../../chapters/paged-attention/BlockGrid.tsx";
import type { Cell } from "../../chapters/paged-attention/cells.ts";
import { GlossaryTerm } from "../ui/GlossaryTerm.tsx";
import { ProvenanceBadge } from "../ui/ProvenanceBadge.tsx";
import { useMediaQuery } from "../useMediaQuery.ts";
import { buildConfig, LLMSIZE_URL } from "./build.ts";
import type { SandboxConfig } from "./params.ts";
import {
  EVENT_TYPES,
  ITL_EDGES,
  TTFT_EDGES,
  type Done,
  type FromWorker,
  type Series,
} from "./protocol.ts";
import { LABELS, summarize } from "./summary.ts";
import type { useRun } from "./useRun.ts";

type Run = ReturnType<typeof useRun>;
type Frame = Extract<FromWorker, { type: "frame" }>;

const GIB = 2 ** 30;
const gib = (b: number) => `${(b / GIB).toFixed(1)} GiB`;
const n = (x: number) => x.toLocaleString("en-US");
const PHASES = ["prefill", "decode", "bubble", "held"] as const;
/** The events list shows the latest rows of the window. */
const EVENT_ROWS = 120;
export const EVENT_WINDOW_S = 0.25;

/** The worker's columns as chapter 3's lanes. */
function lanesOf(done: Done) {
  const s = done.segments;
  const segments: Segment[] = Array.from({ length: s.req.length }, (_, i) => ({
    slot: s.slot[i] ?? 0,
    req: s.req[i] ?? 0,
    phase: PHASES[s.phase[i] ?? 0] ?? "decode",
    t0: s.t0[i] ?? 0,
    t1: s.t1[i] ?? 0,
    start: s.start[i] ?? 0,
    first: s.first[i] === 1,
    preempted: s.preempted[i] === 1,
  }));
  const steps: StepSpan[] = Array.from(done.stallSteps, (t0, i) => ({
    step: i,
    t0,
    t1: done.stallEnds[i] ?? t0,
    stall: true,
  }));
  const queued = Array.from(done.queued.req, (req, i) => ({
    req,
    from: done.queued.from[i] ?? 0,
    to: done.queued.to[i] ?? 0,
  }));
  return { segments, steps, queued };
}

/** At most `most` points: the largest queue in each bucket keeps peaks. */
function downsample(series: Series, most: number) {
  const len = series.t.length;
  const out: { t: number; n: number }[] = [];
  const every = Math.max(1, Math.ceil(len / most));
  for (let i = 0; i < len; i += every) {
    let peak = 0;
    for (let j = i; j < Math.min(len, i + every); j++)
      peak = Math.max(peak, series.waiting[j] ?? 0);
    out.push({ t: series.t[i] ?? 0, n: peak });
  }
  return out;
}

// Most of a large pool is free: those cells share one object, so a frame
// allocates only for the blocks in use.
const FREE: Cell = { kind: "free" };
const GAP: Cell = { kind: "gap" };

/**
 * The worker's frame as grid cells. DESIGN.md's request hues cover slots
 * 1–8: when more run, or any holder sits in a slot above 8, blocks are
 * drawn by state, not by request.
 */
export function cellsOf(frame: Frame): Cell[] {
  const c = frame.cells;
  const aggregate =
    frame.running > MAX_LANES || frame.holders.some((h) => h.slot > MAX_LANES);
  const users = new Map<number, { reqs: number[]; logical: number[] }>();
  for (const h of frame.holders)
    h.blocks.forEach((b, i) => {
      const u = users.get(b) ?? { reqs: [], logical: [] };
      u.reqs.push(h.req);
      u.logical.push(i);
      users.set(b, u);
    });
  return Array.from(c.kind, (kind, b): Cell => {
    const req = c.req[b] ?? -1;
    const fill = c.fill[b] ?? 0;
    const logical = c.logical[b] ?? 0;
    switch (kind) {
      case 1:
        return aggregate
          ? { kind: "used", req, fill, logical }
          : { kind: "held", req, slot: c.slot[b] || 1, fill, logical };
      case 2: {
        const u = users.get(b) ?? { reqs: [req], logical: [logical] };
        return { kind: "shared", reqs: u.reqs, logical: u.logical };
      }
      case 3:
        return { kind: "cached", rank: c.count[b] ?? 0 };
      case 4:
        return GAP;
      default:
        return FREE;
    }
  });
}

/** A summary label, linked to its glossary entry where there is one. */
function Label({ label, term }: { label: string; term?: string }) {
  return term ? <GlossaryTerm id={term}>{label}</GlossaryTerm> : <>{label}</>;
}

/** One run's views: status, memory, summary, grid, lanes, charts, events. */
export function RunView({
  name,
  config,
  run,
  time,
  selected,
  onSelect,
}: {
  name: string;
  config: SandboxConfig;
  run: Run;
  time: number;
  selected: number | null;
  onSelect: (req: number | null) => void;
}) {
  const desktop = useMediaQuery("(min-width: 1024px)");
  const built = useMemo(() => buildConfig(config), [config]);
  const lanes = useMemo(
    () => (run.done ? lanesOf(run.done) : null),
    [run.done],
  );
  const queue = useMemo(() => downsample(run.series, 1500), [run.series]);
  // Built once per frame or pool, not per playhead render.
  const cells = useMemo(
    () =>
      run.frame
        ? cellsOf(run.frame)
        : new Array<Cell>(built.ok ? built.numBlocks : 0).fill(FREE),
    [run.frame, built],
  );
  const metrics = useMemo(
    () => (run.done ? summarize(run.done, run.series) : null),
    [run.done, run.series],
  );
  const marked = useMemo(() => new Set(run.frame?.evicted ?? []), [run.frame]);
  const [now, setNow] = useState(() => performance.now());
  useEffect(() => {
    if (run.status !== "running") return;
    const id = setTimeout(() => {
      setNow(performance.now());
    }, 320);
    return () => {
      clearTimeout(id);
    };
  }, [run.status, run.startedAt]);

  if (!built.ok)
    return (
      <section className="sb-run" aria-label={name} data-status="error">
        <h2 className="sb-run__name">{name}</h2>
        <div className="sb-error" role="alert">
          <p>
            <strong>Cannot run even one request.</strong> {built.message}{" "}
            {config.cap === "gpu" && <ProvenanceBadge kind="computed" />}
          </p>
          {config.cap === "gpu" && (
            <p>
              The memory numbers come from{" "}
              <a href={LLMSIZE_URL}>llmsize&apos;s memory math</a>.
            </p>
          )}
        </div>
      </section>
    );
  if (run.status === "error")
    return (
      <section className="sb-run" aria-label={name} data-status="error">
        <h2 className="sb-run__name">{name}</h2>
        <div className="sb-error" role="alert">
          <p>{run.error?.message}</p>
        </div>
      </section>
    );

  const showProgress = run.status === "running" && now - run.startedAt > 300;
  const capacity = built.capacity;
  const frame = run.frame;
  const done = run.done;
  // Every section is laid out from the start at its final size, so results
  // arriving move nothing (CHAPTER_DOD item 12).
  const kvNow = frame ? frame.kv.tokens : 0;
  const kvBytes = (tokens: number) =>
    capacity > 0 ? (built.bytes.kv * tokens) / capacity : 0;
  const total = built.bytes.usable;
  const w = (b: number) => `${String((100 * b) / total)}%`;
  const ttftCounts = done?.ttft.counts ?? TTFT_EDGES.slice(1).map(() => 0);
  const itlCounts = done?.itl.counts ?? ITL_EDGES.slice(1).map(() => 0);
  const byState =
    frame !== null &&
    (frame.running > MAX_LANES ||
      frame.holders.some((h) => h.slot > MAX_LANES));
  const events = run.events ? eventRows(run.events.columns) : null;
  return (
    <section className="sb-run" aria-label={name} data-status={run.status}>
      <h2 className="sb-run__name">{name}</h2>
      <div className="sb-status">
        {run.status === "running" && (
          <div className="sb-progress" data-hidden={!showProgress}>
            <progress
              value={run.progress?.finished ?? 0}
              max={run.progress?.total ?? 1}
              aria-label={`${name}: requests finished`}
            />
            <span className="num">
              {n(run.progress?.finished ?? 0)} of {n(run.progress?.total ?? 0)}{" "}
              requests done, {(run.progress?.simTime ?? 0).toFixed(1)} s
              simulated <ProvenanceBadge kind="simulated" />
            </span>
            <button type="button" className="button" onClick={run.cancel}>
              Cancel
            </button>
          </div>
        )}
        {run.status === "cancelled" && (
          <p className="sb-note">
            Run cancelled. Change a setting to run again.
          </p>
        )}
        {done && (
          <p className="sb-note num">
            {n(done.requests)} requests in {done.duration.toFixed(1)} s of
            simulated time, {n(done.steps)} steps.{" "}
            <ProvenanceBadge kind="simulated" />
          </p>
        )}
      </div>

      <figure className="sb-memory">
        <figcaption className="sb-sub">
          GPU memory: the weights, the KV pool, and what vLLM leaves unused (1 −
          GPU memory fraction)
        </figcaption>
        <div
          className="sb-bar"
          role="img"
          aria-label={`Weights ${gib(built.bytes.weights)}, KV pool ${gib(built.bytes.kv)} (${n(capacity)} tokens), left unused ${gib(total - built.bytes.budget)}, of ${gib(total)}. KV in use now: ${gib(kvBytes(kvNow))}.`}
        >
          <span
            className="sb-bar__weights"
            style={{ width: w(built.bytes.weights) }}
          />
          <span className="sb-bar__kv" style={{ width: w(built.bytes.kv) }}>
            <span
              className="sb-bar__used"
              style={{
                width: `${String(capacity > 0 ? (100 * kvNow) / capacity : 0)}%`,
              }}
            />
          </span>
          <span className="sb-bar__rest" />
        </div>
        <ul className="sb-legend num">
          <li>
            <span className="sb-swatch sb-swatch--weights" aria-hidden="true" />
            Weights {gib(built.bytes.weights)}
          </li>
          <li>
            <span className="sb-swatch sb-swatch--kv" aria-hidden="true" />
            KV pool {gib(built.bytes.kv)} ({n(capacity)} tokens){" "}
            <ProvenanceBadge kind="computed" />
          </li>
          <li>
            <span className="sb-swatch sb-swatch--used" aria-hidden="true" />
            KV in use at the playhead {gib(kvBytes(kvNow))}{" "}
            <ProvenanceBadge kind="simulated" />
          </li>
          <li>
            <span className="sb-swatch sb-swatch--rest" aria-hidden="true" />
            Left unused or outside the budget
          </li>
        </ul>
        {config.cap !== "gpu" && (
          <p className="sb-note">
            A fixed pool of {n(built.numBlocks)} blocks, set by hand, so the bar
            need not match this GPU.
          </p>
        )}
      </figure>

      <div
        className="sb-summary"
        aria-live={run.status === "done" ? "polite" : "off"}
      >
        <p className="sb-sub">
          Whole run <ProvenanceBadge kind="simulated" />
        </p>
        <dl className="num">
          {LABELS.map((l, i) => {
            const m = metrics?.[i];
            return (
              <div key={l.key}>
                <dt>
                  <Label label={l.label} term={l.term} />
                </dt>
                <dd>
                  {m?.value === null || m === undefined
                    ? "–"
                    : m.format(m.value)}
                </dd>
              </div>
            );
          })}
        </dl>
      </div>

      <div className="sb-grid" data-frame-t={frame?.t}>
        <p className="sb-sub">
          KV blocks at the playhead, {time.toFixed(2)} s
          {byState ? ", drawn by state, not by request" : ""}{" "}
          <ProvenanceBadge kind="simulated" />
        </p>
        <BlockGrid
          frame={null}
          spec={{
            allocator: config.al,
            blockSize: config.bs,
            capacity,
            maxModelLen: config.ml,
          }}
          label={name}
          selected={selected}
          onSelect={onSelect}
          cells={cells}
          summary={`${name} at ${time.toFixed(2)} s: ${String(frame?.running ?? 0)} running, ${String(frame?.waiting ?? 0)} waiting.`}
          marked={marked}
          showLogical
          maxCells={desktop ? 256 : 48}
        />
      </div>

      <div className="sb-lanes">
        <p className="sb-sub">
          Batch slots over time
          {config.ns > MAX_LANES
            ? `: showing ${String(MAX_LANES)} of ${n(config.ns)}`
            : ""}{" "}
          <ProvenanceBadge kind="simulated" />
        </p>
        <Lanes
          tl={lanes ?? EMPTY_LANES}
          cap={config.ns}
          time={time}
          window={desktop ? 30 : 12}
          name={name}
          dashed={false}
        />
      </div>

      <div className="sb-charts">
        <p className="sb-sub">
          The queue up to the playhead; TTFT and ITL over the whole run{" "}
          <ProvenanceBadge kind="simulated" />
        </p>
        <QueueChart
          title="Requests waiting at each step's end"
          series={[{ name, points: queue }]}
          time={Math.min(time, run.series.t.at(-1) ?? 0)}
          duration={done?.duration ?? run.progress?.simTime ?? 1}
        />
        <Histogram
          title="Time to first token (TTFT), log scale"
          noun="requests"
          edges={TTFT_EDGES}
          rows={[
            {
              name,
              values: [],
              count: done?.requests ?? 0,
              counts: ttftCounts,
              p50: done?.summary.ttft.p50 ?? NaN,
              p99: done?.summary.ttft.p99 ?? NaN,
            },
          ]}
        />
        <Histogram
          title="Inter-token latency (ITL), log scale"
          noun="gaps"
          edges={ITL_EDGES}
          rows={[
            {
              name,
              values: [],
              count: itlCounts.reduce((a, b) => a + b, 0),
              counts: itlCounts,
              p50: done?.summary.itl.p50 ?? NaN,
              p99: done?.summary.itl.p99 ?? NaN,
            },
          ]}
        />
      </div>

      <div className="sb-events" data-t1={run.events?.t1}>
        <h3 className="sb-sub">
          Events in the {EVENT_WINDOW_S} s before the playhead
          {run.events
            ? ` (${run.events.t0.toFixed(2)}–${run.events.t1.toFixed(2)} s)`
            : ""}{" "}
          <ProvenanceBadge kind="simulated" />
        </h3>
        <p
          className="sb-note"
          data-hidden={!events || events.total <= EVENT_ROWS}
        >
          The latest {EVENT_ROWS} of {n(events?.total ?? 0)}
          {run.events?.columns.truncated ? " (the window holds more)" : ""}.
        </p>
        <ol
          className="sb-events__list num"
          tabIndex={0}
          aria-label={`${name}: events before the playhead`}
        >
          {events?.rows.map((row) => (
            <li key={row.key}>{row.text}</li>
          ))}
        </ol>
      </div>
    </section>
  );
}

const EMPTY_LANES = { segments: [], steps: [], queued: [] };

function eventRows(cols: NonNullable<Run["events"]>["columns"]) {
  const rows: { key: number; text: string }[] = [];
  const shown = Math.min(cols.t.length, EVENT_ROWS);
  for (let k = 0; k < shown; k++) {
    const i = cols.t.length - 1 - k;
    const type = EVENT_TYPES[cols.type[i] ?? 0] ?? "";
    const req = cols.req[i] ?? -1;
    const v = cols.value[i] ?? NaN;
    const what =
      type === "StepEnd"
        ? `step took ${(v * 1000).toFixed(1)} ms`
        : type === "PrefillChunk"
          ? `${String(v)} prompt tokens`
          : type === "DecodeToken"
            ? `token ${String(v)}`
            : type === "CacheHit"
              ? `${String(v)} tokens hit`
              : type === "Admit"
                ? `${String(v)} cached tokens`
                : type === "Allocate"
                  ? `${String(v)} blocks`
                  : type === "Evict" || type === "CacheInsert"
                    ? `block ${String(v)}`
                    : "";
    rows.push({
      key: i,
      text: `${(cols.t[i] ?? 0).toFixed(3)} s · step ${String(cols.step[i] ?? 0)} · ${type}${req >= 0 ? ` · r${String(req)}` : ""}${what ? ` · ${what}` : ""}`,
    });
  }
  return { rows, total: cols.t.length };
}
