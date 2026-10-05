import { useId, useState, type KeyboardEvent, type PointerEvent } from "react";
import { Callout } from "../../viz/ui/Callout.tsx";
import { Figure } from "../../viz/ui/Figure.tsx";
import { ProvenanceBadge } from "../../viz/ui/ProvenanceBadge.tsx";
import { Select } from "../../viz/ui/Select.tsx";
import { Slider } from "../../viz/ui/Slider.tsx";
import { SourceLink } from "../../viz/ui/SourceLink.tsx";
import { useWidth } from "../../viz/useWidth.ts";
import {
  budget,
  CONCURRENCY_STOPS,
  CONTEXT_STOPS,
  contextStops,
  GIB,
  kvBytesPerRequest,
  maxConcurrency,
  type KvDtype,
} from "./budget.ts";
import {
  GPUS,
  gpu,
  MODELS,
  model,
  type GpuEntry,
  type ModelEntry,
} from "./data.ts";
import { modelName } from "./KvFormula.tsx";
import { MEMORY_BUDGET_DEFAULTS as D } from "./presets.ts";

/** "8K" for whole multiples of 1,024 tokens. */
export const tokens = (n: number) =>
  n % 1024 === 0 ? `${String(n / 1024)}K` : n.toLocaleString("en-US");
const gib = (bytes: number) => `${(bytes / GIB).toFixed(2)} GiB`;

/** Figure 1.5: the main widget (steps 5 and 6). */
export function MemoryBudget() {
  const [slug, setSlug] = useState(D.model);
  const [gpuId, setGpuId] = useState(D.gpu);
  const [dtype, setDtype] = useState<KvDtype>(D.dtype);
  const [context, setContext] = useState(D.context);
  const [concurrency, setConcurrency] = useState(D.concurrency);
  const [notice, setNotice] = useState("");
  const m = model(slug);
  const g = gpu(gpuId);
  const b = budget(g, m, dtype, context, concurrency);
  const dtypeName = useId();

  const changeModel = (next: string) => {
    const nm = model(next);
    const stops = contextStops(nm.maxContext);
    setSlug(next);
    if (!stops.includes(context)) {
      const clamped =
        stops.filter((c) => c <= context).at(-1) ?? stops[0] ?? context;
      setContext(clamped);
      setNotice(
        `Context set to ${tokens(clamped)} tokens: ${modelName(nm.id)} supports at most ${tokens(nm.maxContext)}.`,
      );
    } else {
      setNotice("");
    }
  };

  const needs = b.weights + b.kv;
  const heading = !b.weightsFit
    ? `Weights alone do not fit: needs ${gib(needs)} of ${gib(b.usable)}.`
    : b.fits
      ? `Fits: uses ${gib(needs)} of ${gib(b.usable)}.`
      : `Does not fit: needs ${gib(needs)} of ${gib(b.usable)}.`;

  return (
    <Figure
      number="1.5"
      caption="GPU memory for the weights and the KV cache. Drag context, then requests."
    >
      <div className="budget">
        <div className="budget__controls">
          <Select
            label="Model"
            value={slug}
            options={MODELS.map((x) => ({
              value: x.slug,
              label: modelName(x.id),
            }))}
            onChange={changeModel}
          />
          <Select
            label="GPU"
            value={gpuId}
            options={GPUS.map((x) => ({ value: x.id, label: x.name }))}
            onChange={setGpuId}
          />
          <fieldset className="control radios">
            <legend className="control__label">KV cache precision</legend>
            {(["bf16", "fp8"] as const).map((d) => (
              <label key={d} className="radio">
                <input
                  type="radio"
                  name={dtypeName}
                  value={d}
                  checked={dtype === d}
                  onChange={() => {
                    setDtype(d);
                  }}
                />
                {d === "bf16" ? "bf16, 2 bytes" : "fp8, 1 byte"}
              </label>
            ))}
          </fieldset>
          <Slider
            label="Context length"
            value={context}
            stops={contextStops(m.maxContext)}
            format={(v) => `${tokens(v)} tokens`}
            onChange={setContext}
          />
          <Slider
            label="Requests at once"
            value={concurrency}
            stops={CONCURRENCY_STOPS}
            format={(v) => `${String(v)} ${v === 1 ? "request" : "requests"}`}
            onChange={setConcurrency}
          />
          <p className="budget__notice" aria-live="polite">
            {notice}
          </p>
        </div>

        <div className="budget__view">
          <p className="budget__heading" aria-live="polite" data-fits={b.fits}>
            {heading}
          </p>
          <Bar
            g={g}
            m={m}
            dtype={dtype}
            context={context}
            concurrency={concurrency}
          />
          <p className="budget__readout" aria-live="polite">
            <span className="num">
              {b.weightsFit ? (
                <>
                  Max concurrency at {context.toLocaleString("en-US")} tokens:{" "}
                  <strong>{b.maxConcurrency}</strong>
                </>
              ) : (
                <>
                  Max concurrency: <strong>0</strong>. The weights alone do not
                  fit on this GPU.
                </>
              )}
            </span>{" "}
            <ProvenanceBadge kind="computed" />
          </p>
          <Chart g={g} m={m} dtype={dtype} context={context} />
        </div>

        <Callout kind="simplification">
          <p>
            Free memory here is usable memory minus the weights. vLLM also keeps
            8% of GPU memory back by default (
            <SourceLink id="vllm-src" at="config/cache.py L101" />
            ). It reserves memory for activations and CUDA graphs too (
            <SourceLink id="llmsize-math" at="vLLM" />
            ). So for requests that each hold the full context, max concurrency
            here is an upper bound. For a real deployment, plan it with{" "}
            <a href="https://varadmore.me/llm-calculator/">llmsize</a>.
          </p>
        </Callout>
      </div>
    </Figure>
  );
}

