/**
 * "Cannot fit even one request" (docs/SIM.md §12.1): both cases, stated
 * with computed numbers.
 */
import { describe, expect, it } from "vitest";
import { buildConfig } from "../../src/viz/sandbox/build.ts";
import { V1_DEFAULTS } from "../../src/viz/sandbox/params.ts";

describe("guardrails", () => {
  it("Llama-3.1-70B on an A10G: the weights exceed the budget", () => {
    const built = buildConfig({
      ...V1_DEFAULTS,
      m: "llama-3.1-70b",
      g: "a10g-24",
    });
    expect(built.ok).toBe(false);
    if (built.ok) return;
    expect(built.code).toBe("weights-exceed-budget");
    expect(built.message).toBe(
      "Llama-3.1-70B's weights (131.4 GiB) need more than this GPU's 20.7 GiB budget (22.5 GiB × 0.92).",
    );
  });

  it("a pool too small for max_model_len gives the KV message", () => {
    const fixed = buildConfig({ ...V1_DEFAULTS, cap: 16, ml: 4096 });
    expect(fixed.ok).toBe(false);
    if (fixed.ok) return;
    expect(fixed.code).toBe("kv-smaller-than-max-model-len");
    expect(fixed.message).toContain(
      "holds 256 tokens, but one request may need 4,096",
    );
    // From GPU memory: Llama-3.1-8B on an A10G leaves too little for 131,072.
    const gpu = buildConfig({ ...V1_DEFAULTS, ml: 131072 });
    expect(gpu.ok).toBe(false);
    if (gpu.ok) return;
    expect(gpu.message).toMatch(
      /^After the weights, the KV pool holds [\d,]+ tokens, but one request may need 131,072 \(max_model_len\)\. Lower max_model_len, switch KV to fp8, or pick a bigger GPU\.$/,
    );
  });

  it("the default config builds", () => {
    expect(buildConfig(V1_DEFAULTS).ok).toBe(true);
  });
});
