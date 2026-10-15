import {
  memo,
  useCallback,
  useDeferredValue,
  useId,
  useMemo,
  useState,
} from "react";
import { Figure } from "../../viz/ui/Figure.tsx";
import { PlaybackBar } from "../../viz/ui/PlaybackBar.tsx";
import { ProvenanceBadge } from "../../viz/ui/ProvenanceBadge.tsx";
import { RequestMark } from "../../viz/ui/RequestMark.tsx";
import { Select } from "../../viz/ui/Select.tsx";
import { Slider } from "../../viz/ui/Slider.tsx";
import { Toggle } from "../../viz/ui/Toggle.tsx";
import { useMediaQuery } from "../../viz/useMediaQuery.ts";
import { usePlayhead } from "../../viz/usePlayhead.ts";
import { useWidth } from "../../viz/useWidth.ts";
import { Histogram, logEdges, QueueChart, secs } from "./charts.tsx";
import {
  BASICS,
  BASICS_STATIC,
  budgetOf,
  PREEMPT_POOL,
  RARE_LONG_SHARE,
  SIGMAS,
  STALL,
  STALL_OFF,
  SWEEP_BUDGETS,
  type PresetKey,
  type RunOptions,
} from "./presets.ts";
import {
  countTo,
  queueAt,
  readoutAt,
  runTimeline,
  type Segment,
  type Timeline,
} from "./timeline.ts";

/**
 * - static: one run of `batching-basics`, request-level by default (step 2)
 * - policy: static vs. continuous (step 3)
 * - preemption: continuous on a small pool (step 4)
 * - stall: one run of `long-prompt-stall`, chunking off by default (step 5)
 * - chunking: chunking off vs. on (step 6)
 */
export type Mode = "static" | "policy" | "preemption" | "stall" | "chunking";

const PRESET: Record<Mode, PresetKey> = {
  static: "batching-basics",
  policy: "batching-basics",
  preemption: "batching-basics",
  stall: "long-prompt-stall",
  chunking: "long-prompt-stall",
};

const START: Record<Mode, RunOptions> = {
  static: BASICS_STATIC,
  policy: BASICS,
  preemption: BASICS,
  stall: STALL_OFF,
  chunking: STALL,
};

const CAPTION: Record<Mode, { number: string; caption: string }> = {
  static: {
    number: "3.2",
    caption:
      "Each lane is a batch slot. A request takes the lowest free one when it is admitted. Time runs left to right.",
  },
  policy: {
    number: "3.3",
    caption: "The same requests, scheduled per batch and per step.",
  },
  preemption: {
    number: "3.4",
    caption: `Continuous batching on a pool of ${String(PREEMPT_POOL.blocks)} blocks (${(PREEMPT_POOL.blocks * PREEMPT_POOL.blockSize).toLocaleString("en-US")} tokens).`,
  },
  stall: {
    number: "3.5",
    caption:
      "A mix of short prompts and a few very long ones. Shaded columns mark steps over 5 times the median.",
  },
  chunking: {
    number: "3.6",
    caption: "The same requests with chunked prefill off and on.",
  },
};

interface RunSpec {
  name: string;
  preset: PresetKey;
  o: RunOptions;
  numBlocks?: number;
  longShare?: number;
}

function runSpecs(
  mode: Mode,
  o: RunOptions,
  longShare: number | undefined,
): RunSpec[] {
  const preset = PRESET[mode];
  switch (mode) {
    case "static":
      return [
        {
          name: o.policy === "static" ? "Static" : "Continuous",
          preset,
          o,
        },
      ];
    case "policy":
      return [
        { name: "Static", preset, o: { ...o, policy: "static" } },
        { name: "Continuous", preset, o: { ...o, policy: "continuous" } },
      ];
    case "preemption":
      return [
        { name: "Continuous", preset, o, numBlocks: PREEMPT_POOL.blocks },
      ];
    case "stall":
      return [
        {
          name: o.chunked ? "Chunking on" : "Chunking off",
          preset,
          o,
        },
      ];
    case "chunking":
      return [
        {
          name: "Chunking off",
          preset,
          o: { ...o, chunked: false },
          longShare,
        },
        { name: "Chunking on", preset, o: { ...o, chunked: true }, longShare },
      ];
  }
}

const TTFT_EDGES = logEdges(0.01, 100, 4);
const ITL_EDGES = logEdges(0.01, 10, 5);
const LONG_SHARES = [
  { value: "default", label: "15% (the preset)" },
  { value: "rare", label: `${String(100 * RARE_LONG_SHARE)}%` },
] as const;

