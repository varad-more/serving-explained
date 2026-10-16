/**
 * The sandbox's one parameter table (tasks/todo.md, Prompt 7, decision 5):
 * each key's type, range, and default drive parsing, clamping, encoding, and
 * the notices. tests/sandbox/url.test.ts checks it against docs/SIM.md §12.1,
 * so the two cannot drift. Nothing here throws on bad input.
 */
import gpus from "../../data/gpus.json" with { type: "json" };
import models from "../../data/models.json" with { type: "json" };
import {
  PRESETS,
  type BaseLengthDist,
  type LengthDist,
  type PresetName,
} from "../../sim/index.ts";
import { ENGINE_DEFAULTS } from "../../simConfig.ts";

export type Allocator = "paged" | "contiguous-max";
export type Policy = "static" | "continuous";

export interface SharedPrefix {
  groups: number;
  length: number;
  fraction: number;
}

/** One configuration: every §12.1 key. */
export interface SandboxConfig {
  /** A preset name, as a label only: it changes nothing else (§12.2). */
  p: PresetName | null;
  s: number;
  n: number;
  r: number | "burst";
  pl: LengthDist;
  ol: LengthDist;
  sp: SharedPrefix;
  m: string;
  g: string;
  kd: "bf16" | "fp8";
  gf: number;
  cap: "gpu" | number;
  al: Allocator;
  bs: number;
  pc: boolean;
  sc: Policy;
  ns: number;
  bt: number;
  cp: boolean;
  ml: number;
}

export type Key = Exclude<keyof SandboxConfig, "p">;

export const MODEL_SLUGS = models.models.map((x) => x.slug);
export const GPU_IDS = gpus.gpus.map((x) => x.id);
export const BLOCK_SIZES = [8, 16, 32, 64, 128] as const;
export const PRESET_NAMES = Object.keys(PRESETS) as PresetName[];

const lognormal = (median: number, sigma: number, min: number, max: number) =>
  ({ kind: "lognormal", median, sigma, min, max }) as const;

/**
 * The defaults column of SIM.md §12.1, frozen for format v1. Its workload
 * matches `chatbot` today, but it does not follow later preset tuning:
 * changing a value here means format v2.
 */
export const V1_DEFAULTS: Readonly<SandboxConfig> = Object.freeze({
  p: null,
  s: 1,
  n: 200,
  r: 2,
  pl: lognormal(200, 0.8, 16, 2048),
  ol: lognormal(250, 0.7, 16, 1024),
  sp: { groups: 1, length: 128, fraction: 1 },
  m: "llama-3.1-8b",
  g: "a10g-24",
  kd: "bf16",
  gf: 0.92,
  cap: "gpu",
  al: "paged",
  bs: 16,
  pc: true,
  sc: "continuous",
  ns: 256,
  bt: 2048,
  cp: true,
  ml: 4096,
});

export const LIMITS = {
  s: { min: 0, max: 4_294_967_295 },
  n: { min: 1, max: 5000 },
  r: { min: 0.05, max: 50 },
  length: { min: 1 },
  sigma: { min: 0, max: 3 },
  mixtureParts: 4,
  spGroups: { min: 0, max: 64 },
  gf: { min: 0.5, max: 0.99 },
  cap: { min: 16, max: 262_144 },
  ns: { min: 1, max: 1024 },
  bt: { min: 16, max: 131_072 },
  ml: { min: 64, max: 131_072 },
  /** A run stops with a plain-language error after this many steps (§12.1). */
  steps: 5_000_000,
} as const;

/* ---------- length distributions: f128, u32-256, l200,0.8,16,2048, x… ---------- */

const num = (x: number) => String(x);

export function encodeDist(d: LengthDist): string {
  if (d.kind === "mixture")
    return `x${d.parts.map((p) => `${num(p.weight)}:${encodeBase(p.dist)}`).join("|")}`;
  return encodeBase(d);
}

function encodeBase(d: BaseLengthDist): string {
  switch (d.kind) {
    case "fixed":
      return `f${num(d.value)}`;
    case "uniform":
      return `u${num(d.min)}-${num(d.max)}`;
    case "lognormal":
      return `l${num(d.median)},${num(d.sigma)},${num(d.min)},${num(d.max)}`;
  }
}

