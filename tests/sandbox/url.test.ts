/**
 * Share links, format v1 (docs/SIM.md §12.2), and the parameter table
 * against §12.1. Every preset and random valid configs round-trip to the
 * same config and the same log hash; fuzzed links never throw and always
 * decode to a valid config.
 */
import { readFileSync } from "node:fs";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import gpus from "../../src/data/gpus.json" with { type: "json" };
import models from "../../src/data/models.json" with { type: "json" };
import { createSim, hashEvents, type LengthDist } from "../../src/sim/index.ts";
import { presetConfig, type SimData } from "../../src/simConfig.ts";
import { buildConfig } from "../../src/viz/sandbox/build.ts";
import {
  BLOCK_SIZES,
  clampConfig,
  encodeLink,
  GPU_IDS,
  KEYS,
  LIMITS,
  MODEL_SLUGS,
  PARAMS,
  parseLink,
  PRESET_NAMES,
  presetSandbox,
  V1_DEFAULTS,
  type SandboxConfig,
} from "../../src/viz/sandbox/params.ts";

const DATA: SimData = { models: models.models, gpus: gpus.gpus };

function hashOf(c: SandboxConfig): string {
  const built = buildConfig(c);
  if (!built.ok) return built.code;
  const sim = createSim(built.config);
  sim.run();
  return hashEvents(sim.events());
}

describe("share links", () => {
  for (const name of PRESET_NAMES) {
    it(`${name} round-trips to the CLI's own run`, () => {
      const query = encodeLink({
        a: presetSandbox(name),
        b: null,
        h: null,
        hb: null,
      });
      const parsed = parseLink(query);
      expect(parsed.notices).toEqual([]);
      expect(parsed.a).toEqual(presetSandbox(name));
      const direct = createSim(presetConfig(name, DATA));
      direct.run();
      expect(hashOf(parsed.a)).toBe(hashEvents(direct.events()));
    });
  }

  it("the chatbot link is just its label: chatbot is V1_DEFAULTS today", () => {
    expect(
      encodeLink({ a: presetSandbox("chatbot"), b: null, h: null, hb: null }),
    ).toBe("v=1&a.p=chatbot");
  });

  const length = (ml: number): fc.Arbitrary<LengthDist> => {
    const len = fc.integer({ min: 1, max: ml });
    const base = fc.oneof(
      len.map((value) => ({ kind: "fixed" as const, value })),
      fc.tuple(len, len).map(([a, b]) => ({
        kind: "uniform" as const,
        min: Math.min(a, b),
        max: Math.max(a, b),
      })),
      fc
        .tuple(len, fc.integer({ min: 0, max: 300 }), len, len)
        .map(([median, s, a, b]) => ({
          kind: "lognormal" as const,
          median,
          sigma: s / 100,
          min: Math.min(a, b),
          max: Math.max(a, b),
        })),
    );
    return fc.oneof(
      base,
      fc
        .array(fc.tuple(fc.integer({ min: 1, max: 99 }), base), {
          minLength: 1,
          maxLength: 4,
        })
        .map((parts) => ({
          kind: "mixture" as const,
          parts: parts.map(([w, dist]) => ({ weight: w / 100, dist })),
        })),
    );
  };

  const config: fc.Arbitrary<SandboxConfig> = fc
    .integer({ min: 64, max: 2048 })
    .chain((ml) =>
      fc.record({
        p: fc.constantFrom(null, ...PRESET_NAMES),
        s: fc.integer({ min: 0, max: LIMITS.s.max }),
        n: fc.integer({ min: 1, max: 50 }),
        r: fc.oneof(
          fc.constant("burst" as const),
          fc.integer({ min: 5, max: 5000 }).map((x) => x / 100),
        ),
        pl: length(ml),
        ol: length(ml),
        sp: fc.record({
          groups: fc.integer({ min: 0, max: 64 }),
          length: fc.integer({ min: 0, max: ml - 1 }),
          fraction: fc.integer({ min: 0, max: 100 }).map((x) => x / 100),
        }),
        m: fc.constantFrom(...MODEL_SLUGS),
        g: fc.constantFrom(...GPU_IDS),
        kd: fc.constantFrom("bf16" as const, "fp8" as const),
        gf: fc.integer({ min: 50, max: 99 }).map((x) => x / 100),
        cap: fc.oneof(
          fc.constant("gpu" as const),
          fc.integer({ min: 16, max: 4096 }),
        ),
        al: fc.constantFrom("paged" as const, "contiguous-max" as const),
        bs: fc.constantFrom(...BLOCK_SIZES),
        pc: fc.boolean(),
        sc: fc.constantFrom("static" as const, "continuous" as const),
        ns: fc.integer({ min: 1, max: 64 }),
        bt: fc.integer({ min: 16, max: 8192 }),
        cp: fc.boolean(),
        ml: fc.constant(ml),
      }),
    )
    .map((c) => clampConfig(c));

  it("random valid configs round-trip to an equal config and hash", () => {
    fc.assert(
      fc.property(config, (c) => {
        const parsed = parseLink(encodeLink({ a: c, b: c, h: null, hb: null }));
        expect(parsed.notices).toEqual([]);
        expect(parsed.a).toEqual(c);
        expect(parsed.b).toEqual(c);
        expect(hashOf(parsed.a)).toBe(hashOf(c));
      }),
      { numRuns: 40 },
    );
  });

  const junk = fc.oneof(
    fc.string(),
    fc.string({ unit: "binary" }),
    fc.constantFrom(
      "<script>alert(1)</script>",
      "'; DROP TABLE x; --",
      "1e309",
      "-1",
      "NaN",
      "Infinity",
      "99999999999999999999",
      "x1:f1|1:f1|1:f1|1:f1|1:f1",
      "l0,0,0,0",
      "u9-1",
      "%",
      "__proto__",
      "constructor",
    ),
  );
  const key = fc.oneof(
    fc.constantFrom(
      ...KEYS.map((k) => `a.${k}`),
      ...KEYS.map((k) => `b.${k}`),
      "v",
      "h",
      "hb",
      "a.p",
      "b.p",
      "__proto__",
      "a.__proto__",
    ),
    fc.string(),
  );

  it("fuzzed links never throw, and always decode to a valid config", () => {
    fc.assert(
      fc.property(fc.array(fc.tuple(key, junk), { maxLength: 12 }), (pairs) => {
        const query = pairs
          .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
          .join("&");
        const parsed = parseLink(query);
        for (const c of [parsed.a, ...(parsed.b ? [parsed.b] : [])]) {
          // Valid: clamping again changes nothing, and it builds.
          const again: string[] = [];
          expect(clampConfig(c, again)).toEqual(c);
          expect(again).toEqual([]);
          expect(() => buildConfig(c)).not.toThrow();
        }
      }),
      { numRuns: 300 },
    );
  });

  it("notices name what was dropped", () => {
    const parsed = parseLink(
      "v=1&a.bs=17&a.zz=1&a.m=gpt-9&a.n=999999&h=nothex",
    );
    const text = parsed.notices.join(" ");
    expect(text).toContain("block size");
    expect(text).toContain("a.zz");
    expect(text).toContain("model");
    expect(text).toContain("requests");
    expect(text).toContain("run hash");
    expect(parsed.a.bs).toBe(V1_DEFAULTS.bs);
    expect(parsed.a.n).toBe(LIMITS.n.max);
    expect(parseLink("v=2&a.n=5").notices[0]).toContain("v=2");
  });
});