/**
 * Figures 3.2–3.6: the request timeline. Every control re-runs the sims from
 * the same seed and keeps the playhead. The drawing is a pure function of
 * the event log and the playhead.
 */
export function RequestTimeline({ mode }: { mode: Mode }) {
  const [options, setOptions] = useState<RunOptions>(START[mode]);
  const [share, setShare] = useState<"default" | "rare">("default");
  // Controls answer at once; the sims re-run in a deferred render.
  const shownOptions = useDeferredValue(options);
  const shownShare = useDeferredValue(share);
  const runs = useMemo(
    () =>
      runSpecs(
        mode,
        shownOptions,
        shownShare === "rare" ? RARE_LONG_SHARE : undefined,
      ).map((spec) => ({
        name: spec.name,
        tl: runTimeline(spec.preset, spec.o, {
          numBlocks: spec.numBlocks,
          longShare: spec.longShare,
        }),
      })),
    [mode, shownOptions, shownShare],
  );
  const duration = Math.max(...runs.map((r) => r.tl.duration));
  const ph = usePlayhead(duration);
  const desktop = useMediaQuery("(min-width: 1024px)");
  const set = useCallback((patch: Partial<RunOptions>) => {
    setOptions((o) => ({ ...o, ...patch }));
  }, []);
  const tls = useMemo(() => runs.map((r) => r.tl), [runs]);
  const nextEnd = () =>
    Math.min(
      duration,
      ...runs.map(
        (r) => r.tl.stepEnds.find((t) => t > ph.time + 1e-9) ?? duration,
      ),
    );
  const { number, caption } = CAPTION[mode];
  const compare = runs.length > 1;

  return (
    <Figure number={number} caption={caption}>
      <div className="cb" data-mode={mode}>
        <Controls
          mode={mode}
          options={options}
          set={set}
          share={share}
          setShare={setShare}
        />
        {runs.map((r, i) => (
          <div
            key={r.name}
            className="cb__run"
            role="group"
            aria-label={r.name}
          >
            <div className="cb__head">
              <h3 className="cb__name">{r.name}</h3>
              <RunReadout tl={r.tl} time={ph.time} live={!ph.playing} />
            </div>
            <Lanes
              tl={r.tl}
              time={ph.time}
              window={desktop ? 30 : 12}
              name={r.name}
              dashed={compare && i === 1}
            />
          </div>
        ))}
        <Legend runs={tls} />
        <p className="cb__note">
          &ldquo;So far&rdquo; counts the requests that have their first token
          and the tokens made by the playhead.
        </p>
        <PlaybackBar
          time={ph.time}
          duration={duration}
          playing={ph.playing}
          speed={ph.speed}
          formatTime={(t) => `${t.toFixed(2)} s`}
          onPlay={ph.play}
          onPause={() => {
            ph.setPlaying(false);
          }}
          onStep={() => {
            ph.setPlaying(false);
            ph.setTime(nextEnd());
          }}
          onSeek={(t) => {
            ph.setPlaying(false);
            ph.setTime(t);
          }}
          onSpeed={ph.setSpeed}
        />
        <div className="cb__charts">
          <QueueChart
            title="Requests waiting at each step's end"
            series={runs.map((r, i) => ({
              name: r.name,
              points: r.tl.stepQueue,
              dashed: i === 1,
            }))}
            time={ph.time}
            duration={duration}
          />
          <Histogram
            title="Time to first token (TTFT), log scale"
            noun="requests"
            edges={TTFT_EDGES}
            rows={runs.map((r) => {
              const n = countTo(r.tl.firsts, ph.time);
              return {
                name: r.name,
                values: r.tl.ttft.values,
                count: n,
                p50: r.tl.ttft.p50[n] ?? NaN,
                p99: r.tl.ttft.p99[n] ?? NaN,
              };
            })}
          />
          <Histogram
            title="Inter-token latency (ITL), log scale"
            noun="gaps"
            edges={ITL_EDGES}
            rows={runs.map((r) => {
              const n = countTo(r.tl.gaps, ph.time);
              return {
                name: r.name,
                values: r.tl.itl.values,
                count: n,
                p50: r.tl.itl.p50[n] ?? NaN,
                p99: r.tl.itl.p99[n] ?? NaN,
              };
            })}
          />
          <ProvenanceBadge kind="simulated" />
        </div>
      </div>
    </Figure>
  );
}

