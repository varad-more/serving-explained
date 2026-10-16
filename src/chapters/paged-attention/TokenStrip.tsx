import { useId, useState, type CSSProperties, type KeyboardEvent } from "react";
import { Figure } from "../../viz/ui/Figure.tsx";
import { ProvenanceBadge } from "../../viz/ui/ProvenanceBadge.tsx";
import { RequestMark } from "../../viz/ui/RequestMark.tsx";
import { Slider } from "../../viz/ui/Slider.tsx";
import { useMediaQuery } from "../../viz/useMediaQuery.ts";
import type { Frame, Holder } from "./frames.ts";
import { CAPACITY, compareFrames, DEFAULTS, TABLE_FIGURE } from "./presets.ts";

const B = DEFAULTS.blockSize;
const CELL = 14;
const PITCH = CELL + 2;
const LABEL_W = 76;

let cached: { frame: Frame; holder: Holder } | null = null;
/** The step-4 moment: TABLE_FIGURE's request, from the default paged run. */
export function tableFigure() {
  if (!cached) {
    const frame = compareFrames("paged").find(
      (f) => f.step === TABLE_FIGURE.step,
    );
    const holder = frame?.holders.find((h) => h.req === TABLE_FIGURE.req);
    if (!frame || !holder) throw new Error("TABLE_FIGURE is not in the run");
    cached = { frame, holder };
  }
  return cached;
}

/**
 * Figure 2.3: one request's tokens, grouped into logical blocks, beside its
 * block table and physical memory. Moving through the tokens highlights the
 * logical block, its table row, and the physical block it maps to.
 */
