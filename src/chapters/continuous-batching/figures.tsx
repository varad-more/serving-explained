/**
 * Chapter 3's figures by key, and every number its prose quotes. The numbers
 * come from numbers.tsx at build time (`pnpm gen:figures`), so the page runs
 * no simulation to render its prose (AUDIT.md P1). A test fails if the JSON
 * is stale, so the prose cannot drift from the sim or the data.
 */
import F from "../../data/figures-continuous-batching.json" with { type: "json" };
import { BudgetSweep } from "./BudgetSweep.tsx";
import { PhaseBars } from "./PhaseBars.tsx";
import { RequestTimeline } from "./RequestTimeline.tsx";
import "./continuous-batching.css";

export { F };

/** Keys keep each mode's own state: the board reuses one slot for every step. */
export const figures = {
  phases: () => <PhaseBars />,
  static: () => <RequestTimeline key="static" mode="static" />,
  compare: () => <RequestTimeline key="policy" mode="policy" />,
  preemption: () => <RequestTimeline key="preemption" mode="preemption" />,
  stall: () => <RequestTimeline key="stall" mode="stall" />,
  chunking: () => <RequestTimeline key="chunking" mode="chunking" />,
  sweep: () => <BudgetSweep />,
};