/** Memoized: playback re-renders the figure every frame, not its controls. */
const Controls = memo(function Controls({
  mode,
  options: o,
  set,
  share,
  setShare,
}: {
  mode: Mode;
  options: RunOptions;
  set: (patch: Partial<RunOptions>) => void;
  share: "default" | "rare";
  setShare: (s: "default" | "rare") => void;
}) {
  const batching = PRESET[mode] === "batching-basics";
  const budget = budgetOf(PRESET[mode], o);
  return (
    <div className="cb__controls">
      {mode === "static" && (
        <Radio
          label="Scheduler"
          value={o.policy}
          options={[
            { value: "static", label: "Static (per batch)" },
            { value: "continuous", label: "Continuous (per step)" },
          ]}
          onChange={(policy) => {
            set({ policy });
          }}
        />
      )}
      {mode === "stall" && (
        <Toggle
          label="Chunked prefill"
          checked={o.chunked}
          onChange={(chunked) => {
            set({ chunked });
          }}
        />
      )}
      {(mode === "stall" || mode === "chunking") && (
        <div>
          <Slider
            label={
              mode === "chunking"
                ? "Token budget (chunking on)"
                : "Token budget (max_num_batched_tokens)"
            }
            value={mode === "stall" ? budget : o.budget}
            stops={SWEEP_BUDGETS}
            disabled={mode === "stall" && !o.chunked}
            format={(v) => `${v.toLocaleString("en-US")} tokens`}
            onChange={(v) => {
              set({ budget: v });
            }}
          />
          <p className="cb__note" data-hidden={mode !== "stall" || o.chunked}>
            Raised to {budget.toLocaleString("en-US")}, as vLLM does when no
            budget is set.
          </p>
        </div>
      )}
      {mode === "chunking" && (
        <Select
          label="Share of long prompts"
          value={share}
          options={LONG_SHARES}
          onChange={setShare}
        />
      )}
      <Slider
        label="Arrival rate"
        value={o.rate}
        min={0.4}
        max={2.4}
        step={0.1}
        format={(v) => `${v.toFixed(1)} per second`}
        onChange={(v) => {
          set({ rate: Math.round(v * 10) / 10 });
        }}
      />
      {batching && (
        <Slider
          label="Output length spread (σ)"
          value={o.sigma}
          stops={SIGMAS}
          format={(v) => v.toFixed(2)}
          onChange={(v) => {
            set({ sigma: v });
          }}
        />
      )}
      <Slider
        label="max_num_seqs"
        value={o.maxNumSeqs}
        min={1}
        max={8}
        format={(v) => `${String(v)} at once`}
        onChange={(v) => {
          set({ maxNumSeqs: v });
        }}
      />
    </div>
  );
});

function Radio<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: readonly { value: T; label: string }[];
  onChange: (v: T) => void;
}) {
  const name = useId();
  return (
    <fieldset className="control radio">
      <legend className="control__label">{label}</legend>
      {options.map((opt) => (
        <label key={opt.value} className="radio__option">
          <input
            type="radio"
            name={name}
            value={opt.value}
            checked={value === opt.value}
            onChange={() => {
              onChange(opt.value);
            }}
          />
          {opt.label}
        </label>
      ))}
    </fieldset>
  );
}

/** Throughput, TTFT, and ITL so far and at the end of the run (`simulated`). */
function RunReadout({
  tl,
  time,
  live,
}: {
  tl: Timeline;
  time: number;
  live: boolean;
}) {
  const now = readoutAt(tl, time);
  const end = useMemo(() => readoutAt(tl, tl.duration), [tl]);
  const row = (name: string, r: typeof now) => (
    <tr>
      <th scope="row">{name}</th>
      <td>{r.throughput.toFixed(1)}</td>
      <td>{secs(r.ttftMean)}</td>
      <td>{secs(r.ttftP99)}</td>
      <td>{secs(r.itlP50)}</td>
      <td>{secs(r.itlP99)}</td>
    </tr>
  );
  return (
    <div className="cb__readout" aria-live={live ? "polite" : "off"}>
      <table className="num">
        <thead>
          <tr>
            <td />
            <th scope="col">Output tok/s</th>
            <th scope="col">Mean TTFT</th>
            <th scope="col">p99 TTFT</th>
            <th scope="col">p50 ITL</th>
            <th scope="col">p99 ITL</th>
          </tr>
        </thead>
        <tbody>
          {row("So far", now)}
          {row("At the end", end)}
        </tbody>
      </table>
    </div>
  );
}