const INT = /^\d{1,7}$/;
const DEC = /^\d{1,7}(\.\d{1,6})?$/;
const int = (s: string | undefined) =>
  s !== undefined && INT.test(s) ? Number(s) : NaN;
const dec = (s: string | undefined) =>
  s !== undefined && DEC.test(s) ? Number(s) : NaN;

/** A distribution, or null when the text is not one. Lengths unclamped. */
export function parseDist(text: string): LengthDist | null {
  if (text.startsWith("x")) {
    const parts = text.slice(1).split("|");
    if (parts.length < 1 || parts.length > LIMITS.mixtureParts) return null;
    const out: { weight: number; dist: BaseLengthDist }[] = [];
    for (const part of parts) {
      const [w, body] = part.split(":");
      const weight = dec(w);
      const dist = body === undefined ? null : parseBase(body);
      if (!(weight > 0) || !dist) return null;
      out.push({ weight, dist });
    }
    return { kind: "mixture", parts: out };
  }
  return parseBase(text);
}

function parseBase(text: string): BaseLengthDist | null {
  const kind = text[0];
  const rest = text.slice(1);
  if (kind === "f") {
    const value = int(rest);
    return value >= 1 ? { kind: "fixed", value } : null;
  }
  if (kind === "u") {
    const [a, b] = rest.split("-");
    const min = int(a);
    const max = int(b);
    return min >= 1 && max >= min ? { kind: "uniform", min, max } : null;
  }
  if (kind === "l") {
    const [m, sg, a, b] = rest.split(",");
    const median = int(m);
    const sigma = dec(sg);
    const min = int(a);
    const max = int(b);
    return median >= 1 && sigma >= 0 && min >= 1 && max >= min
      ? { kind: "lognormal", median, sigma, min, max }
      : null;
  }
  return null;
}

/** Clamps every length to [1, ml] and σ to its range; says what changed. */
function clampDist(d: LengthDist, ml: number, notes: string[]): LengthDist {
  const len = (x: number) => Math.min(ml, Math.max(1, x));
  const base = (b: BaseLengthDist): BaseLengthDist => {
    switch (b.kind) {
      case "fixed":
        return { kind: "fixed", value: len(b.value) };
      case "uniform":
        return { kind: "uniform", min: len(b.min), max: len(b.max) };
      case "lognormal":
        return {
          kind: "lognormal",
          median: len(b.median),
          sigma: Math.min(LIMITS.sigma.max, b.sigma),
          min: len(b.min),
          max: len(b.max),
        };
    }
  };
  const out: LengthDist =
    d.kind === "mixture"
      ? {
          kind: "mixture",
          parts: d.parts.map((p) => ({ ...p, dist: base(p.dist) })),
        }
      : base(d);
  if (encodeDist(out) !== encodeDist(d))
    notes.push(
      `lengths above max_model_len (${String(ml)}) or σ above ${String(LIMITS.sigma.max)}`,
    );
  return out;
}

/* ---------- the table ---------- */

interface Param<K extends Key> {
  key: K;
  label: string;
  encode: (v: SandboxConfig[K]) => string;
  /** The value, or null when the text cannot be one. Not yet clamped. */
  parse: (text: string) => SandboxConfig[K] | null;
}

const clampNum = (x: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, x));

function oneOf<T extends string>(options: readonly T[]) {
  return (text: string) =>
    (options as readonly string[]).includes(text) ? (text as T) : null;
}

const bool = (text: string) =>
  text === "1" ? true : text === "0" ? false : null;

