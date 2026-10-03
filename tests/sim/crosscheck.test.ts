/**
 * Cross-check with llmsize (docs/SIM.md §10): S identical requests at t = 0,
 * prompt ℓ − 32 and output 64, through the whole engine. Decode-only steps,
 * where every request decodes one token, give tokens per second, compared
 * with llmsize's estimateThroughput in src/data/roofline-ref.json. The two
 * use the same formula, so this catches unit and wiring bugs.
 */
import { describe, expect, it } from "vitest";
import { createSim } from "../../src/sim/engine.ts";
import type { SimConfig } from "../../src/sim/types.ts";
import { COST_CONSTANTS, gpuCost, modelCost } from "../../src/simConfig.ts";
import { loadData } from "./helpers.ts";

describe("cross-check with llmsize, within 15%", () => {
  const data = loadData();
  for (const ref of data.roofline.configs) {
    it(`${ref.model} on ${ref.gpu}, S ${String(ref.concurrency)}, ℓ ${String(ref.avgSeqLen)}`, () => {
      const m = data.models.find((x) => x.id === ref.model)!;
      const g = data.gpus.find((x) => x.id === ref.gpu)!;
      const S = ref.concurrency;
      const prompt = Array.from(
        { length: ref.avgSeqLen - 32 },
        (_, i) => i % 1000,
      );
      const config: SimConfig = {
        seed: 1,
        requests: Array.from({ length: S }, (_, id) => ({
          id,
          arrival: 0,
          prompt,
          outputLen: 64,
        })),
        model: modelCost(m),
        gpu: gpuCost(g),
        cost: COST_CONSTANTS,
        kv: {
          allocator: "paged",
          numBlocks: S * Math.ceil((ref.avgSeqLen + 32) / 16),
          blockSize: 16,
          prefixCaching: false,
        },
        scheduler: {
          policy: "continuous",
          maxNumSeqs: S,
          maxNumBatchedTokens: 2048,
          chunkedPrefill: true,
          maxModelLen: ref.avgSeqLen + 64,
        },
      };
      const sim = createSim(config);
      sim.run();
      const decodeSteps = sim
        .events()
        .filter((e) => e.type === "StepEnd" && e.batch === S && e.tokens === S);
      // Early requests decode while later prompts still prefill, so only the
      // last steps are decode-only: 32 of them for Qwen3-8B on the H100.
      expect(decodeSteps.length).toBeGreaterThanOrEqual(16);
      const mean =
        decodeSteps.reduce(
          (s, e) => s + (e.type === "StepEnd" ? e.duration : 0),
          0,
        ) / decodeSteps.length;
      const tps = S / mean;
      console.log(
        `crosscheck: ${ref.model} ${ref.gpu}: ${String(decodeSteps.length)} decode steps, sim ${tps.toFixed(1)} vs llmsize ${ref.decodeTokensPerSecond.toFixed(1)} tok/s (${((tps / ref.decodeTokensPerSecond - 1) * 100).toFixed(2)}%)`,
      );
      expect(Math.abs(tps / ref.decodeTokensPerSecond - 1)).toBeLessThan(0.15);
    });
  }
});
