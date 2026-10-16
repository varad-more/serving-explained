/**
 * Chapter 4's figures by key, and every number its prose quotes. The numbers
 * come from numbers.tsx at build time (`pnpm gen:figures`), so the page runs
 * no simulation to render its prose (AUDIT.md P1). A test fails if the JSON
 * is stale, so the prose cannot drift from the sim.
 */
import F from "../../data/figures-prefix-caching.json" with { type: "json" };
import { CacheFigure } from "./CacheFigure.tsx";
import { HashChain } from "./HashChain.tsx";
import { PartialBlocks } from "./PartialBlocks.tsx";
import { RepeatedPrefill } from "./RepeatedPrefill.tsx";
import "../paged-attention/paged-attention.css";
import "./prefix-caching.css";

export { F };

/** Keys keep each mode's own state: the board reuses one slot for every step. */
export const figures = {
  repeated: () => <RepeatedPrefill />,
  chain: () => <HashChain />,
  hit: () => <CacheFigure key="hit" mode="hit" />,
  partial: () => <PartialBlocks />,
  pressure: () => <CacheFigure key="pressure" mode="pressure" />,
  compare: () => <CacheFigure key="compare" mode="compare" />,
};
