/**
 * The engine's CLI (docs/SIM.md §7):
 *
 *   pnpm sim --preset chatbot --scheduler continuous --allocator paged
 *
 * Other flags: --prefix-cache on|off, --chunked-prefill on|off, --blocks,
 * --block-size, --max-num-seqs, --max-batched-tokens, --model, --gpu, --seed,
 * --events N (default 30), and --json. It reads models and GPUs from src/data,
 * so the engine itself stays free of data imports.
 */
import { readFileSync } from "node:fs";
import { parseArgs } from "node:util";
import {
  ConfigError,
  createSim,
  ENGINE_VERSION,
  hashEvents,
  metrics,
  PRESETS,
  type Dist,
  type PresetName,
  type SimEvent,
} from "../src/sim/index.ts";
import {
  presetConfig,
  type ConfigOverrides,
  type SimData,
} from "../src/simConfig.ts";

const USAGE = `usage: pnpm sim [--preset NAME] [--scheduler static|continuous]
  [--allocator paged|contiguous-max] [--prefix-cache on|off] [--chunked-prefill on|off]
  [--blocks N] [--block-size N] [--max-num-seqs N] [--max-batched-tokens N]
  [--model ID|SLUG] [--gpu ID] [--seed N] [--events N] [--json]
presets: ${Object.keys(PRESETS).join(", ")}`;

function fail(message: string): never {
  console.error(`pnpm sim: ${message}\n${USAGE}`);
  process.exit(2);
}

function onOff(value: string | undefined, flag: string): boolean | undefined {
  if (value === undefined) return undefined;
  if (value === "on") return true;
  if (value === "off") return false;
  return fail(`--${flag} takes on or off, not ${value}`);
}

function int(value: string | undefined, flag: string): number | undefined {
  if (value === undefined) return undefined;
  const n = Number(value);
  if (!Number.isInteger(n) || n < 0)
    fail(`--${flag} takes a whole number, not ${value}`);
  return n;
}

function readData(): SimData {
  const read = (file: string): unknown =>
    JSON.parse(
      readFileSync(new URL(`../src/data/${file}`, import.meta.url), "utf8"),
    );
  return {
    models: (read("models.json") as SimData).models,
    gpus: (read("gpus.json") as SimData).gpus,
  };
}

const seconds = (s: number) =>
  !Number.isFinite(s)
    ? "–"
    : s < 1
      ? `${(s * 1000).toFixed(1)} ms`
      : `${s.toFixed(2)} s`;
const dist = (d: Dist) =>
  `mean ${seconds(d.mean)}  p50 ${seconds(d.p50)}  p90 ${seconds(d.p90)}  p99 ${seconds(d.p99)}`;
const count = (n: number) => n.toLocaleString("en-US");

/** One event per line: step, time, type, then its fields. */
function describe(e: SimEvent): string {
  const { type, step, t, ...rest } = e;
  const fields = Object.entries(rest)
    .map(([k, v]) => `${k} ${JSON.stringify(v)}`)
    .join("  ");
  return `${String(step).padStart(5)}  ${t.toFixed(3).padStart(9)}  ${type.padEnd(12)}  ${fields}`;
}

