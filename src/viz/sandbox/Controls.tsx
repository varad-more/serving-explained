import { useId, type ReactNode } from "react";
import gpus from "../../data/gpus.json" with { type: "json" };
import models from "../../data/models.json" with { type: "json" };
import { href } from "../../router.ts";
import type { BaseLengthDist, LengthDist } from "../../sim/index.ts";
import { modelName } from "./build.ts";
import { SourceLink } from "../ui/SourceLink.tsx";
import { PresetDescription } from "./presets.tsx";
import {
  BLOCK_SIZES,
  clampConfig,
  GPU_IDS,
  LIMITS,
  maxContext,
  MODEL_SLUGS,
  PARAMS,
  PRESET_NAMES,
  presetSandbox,
  V1_DEFAULTS,
  type Key,
  type SandboxConfig,
} from "./params.ts";

type Set = (patch: Partial<SandboxConfig>) => void;

const gpuName = (id: string) =>
  gpus.gpus.find((g) => g.id === id)?.name.replace("NVIDIA ", "") ?? id;
const modelLabel = (slug: string) =>
  modelName(models.models.find((m) => m.slug === slug)?.id ?? slug);

/** Where a chapter explains a control. */
const LEARN: Partial<Record<Key, string>> = {
  g: "/kv-cache/#memory-budget",
  m: "/kv-cache/#how-big",
  kd: "/kv-cache/#memory-budget",
  al: "/paged-attention/#contiguous",
  bs: "/paged-attention/#block-size",
  pc: "/prefix-caching/#hit",
  sp: "/prefix-caching/#hit-rate",
  sc: "/continuous-batching/#continuous",
  ns: "/continuous-batching/#static",
  bt: "/continuous-batching/#chunked-prefill",
  cp: "/continuous-batching/#chunked-prefill",
  r: "/continuous-batching/#static",
};

const shown = (key: Key) =>
  PARAMS[key].encode(V1_DEFAULTS[key] as never) === "gpu"
    ? "from GPU memory"
    : key === "pc" || key === "cp"
      ? V1_DEFAULTS[key]
        ? "on"
        : "off"
      : PARAMS[key].encode(V1_DEFAULTS[key] as never);

/** One control: label, input, its default, a reset, and a chapter link. */
function Row({
  k,
  label,
  config,
  set,
  children,
  help,
}: {
  k: Key;
  label: string;
  config: SandboxConfig;
  set: Set;
  children: (id: string) => ReactNode;
  help?: ReactNode;
}) {
  const id = useId();
  const isDefault =
    PARAMS[k].encode(config[k] as never) ===
    PARAMS[k].encode(V1_DEFAULTS[k] as never);
  const learn = LEARN[k];
  return (
    <div className="sb-row">
      <label className="control__label" htmlFor={id}>
        {label}
      </label>
      <div className="sb-row__input">{children(id)}</div>
      <p className="sb-row__meta">
        <span>default {shown(k)}</span>
        <button
          type="button"
          className="sb-reset"
          aria-label={`Reset ${label} to ${shown(k)}`}
          disabled={isDefault}
          onClick={() => {
            set({ [k]: V1_DEFAULTS[k] });
          }}
        >
          Reset
        </button>
        {learn && (
          <a className="sb-learn" href={href(learn)}>
            What is this?
          </a>
        )}
      </p>
      {help && <p className="sb-row__help">{help}</p>}
    </div>
  );
}

function NumberInput({
  id,
  value,
  min,
  max,
  step = 1,
  onChange,
  disabled,
}: {
  id?: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (v: number) => void;
  disabled?: boolean;
}) {
  return (
    <input
      id={id}
      className="sb-number"
      type="number"
      inputMode="decimal"
      value={value}
      min={min}
      max={max}
      step={step}
      disabled={disabled}
      onChange={(e) => {
        const v = Number(e.target.value);
        if (e.target.value !== "" && Number.isFinite(v)) onChange(v);
      }}
    />
  );
}