const LANE = 24;
const GAP = 4;
const QUEUE = 32;
const AXIS = 22;
const TAB = 16;
const CHIP = 34;

/** The slots as lanes, the queue above them, and long steps as bands. */
function Lanes({
  tl,
  time,
  window: span,
  name,
  dashed,
}: {
  tl: Timeline;
  time: number;
  window: number;
  name: string;
  dashed: boolean;
}) {
  const [ref, W] = useWidth<SVGSVGElement>(640);
  const ids = useId();
  const cap = tl.config.scheduler.maxNumSeqs;
  const H = QUEUE + cap * (LANE + GAP) + AXIS;
  const view0 = Math.max(0, time - (2 * span) / 3);
  const view1 = view0 + span;
  const x = (t: number) => ((t - view0) / span) * W;
  const laneY = (slot: number) => QUEUE + (slot - 1) * (LANE + GAP);
  const visible = tl.segments.filter(
    (s) => s.t1 > view0 && s.t0 <= time && s.t0 < view1,
  );
  const bands = tl.steps.filter((s) => s.stall && s.t1 > view0 && s.t0 <= time);
  const waiting = queueAt(tl, time);
  const maxChips = Math.max(1, Math.min(12, Math.floor((W - 40) / (CHIP + 4))));
  const running = visible.filter((s) => s.t0 <= time && time < s.t1);
  const bubbles = running.filter((s) => s.phase === "bubble").length;
  const ticks: number[] = [];
  const every = span > 20 ? 5 : 2;
  for (let t = Math.ceil(view0 / every) * every; t <= view1; t += every)
    ticks.push(t);
  const pattern = (s: Segment) =>
    s.phase === "prefill"
      ? `url(#${ids}-prefill)`
      : s.phase === "bubble"
        ? `url(#${ids}-bubble)`
        : s.phase === "decode"
          ? "var(--ink-2)"
          : "none";
  return (
    <svg
      ref={ref}
      className="cb-lanes"
      viewBox={`0 0 ${String(W)} ${String(H)}`}
      role="img"
      aria-label={`${name} at ${time.toFixed(2)} s: ${String(running.length)} of ${String(cap)} batch slots held${bubbles > 0 ? `, ${String(bubbles)} by finished requests` : ""}; ${String(waiting.length)} waiting.`}
      data-dashed={dashed}
    >
      <defs>
        <pattern
          id={`${ids}-prefill`}
          width="6"
          height="6"
          patternUnits="userSpaceOnUse"
          patternTransform="rotate(45)"
        >
          <rect width="6" height="6" fill="var(--ink)" />
          <line
            x1="0"
            y1="0"
            x2="0"
            y2="6"
            stroke="var(--surface)"
            strokeWidth="2"
          />
        </pattern>
        <pattern
          id={`${ids}-bubble`}
          width="5"
          height="5"
          patternUnits="userSpaceOnUse"
          patternTransform="rotate(-45)"
        >
          <rect width="5" height="5" fill="var(--surface)" />
          <line
            x1="0"
            y1="0"
            x2="0"
            y2="5"
            stroke="var(--block-waste)"
            strokeWidth="1.5"
          />
        </pattern>
      </defs>
      {Array.from({ length: cap }, (_, i) => (
        <line
          key={i}
          className="chart__grid"
          x1={0}
          x2={W}
          y1={laneY(i + 1) + LANE}
          y2={laneY(i + 1) + LANE}
        />
      ))}
      {bands.map((s) => {
        const x0 = x(Math.max(s.t0, view0));
        const x1 = x(Math.min(s.t1, time));
        return (
          <g key={s.step} className="cb-band">
            <rect
              x={x0}
              y={QUEUE - 3}
              width={Math.max(1, x1 - x0)}
              height={cap * (LANE + GAP) + 2}
            />
            {x1 - x0 >= 64 && (
              <text x={x0 + 4} y={H - AXIS - 6}>
                {secs(s.t1 - s.t0)} step
              </text>
            )}
          </g>
        );
      })}
      {visible.map((s) => {
        const x0 = x(Math.max(s.t0, view0));
        const x1 = x(Math.min(s.t1, time));
        return (
          <rect
            key={`${String(s.req)}-${String(s.t0)}`}
            className={`cb-seg cb-seg--${s.phase}`}
            x={x0}
            y={laneY(s.slot) + 2}
            width={Math.max(0, x1 - x0)}
            height={LANE - 4}
            fill={pattern(s)}
          />
        );
      })}
      {/* One tab and one id label per stay in a slot, drawn over its segments. */}
      {stays(visible).map((o) => {
        const x0 = x(Math.max(o.start, view0));
        const x1 = x(Math.min(o.end, time));
        const y = laneY(o.slot);
        const tab = o.start >= view0;
        const at = x0 + (tab ? TAB : 0);
        return (
          <g key={`${String(o.req)}-${String(o.start)}`}>
            {x1 - at >= 28 && (
              <g className="cb-seg__label">
                <rect x={at + 2} y={y + 5} width={24} height={14} />
                <text x={at + 14} y={y + 16} textAnchor="middle">
                  r{o.req}
                </text>
              </g>
            )}
            {tab && (
              <g transform={`translate(${String(x0)} ${String(y + 4)})`}>
                <RequestMark
                  slot={o.slot}
                  size={TAB}
                  title={`r${String(o.req)}, slot ${String(o.slot)}`}
                />
              </g>
            )}
            {o.preempted && o.end <= time && (
              <g className="cb-preempt">
                <line x1={x1} x2={x1} y1={y} y2={y + LANE} />
                <text x={x1 + 3} y={y + 16}>
                  preempted
                </text>
              </g>
            )}
          </g>
        );
      })}
      <g className="cb-queue">
        {waiting.slice(0, maxChips).map((req, i) => (
          <g key={req}>
            <rect x={2 + i * (CHIP + 4)} y={4} width={CHIP} height={22} />
            <text x={2 + i * (CHIP + 4) + CHIP / 2} y={19} textAnchor="middle">
              r{req}
            </text>
          </g>
        ))}
        {waiting.length > maxChips && (
          <text className="cb-queue__more" x={4 + maxChips * (CHIP + 4)} y={19}>
            +{waiting.length - maxChips}
          </text>
        )}
      </g>
      <line
        className="cb-playhead"
        x1={x(time)}
        x2={x(time)}
        y1={0}
        y2={H - AXIS}
      />
      {ticks.map((t) => (
        <text
          key={t}
          className="chart__tick"
          x={x(t)}
          y={H - 6}
          textAnchor={x(t) < 20 ? "start" : x(t) > W - 20 ? "end" : "middle"}
        >
          {t} s
        </text>
      ))}
    </svg>
  );
}

