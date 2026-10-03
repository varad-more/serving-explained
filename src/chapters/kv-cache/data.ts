/** The generated data chapter 1 reads (src/data, from llmsize; `computed`). */
import gpus from "../../data/gpus.json" with { type: "json" };
import models from "../../data/models.json" with { type: "json" };

export type ModelEntry = (typeof models.models)[number];
export type GpuEntry = (typeof gpus.gpus)[number];

export const MODELS: readonly ModelEntry[] = models.models;
export const GPUS: readonly GpuEntry[] = gpus.gpus;
/** The MHA model and the GQA model nearest its size (gen-data picks them). */
export const CONTRAST = models.contrast;

export function model(slugOrId: string): ModelEntry {
  const m = MODELS.find((x) => x.slug === slugOrId || x.id === slugOrId);
  if (!m) throw new RangeError(`unknown model ${slugOrId}`);
  return m;
}

export function gpu(id: string): GpuEntry {
  const g = GPUS.find((x) => x.id === id);
  if (!g) throw new RangeError(`unknown GPU ${id}`);
  return g;
}
