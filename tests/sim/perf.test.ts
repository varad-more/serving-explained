/**
 * Performance (docs/SIM.md §10): 1,000 chatbot requests on 2,000 blocks,
 * paged, continuous, caching on, invariants off, in under 1 s in Node. The
 * best of 3 runs counts.
 */
import { describe, expect, it } from "vitest";
import { createSim } from "../../src/sim/engine.ts";
import { presetConfig } from "../../src/simConfig.ts";
import { loadData } from "./helpers.ts";

describe("performance", () => {
  it("runs 1,000 chatbot requests in under 1 s (best of 3)", () => {
    const config = presetConfig("chatbot", loadData(), {
      count: 1000,
      numBlocks: 2000,
    });
    const times: number[] = [];
    for (let i = 0; i < 3; i++) {
      const start = performance.now();
      createSim({ ...config, checkInvariants: false }).run();
      times.push(performance.now() - start);
    }
    console.log(
      `perf: 1,000 chatbot requests: best ${Math.min(...times).toFixed(0)} ms of ${times.map((t) => t.toFixed(0)).join(", ")}`,
    );
    expect(Math.min(...times)).toBeLessThan(1000);
  });

  it("reports the time with invariants on (does not gate)", () => {
    const config = presetConfig("chatbot", loadData(), {
      count: 1000,
      numBlocks: 2000,
    });
    const start = performance.now();
    createSim({ ...config, checkInvariants: true }).run();
    console.log(
      `perf: with invariants on: ${(performance.now() - start).toFixed(0)} ms`,
    );
  });
});
