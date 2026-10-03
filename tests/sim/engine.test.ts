import { describe, expect, it } from "vitest";
import {
  ConfigError,
  createSim,
  ENGINE_VERSION,
} from "../../src/sim/engine.ts";
import { hashEvents } from "../../src/sim/hash.ts";
import { PRESETS } from "../../src/sim/workload.ts";
import type { PresetName, SimConfig } from "../../src/sim/types.ts";
import { blocksFromGpu, modelCost, presetConfig } from "../../src/simConfig.ts";
import { loadData, req, toyConfig } from "./helpers.ts";

const code = (config: SimConfig) => {
  try {
    createSim(config);
  } catch (e) {
    if (e instanceof ConfigError) return e.code;
    throw e;
  }
  return "ok";
};

describe("createSim validates the config (§2.1)", () => {
  it("names each problem with a code", () => {
    expect(
      code(
        toyConfig({ kv: { allocator: "contiguous-max", prefixCaching: true } }),
      ),
    ).toBe("caching-needs-paged");
    expect(
      code(
        toyConfig({ scheduler: { maxModelLen: 8 }, requests: [req(0, 6, 3)] }),
      ),
    ).toBe("request-too-long");
    expect(
      code(toyConfig({ kv: { numBlocks: 2 }, scheduler: { maxModelLen: 9 } })),
    ).toBe("kv-smaller-than-max-model-len");
    expect(
      code(
        toyConfig({
          scheduler: {
            chunkedPrefill: false,
            maxNumBatchedTokens: 32,
            maxModelLen: 64,
          },
        }),
      ),
    ).toBe("budget-below-max-model-len");
    expect(code(toyConfig({ requests: [req(0, 4, 1), req(0, 4, 1)] }))).toBe(
      "bad-requests",
    );
    expect(code(toyConfig({ requests: [req(0, 4, 1, -1)] }))).toBe(
      "bad-requests",
    );
    expect(code(toyConfig({ requests: [req(0, 4, 0)] }))).toBe("bad-requests");
    expect(code(toyConfig({ requests: [req(0, 6, 3)] }))).toBe("ok");
  });

  it("refuses structurally invalid engine settings", () => {
    expect(() => createSim(toyConfig({ kv: { blockSize: 0 } }))).toThrow(
      RangeError,
    );
  });

  it("has a version", () => {
    expect(ENGINE_VERSION).toBe(1);
  });
});

describe("the Sim object (§2)", () => {
  const config = toyConfig({ requests: [req(0, 4, 3), req(1, 4, 2, 5)] });

  it("run stops at `until`, at maxSteps, or when done", () => {
    const sim = createSim(config);
    expect(sim.run((i) => i.step === 1)).toMatchObject({
      step: 1,
      done: false,
    });
    expect(sim.run(undefined, 1)).toMatchObject({ step: 2 });
    const last = sim.run();
    expect(last.done).toBe(true);
    expect(() => sim.step()).toThrow();
    expect(sim.run()).toBe(last);
  });

  it("jumps an idle clock to the next arrival", () => {
    const sim = createSim(config);
    sim.run();
    const arrive = sim.events().find((e) => e.type === "Arrive" && e.req === 1);
    expect(arrive).toMatchObject({ t: 5 });
    const admit = sim.events().find((e) => e.type === "Admit" && e.req === 1);
    expect(admit?.t).toBe(5);
  });

  it("snapshots only arrived requests, as plain data", () => {
    const sim = createSim(config);
    sim.step();
    const snap = sim.snapshot();
    expect(snap.requests.map((r) => r.id)).toEqual([0]);
    expect(snap.running).toEqual([0]);
    expect(structuredClone(snap)).toEqual(snap);
  });

  it("is deterministic: the same config gives the same log hash", () => {
    const a = createSim(config);
    const b = createSim(config);
    a.run();
    b.run();
    expect(hashEvents(a.events())).toBe(hashEvents(b.events()));
  });
});

describe("every preset runs to the end, under both policies, invariants on, with no Reject", () => {
  const data = loadData();
  for (const name of Object.keys(PRESETS) as PresetName[]) {
    for (const policy of ["continuous", "static"] as const) {
      it(`${name}, ${policy}`, () => {
        const config = presetConfig(name, data, { policy });
        const sim = createSim({ ...config, checkInvariants: true });
        const end = sim.run();
        expect(end.done).toBe(true);
        const events = sim.events();
        expect(events.some((e) => e.type === "Reject")).toBe(false);
        const decoded = events.filter((e) => e.type === "DecodeToken").length;
        expect(decoded).toBe(
          config.requests.reduce((s, r) => s + r.outputLen, 0),
        );
      });
    }
  }
});

describe("generic presets take their KV pool from GPU memory (Q6)", () => {
  it("Llama-3.1-8B on an A10G at 0.92 gets 2,940 blocks of 16", () => {
    const data = loadData();
    const m = data.models.find((x) => x.slug === "llama-3.1-8b")!;
    const g = data.gpus.find((x) => x.id === "a10g-24")!;
    expect(blocksFromGpu(g, modelCost(m), 16)).toBe(2940);
    expect(presetConfig("chatbot", data).kv.numBlocks).toBe(2940);
    expect(presetConfig("paged-vs-contiguous", data).kv.numBlocks).toBe(80);
  });
});