export const PARAMS: { [K in Key]: Param<K> } = {
  s: {
    key: "s",
    label: "seed",
    encode: num,
    parse: (t) => (INT.test(t) || /^\d{8,10}$/.test(t) ? Number(t) : null),
  },
  n: {
    key: "n",
    label: "requests",
    encode: num,
    parse: (t) => (INT.test(t) ? Number(t) : null),
  },
  r: {
    key: "r",
    label: "arrival rate",
    encode: (v) => (v === "burst" ? "burst" : num(v)),
    parse: (t) => (t === "burst" ? "burst" : DEC.test(t) ? Number(t) : null),
  },
  pl: {
    key: "pl",
    label: "prompt length",
    encode: encodeDist,
    parse: parseDist,
  },
  ol: {
    key: "ol",
    label: "output length",
    encode: encodeDist,
    parse: parseDist,
  },
  sp: {
    key: "sp",
    label: "shared prefix",
    encode: (v) => `${num(v.groups)},${num(v.length)},${num(v.fraction)}`,
    parse: (t) => {
      const [k, l, p] = t.split(",");
      const groups = int(k);
      const length = int(l);
      const fraction = dec(p);
      return Number.isFinite(groups) &&
        Number.isFinite(length) &&
        Number.isFinite(fraction)
        ? { groups, length, fraction }
        : null;
    },
  },
  m: { key: "m", label: "model", encode: String, parse: oneOf(MODEL_SLUGS) },
  g: { key: "g", label: "GPU", encode: String, parse: oneOf(GPU_IDS) },
  kd: {
    key: "kd",
    label: "KV dtype",
    encode: String,
    parse: oneOf(["bf16", "fp8"] as const),
  },
  gf: {
    key: "gf",
    label: "GPU memory fraction",
    encode: num,
    parse: (t) => (DEC.test(t) ? Number(t) : null),
  },
  cap: {
    key: "cap",
    label: "KV capacity",
    encode: (v) => (v === "gpu" ? "gpu" : num(v)),
    parse: (t) => (t === "gpu" ? "gpu" : INT.test(t) ? Number(t) : null),
  },
  al: {
    key: "al",
    label: "allocator",
    encode: String,
    parse: oneOf(["paged", "contiguous-max"] as const),
  },
  bs: {
    key: "bs",
    label: "block size",
    encode: num,
    parse: (t) =>
      (BLOCK_SIZES as readonly number[]).includes(int(t)) ? int(t) : null,
  },
  pc: {
    key: "pc",
    label: "prefix caching",
    encode: (v) => (v ? "1" : "0"),
    parse: bool,
  },
  sc: {
    key: "sc",
    label: "scheduler",
    encode: String,
    parse: oneOf(["static", "continuous"] as const),
  },
  ns: {
    key: "ns",
    label: "max_num_seqs",
    encode: num,
    parse: (t) => (INT.test(t) ? Number(t) : null),
  },
  bt: {
    key: "bt",
    label: "max_num_batched_tokens",
    encode: num,
    parse: (t) => (INT.test(t) ? Number(t) : null),
  },
  cp: {
    key: "cp",
    label: "chunked prefill",
    encode: (v) => (v ? "1" : "0"),
    parse: bool,
  },
  ml: {
    key: "ml",
    label: "max_model_len",
    encode: num,
    parse: (t) => (INT.test(t) ? Number(t) : null),
  },
};

/** §12.1's order: a link lists keys in this order. */
export const KEYS: readonly Key[] = [
  "s",
  "n",
  "r",
  "pl",
  "ol",
  "sp",
  "m",
  "g",
  "kd",
  "gf",
  "cap",
  "al",
  "bs",
  "pc",
  "sc",
  "ns",
  "bt",
  "cp",
  "ml",
];

/** The model's maximum context, the upper bound of `ml`. */
export function maxContext(slug: string): number {
  const m = models.models.find((x) => x.slug === slug);
  return Math.min(LIMITS.ml.max, m?.maxContext ?? LIMITS.ml.max);
}

/**
 * Clamps a config to §12.1's ranges and cross-field rules, and says what it
 * changed. The result is always valid.
 */