export function TokenStrip() {
  const { frame, holder } = tableFigure();
  const [cursor, setCursor] = useState(0);
  // Tokens are 14 px: too small to tap (CHAPTER_DOD item 7). Below 1024 px a
  // slider moves the cursor instead, and tokens ignore taps.
  const desktop = useMediaQuery("(min-width: 1024px)");
  const tokensId = useId();
  const readoutId = useId();
  const n = holder.computed;
  const logical = Math.floor(cursor / B);
  const physical = holder.blocks[logical] ?? 0;
  const owner = new Map(
    frame.holders.flatMap((h) => h.blocks.map((b) => [b, h] as const)),
  );
  const cols = 16;
  const numBlocks = CAPACITY / B;
  const rows = holder.blocks.length;

  const move = (to: number) => {
    setCursor(Math.max(0, Math.min(n - 1, to)));
  };
  const onKey = (e: KeyboardEvent<SVGSVGElement>) => {
    const to: Record<string, number> = {
      ArrowLeft: cursor - 1,
      ArrowRight: cursor + 1,
      ArrowUp: cursor - B,
      ArrowDown: cursor + B,
      Home: 0,
      End: n - 1,
    };
    const next = to[e.key];
    if (next === undefined) return;
    move(next);
    e.preventDefault();
  };

  return (
    <Figure
      number="2.3"
      caption={`r${String(holder.req)} at ${frame.t.toFixed(2)} s: its tokens fill logical blocks in order, but the physical blocks are scattered.`}
    >
      <div
        className="strip"
        style={
          {
            "--strip": `var(--req-${String(holder.slot)})`,
            "--strip-label": `var(--req-${String(holder.slot)}-label)`,
          } as CSSProperties
        }
      >
        <p className="strip__who">
          <RequestMark
            slot={holder.slot}
            size={24}
            label={`r${String(holder.req)}`}
          />{" "}
          <span className="num">
            r{holder.req} holds {n} tokens in {holder.blocks.length} blocks of{" "}
            {B}.
          </span>{" "}
          <ProvenanceBadge kind="simulated" />
        </p>

        <div className="strip__panels">
          <div className="strip__panel">
            <p className="strip__title" id={tokensId}>
              Tokens, by logical block
            </p>
            <svg
              className="strip__tokens"
              viewBox={`0 0 ${String(LABEL_W + B * PITCH)} ${String(rows * (PITCH + 4))}`}
              width={LABEL_W + B * PITCH}
              tabIndex={0}
              role="group"
              aria-labelledby={tokensId}
              aria-describedby={readoutId}
              onKeyDown={onKey}
            >
              {holder.blocks.map((_, i) => (
                <g
                  key={i}
                  transform={`translate(0 ${String(i * (PITCH + 4))})`}
                >
                  <text className="strip__label" x={4} y={CELL - 2}>
                    logical {i}
                  </text>
                  {Array.from({ length: B }, (_, j) => {
                    const token = i * B + j;
                    const filled = token < n;
                    const tx = LABEL_W + j * PITCH;
                    return (
                      <g key={j}>
                        <rect
                          className={`strip__token${filled ? "" : " strip__token--empty"}${token === cursor ? " strip__token--cursor" : ""}${i === logical ? " strip__token--active" : ""}`}
                          x={tx}
                          y={0}
                          width={CELL}
                          height={CELL}
                          onPointerEnter={() => {
                            if (desktop && filled) move(token);
                          }}
                          onClick={() => {
                            if (desktop && filled) move(token);
                          }}
                        />
                        {token === cursor && (
                          <path
                            className="active-flag"
                            d={`M${String(tx)} 0h6l-6 6z`}
                          />
                        )}
                      </g>
                    );
                  })}
                </g>
              ))}
            </svg>
            <p className="strip__key">
              Keys: left and right arrows move one token, up and down one block,
              Home and End to the ends.
            </p>
            {!desktop && (
              <Slider
                label="Token"
                value={cursor}
                min={0}
                max={n - 1}
                onChange={move}
              />
            )}
          </div>

          <div className="strip__panel">
            <table className="strip__table num">
              <caption>Block table</caption>
              <thead>
                <tr>
                  <th scope="col">Logical</th>
                  <th scope="col">Physical</th>
                  <th scope="col">Filled</th>
                </tr>
              </thead>
              <tbody>
                {holder.blocks.map((b, i) => (
                  <tr
                    key={b}
                    className={i === logical ? "is-active" : undefined}
                  >
                    <td>{i}</td>
                    <td>{b}</td>
                    <td>
                      {Math.min(B, Math.max(0, n - i * B))} of {B}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="strip__panel">
            <p className="strip__title">Physical blocks 0–{numBlocks - 1}</p>
            <svg
              className="strip__memory"
              viewBox={`0 0 ${String(cols * 18)} ${String(Math.ceil(numBlocks / cols) * 18)}`}
              role="img"
              aria-label={`Physical memory: r${String(holder.req)} holds blocks ${holder.blocks.join(", ")}; logical block ${String(logical)} is physical block ${String(physical)}.`}
            >
              {Array.from({ length: numBlocks }, (_, b) => {
                const h = owner.get(b);
                const mine = h?.req === holder.req;
                const i = mine ? holder.blocks.indexOf(b) : -1;
                return (
                  <g
                    key={b}
                    transform={`translate(${String((b % cols) * 18)} ${String(Math.floor(b / cols) * 18)})`}
                  >
                    <rect
                      className={`strip__block${h ? (mine ? " strip__block--mine" : " strip__block--other") : ""}${mine && i === logical ? " strip__block--active" : ""}`}
                      width={16}
                      height={16}
                    />
                    {mine && (
                      <text
                        className="strip__index"
                        x={8}
                        y={12}
                        textAnchor="middle"
                      >
                        {i}
                      </text>
                    )}
                    {mine && i === logical && (
                      <path className="active-flag" d="M0 0h6l-6 6z" />
                    )}
                  </g>
                );
              })}
            </svg>
            <p className="strip__key">
              Numbered: r{holder.req}&apos;s blocks, by logical index. Gray:
              other requests&apos; blocks.
            </p>
          </div>
        </div>

        <p className="strip__readout num" id={readoutId} aria-live="polite">
          Token {cursor}: logical block {logical} → physical block {physical},
          position {cursor % B} of 0–{B - 1}.
        </p>
      </div>
    </Figure>
  );
}
