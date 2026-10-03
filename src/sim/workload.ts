/**
 * Synthetic workloads and the presets (docs/SIM.md §7). Presets are invented
 * shapes chosen to exercise one mechanism each; they are not measurements of
 * real traffic.
 */
import { ln, makeRng, sampleLength } from "./rng.ts";
import type { Preset, PresetName, RequestSpec, WorkloadSpec } from "./types.ts";

const DEFAULT_VOCAB = 32000;

/**
 * Requests for `spec`, deterministic for `seed`. Arrivals, prefix choice,
 * prompt lengths, output lengths, and tokens each draw from their own stream,
 * so changing one distribution leaves the others' draws unchanged.
 */
export function generateWorkload(
  spec: WorkloadSpec,
  seed: number,
): RequestSpec[] {
  validate(spec);
  const vocab = spec.vocabSize ?? DEFAULT_VOCAB;
  const arrivals = makeRng(seed, "arrivals");
  const prefixChoice = makeRng(seed, "prefix");
  const promptLengths = makeRng(seed, "prompt-lengths");
  const outputLengths = makeRng(seed, "output-lengths");
  const tokens = makeRng(seed, "tokens");
  const token = () => Math.floor(tokens() * vocab);

  const sp = spec.sharedPrefix;
  const prefixes =
    sp && sp.fraction > 0
      ? Array.from({ length: sp.groups }, () =>
          Array.from({ length: sp.length }, token),
        )
      : [];

  const requests: RequestSpec[] = [];
  let t = 0;
  for (let id = 0; id < spec.count; id++) {
    if (spec.arrival.kind === "poisson") {
      t += -ln(1 - arrivals()) / spec.arrival.ratePerS;
    }
    const inGroup = sp !== undefined && prefixChoice() < sp.fraction;
    const group = prefixChoice();
    const prefix = inGroup
      ? (prefixes[Math.floor(group * prefixes.length)] ?? [])
      : [];
    let body = sampleLength(spec.promptLen, promptLengths);
    let output = sampleLength(spec.outputLen, outputLengths);

    // Clip to maxModelLen: the body first, then the output.
    let excess = prefix.length + body + output - spec.maxModelLen;
    const minBody = prefix.length > 0 ? 0 : 1;
    const cut = Math.max(0, Math.min(excess, body - minBody));
    body -= cut;
    excess -= cut;
    if (excess > 0) output -= excess;

    const prompt = [...prefix, ...Array.from({ length: body }, token)];
    requests.push({ id, arrival: t, prompt, outputLen: output });
  }
  return requests;
}

function validate(spec: WorkloadSpec): void {
  const fail = (why: string) => {
    throw new RangeError(`workload: ${why}`);
  };
  if (!Number.isInteger(spec.count) || spec.count < 0)
    fail("count must be a whole number");
  if (spec.arrival.kind === "poisson" && !(spec.arrival.ratePerS > 0)) {
    fail("the arrival rate must be positive");
  }
  if (!Number.isInteger(spec.maxModelLen) || spec.maxModelLen < 2) {
    fail("maxModelLen must be at least 2");
  }
  const sp = spec.sharedPrefix;
  if (sp) {
    if (sp.fraction < 0 || sp.fraction > 1)
      fail("the share fraction must be in [0, 1]");
    if (sp.fraction > 0 && (!Number.isInteger(sp.groups) || sp.groups < 1)) {
      fail("a shared prefix needs at least one group");
    }
    if (sp.length > spec.maxModelLen - 1) {
      fail("the shared prefix must leave room for one output token");
    }
  }
  for (const d of [spec.promptLen, spec.outputLen]) {
    const parts = d.kind === "mixture" ? d.parts.map((p) => p.dist) : [d];
    for (const p of parts) {
      const min = p.kind === "fixed" ? p.value : p.min;
      if (!Number.isInteger(min) || min < 1) fail("lengths must be at least 1");
    }
  }
}

const lognormal = (median: number, sigma: number, min: number, max: number) =>
  ({ kind: "lognormal", median, sigma, min, max }) as const;
const uniform = (min: number, max: number) =>
  ({ kind: "uniform", min, max }) as const;
const poisson = (ratePerS: number) => ({ kind: "poisson", ratePerS }) as const;

/**
 * The presets. Each runs on the engine defaults (§7: Llama-3.1-8B-Instruct on
 * a10g-24, block size 16, max_model_len 4096, the `vllm serve` scheduler
 * defaults for a GPU under 70 GB) unless it overrides them. The four generic
 * presets set no numBlocks: the caller derives it from GPU memory (Q6).
 */
