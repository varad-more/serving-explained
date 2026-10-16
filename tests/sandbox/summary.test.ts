/**
 * The A/B diff rules (src/viz/sandbox/summary.ts): equal hashes say
 * "identical", shares change in percentage points, the rest in percent.
 */
import { describe, expect, it } from "vitest";
import {
  presetSandbox,
  type SandboxConfig,
} from "../../src/viz/sandbox/params.ts";
import type { FromWorker, Series } from "../../src/viz/sandbox/protocol.ts";
import { createRunner } from "../../src/viz/sandbox/runner.ts";
import { diff } from "../../src/viz/sandbox/summary.ts";

async function run(config: SandboxConfig) {
  const out: FromWorker[] = [];
  let now = 0;
  const handle = createRunner((m) => out.push(m), {
    now: () => (now += 10),
    yield: () => Promise.resolve(),
  });
  await handle({ type: "run", config });
  const done = out.at(-1);
  if (done?.type !== "done") throw new Error("no done");
  const batches = out.flatMap((m) => (m.type === "batch" ? [m.series] : []));
  const keys = Object.keys(batches[0] ?? {}) as (keyof Series)[];
  const series = Object.fromEntries(
    keys.map((k) => [k, Float64Array.from(batches.flatMap((b) => [...b[k]]))]),
  ) as unknown as Series;
  return { done, series };
}

describe("the A/B diff", () => {
  const chatbot = { ...presetSandbox("chatbot"), n: 40 };

  it("says identical when the log hashes match", async () => {
    const a = await run(chatbot);
    const rows = diff(a, await run(chatbot));
    expect(new Set(rows.map((r) => r.delta))).toEqual(
      new Set(["identical (same log hash)"]),
    );
  });

  it("gives shares in percentage points and the rest in percent", async () => {
    const rows = diff(
      await run(chatbot),
      await run({ ...chatbot, sc: "static" }),
    );
    const ttft = rows.find((r) => r.key === "ttft-mean");
    expect(ttft?.arrow).toBe("▲");
    expect(ttft?.deltaPct).toMatch(/^\+[\d.]+%$/);
    for (const key of ["kv-mean", "kv-peak", "waste", "hit-rate"]) {
      const row = rows.find((r) => r.key === key);
      expect(row?.deltaPct, key).toBe("");
      expect(row?.delta, key).toMatch(/^(same|[+−][\d.]+ pp)$/);
    }
  });
});
