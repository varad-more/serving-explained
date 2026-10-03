/**
 * Frames for the TokenGrid figure (steps 1–2), built from the engine's event
 * log for the TOKEN_GRID run, so the figure shows what the engine did.
 */
import { createSim, type SimEvent } from "../../sim/index.ts";
import { TOKEN_GRID } from "./presets.ts";

export interface GridFrame {
  step: number;
  /** Positions whose keys and values this step computes, with a cache: [start, end). */
  start: number;
  end: number;
  /** The position of the token sampled at the end of this step. */
  sampled: number;
  /** Positions computed this step without a cache: every token so far. */
  noCache: number;
  /** Running totals, with and without a cache. */
  totalCache: number;
  totalNoCache: number;
}

export function gridFrames(
  events: readonly SimEvent[],
  promptLen: number,
): GridFrame[] {
  const frames: GridFrame[] = [];
  let held = 0;
  let sampled = -1;
  let totalCache = 0;
  let totalNoCache = 0;
  for (const e of events) {
    if (e.type === "DecodeToken") sampled = promptLen + e.index;
    if (e.type !== "StepEnd") continue;
    const start = held;
    held += e.tokens;
    totalCache += e.tokens;
    totalNoCache += held;
    frames.push({
      step: e.step,
      start,
      end: held,
      sampled,
      noCache: held,
      totalCache,
      totalNoCache,
    });
  }
  return frames;
}

/** The figure's frames: one per engine step of the TOKEN_GRID run. */
export const FRAMES: readonly GridFrame[] = (() => {
  const sim = createSim(TOKEN_GRID);
  sim.run();
  return gridFrames(sim.events(), TOKEN_GRID.requests[0]?.prompt.length ?? 0);
})();

export const PROMPT_LEN = TOKEN_GRID.requests[0]?.prompt.length ?? 0;
export const OUTPUT_LEN = TOKEN_GRID.requests[0]?.outputLen ?? 0;
export const LAYERS = TOKEN_GRID.model.layers;