export function clampConfig(
  c: SandboxConfig,
  notes: string[] = [],
): SandboxConfig {
  const out: SandboxConfig = { ...c };
  const note = (label: string, why: string) => {
    notes.push(`${label}: ${why}`);
  };
  const bound = (
    key: "s" | "n" | "gf" | "ns" | "bt",
    lo: number,
    hi: number,
    round: boolean,
  ) => {
    const v = out[key];
    const x = clampNum(round ? Math.round(v) : v, lo, hi);
    if (x !== v)
      note(
        PARAMS[key].label,
        `${String(v)} is out of range; using ${String(x)}`,
      );
    out[key] = x;
  };
  bound("s", LIMITS.s.min, LIMITS.s.max, true);
  bound("n", LIMITS.n.min, LIMITS.n.max, true);
  bound("gf", LIMITS.gf.min, LIMITS.gf.max, false);
  bound("ns", LIMITS.ns.min, LIMITS.ns.max, true);
  bound("bt", LIMITS.bt.min, LIMITS.bt.max, true);
  if (out.r !== "burst") {
    const r = clampNum(out.r, LIMITS.r.min, LIMITS.r.max);
    if (r !== out.r)
      note(
        "arrival rate",
        `${String(out.r)} is out of range; using ${String(r)}`,
      );
    out.r = r;
  }
  if (out.cap !== "gpu") {
    const cap = clampNum(Math.round(out.cap), LIMITS.cap.min, LIMITS.cap.max);
    if (cap !== out.cap)
      note(
        "KV capacity",
        `${String(out.cap)} blocks is out of range; using ${String(cap)}`,
      );
    out.cap = cap;
  }
  const top = maxContext(out.m);
  const ml = clampNum(Math.round(out.ml), LIMITS.ml.min, top);
  if (ml !== out.ml)
    note(
      "max_model_len",
      `${String(out.ml)} is out of range for this model; using ${String(ml)}`,
    );
  out.ml = ml;
  const lengths: string[] = [];
  out.pl = clampDist(out.pl, ml, lengths);
  out.ol = clampDist(out.ol, ml, lengths);
  if (lengths.length > 0) note("lengths", "clamped to 1 – max_model_len");
  const sp = {
    groups: clampNum(
      Math.round(out.sp.groups),
      LIMITS.spGroups.min,
      LIMITS.spGroups.max,
    ),
    length: clampNum(Math.round(out.sp.length), 0, ml - 1),
    fraction: clampNum(out.sp.fraction, 0, 1),
  };
  if (
    sp.groups !== out.sp.groups ||
    sp.length !== out.sp.length ||
    sp.fraction !== out.sp.fraction
  )
    note("shared prefix", `clamped to ${PARAMS.sp.encode(sp)}`);
  out.sp = sp;
  if (out.al === "contiguous-max" && out.pc) {
    note("prefix caching", "turned off: it needs the paged allocator");
    out.pc = false;
  }
  return out;
}

/* ---------- links ---------- */

export interface Link {
  a: SandboxConfig;
  b: SandboxConfig | null;
  /** First 8 hex digits of each run's log hash, when the link carries them. */
  h: string | null;
  hb: string | null;
}

export interface Parsed extends Link {
  /** What was dropped or changed, in plain words. */
  notices: string[];
}

const HASH = /^[0-9a-f]{8}$/;