interface View {
  g: GpuEntry;
  m: ModelEntry;
  dtype: KvDtype;
  context: number;
}

const BAR_H = 36;

/** Weights, KV, and free memory on a fixed scale: 1.5 × the GPU's usable memory. */
function Bar({
  g,
  m,
  dtype,
  context,
  concurrency,
}: View & { concurrency: number }) {
  const id = useId();
  const [ref, BAR_W] = useWidth<SVGSVGElement>(600);
  const b = budget(g, m, dtype, context, concurrency);
  const scale = 1.5 * b.usable;
  const x = (bytes: number) => (BAR_W * Math.min(bytes, scale)) / scale;
  const cap = x(b.usable);
  const end = b.weights + b.kv;
  const clipped = end > scale;
  const perRequest = kvBytesPerRequest(m, dtype, context);
  return (
    <>
      <svg
        ref={ref}
        className="bar"
        viewBox={`0 0 ${String(BAR_W)} ${String(BAR_H + 22)}`}
        role="img"
        aria-label={`Weights ${gib(b.weights)}, KV cache ${gib(b.kv)}, usable memory ${gib(b.usable)}.`}
      >
        <defs>
          <pattern
            id={`${id}kv`}
            width="6"
            height="6"
            patternUnits="userSpaceOnUse"
            patternTransform="rotate(45)"
          >
            <rect className="bar__kv-fill" width="6" height="6" />
            <line className="bar__kv-stripe" x1="0" y1="0" x2="0" y2="6" />
          </pattern>
          <pattern
            id={`${id}over`}
            width="6"
            height="6"
            patternUnits="userSpaceOnUse"
            patternTransform="rotate(-45)"
          >
            <line className="bar__over-stripe" x1="0" y1="0" x2="0" y2="6" />
          </pattern>
        </defs>
        <rect className="bar__free" x={0} y={0} width={cap} height={BAR_H} />
        <rect
          className="bar__weights"
          x={0}
          y={0}
          width={x(b.weights)}
          height={BAR_H}
        />
        {b.kv > 0 && b.weightsFit && (
          <rect
            x={x(b.weights)}
            y={0}
            width={x(end) - x(b.weights)}
            height={BAR_H}
            fill={`url(#${id}kv)`}
          />
        )}
        {end > b.usable && (
          <rect
            className="bar__over"
            x={cap}
            y={0}
            width={x(end) - cap}
            height={BAR_H}
            fill={`url(#${id}over)`}
          />
        )}
        {clipped && (
          <path
            className="bar__break"
            d={`M ${String(BAR_W - 14)} -2 l 6 ${String(BAR_H + 4)} M ${String(BAR_W - 6)} -2 l 6 ${String(BAR_H + 4)}`}
          />
        )}
        <line className="bar__cap" x1={cap} x2={cap} y1={-4} y2={BAR_H + 6} />
        <text
          className="bar__cap-label"
          x={cap}
          y={BAR_H + 18}
          textAnchor="middle"
        >
          usable {gib(b.usable)}
        </text>
      </svg>
      <ul className="bar__legend num">
        <li>
          <span
            className="legend-swatch legend-swatch--weights"
            aria-hidden="true"
          />
          Weights {gib(b.weights)}
        </li>
        <li>
          <span
            className="legend-swatch legend-swatch--kv"
            aria-hidden="true"
          />
          KV cache {gib(b.kv)} ({concurrency} × {gib(perRequest)})
        </li>
        <li>
          {b.fits ? (
            <>
              <span
                className="legend-swatch legend-swatch--free"
                aria-hidden="true"
              />
              Free {gib(b.free)}
            </>
          ) : (
            <>
              <span
                className="legend-swatch legend-swatch--over"
                aria-hidden="true"
              />
              Over by {gib(-b.free)}
            </>
          )}
        </li>
      </ul>
    </>
  );
}

