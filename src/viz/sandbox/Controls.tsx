import { useId, useState, type ReactNode } from "react";
import gpus from "../../data/gpus.json" with { type: "json" };
import models from "../../data/models.json" with { type: "json" };
import { href } from "../../router.ts";
import type { BaseLengthDist, LengthDist } from "../../sim/index.ts";
import { ProvenanceBadge } from "../ui/ProvenanceBadge.tsx";
import { SourceLink } from "../ui/SourceLink.tsx";
import { useMediaQuery } from "../useMediaQuery.ts";
import { LLMSIZE_URL, modelName } from "./build.ts";
import { PresetDescription } from "./presets.tsx";
import {
  BLOCK_SIZES,
  clampConfig,
  GPU_IDS,
  LIMITS,
  matchesPreset,
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

const SIM =
  "https://github.com/varad-more/serving-explained/blob/main/docs/SIM.md";
const SIM7 = `${SIM}#7-workloads-presets-cli`;
const SIM9 = `${SIM}#9-simplifications-what-this-leaves-out`;
const SIM12 = `${SIM}#121-limits`;
const n = (x: number) => x.toLocaleString("en-US");

/** Where a chapter explains a control. */
const LEARN: Partial<Record<Key, string>> = {
  g: "/kv-cache/#memory-budget",
  gf: "/kv-cache/#memory-budget",
  cap: "/kv-cache/#memory-budget",
  ml: "/continuous-batching/#stall",
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

/** A length distribution in words. */
function describe(d: LengthDist): string {
  if (d.kind === "mixture")
    return `a mixture of ${String(d.parts.length)} parts`;
  if (d.kind === "fixed") return `${n(d.value)} tokens`;
  if (d.kind === "uniform") return `uniform, ${n(d.min)}–${n(d.max)}`;
  return `lognormal, median ${n(d.median)}, σ ${String(d.sigma)}, ${n(d.min)}–${n(d.max)}`;
}

/** A key's default in plain words, not its link encoding. */
function shown(k: Key): string {
  const d = V1_DEFAULTS;
  switch (k) {
    case "g":
      return gpuName(d.g);
    case "m":
      return modelLabel(d.m);
    case "cap":
      return d.cap === "gpu" ? "from GPU memory" : `${n(d.cap)} blocks`;
    case "pc":
      return d.pc ? "on" : "off";
    case "cp":
      return d.cp ? "on" : "off";
    case "r":
      return d.r === "burst" ? "all at once" : `${String(d.r)} per second`;
    case "pl":
      return describe(d.pl);
    case "ol":
      return describe(d.ol);
    case "sp":
      return `${String(d.sp.groups)} ${d.sp.groups === 1 ? "prefix" : "prefixes"} of ${n(d.sp.length)} tokens, p ${String(d.sp.fraction)}`;
    case "bs":
      return `${String(d.bs)} tokens`;
    case "al":
      return d.al === "paged" ? "paged" : "contiguous";
    case "kd":
      return d.kd;
    case "sc":
      return d.sc;
    case "s":
      return String(d.s);
    case "gf":
      return String(d.gf);
    case "n":
      return n(d.n);
    case "ns":
      return n(d.ns);
    case "bt":
      return n(d.bt);
    case "ml":
      return n(d.ml);
  }
}

/**
 * One control: label, input, its default, a reset, and a chapter link. A
 * `group` row holds several inputs, named by its label through
 * aria-labelledby; a plain row's label points at its one input.
 */
function Row({
  k,
  label,
  config,
  set,
  children,
  help,
  group = false,
}: {
  k: Key;
  label: string;
  config: SandboxConfig;
  set: Set;
  children: (id: string, labelId: string) => ReactNode;
  help?: ReactNode;
  group?: boolean;
}) {
  const id = useId();
  const labelId = useId();
  const isDefault =
    PARAMS[k].encode(config[k] as never) ===
    PARAMS[k].encode(V1_DEFAULTS[k] as never);
  const learn = LEARN[k];
  return (
    <div className="sb-row">
      {group ? (
        <span className="control__label" id={labelId}>
          {label}
        </span>
      ) : (
        <label className="control__label" htmlFor={id} id={labelId}>
          {label}
        </label>
      )}
      <div className="sb-row__input">{children(id, labelId)}</div>
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
            What is this?<span className="visually-hidden"> ({label})</span>
          </a>
        )}
      </p>
      {help && <p className="sb-row__help">{help}</p>}
    </div>
  );
}

/**
 * A number field that keeps what is typed. A value in range applies as it is
 * typed; anything else waits for blur or Enter, then is clamped. Clamping
 * each keystroke would turn "8192" into "64192".
 */
