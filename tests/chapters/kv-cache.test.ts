/**
 * Chapter 1's claims (tasks/todo.md, "Prompt 3: KV cache chapter"). One test
 * per <Claim id>, each run against the exact data and presets the chapter
 * imports. If a test fails, the prose is wrong: never reword a claim or
 * loosen a test to make it pass (CLAUDE.md).
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  BLOCK_SIZE,
  budget,
  CONCURRENCY_STOPS,
  contextStops,
  freeBytes,
  GIB,
  kvBytesPerRequest,
  kvBytesPerToken,
  kvFormula,
  maxConcurrency,
  type KvDtype,
} from "../../src/chapters/kv-cache/budget.ts";
import {
  CONTRAST,
  GPUS,
  gpu,
  model,
  MODELS,
} from "../../src/chapters/kv-cache/data.ts";
import {
  BIG_GPU,
  CHECK_YOURSELF,
  MEMORY_BUDGET_DEFAULTS as D,
  GQA_CONTRAST,
  TOKEN_GRID,
} from "../../src/chapters/kv-cache/presets.ts";
import kvRef from "../../src/data/kv-ref.json" with { type: "json" };
import { createSim, type SimEvent } from "../../src/sim/index.ts";

const DTYPES: readonly KvDtype[] = ["bf16", "fp8"];

/** The TokenGrid figure's run: one request, 6-token prompt, 6 outputs. */
function tokenGridLog(): readonly SimEvent[] {
  const sim = createSim({ ...TOKEN_GRID, checkInvariants: true });
  sim.run();
  return sim.events();
}
const stepEnds = (events: readonly SimEvent[]) =>
  events.flatMap((e) => (e.type === "StepEnd" ? [e] : []));

/** Positions a model without a cache reruns over at each step: the whole sequence so far. */
function noCachePositions(events: readonly SimEvent[]): number[] {
  let held = 0;
  return stepEnds(events).map((e) => (held += e.tokens));
}