/** Parses a query string. Never throws; the result is always valid. */
export function parseLink(query: string): Parsed {
  const notices: string[] = [];
  let params: URLSearchParams;
  try {
    params = new URLSearchParams(query);
  } catch {
    params = new URLSearchParams();
    notices.push("The link could not be read; using the defaults.");
  }
  const v = params.get("v");
  if (v !== null && v !== "1") {
    notices.push(`Link format v=${clip(v)} is unknown; using the defaults.`);
    return { a: { ...V1_DEFAULTS }, b: null, h: null, hb: null, notices };
  }
  const configs: Record<"a" | "b", SandboxConfig> = {
    a: { ...V1_DEFAULTS },
    b: { ...V1_DEFAULTS },
  };
  let hasB = false;
  let h: string | null = null;
  let hb: string | null = null;
  for (const [rawKey, value] of params) {
    try {
      if (rawKey === "v") continue;
      if (rawKey === "h" || rawKey === "hb") {
        if (HASH.test(value)) {
          if (rawKey === "h") h = value;
          else hb = value;
        } else notices.push(`Ignored a malformed run hash (${rawKey}).`);
        continue;
      }
      const match = /^([ab])\.([a-z]{1,3})$/.exec(rawKey);
      const side = match?.[1] as "a" | "b" | undefined;
      const key = match?.[2];
      if (!side || !key) {
        notices.push(`Ignored an unknown setting "${clip(rawKey)}".`);
        continue;
      }
      if (side === "b") hasB = true;
      const cfg = configs[side];
      if (key === "p") {
        if ((PRESET_NAMES as string[]).includes(value))
          cfg.p = value as PresetName;
        else notices.push(`Ignored an unknown preset label "${clip(value)}".`);
        continue;
      }
      if (!(KEYS as readonly string[]).includes(key)) {
        notices.push(`Ignored an unknown setting "${clip(rawKey)}".`);
        continue;
      }
      const param = PARAMS[key as Key];
      const parsed = param.parse(value);
      if (parsed === null) {
        notices.push(
          `${side.toUpperCase()}: ${param.label} "${clip(value)}" is not valid; using the default.`,
        );
        continue;
      }
      (cfg as unknown as Record<string, unknown>)[key] = parsed;
    } catch {
      notices.push(`Ignored a setting that could not be read.`);
    }
  }
  const clampSide = (side: "a" | "b") => {
    const notes: string[] = [];
    const out = clampConfig(configs[side], notes);
    for (const n of notes) notices.push(`${side.toUpperCase()}: ${n}.`);
    return out;
  };
  return {
    a: clampSide("a"),
    b: hasB ? clampSide("b") : null,
    h,
    hb: hasB ? hb : null,
    notices,
  };
}

/** Keeps notices short, whatever the link held. */
function clip(text: string): string {
  const plain = text.replace(/[^\x20-\x7e]/g, "?");
  return plain.length > 24 ? `${plain.slice(0, 24)}…` : plain;
}

/** Every key that differs from V1_DEFAULTS, in §12.1's order. */
function encodeSide(prefix: "a" | "b", c: SandboxConfig): string[] {
  const out: string[] = [];
  if (c.p) out.push(`${prefix}.p=${c.p}`);
  for (const key of KEYS) {
    const param = PARAMS[key] as Param<Key>;
    const value = param.encode(c[key]);
    if (value !== param.encode(V1_DEFAULTS[key]))
      out.push(`${prefix}.${key}=${encodeURIComponent(value)}`);
  }
  return out;
}

/** The query string for a link: `v=1&a.…&b.…&h=…&hb=…`. */
export function encodeLink(link: Link): string {
  const parts = ["v=1", ...encodeSide("a", link.a)];
  if (link.b) parts.push(...encodeSide("b", link.b));
  if (link.h) parts.push(`h=${link.h}`);
  if (link.b && link.hb) parts.push(`hb=${link.hb}`);
  return parts.join("&");
}

/* ---------- presets ---------- */

const defaultSlug =
  models.models.find((x) => x.id === ENGINE_DEFAULTS.model)?.slug ??
  V1_DEFAULTS.m;

/** A preset as a sandbox config: the same run as `pnpm sim --preset`. */
export function presetSandbox(name: PresetName): SandboxConfig {
  const preset = PRESETS[name];
  const kv = { ...ENGINE_DEFAULTS.kv, ...preset.kv };
  const sc = { ...ENGINE_DEFAULTS.scheduler, ...preset.scheduler };
  const w = preset.workload;
  return {
    p: name,
    s: preset.seed,
    n: w.count,
    r: w.arrival.kind === "burst" ? "burst" : w.arrival.ratePerS,
    pl: w.promptLen,
    ol: w.outputLen,
    sp: w.sharedPrefix ?? { groups: 0, length: 0, fraction: 0 },
    m: defaultSlug,
    g: ENGINE_DEFAULTS.gpu,
    kd: "bf16",
    gf: ENGINE_DEFAULTS.gpuMemoryFraction,
    cap: preset.kv?.numBlocks ?? "gpu",
    al: kv.allocator,
    bs: kv.blockSize,
    pc: kv.allocator === "paged" && kv.prefixCaching,
    sc: sc.policy,
    ns: sc.maxNumSeqs,
    bt: sc.maxNumBatchedTokens,
    cp: sc.chunkedPrefill,
    ml: sc.maxModelLen,
  };
}