function NumberInput({
  id,
  value,
  min,
  max,
  step = 1,
  onChange,
  label,
}: {
  id?: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (v: number) => void;
  /** The field's name, when no <label> names it in full. */
  label?: string;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const commit = (text: string) => {
    const v = Number(text);
    if (text.trim() !== "" && Number.isFinite(v))
      onChange(Math.min(max, Math.max(min, v)));
    setDraft(null);
  };
  return (
    <input
      id={id}
      className="sb-number"
      type="number"
      inputMode="decimal"
      aria-label={label}
      value={draft ?? value}
      min={min}
      max={max}
      step={step}
      onChange={(e) => {
        const text = e.target.value;
        const v = Number(text);
        setDraft(text);
        if (text.trim() !== "" && Number.isFinite(v) && v >= min && v <= max)
          onChange(v);
      }}
      onBlur={(e) => {
        commit(e.target.value);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") commit(e.currentTarget.value);
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
  disabled,
}: {
  id?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  /** When the switch has no <label for>, its own visible text. */
  label?: string;
  disabled?: boolean;
}) {
  return (
    <button
      id={id}
      type="button"
      role="switch"
      aria-checked={checked}
      className="toggle__switch"
      disabled={disabled}
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
  labelId,
  name,
  value,
  ml,
  onChange,
}: {
  labelId: string;
  /** The row's label, to name each field in full. */
  name: string;
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
            label={`${label}: tokens`}
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
              label={`${label}: min`}
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
              label={`${label}: max`}
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
              label={`${label}: median`}
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
              label={`${label}: σ`}
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
              label={`${label}: min`}
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
              label={`${label}: max`}
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
    <div className="sb-mixture" role="group" aria-labelledby={labelId}>
      {parts.map((p, i) => (
        <div key={i} className="sb-mixture__row">
          {parts.length > 1 && (
            <label className="sb-dist__field">
              weight
              <NumberInput
                label={`${name}, part ${String(i + 1)}: weight`}
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
            parts.length > 1 ? `${name}, part ${String(i + 1)}` : name,
          )}
          {parts.length > 1 && (
            <button
              type="button"
              className="sb-reset"
              aria-label={`${name}: remove part ${String(i + 1)}`}
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
          aria-label={`${name}: add a mixture part`}
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
  // On phones the groups start closed, so the results are not far below.
  const desktop = useMediaQuery("(min-width: 1024px)");
  // A preset's tested description shows only while the settings are its own.
  const preset = matchesPreset(c) ? c.p : null;
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
          value={preset ?? ""}
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
        {preset && <PresetDescription name={preset} />}
      </div>

      <details className="sb-group" open={desktop}>
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
            c.cap === "gpu" ? (
              <>
                From GPU memory after the weights, by{" "}
                <a href={LLMSIZE_URL}>llmsize&apos;s memory math</a>. Like
                chapter 1, it leaves out activations and runtime overhead, so it
                overstates vLLM&apos;s pool (<a href={SIM9}>SIM.md §9.14</a>).
              </>
            ) : (
              "A fixed pool, in blocks, set by hand."
            )
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
                    label="KV capacity: blocks"
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

      <details className="sb-group" open={desktop}>
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
            c.al === "contiguous-max" ? (
              <>
                Off: prefix caching needs the paged allocator (
                <a href={SIM12}>SIM.md §12.1</a>).
              </>
            ) : undefined
          }
        >
          {(id) => (
            <Switch
              id={id}
              disabled={c.al === "contiguous-max"}
              checked={c.pc}
              onChange={(pc) => {
                set({ pc });
              }}
            />
          )}
        </Row>
      </details>

      <details className="sb-group" open={desktop}>
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
              vllm serve uses 256 on GPUs under 70 GB, and 1,024 on larger GPUs
              other than A100s (
              <SourceLink id="vllm-src" at="engine/arg_utils.py L2866–2895" />
              ). The sandbox keeps 256 on every GPU.
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
                vllm serve uses 2,048 on GPUs under 70 GB (
                <SourceLink id="vllm-src" at="engine/arg_utils.py L2866–2895" />
                ). It uses 8,192 at 70 GB or more, except on A100s, and 16,384
                at 160 GB or more. The sandbox keeps 2,048 on every GPU.
              </>
            ) : (
              <>
                Chunked prefill is off, so the budget is at least max_model_len:
                here {n(Math.max(c.bt, c.ml))}. vLLM does this only when no
                budget is set (
                <SourceLink id="vllm-src" at="engine/arg_utils.py L3079–3087" />
                ).
              </>
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

      <details className="sb-group" open={desktop}>
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
          group
          help={
            c.r === "burst" ? (
              "All requests arrive at once."
            ) : (
              <>
                Requests per second, with random (Poisson) gaps between them (
                <a href={SIM7}>SIM.md §7</a>).
              </>
            )
          }
        >
          {(_, labelId) => (
            <span className="sb-inline" role="group" aria-labelledby={labelId}>
              {c.r !== "burst" && (
                <NumberInput
                  label="Arrival rate, per second"
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
        <Row
          k="pl"
          label="Prompt length after the shared prefix"
          config={c}
          set={set}
          group
        >
          {(_, labelId) => (
            <DistEditor
              labelId={labelId}
              name="Prompt length"
              value={c.pl}
              ml={c.ml}
              onChange={(pl) => {
                set({ pl });
              }}
            />
          )}
        </Row>
        <Row k="ol" label="Output length" config={c} set={set} group>
          {(_, labelId) => (
            <DistEditor
              labelId={labelId}
              name="Output length"
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
          group
          help={
            <>
              Each request starts with one of k prefixes of L tokens, with
              chance p (<a href={SIM7}>SIM.md §7</a>).
            </>
          }
        >
          {(_, labelId) => (
            <span className="sb-inline" role="group" aria-labelledby={labelId}>
              <label className="sb-dist__field">
                k
                <NumberInput
                  label="Shared prefix: k, how many prefixes"
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
                  label="Shared prefix: L, tokens in each"
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
                  label="Shared prefix: p, the chance a request has one"
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
          help={
            <>
              Up to {n(top)} tokens for this model{" "}
              <ProvenanceBadge kind="computed" />. Each request&apos;s prefix,
              prompt, and output must fit in it; the prompt is cut first (
              <a href={SIM7}>SIM.md §7</a>).
            </>
          }
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