const CLAIMS: Record<string, () => void> = {
  "no-cache-work": () => {
    // Without a cache, each step reruns the model over every token so far:
    // 6, 7, … 11 positions, 51 in total.
    const counts = noCachePositions(tokenGridLog());
    expect(counts).toEqual([6, 7, 8, 9, 10, 11]);
    expect(counts.reduce((s, n) => s + n, 0)).toBe(51);
  },

  "cache-one-column": () => {
    // With a cache, the first step computes the 6-token prompt; every later
    // step computes one new position per layer.
    const ends = stepEnds(tokenGridLog());
    expect(ends.map((e) => e.tokens)).toEqual([6, 1, 1, 1, 1, 1]);
  },

  "cache-total": () => {
    // 11 positions computed in total, instead of 51; the newest sampled token
    // has no keys and values yet, so 12 tokens hold 11 positions of KV.
    const events = tokenGridLog();
    expect(stepEnds(events).reduce((s, e) => s + e.tokens, 0)).toBe(11);
    expect(events.filter((e) => e.type === "DecodeToken")).toHaveLength(6);
    // After each step, KV covers the prompt and every output but the newest.
    const sim = createSim(TOKEN_GRID);
    for (let step = 0; step < 5; step++) {
      sim.step();
      const r = sim.snapshot().requests[0];
      expect(r?.computedTokens).toBe(6 + (r?.generated ?? 0) - 1);
    }
  },

  "formula-matches-data": () => {
    // bytes per token = 2 × L × n_kv × d_h × s matches llmsize for every model.
    for (const m of MODELS) {
      for (const dtype of DTYPES) {
        expect(kvFormula(m, dtype), `${m.id} ${dtype}`).toBe(
          kvBytesPerToken(m, dtype),
        );
      }
    }
    for (const e of kvRef.entries) {
      const m = model(e.model);
      const rounded = Math.ceil(e.tokens / BLOCK_SIZE) * BLOCK_SIZE;
      expect(e.bytes, `${e.model} ${e.kvDtype} ${String(e.tokens)}`).toBe(
        kvFormula(m, e.kvDtype as KvDtype) * rounded,
      );
    }
  },

  "gqa-smaller": () => {
    // GQA shares KV heads: at least 3× less KV per token, for weights within 1.25×.
    const mha = model(CONTRAST.mha);
    const gqa = model(CONTRAST.gqa);
    expect(mha.kvHeads).toBe(mha.attentionHeads);
    expect(gqa.kvHeads).toBeLessThan(gqa.attentionHeads);
    expect(
      mha.kvBytesPerTokenBf16 / gqa.kvBytesPerTokenBf16,
    ).toBeGreaterThanOrEqual(3);
    expect(mha.weightBytesBf16 / gqa.weightBytesBf16).toBeLessThanOrEqual(1.25);
    const g = gpu(GQA_CONTRAST.gpu);
    expect(
      maxConcurrency(g, gqa, "bf16", GQA_CONTRAST.context),
    ).toBeGreaterThan(3 * maxConcurrency(g, mha, "bf16", GQA_CONTRAST.context));
  },

  "weights-fixed": () => {
    // The weights do not change with context, concurrency, or KV dtype.
    const g = gpu(D.gpu);
    const m = model(D.model);
    for (const context of contextStops(m.maxContext)) {
      for (const n of CONCURRENCY_STOPS) {
        for (const dtype of DTYPES) {
          expect(budget(g, m, dtype, context, n).weights).toBe(
            m.weightBytesBf16,
          );
        }
      }
    }
  },

  "kv-linear": () => {
    // KV = KV per request × requests, and KV per request = tokens × KV per
    // token, for every model and dtype; every context stop is a multiple of
    // 16, so none is rounded up.
    const g = gpu(D.gpu);
    for (const m of MODELS) {
      const stops = contextStops(m.maxContext);
      expect(stops.every((c) => c % BLOCK_SIZE === 0)).toBe(true);
      for (const dtype of DTYPES) {
        for (const context of stops) {
          for (const n of CONCURRENCY_STOPS) {
            const b = budget(g, m, dtype, context, n);
            expect(b.kv).toBe(n * kvBytesPerRequest(m, dtype, context));
          }
          expect(kvBytesPerRequest(m, dtype, context)).toBe(
            context * kvBytesPerToken(m, dtype),
          );
        }
      }
    }
  },

  "default-crosses": () => {
    // The default state fits; at 8 requests it does not. On the A10G the
    // weights take about two thirds of usable memory.
    const g = gpu(D.gpu);
    const m = model(D.model);
    expect(budget(g, m, D.dtype, D.context, D.concurrency).fits).toBe(true);
    expect(budget(g, m, D.dtype, D.context, D.overflow).fits).toBe(false);
    expect(
      Math.abs(m.weightBytesBf16 / g.usableVramBytes - 2 / 3),
    ).toBeLessThan(0.02);
  },

  "kv-outgrows-weights": () => {
    // On the H100 at 8K tokens and max concurrency, KV is more than 4× the weights.
    const g = gpu(BIG_GPU.gpu);
    const m = model(D.model);
    const n = maxConcurrency(g, m, "bf16", BIG_GPU.context);
    const b = budget(g, m, "bf16", BIG_GPU.context, n);
    expect(b.fits).toBe(true);
    expect(b.kv / b.weights).toBeGreaterThan(4);
  },

  "max-conc-formula": () => {
    // The widget's max concurrency = ⌊(usable − weights) / KV per request⌋,
    // with KV per request from llmsize's kvBytesForSequence.
    for (const e of kvRef.entries) {
      const m = model(e.model);
      for (const g of GPUS) {
        const free = g.usableVramBytes - m.weightBytesBf16;
        const expected = free <= 0 ? 0 : Math.floor(free / e.bytes);
        expect(
          maxConcurrency(g, m, e.kvDtype as KvDtype, e.tokens),
          `${e.model} ${g.id} ${String(e.tokens)}`,
        ).toBe(expected);
      }
    }
  },

  "double-context-halves": () => {
    // Doubling context halves max concurrency: mc(2c) = ⌊mc(c) / 2⌋, exactly.
    for (const m of MODELS) {
      const stops = contextStops(m.maxContext);
      for (const g of GPUS) {
        for (const dtype of DTYPES) {
          for (const c of stops) {
            if (!stops.includes(2 * c) || maxConcurrency(g, m, dtype, c) === 0)
              continue;
            expect(maxConcurrency(g, m, dtype, 2 * c)).toBe(
              Math.floor(maxConcurrency(g, m, dtype, c) / 2),
            );
          }
        }
      }
    }
  },

  "fp8-doubles": () => {
    // fp8 KV doubles max concurrency, give or take one for floor rounding.
    for (const m of MODELS) {
      for (const g of GPUS) {
        for (const c of contextStops(m.maxContext)) {
          const bf16 = maxConcurrency(g, m, "bf16", c);
          expect([2 * bf16, 2 * bf16 + 1]).toContain(
            maxConcurrency(g, m, "fp8", c),
          );
        }
      }
    }
  },
};

describe("chapter 1 claims", () => {
  for (const [id, test] of Object.entries(CLAIMS)) it(id, test);
});

describe("chapter 1 CheckYourself", () => {
  it("its answers follow from the numbers as shown, rounded as shown", () => {
    // The page shows GiB to 3 places (KV per request in fp8 to 4); a reader
    // who divides the shown numbers must get the shown answers.
    const g = gpu(CHECK_YOURSELF.gpu);
    const m = model(CHECK_YOURSELF.model);
    const shown = (x: number, digits: number) =>
      Number((x / GIB).toFixed(digits));
    const free = shown(g.usableVramBytes, 3) - shown(m.weightBytesBf16, 3);
    expect(free).toBeCloseTo(shown(freeBytes(g, m), 3), 9);
    for (const [dtype, digits] of [
      ["bf16", 3],
      ["fp8", 4],
    ] as const) {
      const perRequest = shown(
        kvBytesPerRequest(m, dtype, CHECK_YOURSELF.context),
        digits,
      );
      expect(Math.floor(free / perRequest)).toBe(
        maxConcurrency(g, m, dtype, CHECK_YOURSELF.context),
      );
    }
  });
});

describe("chapter 1 claim ids", () => {
  it("match the <Claim> ids in the chapter exactly (meta-test)", () => {
    const mdx = readFileSync("src/chapters/kv-cache/index.mdx", "utf8");
    const used = new Set(
      [...mdx.matchAll(/<Claim\s+id="([^"]+)"/g)].map((m) => m[1]),
    );
    expect([...used].sort()).toEqual(Object.keys(CLAIMS).sort());
  });
});
