import { useMemo, useState } from "react";
import { Figure } from "../../viz/ui/Figure.tsx";
import { ProvenanceBadge } from "../../viz/ui/ProvenanceBadge.tsx";
import { Select } from "../../viz/ui/Select.tsx";
import { useWidth } from "../../viz/useWidth.ts";
import { modelName } from "../kv-cache/KvFormula.tsx";
import { secs } from "./charts.tsx";
import {
  GPU_IDS,
  MODEL_SLUGS,
  PHASE_DEFAULT,
  PHASE_REQUEST,
  phaseRun,
} from "./presets.ts";
import { crossover, phaseSteps } from "./stats.ts";
import gpus from "../../data/gpus.json" with { type: "json" };
import models from "../../data/models.json" with { type: "json" };

const gpuName = (id: string) =>
  gpus.gpus.find((g) => g.id === id)?.name.replace("NVIDIA ", "") ?? id;
const modelLabel = (slug: string) =>
  modelName(models.models.find((m) => m.slug === slug)?.id ?? slug);
const fits = (model: string, gpu: string) => phaseRun(model, gpu).fits;

/**
 * Figure 3.1: one request on a model and GPU. The prefill step and a decode
 * step, each with its compute time and memory time from the sim's roofline.
 */
export function PhaseBars() {
  const [model, setModel] = useState<string>(PHASE_DEFAULT.model);
  const [gpu, setGpu] = useState<string>(PHASE_DEFAULT.gpu);
  const steps = useMemo(() => phaseSteps(model, gpu), [model, gpu]);
  const cross = useMemo(() => crossover(model, gpu), [model, gpu]);
  return (
    <Figure
      number="3.1"
      caption={`One request: a ${PHASE_REQUEST.prompt.toLocaleString("en-US")}-token prompt, then ${String(PHASE_REQUEST.output)} output tokens.`}
    >
      <div className="cb">
        <div className="cb__controls">
          <Select
            label="Model"
            value={model}
            options={MODEL_SLUGS.map((m) => ({
              value: m,
              label: fits(m, gpu)
                ? modelLabel(m)
                : `${modelLabel(m)} (does not fit)`,
              disabled: !fits(m, gpu),
            }))}
            onChange={setModel}
          />
          <Select
            label="GPU"
            value={gpu}
            options={GPU_IDS.map((g) => ({
              value: g,
              label: fits(model, g)
                ? gpuName(g)
                : `${gpuName(g)} (does not fit)`,
              disabled: !fits(model, g),
            }))}
            onChange={setGpu}
          />
        </div>
        <p className="cb__note">
          A pair is disabled when the weights leave too little memory for this
          request.
        </p>
        {steps && (
          <div className="phase" aria-live="polite">
            <StepBars
              title={`Prefill step: ${PHASE_REQUEST.prompt.toLocaleString("en-US")} prompt tokens`}
              step={steps.prefill}
            />
            <StepBars title="Decode step: 1 token" step={steps.decode} />
            <p className="phase__cross num">
              {Number.isFinite(cross)
                ? `On this pair, a prefill step of ${cross.toLocaleString("en-US")} or more prompt tokens is compute-bound.`
                : "On this pair, even the prefill step is memory-bound."}{" "}
              <ProvenanceBadge kind="simulated" />
            </p>
          </div>
        )}
      </div>
    </Figure>
  );
}

function StepBars({
  title,
  step,
}: {
  title: string;
  step: { computeS: number; memoryS: number; bound: "compute" | "memory" };
}) {
  const [ref, W] = useWidth<SVGSVGElement>(480);
  const LABEL = 76;
  const VALUE = 64;
  const top = Math.max(step.computeS, step.memoryS);
  const x = (s: number) => (s / top) * (W - LABEL - VALUE);
  const bars = [
    { name: "Compute", s: step.computeS, bound: step.bound === "compute" },
    { name: "Memory", s: step.memoryS, bound: step.bound === "memory" },
  ];
  return (
    <figure className="phase__step">
      <figcaption className="phase__title">
        {title}:{" "}
        <strong>
          {step.bound === "compute" ? "compute-bound" : "memory-bound"}
        </strong>
      </figcaption>
      <svg
        ref={ref}
        className="phase__svg"
        viewBox={`0 0 ${String(W)} 60`}
        role="img"
        aria-label={`${title}. Compute time ${secs(step.computeS)}, memory time ${secs(step.memoryS)}. The step takes the longer one: ${step.bound}-bound.`}
      >
        {bars.map((b, i) => (
          <g key={b.name}>
            <text className="chart__tick" x={2} y={i * 28 + 17}>
              {b.name}
            </text>
            <rect
              className={
                b.bound ? "phase__bar phase__bar--bound" : "phase__bar"
              }
              x={LABEL}
              y={i * 28 + 4}
              width={Math.max(1, x(b.s))}
              height={18}
            />
            <text
              className="chart__tick"
              x={LABEL + Math.max(1, x(b.s)) + 6}
              y={i * 28 + 17}
            >
              {secs(b.s)}
            </text>
          </g>
        ))}
      </svg>
    </figure>
  );
}