/** Visible segments grouped by stay: one request's time in one slot. */
function stays(segments: readonly Segment[]) {
  const by = new Map<
    string,
    {
      req: number;
      slot: number;
      start: number;
      end: number;
      preempted: boolean;
    }
  >();
  for (const s of segments) {
    const key = `${String(s.req)}-${String(s.start)}`;
    const o = by.get(key);
    if (o) {
      o.end = Math.max(o.end, s.t1);
      o.preempted ||= s.preempted;
    } else
      by.set(key, {
        req: s.req,
        slot: s.slot,
        start: s.start,
        end: s.t1,
        preempted: s.preempted,
      });
  }
  return [...by.values()];
}

const Legend = memo(function Legend({ runs }: { runs: readonly Timeline[] }) {
  const has = (phase: Segment["phase"]) =>
    runs.some((tl) => tl.segments.some((s) => s.phase === phase));
  const stalls = runs.some((tl) => tl.steps.some((s) => s.stall));
  const preempts = runs.some((tl) => tl.preemptions.length > 0);
  return (
    <ul className="cb-legend cb-legend--phases">
      <li>
        <span className="cb-swatch cb-swatch--queued" aria-hidden="true" />
        Waiting in the queue
      </li>
      <li>
        <span className="cb-swatch cb-swatch--prefill" aria-hidden="true" />
        Prefill
      </li>
      <li>
        <span className="cb-swatch cb-swatch--decode" aria-hidden="true" />
        Decode
      </li>
      {has("bubble") && (
        <li>
          <span className="cb-swatch cb-swatch--bubble" aria-hidden="true" />
          Finished, still holding its batch slot
        </li>
      )}
      {has("held") && (
        <li>
          <span className="cb-swatch cb-swatch--held" aria-hidden="true" />
          Holding its batch slot, not scheduled this step
        </li>
      )}
      {stalls && (
        <li>
          <span className="cb-swatch cb-swatch--band" aria-hidden="true" />A
          step over 5 times the median
        </li>
      )}
      {preempts && (
        <li>
          <span className="cb-swatch cb-swatch--preempt" aria-hidden="true" />
          Preempted
        </li>
      )}
    </ul>
  );
});
