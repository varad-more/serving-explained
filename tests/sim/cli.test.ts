import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";

const sim = (...args: string[]) =>
  spawnSync(process.execPath, ["scripts/sim.ts", ...args], {
    encoding: "utf8",
    input: "",
  });

describe("pnpm sim (docs/SIM.md §7)", () => {
  it("prints the SIMULATED header, the config, metrics, and the first N events", () => {
    const r = sim("--preset", "paged-vs-contiguous", "--events", "3");
    expect(r.status).toBe(0);
    expect(r.stdout).toMatch(/^SIMULATED/);
    expect(r.stdout).toContain("paged, 80 blocks of 16 (1,280 tokens)");
    expect(r.stdout).toMatch(/TTFT +mean/);
    expect(r.stdout).toContain("events (first 3 of");
    expect(r.stdout.trim().split("\n").at(-1)).toMatch(
      /^ +0 +\d+\.\d+ +Allocate/,
    );
  });

  it("--json is machine-readable and marked simulated", () => {
    const r = sim(
      "--preset",
      "batching-basics",
      "--scheduler",
      "static",
      "--events",
      "2",
      "--json",
    );
    const out = JSON.parse(r.stdout) as {
      provenance: string;
      config: { scheduler: { policy: string } };
      events: unknown[];
      hash: string;
    };
    expect(out.provenance).toBe("simulated");
    expect(out.config.scheduler.policy).toBe("static");
    expect(out.events).toHaveLength(2);
    expect(out.hash).toMatch(/^[0-9a-f]{14}$/);
  });

  it("refuses unknown presets and bad flag values with exit code 2", () => {
    expect(sim("--preset", "nope").status).toBe(2);
    expect(sim("--prefix-cache", "maybe").status).toBe(2);
    const r = sim(
      "--preset",
      "chatbot",
      "--chunked-prefill",
      "off",
      "--max-batched-tokens",
      "1024",
    );
    expect(r.status).toBe(2);
    expect(r.stderr).toContain("chunked prefill off");
  });

  it("chunked prefill off raises an unset budget to max_model_len, as vLLM does", () => {
    const r = sim(
      "--preset",
      "long-prompt-stall",
      "--chunked-prefill",
      "off",
      "--events",
      "0",
    );
    expect(r.status).toBe(0);
    expect(r.stdout).toContain("budget 8,192, chunked prefill off");
  });
});
