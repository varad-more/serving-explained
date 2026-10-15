import { useMemo, useState } from "react";
import { Figure } from "../../viz/ui/Figure.tsx";
import { PlaybackBar } from "../../viz/ui/PlaybackBar.tsx";
import { ProvenanceBadge } from "../../viz/ui/ProvenanceBadge.tsx";
import { Select } from "../../viz/ui/Select.tsx";
import { Slider } from "../../viz/ui/Slider.tsx";
import { usePlayhead } from "../../viz/usePlayhead.ts";
import { BlockGrid } from "./BlockGrid.tsx";
import type { GridSpec } from "./cells.ts";
import {
  frameAt,
  meanOver,
  meanTableLength,
  peakRunning,
  wasteShare,
  type Frame,
} from "./frames.ts";
import {
  BLOCK_SIZES,
  CAPACITY,
  compareConfig,
  compareFrames,
  DEFAULTS,
  MAX_MODEL_LENS,
  WINDOW_S,
  type Allocator,
  type CompareOptions,
} from "./presets.ts";

export type Mode = "contiguous" | "paged" | "compare" | "block-size";

const n = (x: number) => x.toLocaleString("en-US");

function figureText(mode: Mode, o: CompareOptions) {
  switch (mode) {
    case "contiguous":
      return {
        number: "2.1",
        caption: `Contiguous allocation: each request reserves a ${n(o.maxModelLen)}-token region when it starts running.`,
      };
    case "paged":
      return {
        number: "2.2",
        caption: `Paged allocation: a request takes ${n(o.blockSize)}-token blocks as its tokens need them.`,
      };
    case "compare":
      return {
        number: "2.4",
        caption:
          "The same requests on both allocators, in lockstep by simulated time.",
      };
    case "block-size":
      return {
        number: "2.5",
        caption: `Paged allocation at the block size you pick, with the pool fixed at ${n(CAPACITY)} tokens.`,
      };
  }
}

const MAX_RUNNING = compareConfig("paged").scheduler.maxNumSeqs;
const pct = (x: number) => `${(100 * x).toFixed(0)}%`;
/** A figure space is one digit wide: " 6%" and "60%" take the same room. */
const FIGURE_SPACE = "\u2007";
const padded = (x: number) => pct(x).padStart(3, FIGURE_SPACE);

/**
 * Figures 2.1, 2.2, 2.4, and 2.5: the paged-vs-contiguous preset on a toy
 * GPU. Every control re-runs both sims and keeps the playhead.
 */
