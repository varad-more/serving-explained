/**
 * Chapter 3's `measured` callout: src/data/bench-ieb.json, recomputed here
 * from the vendored bench-ieb files without the generator's code, and the
 * vendored files checked against the pinned commit's blob ids.
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import data from "../../src/data/bench-ieb.json" with { type: "json" };
import { BLOBS, LOG, RESULTS, VENDOR } from "../../scripts/gen-measured.ts";

const bytes = (path: string) => readFileSync(`${VENDOR}/${path}`);

describe("bench-ieb measured numbers", () => {
  it("vendored files are the ones at the pinned commit", () => {
    for (const [path, blob] of Object.entries(BLOBS)) {
      const b = bytes(path);
      const sha = createHash("sha1")
        .update(`blob ${String(b.length)}\0`)
        .update(b)
        .digest("hex");
      expect(sha, path).toBe(blob);
    }
  });

  it("every level's p50 TTFT and output tok/s recompute from the files", () => {
    // Strip the log's terminal color codes (ESC [ … m).
    const ansi = new RegExp(`${String.fromCharCode(27)}\\[[0-9;]*m`, "g");
    const log = bytes(LOG).toString("utf8").replace(ansi, "").split("\n");
    const stamp = (line: number) =>
      Date.parse(
        /\d{4}-\d\d-\d\dT[\d:.]+Z/.exec(log[line - 1] ?? "")?.[0] ?? "",
      );
    for (const e of data.engines) {
      const file = RESULTS[e.engine as keyof typeof RESULTS];
      const json = JSON.parse(bytes(file).toString("utf8")) as {
        requests: {
          ttft_ms: number;
          output_tokens: number;
          success: boolean;
        }[];
      };
      expect(json.requests).toHaveLength(900);
      const words = (json.requests as unknown as { prompt_len: number }[]).map(
        (r) => r.prompt_len,
      );
      expect(e.promptWords).toEqual({
        min: Math.min(...words),
        max: Math.max(...words),
      });
      expect(e.prompts).toBe(
        new Set(
          (json.requests as unknown as { prompt_id: string }[]).map(
            (r) => r.prompt_id,
          ),
        ).size,
      );
      e.levels.forEach((level, k) => {
        const rs = json.requests.slice(150 * k, 150 * (k + 1));
        expect(rs.every((r) => r.success && r.output_tokens === 256)).toBe(
          true,
        );
        const t = rs.map((r) => r.ttft_ms).sort((a, b) => a - b);
        expect(level.p50TtftMs).toBeCloseTo(
          ((t[74] ?? 0) + (t[75] ?? 0)) / 2,
          9,
        );
        const [from, to] = level.logLines as [number, number];
        expect(log[from - 1]).toContain(
          `concurrency=${String(level.concurrency)}`,
        );
        const next = log[to - 1] ?? "";
        expect(
          k + 1 < e.levels.length
            ? next.includes("throughput ramp level")
            : next.includes(`saved results`) && next.includes(file),
        ).toBe(true);
        const seconds = (stamp(to) - stamp(from)) / 1000;
        expect(level.outputTokPerS).toBeCloseTo((150 * 256) / seconds, 9);
      });
    }
  });

  it("the callout's figures: 1 vs. 64 concurrent requests", () => {
    const at = (engine: string, c: number) =>
      data.engines
        .find((e) => e.engine === engine)
        ?.levels.find((l) => l.concurrency === c);
    expect(at("vLLM", 1)?.p50TtftMs).toBeCloseTo(41.15, 2);
    expect(at("vLLM", 64)?.p50TtftMs).toBeCloseTo(162.83, 2);
    expect(at("vLLM", 64)?.outputTokPerS).toBeCloseTo(1279.53, 2);
    expect(at("SGLang", 1)?.p50TtftMs).toBeCloseTo(69.87, 2);
    expect(at("SGLang", 64)?.p50TtftMs).toBeCloseTo(156.12, 2);
    expect(at("SGLang", 64)?.outputTokPerS).toBeCloseTo(1271.1, 1);
    expect(data.gpu).toBe("NVIDIA A10G, 23028 MiB");
    expect(data.model).toBe("meta-llama/Llama-3.1-8B-Instruct");
  });
});
