import { useState } from "react";
import { createSim, metrics } from "../../sim/index.ts";
import { Figure } from "../../viz/ui/Figure.tsx";
import { ProvenanceBadge } from "../../viz/ui/ProvenanceBadge.tsx";
import { Slider } from "../../viz/ui/Slider.tsx";
import { useWidth } from "../../viz/useWidth.ts";
import { secs } from "./charts.tsx";
import { runConfig, STALL, SWEEP_BUDGETS } from "./presets.ts";
import { longTtft, type Run } from "./stats.ts";

export interface SweepPoint {
  budget: number;
  throughput: number;
  p99Itl: number;
  longTtft: number;
}

let sweep: SweepPoint[] | null = null;
/** `long-prompt-stall` at every budget of the sweep, run once. */
export function budgetSweep(): SweepPoint[] {
  sweep ??= SWEEP_BUDGETS.map((budget) => {
    const config = runConfig("long-prompt-stall", { ...STALL, budget });
    const sim = createSim(config);
    sim.run();
    const run: Run = {
      config,
      events: sim.events(),
      m: metrics(sim.events(), config),
    };
    return {
      budget,
      throughput: run.m.summary.outputTokensPerS,
      p99Itl: run.m.summary.itl.p99,
      longTtft: longTtft(run),
    };
  });
  return sweep;
}

/** Figure 3.7: throughput, p99 ITL, and the long prompts' TTFT by budget. */
export function BudgetSweep() {
  const [budget, setBudget] = useState<number>(STALL.budget);
  const data = budgetSweep();
  const best = (f: (d: SweepPoint) => number) =>
    data.reduce((a, d) => (f(d) < f(a) ? d : a)).budget;
  return (
    <Figure
      number="3.7"
      caption="The long-prompt preset with chunked prefill on, at eight token budgets."
    >
      <div className="cb">
        <div className="cb__controls">
          <Slider
            label="Token budget (max_num_batched_tokens)"
            value={budget}
            stops={SWEEP_BUDGETS}
            format={(v) => `${v.toLocaleString("en-US")} tokens`}
            onChange={setBudget}
          />
        </div>
        <div className="sweep">
          <SweepChart
            title="Output tokens per second (higher is better)"
            data={data}
            y={(d) => d.throughput}
            label={(v) => v.toFixed(1)}
            current={budget}
            best={best((d) => -d.throughput)}
          />
          <SweepChart
            title="p99 inter-token latency (lower is better)"
            data={data}
            y={(d) => d.p99Itl}
            label={secs}
            current={budget}
            best={best((d) => d.p99Itl)}
          />
          <SweepChart
            title="Long prompts' mean TTFT (lower is better)"
            data={data}
            y={(d) => d.longTtft}
            label={secs}
            current={budget}
            best={best((d) => d.longTtft)}
          />
          <ProvenanceBadge kind="simulated" />
        </div>
        <ul className="sweep__key">
          <li>
            <svg width="12" height="12" aria-hidden="true">
              <circle
                className="sweep__dot"
                data-best="true"
                cx="6"
                cy="6"
                r="5"
              />
            </svg>
            The best budget on that measure
          </li>
          <li>
            <svg width="20" height="20" aria-hidden="true">
              <circle className="chart__current" cx="10" cy="10" r="8" />
            </svg>
            The budget you picked
          </li>
          <li>
            Each panel&apos;s vertical axis spans its own range and does not
            start at 0.
          </li>
        </ul>
        <details className="chart__table">
          <summary>Show the numbers as a table</summary>
          <table className="num">
            <thead>
              <tr>
                <th scope="col">Budget</th>
                <th scope="col">Output tok/s</th>
                <th scope="col">p99 ITL</th>
                <th scope="col">Long prompts&apos; mean TTFT</th>
              </tr>
            </thead>
            <tbody>
              {data.map((d) => (
                <tr key={d.budget}>
                  <td>{d.budget.toLocaleString("en-US")}</td>
                  <td>{d.throughput.toFixed(1)}</td>
                  <td>{secs(d.p99Itl)}</td>
                  <td>{secs(d.longTtft)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </details>
      </div>
    </Figure>
  );
}

const H = 150;
const P = { left: 48, right: 14, top: 30, bottom: 26 };

function SweepChart({
  title,
  data,
  y: value,
  label,
  current,
  best,
}: {
  title: string;
  data: readonly SweepPoint[];
  y: (d: SweepPoint) => number;
  label: (v: number) => string;
  current: number;
  best: number;
}) {
  const [ref, W] = useWidth<SVGSVGElement>(260);
  const ys = data.map(value);
  const lo = Math.min(...ys);
  const hi = Math.max(...ys);
  const span = hi - lo || 1;
  const first = data[0]?.budget ?? 1;
  const last = data.at(-1)?.budget ?? 2;
  const x = (b: number) =>
    P.left +
    (Math.log2(b / first) / Math.log2(last / first)) * (W - P.left - P.right);
  const y = (v: number) =>
    P.top + (1 - (v - lo) / span) * (H - P.top - P.bottom);
  const cur = data.find((d) => d.budget === current);
  const anchor = (b: number) =>
    b === first ? "start" : b === last ? "end" : "middle";
  return (
    <figure className="sweep-chart">
      <figcaption className="sweep-chart__title">{title}</figcaption>
      <svg
        ref={ref}
        viewBox={`0 0 ${String(W)} ${String(H)}`}
        height={H}
        role="img"
        aria-label={`${title}: ${data.map((d) => `budget ${String(d.budget)}, ${label(value(d))}`).join("; ")}. Best at ${String(best)}.`}
      >
        {[lo, hi].map((v) => (
          <g key={v}>
            <line
              className="chart__grid"
              x1={P.left}
              x2={W - P.right}
              y1={y(v)}
              y2={y(v)}
            />
            <text
              className="sweep__axis"
              x={P.left - 4}
              y={y(v) + 4}
              textAnchor="end"
            >
              {label(v)}
            </text>
          </g>
        ))}
        <path
          className="chart__line sweep__line"
          d={data
            .map(
              (d, i) =>
                `${i === 0 ? "M" : "L"} ${String(x(d.budget))} ${String(y(value(d)))}`,
            )
            .join(" ")}
        />
        {data.map((d) => (
          <circle
            key={d.budget}
            className="sweep__dot"
            data-best={d.budget === best}
            cx={x(d.budget)}
            cy={y(value(d))}
            r={d.budget === best ? 5 : 3}
          />
        ))}
        {cur && (
          <g className="sweep__current">
            <circle
              className="chart__current"
              cx={x(cur.budget)}
              cy={y(value(cur))}
              r={9}
            />
            <text
              className="chart__tick"
              x={x(cur.budget)}
              y={y(value(cur)) - 14}
              textAnchor={anchor(cur.budget)}
            >
              {label(value(cur))}
            </text>
          </g>
        )}
        {[first, 512, last].map((b) => (
          <text
            key={b}
            className="chart__tick"
            x={x(b)}
            y={H - 8}
            textAnchor={anchor(b)}
          >
            {b.toLocaleString("en-US")}
          </text>
        ))}
      </svg>
    </figure>
  );
}