function Choice<T extends string>({
  id,
  value,
  options,
  onChange,
}: {
  id: string;
  value: T;
  options: readonly { value: T; label: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <select
      id={id}
      className="sb-select"
      value={value}
      onChange={(e) => {
        onChange(e.target.value as T);
      }}
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

/** An on/off switch, styled like the chapters' toggles (44 px target). */
function Switch({
  id,
  checked,
  onChange,
  label,
}: {
  id?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  /** When the switch has no <label for>, its own visible text. */
  label?: string;
}) {
  return (
    <button
      id={id}
      type="button"
      role="switch"
      aria-checked={checked}
      className="toggle__switch"
      onClick={() => {
        onChange(!checked);
      }}
    >
      <span className="toggle__track" aria-hidden="true">
        <span className="toggle__thumb" />
      </span>
      <span className="toggle__state">
        {label ? `${label}: ` : ""}
        {checked ? "On" : "Off"}
      </span>
    </button>
  );
}

/** A length distribution: its kind and parameters; a mixture is ≤ 4 rows. */
function DistEditor({
  id,
  value,
  ml,
  onChange,
}: {
  id: string;
  value: LengthDist;
  ml: number;
  onChange: (d: LengthDist) => void;
}) {
  const base = (
    b: BaseLengthDist,
    set: (b: BaseLengthDist) => void,
    label: string,
  ) => (
    <span className="sb-dist">
      <select
        aria-label={`${label}: kind`}
        className="sb-select"
        value={b.kind}
        onChange={(e) => {
          const k = e.target.value;
          set(
            k === "fixed"
              ? { kind: "fixed", value: 128 }
              : k === "uniform"
                ? { kind: "uniform", min: 32, max: 256 }
                : {
                    kind: "lognormal",
                    median: 128,
                    sigma: 0.6,
                    min: 16,
                    max: Math.min(ml, 1024),
                  },
          );
        }}
      >
        <option value="fixed">fixed</option>
        <option value="uniform">uniform</option>
        <option value="lognormal">lognormal</option>
      </select>
      {b.kind === "fixed" && (
        <label className="sb-dist__field">
          tokens
          <NumberInput
            value={b.value}
            min={1}
            max={ml}
            onChange={(value) => {
              set({ ...b, value });
            }}
          />
        </label>
      )}
      {b.kind === "uniform" && (
        <>
          <label className="sb-dist__field">
            min
            <NumberInput
              value={b.min}
              min={1}
              max={ml}
              onChange={(min) => {
                set({ ...b, min, max: Math.max(min, b.max) });
              }}
            />
          </label>
          <label className="sb-dist__field">
            max
            <NumberInput
              value={b.max}
              min={1}
              max={ml}
              onChange={(max) => {
                set({ ...b, max, min: Math.min(max, b.min) });
              }}
            />
          </label>
        </>
      )}
      {b.kind === "lognormal" && (
        <>
          <label className="sb-dist__field">
            median
            <NumberInput
              value={b.median}
              min={1}
              max={ml}
              onChange={(median) => {
                set({ ...b, median });
              }}
            />
          </label>
          <label className="sb-dist__field">
            σ
            <NumberInput
              value={b.sigma}
              min={0}
              max={LIMITS.sigma.max}
              step={0.1}
              onChange={(sigma) => {
                set({ ...b, sigma: Math.round(sigma * 100) / 100 });
              }}
            />
          </label>
          <label className="sb-dist__field">
            min
            <NumberInput
              value={b.min}
              min={1}
              max={ml}
              onChange={(min) => {
                set({ ...b, min, max: Math.max(min, b.max) });
              }}
            />
          </label>
          <label className="sb-dist__field">
            max
            <NumberInput
              value={b.max}
              min={1}
              max={ml}
              onChange={(max) => {
                set({ ...b, max, min: Math.min(max, b.min) });
              }}
            />
          </label>
        </>
      )}
    </span>
  );
  const parts =
    value.kind === "mixture" ? value.parts : [{ weight: 1, dist: value }];
  const setParts = (next: { weight: number; dist: BaseLengthDist }[]) => {
    const [only] = next;
    onChange(
      next.length === 1 && only ? only.dist : { kind: "mixture", parts: next },
    );
  };
  return (
    <div id={id} className="sb-mixture" role="group">
      {parts.map((p, i) => (
        <div key={i} className="sb-mixture__row">
          {parts.length > 1 && (
            <label className="sb-dist__field">
              weight
              <NumberInput
                value={p.weight}
                min={0.01}
                max={1}
                step={0.05}
                onChange={(weight) => {
                  setParts(
                    parts.map((q, j) =>
                      j === i ? { ...q, weight: Math.max(0.01, weight) } : q,
                    ),
                  );
                }}
              />
            </label>
          )}
          {base(
            p.dist,
            (dist) => {
              setParts(parts.map((q, j) => (j === i ? { ...q, dist } : q)));
            },
            `part ${String(i + 1)}`,
          )}
          {parts.length > 1 && (
            <button
              type="button"
              className="sb-reset"
              onClick={() => {
                setParts(parts.filter((_, j) => j !== i));
              }}
            >
              Remove part {i + 1}
            </button>
          )}
        </div>
      ))}
      {parts.length < LIMITS.mixtureParts && (
        <button
          type="button"
          className="sb-reset"
          onClick={() => {
            setParts([
              ...parts.map((q) => ({ ...q, weight: q.weight })),
              {
                weight: 0.1,
                dist: { kind: "fixed", value: Math.min(ml, 1024) },
              },
            ]);
          }}
        >
          Add a mixture part
        </button>
      )}
    </div>
  );
}

/** The four groups of controls (tasks/todo.md, Prompt 7, "Controls"). */
export function Controls({
  config: c,
  onChange,
  name,
}: {
  config: SandboxConfig;
  onChange: (c: SandboxConfig) => void;
  /** "A" or "B" in A/B mode, for labels. */
  name: string;
}) {
  const set: Set = (patch) => {
    onChange(clampConfig({ ...c, ...patch, p: null }));
  };
  const presetId = useId();
  const top = maxContext(c.m);
  return (
    <div
      className="sb-controls"
      aria-label={`Configuration ${name}`}
      role="group"
    >
      <div className="sb-row">
        <label className="control__label" htmlFor={presetId}>
          Start from a preset
        </label>
        <select
          id={presetId}
          className="sb-select"
          value={c.p ?? ""}
          onChange={(e) => {
            const p = e.target.value;
            if (p) onChange(presetSandbox(p as (typeof PRESET_NAMES)[number]));
          }}
        >
          <option value="">(custom)</option>
          {PRESET_NAMES.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
        {c.p && <PresetDescription name={c.p} />}
      </div>

      <details className="sb-group" open>
        <summary>Hardware and model</summary>
        <Row k="g" label="GPU" config={c} set={set}>
          {(id) => (
            <Choice
              id={id}
              value={c.g}
              options={GPU_IDS.map((g) => ({ value: g, label: gpuName(g) }))}
              onChange={(g) => {
                set({ g });
              }}
            />
          )}
        </Row>
        <Row k="m" label="Model" config={c} set={set}>
          {(id) => (
            <Choice
              id={id}
              value={c.m}
              options={MODEL_SLUGS.map((m) => ({
                value: m,
                label: modelLabel(m),
              }))}
              onChange={(m) => {
                set({ m });
              }}
            />
          )}
        </Row>
        <Row k="kd" label="KV dtype" config={c} set={set}>
          {(id) => (
            <Choice
              id={id}
              value={c.kd}
              options={[
                { value: "bf16", label: "bf16, 2 bytes" },
                { value: "fp8", label: "fp8, 1 byte" },
              ]}
              onChange={(kd) => {
                set({ kd });
              }}
            />
          )}
        </Row>
        <Row
          k="gf"
          label="GPU memory fraction"
          config={c}
          set={set}
          help={
            <>
              vLLM&apos;s gpu_memory_utilization: the share of GPU memory it may
              use (<SourceLink id="vllm-src" at="config/cache.py L101" />
              ).
            </>
          }
        >
          {(id) => (
            <NumberInput
              id={id}
              value={c.gf}
              min={LIMITS.gf.min}
              max={LIMITS.gf.max}
              step={0.01}
              onChange={(gf) => {
                set({ gf });
              }}
            />
          )}
        </Row>
        <Row
          k="cap"
          label="KV capacity"
          config={c}
          set={set}
          help={
            c.cap === "gpu"
              ? "From GPU memory after the weights. Like chapter 1, this leaves out activations and runtime overhead, so it overstates vLLM's pool."
              : "A fixed pool, in blocks."
          }
        >
          {(id) => (
            <span className="sb-inline">
              <select
                id={id}
                className="sb-select"
                value={c.cap === "gpu" ? "gpu" : "fixed"}
                onChange={(e) => {
                  set({ cap: e.target.value === "gpu" ? "gpu" : 4096 });
                }}
              >
                <option value="gpu">from GPU memory</option>
                <option value="fixed">fixed blocks</option>
              </select>
              {c.cap !== "gpu" && (
                <label className="sb-dist__field">
                  blocks
                  <NumberInput
                    value={c.cap}
                    min={LIMITS.cap.min}
                    max={LIMITS.cap.max}
                    onChange={(cap) => {
                      set({ cap });
                    }}
                  />
                </label>
              )}
            </span>
          )}
        </Row>
      </details>

      <details className="sb-group" open>
        <summary>Memory</summary>
        <Row k="al" label="Allocator" config={c} set={set}>
          {(id) => (
            <Choice
              id={id}
              value={c.al}
              options={[
                { value: "paged", label: "paged" },
                {
                  value: "contiguous-max",
                  label: "contiguous, reserve the maximum",
                },
              ]}
              onChange={(al) => {
                set({ al });
              }}
            />
          )}
        </Row>
        <Row k="bs" label="Block size" config={c} set={set}>
          {(id) => (
            <Choice
              id={id}
              value={String(c.bs)}
              options={BLOCK_SIZES.map((b) => ({
                value: String(b),
                label: `${String(b)} tokens`,
              }))}
              onChange={(v) => {
                set({ bs: Number(v) });
              }}
            />
          )}
        </Row>
        <Row
          k="pc"
          label="Prefix caching"
          config={c}
          set={set}
          help={
            c.al === "contiguous-max"
              ? "Off: it needs the paged allocator."
              : undefined
          }
        >
          {(id) => (
            <Switch
              id={id}
              checked={c.pc}
              onChange={(pc) => {
                set({ pc });
              }}
            />
          )}
        </Row>
      </details>

      <details className="sb-group" open>
        <summary>Scheduler</summary>
        <Row k="sc" label="Scheduler" config={c} set={set}>
          {(id) => (
            <Choice
              id={id}
              value={c.sc}
              options={[
                { value: "continuous", label: "continuous (per step)" },
                { value: "static", label: "static (per batch)" },
              ]}
              onChange={(sc) => {
                set({ sc });
              }}
            />
          )}
        </Row>
        <Row
          k="ns"
          label="max_num_seqs"
          config={c}
          set={set}
          help={
            <>
              vLLM&apos;s default is 256 on GPUs under 70 GB, and 1,024 on
              larger GPUs other than A100s (
              <SourceLink id="vllm-src" at="engine/arg_utils.py L2866–2895" />
              ).
            </>
          }
        >
          {(id) => (
            <NumberInput
              id={id}
              value={c.ns}
              min={LIMITS.ns.min}
              max={LIMITS.ns.max}
              onChange={(ns) => {
                set({ ns });
              }}
            />
          )}
        </Row>
        <Row
          k="bt"
          label="max_num_batched_tokens"
          config={c}
          set={set}
          help={
            c.cp ? (
              <>
                vLLM&apos;s default for vllm serve is 2,048 on GPUs under 70 GB
                (
                <SourceLink id="vllm-src" at="engine/arg_utils.py L2866–2895" />
                ).
              </>
            ) : (
              `Chunked prefill is off, so the budget is raised to max_model_len (${top < c.ml ? String(top) : String(c.ml)}), as vLLM does when no budget is set.`
            )
          }
        >
          {(id) => (
            <NumberInput
              id={id}
              value={c.bt}
              min={LIMITS.bt.min}
              max={LIMITS.bt.max}
              onChange={(bt) => {
                set({ bt });
              }}
            />
          )}
        </Row>
        <Row k="cp" label="Chunked prefill" config={c} set={set}>
          {(id) => (
            <Switch
              id={id}
              checked={c.cp}
              onChange={(cp) => {
                set({ cp });
              }}
            />
          )}
        </Row>
      </details>

      <details className="sb-group" open>
        <summary>Workload</summary>
        <Row k="n" label="Requests" config={c} set={set}>
          {(id) => (
            <NumberInput
              id={id}
              value={c.n}
              min={LIMITS.n.min}
              max={LIMITS.n.max}
              onChange={(n) => {
                set({ n });
              }}
            />
          )}
        </Row>
        <Row
          k="r"
          label="Arrival rate"
          config={c}
          set={set}
          help={
            c.r === "burst"
              ? "All requests arrive at once."
              : "Poisson arrivals, per second."
          }
        >
          {(id) => (
            <span className="sb-inline">
              {c.r !== "burst" && (
                <NumberInput
                  id={id}
                  value={c.r}
                  min={LIMITS.r.min}
                  max={LIMITS.r.max}
                  step={0.1}
                  onChange={(r) => {
                    set({ r });
                  }}
                />
              )}
              <Switch
                label="All at once"
                checked={c.r === "burst"}
                onChange={(burst) => {
                  set({ r: burst ? "burst" : 2 });
                }}
              />
            </span>
          )}
        </Row>
        <Row k="pl" label="Prompt length" config={c} set={set}>
          {(id) => (
            <DistEditor
              id={id}
              value={c.pl}
              ml={c.ml}
              onChange={(pl) => {
                set({ pl });
              }}
            />
          )}
        </Row>
        <Row k="ol" label="Output length" config={c} set={set}>
          {(id) => (
            <DistEditor
              id={id}
              value={c.ol}
              ml={c.ml}
              onChange={(ol) => {
                set({ ol });
              }}
            />
          )}
        </Row>
        <Row
          k="sp"
          label="Shared prefix"
          config={c}
          set={set}
          help="k prefixes of L tokens; each request starts with one with probability p."
        >
          {(id) => (
            <span className="sb-inline" id={id}>
              <label className="sb-dist__field">
                k
                <NumberInput
                  value={c.sp.groups}
                  min={0}
                  max={LIMITS.spGroups.max}
                  onChange={(groups) => {
                    set({ sp: { ...c.sp, groups } });
                  }}
                />
              </label>
              <label className="sb-dist__field">
                L
                <NumberInput
                  value={c.sp.length}
                  min={0}
                  max={c.ml - 1}
                  onChange={(length) => {
                    set({ sp: { ...c.sp, length } });
                  }}
                />
              </label>
              <label className="sb-dist__field">
                p
                <NumberInput
                  value={c.sp.fraction}
                  min={0}
                  max={1}
                  step={0.05}
                  onChange={(fraction) => {
                    set({ sp: { ...c.sp, fraction } });
                  }}
                />
              </label>
            </span>
          )}
        </Row>
        <Row
          k="ml"
          label="max_model_len"
          config={c}
          set={set}
          help={`Up to ${top.toLocaleString("en-US")} for this model. Lengths are clipped to it.`}
        >
          {(id) => (
            <NumberInput
              id={id}
              value={c.ml}
              min={LIMITS.ml.min}
              max={top}
              onChange={(ml) => {
                set({ ml });
              }}
            />
          )}
        </Row>
        <Row k="s" label="Seed" config={c} set={set}>
          {(id) => (
            <span className="sb-inline">
              <NumberInput
                id={id}
                value={c.s}
                min={LIMITS.s.min}
                max={LIMITS.s.max}
                onChange={(s) => {
                  set({ s });
                }}
              />
              <button
                type="button"
                className="sb-reset"
                onClick={() => {
                  const x = new Uint32Array(1);
                  crypto.getRandomValues(x);
                  set({ s: x[0] ?? 1 });
                }}
              >
                Re-roll
              </button>
            </span>
          )}
        </Row>
      </details>
    </div>
  );
}
