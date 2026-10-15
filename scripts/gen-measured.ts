/**
 * Generates src/data/bench-ieb.json, chapter 3's `measured` numbers, from
 * bench-ieb's committed concurrency-64 result files and run log. Copies of
 * the three files sit in scripts/vendor/bench-ieb at their repo paths;
 * tests/data/bench-ieb.test.ts checks they match the pinned commit and
 * recomputes every number here.
 *
 * Method (tasks/todo.md, "Measured callout"):
 * - Each result file has 150 requests per concurrency level, in level order.
 * - p50 TTFT is the median of a level's `ttft_ms`: the mean of the two middle
 *   values.
 * - Output tok/s is a level's output tokens over the time from its
 *   "throughput ramp level" log line to the next level's, or to "saved
 *   results" for the last level.
 *
 * Never edit the JSON by hand: rerun `pnpm gen:measured`.
 */
import { readFileSync, writeFileSync } from "node:fs";

export const REPO = "varad-more/inference-engine-benchmark-system";
export const COMMIT = "1c964318addd2c742b53b0f0cf4a2cad791cace9";
export const VENDOR = "scripts/vendor/bench-ieb";
export const LOG = "logs/phase2_resume_20260418T042547.log";
export const RESULTS = {
  vLLM: "results_concurrency64/llama-3-1-8b-instruct/throughput_ramp_extended_vllm_1776486559.json",
  SGLang:
    "results_concurrency64/llama-3-1-8b-instruct/throughput_ramp_extended_sglang_1776488646.json",
} as const;
/** Git blob ids of the three files at COMMIT. */
export const BLOBS: Record<string, string> = {
  [LOG]: "96844d976c6287f5e2f2356fca229a0f28430d12",
  [RESULTS.vLLM]: "86cb7ada72b3c15c42e156e39a354b2cf8295b36",
  [RESULTS.SGLang]: "1e25acf39f88cb144cbaa6c3321f61c07b4e1554",
};
const PER_LEVEL = 150;

export const fileUrl = (path: string, line?: number) =>
  `https://github.com/${REPO}/blob/${COMMIT}/${path}${line ? `#L${String(line)}` : ""}`;

interface Request {
  request_id: number;
  success: boolean;
  ttft_ms: number;
  output_tokens: number;
}

const read = (path: string) => readFileSync(`${VENDOR}/${path}`, "utf8");

function main() {
  // The log has terminal color codes; strip them before matching.
  const log = read(LOG)
    .replace(new RegExp(`${String.fromCharCode(27)}\\[[0-9;]*m`, "g"), "")
    .split("\n");
  const lineOf = (re: RegExp, from = 0) => {
    const i = log.findIndex((l, k) => k >= from && re.test(l));
    if (i < 0) throw new Error(`no log line matches ${String(re)}`);
    return i + 1;
  };
  const text = (line: number) => (log[line - 1] ?? "").trim();
  const gpuLine = lineOf(/GPU:\s/);
  const modelLine = lineOf(/Model\s*:/);
  const engines = (["vLLM", "SGLang"] as const).map((engine) => {
    const path = RESULTS[engine];
    const savedLine = lineOf(new RegExp(`saved results .*${path}`));
    const imageLine = lineOf(
      engine === "vLLM" ? /\[pull\] vllm\// : /\[pull\] lmsysorg\/sglang/,
    );
    const json = JSON.parse(read(path)) as {
      requests: Request[];
      scenario_config: { concurrency_levels: number[] };
    };
    const levels = json.scenario_config.concurrency_levels;
    // This engine's level lines are the last ones before its "saved results".
    const marks: number[] = [];
    for (let i = savedLine - 1; i >= 1 && marks.length < levels.length; i--)
      if (/throughput ramp level/.test(text(i))) marks.unshift(i);
    marks.push(savedLine);
    const time = (line: number) => Date.parse(text(line).split(" ")[0] ?? "");
    return {
      engine,
      image: /\S+:\S+/.exec(text(imageLine).replace("[pull] ", ""))?.[0] ?? "",
      imageLine,
      file: path,
      savedLine,
      levels: levels.map((concurrency, k) => {
        const rs = json.requests.slice(k * PER_LEVEL, (k + 1) * PER_LEVEL);
        if (rs.length !== PER_LEVEL || !rs.every((r) => r.success))
          throw new Error(
            `${engine} level ${String(concurrency)} is incomplete`,
          );
        const ttft = rs.map((r) => r.ttft_ms).sort((a, b) => a - b);
        const mid = PER_LEVEL / 2;
        const tokens = rs.reduce((s, r) => s + r.output_tokens, 0);
        const from = marks[k] ?? 0;
        const to = marks[k + 1] ?? 0;
        const seconds = (time(to) - time(from)) / 1000;
        return {
          concurrency,
          requests: rs.length,
          outputTokens: tokens,
          p50TtftMs: ((ttft[mid - 1] ?? 0) + (ttft[mid] ?? 0)) / 2,
          seconds,
          outputTokPerS: tokens / seconds,
          logLines: [from, to],
        };
      }),
    };
  });
  const out = {
    _provenance: {
      repo: REPO,
      commit: COMMIT,
      blobs: BLOBS,
      by: "pnpm gen:measured (scripts/gen-measured.ts)",
    },
    gpu: text(gpuLine).replace(/^GPU:\s*/, ""),
    gpuLine,
    model: text(modelLine).replace(/^Model\s*:\s*/, ""),
    modelLine,
    log: LOG,
    engines,
  };
  writeFileSync("src/data/bench-ieb.json", `${JSON.stringify(out, null, 2)}\n`);
  console.log("wrote src/data/bench-ieb.json");
}

if (import.meta.url === `file://${process.argv[1] ?? ""}`) main();
