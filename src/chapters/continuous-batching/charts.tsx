/**
 * Chapter 3's small charts: a step line for the queue and histograms for TTFT
 * and ITL. One y axis each, thin marks, a legend for two series plus direct
 * labels, a keyboard cursor with a visible readout, and a table view (the
 * dataviz rules in DESIGN.md).
 */
import { useState, type KeyboardEvent } from "react";
import { useWidth } from "../../viz/useWidth.ts";

/** "0.4 ms" and "40 ms" under a second, "1.22 s" above. */
export function secs(x: number): string {
  if (!Number.isFinite(x)) return "–";
  if (x < 0.01) return `${(x * 1000).toFixed(1)} ms`;
  if (x < 1) return `${String(Math.round(x * 1000))} ms`;
  return `${x.toFixed(x < 10 ? 2 : 1)} s`;
}

const PAD = { left: 36, right: 12, top: 10, bottom: 24 };

function useCursor(count: number) {
  const [cursor, setCursor] = useState<number | null>(null);
  const onKey = (
    e: KeyboardEvent,
    rows = 1,
    row = 0,
    setRow?: (row: number) => void,
  ) => {
    const last = count - 1;
    const at = cursor ?? 0;
    const moves: Record<string, () => void> = {
      ArrowRight: () => {
        setCursor(Math.min(last, cursor === null ? 0 : at + 1));
      },
      ArrowLeft: () => {
        setCursor(Math.max(0, cursor === null ? 0 : at - 1));
      },
      Home: () => {
        setCursor(0);
      },
      End: () => {
        setCursor(last);
      },
      ArrowDown: () => {
        setRow?.(Math.min(rows - 1, row + 1));
      },
      ArrowUp: () => {
        setRow?.(Math.max(0, row - 1));
      },
    };
    const move = moves[e.key];
    if (!move) return;
    e.preventDefault();
    move();
  };
  return { cursor, setCursor, onKey };
}

export interface StepSeries {
  name: string;
  /** The count from each t on, ascending. */
  points: readonly { t: number; n: number }[];
  dashed?: boolean;
}

const valueAt = (points: StepSeries["points"], t: number) => {
  let n = 0;
  for (const p of points) {
    if (p.t > t) break;
    n = p.n;
  }
  return n;
};