export function PagedFigure({ mode }: { mode: Mode }) {
  const [options, setOptions] = useState<CompareOptions>(DEFAULTS);
  const [selected, setSelected] = useState<number | null>(null);
  const runs = useMemo(
    () => ({
      contiguous: compareFrames("contiguous-max", options),
      paged: compareFrames("paged", options),
    }),
    [options],
  );
  const shown: Allocator[] =
    mode === "compare"
      ? ["contiguous-max", "paged"]
      : mode === "contiguous"
        ? ["contiguous-max"]
        : ["paged"];
  const framesOf = (a: Allocator) =>
    a === "paged" ? runs.paged : runs.contiguous;
  const duration = Math.max(...shown.map((a) => framesOf(a).at(-1)?.t ?? 0));
  const ph = usePlayhead(duration);
  const set = (patch: Partial<CompareOptions>) => {
    setOptions((o) => ({ ...o, ...patch }));
  };
  const spec = (allocator: Allocator): GridSpec => ({
    allocator,
    blockSize: options.blockSize,
    capacity: CAPACITY,
    maxModelLen: options.maxModelLen,
  });
  const current = shown.map((a) => ({
    a,
    frame: frameAt(framesOf(a), ph.time),
  }));
  const holders = [
    ...new Set(
      current.flatMap(({ frame }) => frame?.holders.map((h) => h.req) ?? []),
    ),
  ].sort((x, y) => x - y);

  // Step: the next StepEnd of any grid on screen.
  const nextEnd = () =>
    Math.min(
      duration,
      ...shown.map(
        (a) => framesOf(a).find((f) => f.t > ph.time + 1e-9)?.t ?? duration,
      ),
    );

  const { number, caption } = figureText(mode, options);
  return (
    <Figure number={number} caption={caption}>
      <div className="paged" data-mode={mode}>
        <p className="paged__toy">
          Toy GPU:{" "}
          <span className="num">{CAPACITY.toLocaleString("en-US")}</span> tokens
          of KV, at most {MAX_RUNNING} requests at once.
        </p>

        {mode === "compare" && (
          <div className="paged__controls">
            <BlockSizeSlider
              value={options.blockSize}
              onChange={(v) => {
                set({ blockSize: v });
              }}
            />
            <Slider
              label="Arrival rate"
              value={options.rate}
              min={0.5}
              max={3}
              step={0.25}
              format={(v) => `${v.toFixed(2)} per second`}
              onChange={(v) => {
                set({ rate: v });
              }}
            />
            <Slider
              label="Output length spread (σ)"
              value={options.sigma}
              min={0}
              max={1}
              step={0.1}
              format={(v) => v.toFixed(1)}
              onChange={(v) => {
                set({ sigma: Math.round(v * 10) / 10 });
              }}
            />
            <Select
              label="max_model_len"
              value={String(options.maxModelLen)}
              options={MAX_MODEL_LENS.map((m) => ({
                value: String(m),
                label: `${String(m)} tokens`,
              }))}
              onChange={(v) => {
                set({ maxModelLen: Number(v) });
              }}
            />
          </div>
        )}
        {mode === "block-size" && (
          <div className="paged__controls">
            <BlockSizeSlider
              value={options.blockSize}
              onChange={(v) => {
                set({ blockSize: v });
              }}
            />
          </div>
        )}

        {current.map(({ a, frame }) => (
          <div
            key={a}
            className="paged__grid"
            role="group"
            aria-label={a === "paged" ? "Paged" : "Contiguous"}
          >
            <div className="paged__head">
              <h3 className="paged__name">
                {a === "paged" ? "Paged" : "Contiguous"}
              </h3>
              <Readout frame={frame} allocator={a} live={!ph.playing} />
            </div>
            <BlockGrid
              frame={frame}
              spec={spec(a)}
              label={a === "paged" ? "Paged" : "Contiguous"}
              selected={selected}
              onSelect={setSelected}
            />
          </div>
        ))}

        <Legend contiguous={shown.includes("contiguous-max")} />
        <p className="paged__keys">
          Keys: Tab to a grid, then arrows move the cell cursor, Home and End
          jump to the ends, and Enter selects the cell&apos;s request.
        </p>

        <PlaybackBar
          time={ph.time}
          duration={duration}
          playing={ph.playing}
          speed={ph.speed}
          // Two decimals: one engine step is about 40 ms of sim time.
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

        <div className="paged__select">
          <Select
            label="Show a request's blocks"
            value={selected === null ? "" : String(selected)}
            options={[
              { value: "", label: "None" },
              ...[
                ...new Set([
                  ...holders,
                  ...(selected === null ? [] : [selected]),
                ]),
              ].map((r) => ({
                value: String(r),
                label: `r${String(r)}`,
              })),
            ]}
            onChange={(v) => {
              setSelected(v === "" ? null : Number(v));
            }}
          />
          {selected !== null && (
            <TablePanel
              req={selected}
              current={current}
              blockSize={options.blockSize}
            />
          )}
        </div>

        {mode === "block-size" && (
          <BlockSizeCharts blockSize={options.blockSize} />
        )}
      </div>
    </Figure>
  );
}

function BlockSizeSlider({
  value,
  onChange,
}: {
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <Slider
      label="Block size"
      value={value}
      stops={BLOCK_SIZES}
      format={(v) => `${String(v)} tokens`}
      onChange={onChange}
    />
  );
}

/** Running, waiting, KV used, and waste for one grid (`simulated`). */
function Readout({
  frame,
  allocator,
  live,
}: {
  frame: Frame | null;
  allocator: Allocator;
  live: boolean;
}) {
  const kv = frame?.kv;
  const share = (x: number) => (kv ? x / kv.capacity : 0);
  const reserved = kv ? share(kv.allocated - kv.tokens) : 0;
  const gap = kv ? share(kv.unusable) : 0;
  return (
    <div className="paged__readout" aria-live={live ? "polite" : "off"}>
      <dl className="num">
        <div>
          <dt>Running</dt>
          <dd className="w2">{frame?.running ?? 0}</dd>
        </div>
        <div>
          <dt>Waiting</dt>
          <dd className="w2">{frame?.waiting ?? 0}</dd>
        </div>
        <div>
          <dt>KV used</dt>
          <dd className="w4">{pct(kv ? share(kv.tokens) : 0)}</dd>
        </div>
        <div>
          <dt>Waste</dt>
          <dd>
            <span className="w4">{pct(reserved + gap)}</span>
            {allocator === "contiguous-max" && (
              <span className="paged__split">
                {" "}
                (reserved {padded(reserved)}, gap {padded(gap)})
              </span>
            )}
          </dd>
        </div>
        {/* Laid out even at 0, so its first appearance moves nothing. */}
        {allocator === "paged" && (
          <div data-hidden={(frame?.preemptions ?? 0) === 0}>
            <dt>Preemptions</dt>
            <dd className="w2">{frame?.preemptions ?? 0}</dd>
          </div>
        )}
      </dl>
      <ProvenanceBadge kind="simulated" />
    </div>
  );
}