function main(): void {
  const { values } = parseArgs({
    options: {
      preset: { type: "string", default: "chatbot" },
      scheduler: { type: "string" },
      allocator: { type: "string" },
      "prefix-cache": { type: "string" },
      "chunked-prefill": { type: "string" },
      blocks: { type: "string" },
      "block-size": { type: "string" },
      "max-num-seqs": { type: "string" },
      "max-batched-tokens": { type: "string" },
      model: { type: "string" },
      gpu: { type: "string" },
      seed: { type: "string" },
      events: { type: "string", default: "30" },
      json: { type: "boolean", default: false },
      help: { type: "boolean", default: false },
    },
    strict: true,
  });
  if (values.help) {
    console.log(USAGE);
    return;
  }
  const name = values.preset;
  if (!(name in PRESETS)) fail(`unknown preset ${name}`);
  const policy = values.scheduler;
  if (policy !== undefined && policy !== "static" && policy !== "continuous") {
    fail(`--scheduler takes static or continuous, not ${policy}`);
  }
  const allocator = values.allocator;
  if (
    allocator !== undefined &&
    allocator !== "paged" &&
    allocator !== "contiguous-max"
  ) {
    fail(`--allocator takes paged or contiguous-max, not ${allocator}`);
  }
  const over: ConfigOverrides = {
    policy,
    allocator,
    prefixCaching: onOff(values["prefix-cache"], "prefix-cache"),
    chunkedPrefill: onOff(values["chunked-prefill"], "chunked-prefill"),
    numBlocks: int(values.blocks, "blocks"),
    blockSize: int(values["block-size"], "block-size"),
    maxNumSeqs: int(values["max-num-seqs"], "max-num-seqs"),
    maxNumBatchedTokens: int(
      values["max-batched-tokens"],
      "max-batched-tokens",
    ),
    model: values.model,
    gpu: values.gpu,
    seed: int(values.seed, "seed"),
  };
  const shown = int(values.events, "events") ?? 30;

  let config;
  let sim;
  try {
    config = presetConfig(name as PresetName, readData(), over);
    sim = createSim(config);
  } catch (e) {
    if (e instanceof ConfigError || e instanceof RangeError) fail(e.message);
    throw e;
  }
  const end = sim.run();
  const events = sim.events();
  const m = metrics(events, config);
  const hash = hashEvents(events);

  if (values.json) {
    const { requests, ...rest } = config;
    console.log(
      JSON.stringify(
        {
          provenance: "simulated",
          engineVersion: ENGINE_VERSION,
          preset: name,
          config: { ...rest, requests: requests.length },
          steps: end.step + 1,
          hash,
          summary: m.summary,
          events: events.slice(0, shown),
        },
        null,
        2,
      ),
    );
    return;
  }

  const { kv, scheduler: sc } = config;
  const s = m.summary;
  const lines = [
    "SIMULATED: a toy engine, not a measurement of any real server (docs/SIM.md).",
    "",
    "config",
    `  preset             ${name} (seed ${String(config.seed)}, ${count(config.requests.length)} requests)`,
    `  model / gpu        ${config.model.id} on ${config.gpu.id}`,
    `  kv                 ${kv.allocator}, ${count(kv.numBlocks)} blocks of ${String(kv.blockSize)} (${count(kv.numBlocks * kv.blockSize)} tokens), prefix caching ${kv.prefixCaching ? "on" : "off"}`,
    `  scheduler          ${sc.policy}, max_num_seqs ${String(sc.maxNumSeqs)}, budget ${count(sc.maxNumBatchedTokens)}, chunked prefill ${sc.chunkedPrefill ? "on" : "off"}, max_model_len ${count(sc.maxModelLen)}`,
    `  engine version     ${String(ENGINE_VERSION)}`,
    "",
    "metrics (simulated)",
    `  steps              ${count(end.step + 1)}`,
    `  makespan           ${seconds(s.makespan)}`,
    `  output tokens/s    ${s.outputTokensPerS.toFixed(1)}`,
    `  requests/s         ${s.requestsPerS.toFixed(3)}`,
    `  TTFT               ${dist(s.ttft)}`,
    `  ITL                ${dist(s.itl)}`,
    `  E2E                ${dist(s.e2e)}`,
    `  prefix hit rate    ${s.prefixHitRate === null ? "– (caching off)" : `${(s.prefixHitRate * 100).toFixed(1)}%`}`,
    `  preemptions        ${count(s.preemptions)}`,
    `  evictions          ${count(s.evictions)}`,
    `  log hash           ${hash}`,
  ];
  if (shown > 0) {
    lines.push(
      "",
      `events (first ${count(Math.min(shown, events.length))} of ${count(events.length)})`,
      " step          t  type          fields",
      ...events.slice(0, shown).map(describe),
    );
  }
  console.log(lines.join("\n"));
}

main();