export const PRESETS: Record<PresetName, Preset> = {
  chatbot: {
    description: "Chat traffic with one shared system prompt.",
    seed: 1,
    workload: {
      count: 200,
      arrival: poisson(2),
      promptLen: lognormal(200, 0.8, 16, 2048),
      outputLen: lognormal(250, 0.7, 16, 1024),
      sharedPrefix: { groups: 1, length: 128, fraction: 1 },
      maxModelLen: 4096,
    },
  },
  rag: {
    description: "Long retrieved documents, some of them repeated.",
    seed: 2,
    workload: {
      count: 100,
      arrival: poisson(0.5),
      promptLen: uniform(1500, 2500),
      outputLen: lognormal(120, 0.5, 16, 512),
      sharedPrefix: { groups: 8, length: 1024, fraction: 0.6 },
      maxModelLen: 4096,
    },
  },
  "batch-summarize": {
    description: "A full queue of long documents, all arriving at once.",
    seed: 3,
    workload: {
      count: 64,
      arrival: { kind: "burst" },
      promptLen: uniform(800, 2000),
      outputLen: { kind: "fixed", value: 200 },
      sharedPrefix: { groups: 1, length: 64, fraction: 1 },
      maxModelLen: 4096,
    },
  },
  "agent-loop": {
    description: "Agent calls that repeat a long tool and context prefix.",
    seed: 5,
    workload: {
      count: 150,
      arrival: poisson(4),
      promptLen: uniform(32, 256),
      outputLen: lognormal(60, 0.6, 8, 256),
      sharedPrefix: { groups: 4, length: 2048, fraction: 0.9 },
      maxModelLen: 4096,
    },
  },
  "paged-vs-contiguous": {
    description: "Short requests on a toy GPU with 1,280 tokens of KV.",
    seed: 37, // tuned from 7 (docs/SIM.md §7, tuning log)
    workload: {
      count: 40,
      arrival: poisson(1.5),
      promptLen: uniform(32, 128),
      outputLen: lognormal(100, 0.6, 16, 256),
      maxModelLen: 384,
    },
    kv: { numBlocks: 80, blockSize: 16, prefixCaching: false },
    scheduler: { maxModelLen: 512, maxNumSeqs: 8 },
  },
  "batching-basics": {
    description: "Requests with a wide spread of output lengths.",
    seed: 11,
    workload: {
      count: 48,
      arrival: poisson(1.2),
      promptLen: uniform(32, 256),
      outputLen: lognormal(80, 1.0, 8, 512),
      maxModelLen: 1024,
    },
    kv: { numBlocks: 2000, prefixCaching: false },
    scheduler: {
      maxModelLen: 1024,
      maxNumSeqs: 8,
      maxNumBatchedTokens: 2048,
      chunkedPrefill: true,
    },
  },
  "long-prompt-stall": {
    description: "Mostly short prompts, with a long one now and then.",
    seed: 13,
    workload: {
      count: 80,
      arrival: poisson(1.5),
      promptLen: {
        kind: "mixture",
        parts: [
          { weight: 0.85, dist: uniform(64, 256) },
          { weight: 0.15, dist: uniform(6000, 7500) },
        ],
      },
      outputLen: lognormal(50, 0.5, 16, 200),
      maxModelLen: 8192,
    },
    kv: { numBlocks: 3861, prefixCaching: false },
    scheduler: { maxModelLen: 8192, maxNumSeqs: 8 },
  },
  "shared-system-prompt": {
    description: "Most requests share one 600-token system prompt.",
    seed: 17,
    workload: {
      count: 60,
      arrival: poisson(1.5),
      promptLen: uniform(32, 256),
      outputLen: lognormal(100, 0.6, 16, 256),
      sharedPrefix: { groups: 1, length: 600, fraction: 0.9 },
      maxModelLen: 1536,
    },
    kv: { numBlocks: 256, blockSize: 16, prefixCaching: true },
    scheduler: {
      maxModelLen: 1536,
      maxNumSeqs: 8,
      maxNumBatchedTokens: 2048,
      chunkedPrefill: true,
    },
  },
  "cache-pressure": {
    description: "Twelve shared prefixes competing for a small cache.",
    seed: 19,
    workload: {
      count: 80,
      arrival: poisson(2),
      promptLen: uniform(32, 128),
      outputLen: lognormal(60, 0.6, 16, 200),
      sharedPrefix: { groups: 12, length: 256, fraction: 0.9 },
      maxModelLen: 1024,
    },
    kv: { numBlocks: 128, blockSize: 16, prefixCaching: true },
    scheduler: { maxModelLen: 1024, maxNumSeqs: 8 },
  },
};