/** The selected request's block table (paged) or region (contiguous). */
function TablePanel({
  req,
  current,
  blockSize: B,
}: {
  req: number;
  current: { a: Allocator; frame: Frame | null }[];
  blockSize: number;
}) {
  return (
    <div
      className="table-panel"
      tabIndex={0}
      role="group"
      aria-label={`r${String(req)}'s blocks`}
    >
      {current.map(({ a, frame }) => {
        const h = frame?.holders.find((x) => x.req === req);
        const name = a === "paged" ? "Paged" : "Contiguous";
        if (!h) {
          return (
            <p key={a} className="table-panel__none">
              {name}: r{req} holds no memory now (waiting or finished).
            </p>
          );
        }
        if (h.region) {
          return (
            <p key={a} className="num">
              {name}: r{req} reserves slots {h.region.start}–
              {h.region.start + h.region.len - 1} ({h.region.len} slots) and
              uses {h.computed}.
            </p>
          );
        }
        return (
          <table key={a} className="table-panel__table num">
            <caption>
              {name}: r{req}&apos;s block table
            </caption>
            <thead>
              <tr>
                <th scope="col">Logical</th>
                <th scope="col">Physical</th>
                <th scope="col">Filled</th>
              </tr>
            </thead>
            <tbody>
              {h.blocks.map((b, i) => (
                <tr key={b}>
                  <td>{i}</td>
                  <td>{b}</td>
                  <td>
                    {Math.min(B, Math.max(0, h.computed - i * B))} of {B}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        );
      })}
    </div>
  );
}

function Legend({ contiguous }: { contiguous: boolean }) {
  return (
    <ul className="paged__legend">
      <li>
        <span
          className="legend-swatch legend-swatch--held"
          aria-hidden="true"
        />
        A request&apos;s KV: color, pattern, and glyph per request
      </li>
      <li>
        <span
          className="legend-swatch legend-swatch--waste"
          aria-hidden="true"
        />
        Slots held but empty
      </li>
      <li>
        <span
          className="legend-swatch legend-swatch--free"
          aria-hidden="true"
        />
        Free: held by no request
      </li>
      {contiguous && (
        <li>
          <span
            className="legend-swatch legend-swatch--gap"
            aria-hidden="true"
          />
          Gap: free space too small for a region
        </li>
      )}
      <li>
        <span
          className="legend-swatch legend-swatch--selected"
          aria-hidden="true"
        />
        Selected request
      </li>
    </ul>
  );
}

/** Step 6's two small charts, from 5 runs of the preset (one per block size). */
let chartData: { B: number; waste: number; table: number }[] | null = null;
export function blockSizeSeries() {
  chartData ??= BLOCK_SIZES.map((B) => {
    const frames = compareFrames("paged", { ...DEFAULTS, blockSize: B });
    return {
      B,
      waste: meanOver(frames, wasteShare, WINDOW_S),
      table: meanOver(frames, meanTableLength, WINDOW_S),
    };
  });
  return chartData;
}

function BlockSizeCharts({ blockSize }: { blockSize: number }) {
  const data = blockSizeSeries();
  return (
    <div className="bs-charts">
      <MiniChart
        title={`Mean waste, first ${String(WINDOW_S)} s`}
        points={data.map((d) => ({
          x: d.B,
          y: 100 * d.waste,
          label: `${(100 * d.waste).toFixed(1)}%`,
        }))}
        current={blockSize}
      />
      <MiniChart
        title={`Mean blocks per request's table, first ${String(WINDOW_S)} s`}
        points={data.map((d) => ({
          x: d.B,
          y: d.table,
          label: d.table.toFixed(1),
        }))}
        current={blockSize}
      />
      <ProvenanceBadge kind="simulated" />
      <details className="chart__table">
        <summary>Show the numbers as a table</summary>
        <table className="num">
          <thead>
            <tr>
              <th scope="col">Block size</th>
              <th scope="col">Mean waste</th>
              <th scope="col">Mean table length</th>
            </tr>
          </thead>
          <tbody>
            {data.map((d) => (
              <tr key={d.B}>
                <td>{d.B}</td>
                <td>{(100 * d.waste).toFixed(1)}%</td>
                <td>{d.table.toFixed(1)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </div>
  );
}

const MW = 260;
const MH = 150;
const MP = { left: 12, right: 12, top: 26, bottom: 30 };

function MiniChart({
  title,
  points,
  current,
}: {
  title: string;
  points: { x: number; y: number; label: string }[];
  current: number;
}) {
  const top = Math.max(...points.map((p) => p.y)) * 1.1;
  const x = (v: number) =>
    MP.left +
    (Math.log2(v / 8) / Math.log2(128 / 8)) * (MW - MP.left - MP.right);
  const y = (v: number) => MP.top + (1 - v / top) * (MH - MP.top - MP.bottom);
  return (
    <figure className="mini-chart">
      <figcaption className="mini-chart__title">{title}</figcaption>
      <svg
        viewBox={`0 0 ${String(MW)} ${String(MH)}`}
        role="img"
        aria-label={`${title}: ${points.map((p) => `block size ${String(p.x)}, ${p.label}`).join("; ")}.`}
      >
        <line
          className="chart__grid"
          x1={MP.left}
          x2={MW - MP.right}
          y1={y(0)}
          y2={y(0)}
        />
        <path
          className="chart__line"
          d={points
            .map(
              (p, i) =>
                `${i === 0 ? "M" : "L"} ${String(x(p.x))} ${String(y(p.y))}`,
            )
            .join(" ")}
        />
        {points.map((p) => (
          <g key={p.x}>
            <circle
              className={p.x === current ? "chart__current" : "chart__dot"}
              cx={x(p.x)}
              cy={y(p.y)}
              r={p.x === current ? 6 : 3}
            />
            <text
              className="chart__tick"
              x={x(p.x)}
              y={y(p.y) - 10}
              textAnchor={
                p === points.at(-1)
                  ? "end"
                  : p === points[0]
                    ? "start"
                    : "middle"
              }
            >
              {p.label}
            </text>
            <text
              className="chart__tick"
              x={x(p.x)}
              y={MH - 12}
              textAnchor="middle"
            >
              {p.x}
            </text>
          </g>
        ))}
      </svg>
    </figure>
  );
}

/**
 * CheckYourself's control, inside the revealed answer: predict first, then
 * set max_model_len and read both allocators' peak running counts.
 */
export function MaxLenTry() {
  const [maxModelLen, setMaxModelLen] = useState(DEFAULTS.maxModelLen);
  const options = { ...DEFAULTS, maxModelLen };
  const contiguous = peakRunning(compareFrames("contiguous-max", options));
  const paged = peakRunning(compareFrames("paged", options));
  return (
    <div className="try">
      <Select
        label="Try it: max_model_len"
        value={String(maxModelLen)}
        options={MAX_MODEL_LENS.map((m) => ({
          value: String(m),
          label: `${String(m)} tokens`,
        }))}
        onChange={(v) => {
          setMaxModelLen(Number(v));
        }}
      />
      <p className="num" aria-live="polite">
        Most requests at once: contiguous {contiguous}, paged {paged}.{" "}
        <ProvenanceBadge kind="simulated" />
      </p>
    </div>
  );
}

/** The second CheckYourself's control: block size, with its mean waste and table length. */
export function BlockSizeTry() {
  const [blockSize, setBlockSize] = useState<number>(DEFAULTS.blockSize);
  const d = blockSizeSeries().find((x) => x.B === blockSize);
  return (
    <div className="try">
      <Select
        label="Try it: block size"
        value={String(blockSize)}
        options={BLOCK_SIZES.map((b) => ({
          value: String(b),
          label: `${String(b)} tokens`,
        }))}
        onChange={(v) => {
          setBlockSize(Number(v));
        }}
      />
      <p className="num" aria-live="polite">
        First {WINDOW_S} s: mean paged waste{" "}
        {(100 * (d?.waste ?? 0)).toFixed(1)}%, mean table length{" "}
        {(d?.table ?? 0).toFixed(1)} blocks.{" "}
        <ProvenanceBadge kind="simulated" />
      </p>
    </div>
  );
}