/** The queue over time, drawn up to the playhead. */
export function QueueChart({
  title,
  series,
  time,
  duration,
}: {
  title: string;
  series: readonly StepSeries[];
  time: number;
  duration: number;
}) {
  const [ref, W] = useWidth<SVGSVGElement>(560);
  const H = 120;
  const seconds = Math.max(1, Math.floor(time));
  const { cursor, setCursor, onKey } = useCursor(seconds + 1);
  const top = Math.max(4, ...series.flatMap((s) => s.points.map((p) => p.n)));
  const x = (t: number) =>
    PAD.left + (t / (duration || 1)) * (W - PAD.left - PAD.right);
  const y = (n: number) => PAD.top + (1 - n / top) * (H - PAD.top - PAD.bottom);
  const path = (s: StepSeries) => {
    let d = `M ${String(x(0))} ${String(y(0))}`;
    let n = 0;
    for (const p of s.points) {
      if (p.t > time) break;
      d += ` H ${String(x(p.t))} V ${String(y(p.n))}`;
      n = p.n;
    }
    return { d: `${d} H ${String(x(time))}`, n };
  };
  const drawn = series.map((s) => ({ s, ...path(s) }));
  // Direct labels at the line ends, pushed 14 px apart when they would touch
  // and kept inside the plot, clear of the axis labels.
  const ends = drawn.map((l) => y(l.n));
  if (ends.length === 2) {
    const [a = 0, b = 0] = ends;
    const lo = PAD.top + 8;
    const hi = H - PAD.bottom - 4;
    let top = Math.min(a, b);
    let bottom = Math.max(a, b);
    if (bottom - top < 14) {
      const mid = (top + bottom) / 2;
      top = mid - 7;
      bottom = mid + 7;
    }
    if (bottom > hi) [top, bottom] = [hi - 14, hi];
    if (top < lo) [top, bottom] = [lo, lo + 14];
    const aFirst = a < b || (a === b && drawn[0]?.s.dashed !== true);
    ends[0] = aFirst ? top : bottom;
    ends[1] = aFirst ? bottom : top;
  }
  const yTicks = [0, Math.round(top / 2), top];
  const xTicks = ticks(duration);
  const at = cursor === null ? null : Math.min(cursor, time);
  const describe = (t: number) =>
    `At ${String(t)} s: ${series.map((s) => `${s.name} ${String(valueAt(s.points, t))}`).join(", ")} waiting.`;
  return (
    <figure className="cb-chart">
      <figcaption className="cb-chart__title">{title}</figcaption>
      {series.length > 1 && <LineLegend series={series} />}
      <div
        className="cb-chart__focus"
        tabIndex={0}
        role="group"
        aria-label="Queue chart. Left and right arrows move a cursor by one second."
        onKeyDown={(e) => {
          onKey(e);
        }}
      >
        <svg
          ref={ref}
          className="cb-chart__svg"
          viewBox={`0 0 ${String(W)} ${String(H)}`}
          height={H}
          role="img"
          aria-label={describe(Math.floor(time))}
          onPointerMove={(e) => {
            const box = e.currentTarget.getBoundingClientRect();
            const t =
              ((e.clientX - box.left - PAD.left) /
                (box.width - PAD.left - PAD.right)) *
              duration;
            setCursor(Math.max(0, Math.min(seconds, Math.round(t))));
          }}
          onPointerLeave={() => {
            setCursor(null);
          }}
        >
          {yTicks.map((n) => (
            <g key={n}>
              <line
                className="chart__grid"
                x1={PAD.left}
                x2={W - PAD.right}
                y1={y(n)}
                y2={y(n)}
              />
              <text
                className="chart__tick"
                x={PAD.left - 6}
                y={y(n) + 4}
                textAnchor="end"
              >
                {n}
              </text>
            </g>
          ))}
          {xTicks.map((t, i) => (
            <text
              key={t}
              className="chart__tick"
              x={x(t)}
              y={H - 6}
              textAnchor={i === 0 ? "start" : "middle"}
            >
              {t} s
            </text>
          ))}
          {drawn.map(({ s, d }, i) => (
            <g key={s.name}>
              <path className="cb-line" data-dashed={s.dashed ?? false} d={d} />
              {series.length > 1 && (
                <text
                  className="cb-line__label"
                  x={Math.min(x(time) + 4, W - PAD.right)}
                  y={(ends[i] ?? 0) + 4}
                  textAnchor={x(time) + 80 > W ? "end" : "start"}
                >
                  {s.name}
                </text>
              )}
            </g>
          ))}
          {at !== null && (
            <line
              className="cb-cursor"
              x1={x(at)}
              x2={x(at)}
              y1={PAD.top}
              y2={H - PAD.bottom}
            />
          )}
        </svg>
      </div>
      <p className="cb-chart__readout num" aria-live="polite">
        {at === null ? " " : describe(at)}
      </p>
      <details className="chart__table">
        <summary>Show the numbers as a table</summary>
        <table className="num">
          <thead>
            <tr>
              <th scope="col">Time</th>
              {series.map((s) => (
                <th key={s.name} scope="col">
                  {s.name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {ticks(time, 5).map((t) => (
              <tr key={t}>
                <td>{t} s</td>
                {series.map((s) => (
                  <td key={s.name}>{valueAt(s.points, t)}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </figure>
  );
}

/** Round tick times over [0, duration]: every `step` s, or a step that fits. */
function ticks(duration: number, step?: number): number[] {
  const every = step ?? (duration > 60 ? 20 : duration > 24 ? 10 : 5);
  const out: number[] = [];
  for (let t = 0; t <= duration + 1e-9; t += every) out.push(t);
  return out;
}

function LineLegend({ series }: { series: readonly StepSeries[] }) {
  return (
    <ul className="cb-legend">
      {series.map((s) => (
        <li key={s.name}>
          <svg width="24" height="10" aria-hidden="true">
            <line
              className="cb-line"
              data-dashed={s.dashed ?? false}
              x1="0"
              x2="24"
              y1="5"
              y2="5"
            />
          </svg>
          {s.name}
        </li>
      ))}
    </ul>
  );
}

export interface HistRow {
  name: string;
  /** Every value of the run, in time order. */
  values: readonly number[];
  /** How many of them are drawn: those so far. */
  count: number;
  p50: number;
  p99: number;
  /** Bin counts already made (the sandbox's worker): values are then unused. */
  counts?: readonly number[];
}

/** Each bin's count over the first n values, for every n; cached per list. */
const cumulative = new WeakMap<
  readonly number[],
  Map<readonly number[], Int32Array>
>();
function binCounts(values: readonly number[], edges: readonly number[]) {
  let byEdges = cumulative.get(values);
  if (!byEdges) {
    byEdges = new Map();
    cumulative.set(values, byEdges);
  }
  let table = byEdges.get(edges);
  if (!table) {
    const bins = edges.length - 1;
    table = new Int32Array((values.length + 1) * bins);
    values.forEach((v, i) => {
      let b = edges.findIndex((e) => v < e) - 1;
      if (b < 0) b = v < (edges[0] ?? 0) ? 0 : bins - 1;
      const row = (i + 1) * bins;
      table?.set(table.subarray(i * bins, row), row);
      if (table) table[row + b] = (table[row + b] ?? 0) + 1;
    });
    byEdges.set(edges, table);
  }
  return table;
}

/**
 * A histogram on a log x axis, one row per run sharing the axis, with p50 and
 * p99 drawn as labeled rules.
 */
export function Histogram({
  title,
  noun,
  rows,
  edges,
}: {
  title: string;
  /** What one count is: "requests" or "gaps". */
  noun: string;
  rows: readonly HistRow[];
  /** Bin edges, ascending; values outside fall in the end bins. */
  edges: readonly number[];
}) {
  const [ref, W] = useWidth<SVGSVGElement>(560);
  const bins = edges.length - 1;
  const [row, setRow] = useState(0);
  const { cursor, setCursor, onKey } = useCursor(bins);
  const ROW_H = 64;
  const H = PAD.top + rows.length * ROW_H + PAD.bottom;
  const lo = Math.log10(edges[0] ?? 1);
  const hi = Math.log10(edges.at(-1) ?? 10);
  const x = (v: number) =>
    PAD.left +
    ((Math.log10(Math.min(Math.max(v, 10 ** lo), 10 ** hi)) - lo) / (hi - lo)) *
      (W - PAD.left - PAD.right);
  const counts = rows.map((r) =>
    r.counts
      ? [...r.counts]
      : [
          ...binCounts(r.values, edges).subarray(
            r.count * bins,
            (r.count + 1) * bins,
          ),
        ],
  );
  const top = Math.max(1, ...counts.flat());
  const binText = (b: number) =>
    `${secs(edges[b] ?? 0)} to ${secs(edges[b + 1] ?? 0)}`;
  const describe = (r: number, b: number) =>
    `${rows[r]?.name ?? ""}, ${binText(b)}: ${String(counts[r]?.[b] ?? 0)} ${noun}.`;
  const active = cursor === null ? null : { r: row, b: cursor };
  const decades: number[] = [];
  for (let d = Math.ceil(lo); d <= Math.floor(hi); d++) decades.push(10 ** d);
  return (
    <figure className="cb-chart">
      <figcaption className="cb-chart__title">{title}</figcaption>
      <div
        className="cb-chart__focus"
        tabIndex={0}
        role="group"
        aria-label={`${title}. Left and right arrows move between bars${rows.length > 1 ? "; up and down between runs" : ""}.`}
        onKeyDown={(e) => {
          onKey(e, rows.length, row, setRow);
        }}
      >
        <svg
          ref={ref}
          className="cb-chart__svg"
          viewBox={`0 0 ${String(W)} ${String(H)}`}
          height={H}
          role="img"
          aria-label={rows
            .map(
              (r) =>
                `${r.name}: ${String(r.count)} ${noun}, p50 ${secs(r.p50)}, p99 ${secs(r.p99)}`,
            )
            .join("; ")}
          onPointerLeave={() => {
            setCursor(null);
          }}
        >
          {rows.map((r, i) => {
            const y0 = PAD.top + i * ROW_H;
            const base = y0 + ROW_H - 8;
            const h = (n: number) => (n / top) * (ROW_H - 28);
            return (
              <g key={r.name}>
                {rows.length > 1 && (
                  <text className="cb-chart__row" x={PAD.left} y={y0 + 10}>
                    {r.name}
                  </text>
                )}
                <line
                  className="chart__grid"
                  x1={PAD.left}
                  x2={W - PAD.right}
                  y1={base}
                  y2={base}
                />
                {(counts[i] ?? []).map((n, b) => {
                  const x0 = x(edges[b] ?? 0);
                  const x1 = x(edges[b + 1] ?? 0);
                  const on = active?.r === i && active.b === b;
                  return (
                    <g key={b}>
                      <rect
                        className={on ? "cb-bar cb-bar--active" : "cb-bar"}
                        x={x0 + 1}
                        y={base - h(n)}
                        width={Math.max(1, x1 - x0 - 2)}
                        height={Math.max(0, h(n))}
                      />
                      {on && (
                        <path
                          className="active-flag"
                          d={`M${String((x0 + x1) / 2)} ${String(base + 1)}l4 6h-8z`}
                        />
                      )}
                      {/* The whole row height is the hit area, so short bars are easy to point at. */}
                      <rect
                        className="cb-hit"
                        x={x0}
                        y={y0}
                        width={Math.max(1, x1 - x0)}
                        height={ROW_H}
                        onPointerEnter={() => {
                          setRow(i);
                          setCursor(b);
                        }}
                      />
                    </g>
                  );
                })}
                {Number.isFinite(r.p50) && (
                  <Rule x={x(r.p50)} y0={y0 + 14} y1={base} label="p50" />
                )}
                {Number.isFinite(r.p99) && (
                  <Rule
                    x={x(r.p99)}
                    y0={y0 + 14}
                    y1={base}
                    label="p99"
                    flip={x(r.p99) - x(r.p50) < 30}
                  />
                )}
              </g>
            );
          })}
          {decades.map((d, i) => (
            <text
              key={d}
              className="chart__tick"
              x={x(d)}
              y={H - 6}
              textAnchor={
                i === 0 ? "start" : i === decades.length - 1 ? "end" : "middle"
              }
            >
              {d < 1 ? `${String(Math.round(d * 1000))} ms` : `${String(d)} s`}
            </text>
          ))}
        </svg>
      </div>
      <p className="cb-chart__readout num" aria-live="polite">
        {active === null ? " " : describe(active.r, active.b)}
      </p>
      <details className="chart__table">
        <summary>Show the numbers as a table</summary>
        <table className="num">
          <thead>
            <tr>
              <th scope="col">Range</th>
              {rows.map((r) => (
                <th key={r.name} scope="col">
                  {r.name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: bins }, (_, b) => (
              <tr key={b}>
                <td>{binText(b)}</td>
                {rows.map((r, i) => (
                  <td key={r.name}>{counts[i]?.[b] ?? 0}</td>
                ))}
              </tr>
            ))}
            <tr>
              <td>p50, p99</td>
              {rows.map((r) => (
                <td key={r.name}>
                  {secs(r.p50)}, {secs(r.p99)}
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </details>
    </figure>
  );
}

function Rule({
  x,
  y0,
  y1,
  label,
  flip = false,
}: {
  x: number;
  y0: number;
  y1: number;
  label: string;
  flip?: boolean;
}) {
  return (
    <g className="cb-rule">
      <line x1={x} x2={x} y1={y0} y2={y1} />
      <text
        x={flip ? x + 3 : x - 3}
        y={y0 + 8}
        textAnchor={flip ? "start" : "end"}
      >
        {label}
      </text>
    </g>
  );
}

/** Log-spaced edges: `perDecade` bins per factor of 10, from lo to hi. */
export function logEdges(lo: number, hi: number, perDecade: number): number[] {
  const out: number[] = [];
  const a = Math.log10(lo);
  const n = Math.round((Math.log10(hi) - a) * perDecade);
  for (let i = 0; i <= n; i++) out.push(10 ** (a + i / perDecade));
  return out;
}