describe("the parameter table matches SIM.md §12.1", () => {
  const doc = readFileSync("docs/SIM.md", "utf8");
  const table = doc.slice(
    doc.indexOf("### 12.1 Limits"),
    doc.indexOf("**Rules across fields:**"),
  );
  const rows = table
    .split("\n")
    .filter((l) => /^\| [^-|]/.test(l) && l.includes("`"))
    .map((l) => l.split("|").map((c) => c.trim()))
    .map((c) => ({
      key: (c[2] ?? "").replaceAll("`", ""),
      range: c[3] ?? "",
      def: c[4] ?? "",
    }));
  const nums = (text: string) =>
    [...text.replaceAll(",", "").matchAll(/\d+(\.\d+)?/g)].map((m) =>
      Number(m[0]),
    );

  it("has exactly the code's keys, in order", () => {
    expect(rows.map((r) => r.key)).toEqual([...KEYS]);
  });

  it("states the code's defaults", () => {
    for (const r of rows) {
      const param = PARAMS[r.key as keyof typeof PARAMS];
      const code = param.encode(
        V1_DEFAULTS[r.key as keyof typeof PARAMS] as never,
      );
      // A leading number, else the first `code` span.
      const first =
        /^[\d,.]+/.exec(r.def)?.[0].replaceAll(",", "") ??
        /`([^`]+)`/.exec(r.def)?.[1];
      expect(first, r.key).toBe(code);
    }
  });

  it("states the code's ranges", () => {
    const at = (key: string) => rows.find((r) => r.key === key)?.range ?? "";
    expect(nums(at("s"))).toEqual([LIMITS.s.min, LIMITS.s.max]);
    expect(nums(at("n"))).toEqual([LIMITS.n.min, LIMITS.n.max]);
    expect(nums(at("r"))).toEqual([LIMITS.r.min, LIMITS.r.max]);
    expect(at("r")).toContain("`burst`");
    expect(nums(at("pl"))).toEqual([LIMITS.mixtureParts, LIMITS.length.min]);
    expect(nums(at("sp"))).toEqual([
      LIMITS.spGroups.min,
      LIMITS.spGroups.max,
      0,
      1,
      0,
      1,
    ]);
    expect(nums(at("m"))).toEqual([MODEL_SLUGS.length]);
    expect(nums(at("g"))).toEqual([GPU_IDS.length]);
    expect(nums(at("gf"))).toEqual([LIMITS.gf.min, LIMITS.gf.max]);
    expect(nums(at("cap"))).toEqual([LIMITS.cap.min, LIMITS.cap.max]);
    expect(nums(at("bs"))).toEqual([...BLOCK_SIZES]);
    expect(nums(at("ns"))).toEqual([LIMITS.ns.min, LIMITS.ns.max]);
    expect(nums(at("bt"))).toEqual([LIMITS.bt.min, LIMITS.bt.max]);
    expect(nums(at("ml"))).toEqual([LIMITS.ml.min, LIMITS.ml.max]);
    for (const [key, options] of [
      ["kd", ["bf16", "fp8"]],
      ["al", ["paged", "contiguous-max"]],
      ["sc", ["static", "continuous"]],
    ] as const)
      expect([...at(key).matchAll(/`([^`]+)`/g)].map((m) => m[1])).toEqual(
        options,
      );
  });
});
