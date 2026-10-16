import { useState } from "react";
import { createSim } from "../../sim/index.ts";
import { Figure } from "../../viz/ui/Figure.tsx";
import { ProvenanceBadge } from "../../viz/ui/ProvenanceBadge.tsx";
import { Select } from "../../viz/ui/Select.tsx";
import { useWidth } from "../../viz/useWidth.ts";
import { BLOCK_SIZES, cacheConfig, CHECK, SHARED } from "./presets.ts";

/** The most tokens any CacheHit reuses, on `shared-system-prompt` at block size B. */
export function sharedTokens(B: number, prefixLen = SHARED.prefixLen): number {
  const sim = createSim(
    cacheConfig("shared-system-prompt", { ...SHARED, prefixLen, blockSize: B }),
  );
  sim.run();
  let most = 0;
  for (const e of sim.events())
    if (e.type === "CacheHit") most = Math.max(most, e.tokens);
  return most;
}

let rows: { B: number; shared: number }[] | null = null;
export function partialRows() {
  rows ??= BLOCK_SIZES.map((B) => ({ B, shared: sharedTokens(B) }));
  return rows;
}

const ROW = 30;
const LABEL = 56;

/** Figure 4.4: the 600-token prefix at five block sizes. */
export function PartialBlocks() {
  const [ref, W] = useWidth<SVGSVGElement>(600);
  const [B, setB] = useState<number>(SHARED.blockSize);
  const L = SHARED.prefixLen;
  const data = partialRows();
  const x = (t: number) => LABEL + (t / L) * (W - LABEL - 8);
  const H = data.length * ROW + 8;
  const pick = data.find((d) => d.B === B);
  return (
    <Figure
      number="4.4"
      caption={`The ${String(L)}-token system prompt at five block sizes. Only full blocks are reused.`}
    >
      <div className="cache">
        <div className="paged__controls">
          <Select
            label="Highlight a block size"
            value={String(B)}
            options={BLOCK_SIZES.map((b) => ({
              value: String(b),
              label: `${String(b)} tokens`,
            }))}
            onChange={(v) => {
              setB(Number(v));
            }}
          />
        </div>
        <svg
          ref={ref}
          className="cache__svg"
          viewBox={`0 0 ${String(W)} ${String(H)}`}
          height={H}
          role="img"
          aria-label={data
            .map(
              (d) =>
                `Block size ${String(d.B)}: ${String(d.shared)} tokens reused, ${String(L - d.shared)} recomputed`,
            )
            .join("; ")}
        >
          {data.map((d, i) => {
            const y = i * ROW + 4;
            const full = Math.floor(d.shared / d.B);
            return (
              <g key={d.B} className="pb__row" data-active={d.B === B}>
                <rect
                  className="pb__band"
                  x={0}
                  y={y - 3}
                  width={W}
                  height={ROW - 2}
                />
                <text className="chart__tick" x={4} y={y + 15}>
                  B {d.B}
                </text>
                {Array.from({ length: full }, (_, k) => (
                  <rect
                    key={k}
                    className="pb__full"
                    x={x(k * d.B)}
                    y={y}
                    width={Math.max(1, x((k + 1) * d.B) - x(k * d.B) - 1)}
                    height={20}
                  />
                ))}
                {d.shared < L && (
                  <rect
                    className="pb__partial"
                    x={x(d.shared)}
                    y={y}
                    width={x(L) - x(d.shared)}
                    height={20}
                  />
                )}
              </g>
            );
          })}
        </svg>
        <ul className="paged__legend">
          <li>
            <span
              className="legend-swatch pb-swatch--full"
              aria-hidden="true"
            />
            A full block: reused on a hit
          </li>
          <li>
            <span
              className="legend-swatch pb-swatch--partial"
              aria-hidden="true"
            />
            The last, partial block: every request computes it
          </li>
        </ul>
        <p className="cache__counter num" aria-live="polite">
          At block size {B}, a hit reuses {pick?.shared ?? 0} of {L} tokens, and
          each request computes the last {L - (pick?.shared ?? 0)} itself.{" "}
          <ProvenanceBadge kind="simulated" />
        </p>
      </div>
    </Figure>
  );
}

/** CheckYourself's control: a 100-token prefix at the block size picked. */
export function CheckTry() {
  const [B, setB] = useState<number>(CHECK.blockSize);
  const shared = sharedTokens(B, CHECK.prefixLen);
  return (
    <div className="try">
      <Select
        label="Try it: block size"
        value={String(B)}
        options={BLOCK_SIZES.map((b) => ({
          value: String(b),
          label: `${String(b)} tokens`,
        }))}
        onChange={(v) => {
          setB(Number(v));
        }}
      />
      <p className="num" aria-live="polite">
        A {CHECK.prefixLen}-token prefix: each hit reuses {shared} tokens; the
        other {CHECK.prefixLen - shared} are computed again.{" "}
        <ProvenanceBadge kind="simulated" />
      </p>
    </div>
  );
}