const CH = 220;
const PAD = { left: 44, right: 16, top: 16, bottom: 40 };
const X_MIN = Math.log2(CONTEXT_STOPS[0]);
const X_MAX = Math.log2(CONTEXT_STOPS[CONTEXT_STOPS.length - 1] ?? 131072);
const X_TICKS = [256, 1024, 4096, 16384, 65536];

/** Max concurrency against context, log–log: a slope of −1 halves requests per doubling. */
function Chart({ g, m, dtype, context }: View) {
  const [ref, CW] = useWidth<HTMLDivElement>(600);
  const points = contextStops(m.maxContext).map((c) => ({
    c,
    n: maxConcurrency(g, m, dtype, c),
  }));
  const shown = points.filter((p) => p.n >= 1);
  const [cursor, setCursor] = useState<number | null>(null);
  const top = Math.max(
    16,
    2 ** Math.ceil(Math.log2(Math.max(1, ...shown.map((p) => p.n)))),
  );
  const x = (c: number) =>
    PAD.left +
    ((Math.log2(c) - X_MIN) / (X_MAX - X_MIN)) * (CW - PAD.left - PAD.right);
  const y = (n: number) =>
    PAD.top + (1 - Math.log2(n) / Math.log2(top)) * (CH - PAD.top - PAD.bottom);
  const yTicks = Array.from(
    { length: Math.log2(top) + 1 },
    (_, i) => 2 ** i,
  ).filter((_, i, a) => a.length <= 8 || i % 2 === 0);
  const current = shown.find((p) => p.c === context);
  const lastFit = shown.at(-1);
  const pastFit = lastFit && points.some((p) => p.c > lastFit.c && p.n === 0);
  const tip = cursor === null ? null : shown[cursor];

  const move = (e: KeyboardEvent<SVGSVGElement>) => {
    if (shown.length === 0) return;
    const i =
      cursor ??
      Math.max(
        0,
        shown.findIndex((p) => p.c === context),
      );
    if (e.key === "ArrowRight") setCursor(Math.min(shown.length - 1, i + 1));
    else if (e.key === "ArrowLeft") setCursor(Math.max(0, i - 1));
    else if (e.key === "Escape") setCursor(null);
    else return;
    e.preventDefault();
  };
  const hover = (e: PointerEvent<SVGSVGElement>) => {
    const box = e.currentTarget.getBoundingClientRect();
    const px = ((e.clientX - box.left) / box.width) * CW;
    let best = 0;
    shown.forEach((p, i) => {
      if (Math.abs(x(p.c) - px) < Math.abs(x(shown[best]?.c ?? 0) - px))
        best = i;
    });
    setCursor(shown.length > 0 ? best : null);
  };

  return (
    <div className="chart" ref={ref}>
      <p className="chart__title">
        Max concurrency by context length (both axes doubling){" "}
        <ProvenanceBadge kind="computed" />
      </p>
      {shown.length === 0 ? (
        <p className="chart__empty">
          No request fits at any context: the weights alone do not fit.
        </p>
      ) : (
        <svg
          className="chart__svg"
          viewBox={`0 0 ${String(CW)} ${String(CH)}`}
          role="img"
          tabIndex={0}
          aria-label="Max concurrency falls by half each time context doubles. Use the left and right arrows to read each point."
          onKeyDown={move}
          onFocus={() => {
            setCursor(
              Math.max(
                0,
                shown.findIndex((p) => p.c === context),
              ),
            );
          }}
          onBlur={() => {
            setCursor(null);
          }}
          onPointerMove={hover}
          onPointerLeave={() => {
            setCursor(null);
          }}
        >
          {yTicks.map((n) => (
            <g key={n}>
              <line
                className="chart__grid"
                x1={PAD.left}
                x2={CW - PAD.right}
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
          {X_TICKS.map((c) => (
            <text
              key={c}
              className="chart__tick"
              x={x(c)}
              y={CH - PAD.bottom + 18}
              textAnchor="middle"
            >
              {tokens(c)}
            </text>
          ))}
          <text
            className="chart__axis"
            x={(PAD.left + CW - PAD.right) / 2}
            y={CH - 4}
            textAnchor="middle"
          >
            context length, tokens
          </text>
          <path
            className="chart__line"
            d={shown
              .map(
                (p, i) =>
                  `${i === 0 ? "M" : "L"} ${String(x(p.c))} ${String(y(p.n))}`,
              )
              .join(" ")}
          />
          {shown.map((p) => (
            <circle
              key={p.c}
              className="chart__dot"
              cx={x(p.c)}
              cy={y(p.n)}
              r={3}
            />
          ))}
          {current && (
            <circle
              className="chart__current"
              cx={x(current.c)}
              cy={y(current.n)}
              r={7}
            />
          )}
          {tip && (
            <g
              className="chart__tip"
              transform={`translate(${String(Math.max(0, Math.min(x(tip.c) - 73, CW - 148)))} ${String(Math.max(y(tip.n) - 34, 2))})`}
            >
              <rect width="146" height="24" />
              <text x="8" y="16">
                {tokens(tip.c)} tokens: {tip.n}{" "}
                {tip.n === 1 ? "request" : "requests"}
              </text>
            </g>
          )}
        </svg>
      )}
      <p className="chart__note">
        {pastFit && `No request fits past ${tokens(lastFit.c)} tokens.`}
      </p>
      <p className="visually-hidden" aria-live="polite">
        {tip &&
          `${tokens(tip.c)} tokens: ${String(tip.n)} ${tip.n === 1 ? "request" : "requests"}.`}
      </p>
      <details className="chart__table">
        <summary>Show the numbers as a table</summary>
        <table className="num">
          <thead>
            <tr>
              <th scope="col">Context, tokens</th>
              <th scope="col">Max concurrency</th>
            </tr>
          </thead>
          <tbody>
            {points.map((p) => (
              <tr key={p.c}>
                <td>{p.c.toLocaleString("en-US")}</td>
                <td>{p.n}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </div>
  );
}
