import { useEffect, useState } from "react";
import { Figure } from "../../viz/ui/Figure.tsx";
import { PlaybackBar } from "../../viz/ui/PlaybackBar.tsx";
import { ProvenanceBadge } from "../../viz/ui/ProvenanceBadge.tsx";
import {
  FRAMES,
  LAYERS,
  OUTPUT_LEN,
  PROMPT_LEN,
  type GridFrame,
} from "./gridFrames.ts";

/** At 1×, the six steps play in five seconds. */
const STEPS_PER_SECOND = 1.2;
const COLS = PROMPT_LEN + OUTPUT_LEN;
const CELL_W = 24;
const CELL_H = 5;
const GAP_X = 4;
const GAP_Y = 1;
const LEFT = 8;
const TOP = 26;
const WIDTH = LEFT + COLS * (CELL_W + GAP_X);
const GRID_H = LAYERS * (CELL_H + GAP_Y);
const HEIGHT = TOP + GRID_H + 24;

type Mode = "no-cache" | "cache";
type CellState = "computed" | "stored" | "sampled" | "future";

function stateOf(col: number, f: GridFrame, mode: Mode): CellState {
  if (col === f.sampled) return "sampled";
  if (mode === "no-cache") return col < f.end ? "computed" : "future";
  if (col >= f.start && col < f.end) return "computed";
  return col < f.start ? "stored" : "future";
}

const LEGEND: Record<CellState, string> = {
  computed: "keys and values computed this step",
  stored: "stored in the cache, read this step",
  sampled: "token just sampled: no keys and values yet",
  future: "not generated yet",
};

/**
 * Figures 1.1 and 1.2: one request's tokens across Llama-3.1-8B's 32 layers,
 * step by step, from the engine's event log. Without a cache every step
 * lights every column so far; with one, each step lights one new column.
 */
export function TokenGrid({ mode }: { mode: Mode }) {
  const [time, setTime] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const last = FRAMES.length - 1;
  const frame = FRAMES[Math.min(last, Math.floor(time))] ?? FRAMES[0];

  useEffect(() => {
    if (!playing) return;
    let before = performance.now();
    let id = requestAnimationFrame(function tick(now) {
      const dt = ((now - before) / 1000) * STEPS_PER_SECOND * speed;
      before = now;
      setTime((t) => Math.min(last, t + dt));
      id = requestAnimationFrame(tick);
    });
    return () => {
      cancelAnimationFrame(id);
    };
  }, [playing, speed, last]);

  useEffect(() => {
    if (time >= last) setPlaying(false);
  }, [time, last]);

  if (!frame) return null;
  const thisStep = mode === "cache" ? frame.end - frame.start : frame.noCache;
  const total = mode === "cache" ? frame.totalCache : frame.totalNoCache;
  const states = Array.from({ length: COLS }, (_, col) =>
    stateOf(col, frame, mode),
  );
  const positions = thisStep === 1 ? "position" : "positions";
  const summary = `Step ${String(frame.step + 1)} of ${String(FRAMES.length)}: ${String(thisStep)} ${positions} computed this step, ${String(total)} so far.`;

  return (
    <Figure
      number={mode === "cache" ? "1.2" : "1.1"}
      caption={
        mode === "cache"
          ? "With a KV cache: each step computes one new column and stores it."
          : "Without a cache: each step reruns the model over every token so far."
      }
    >
      <div className="token-grid" data-mode={mode}>
        <svg
          className="token-grid__svg"
          viewBox={`0 0 ${String(WIDTH)} ${String(HEIGHT)}`}
          role="img"
          aria-label={`${summary} Columns are token positions; rows are the model's ${String(LAYERS)} layers.`}
        >
          <text className="token-grid__band" x={LEFT} y={12}>
            prompt
          </text>
          <text
            className="token-grid__band"
            x={LEFT + PROMPT_LEN * (CELL_W + GAP_X)}
            y={12}
          >
            outputs
          </text>
          <line
            className="token-grid__rule"
            x1={LEFT}
            x2={LEFT + PROMPT_LEN * (CELL_W + GAP_X) - GAP_X}
            y1={18}
            y2={18}
          />
          <line
            className="token-grid__rule"
            x1={LEFT + PROMPT_LEN * (CELL_W + GAP_X)}
            x2={WIDTH - GAP_X}
            y1={18}
            y2={18}
          />
          {states.map((state, col) =>
            Array.from({ length: LAYERS }, (_, row) => (
              <rect
                key={`${String(col)}-${String(row)}`}
                className={`token-grid__cell token-grid__cell--${state}`}
                x={LEFT + col * (CELL_W + GAP_X)}
                y={TOP + row * (CELL_H + GAP_Y)}
                width={CELL_W}
                height={CELL_H}
              />
            )),
          )}
          {states.map((_, col) => (
            <text
              key={col}
              className="token-grid__tick"
              x={LEFT + col * (CELL_W + GAP_X) + CELL_W / 2}
              y={TOP + GRID_H + 16}
              textAnchor="middle"
            >
              {col + 1}
            </text>
          ))}
        </svg>
        {/* Each count ends its line, so a new digit moves nothing. */}
        <div
          className="token-grid__readout num"
          aria-live={playing ? "off" : "polite"}
        >
          <p>
            Step {frame.step + 1} of {FRAMES.length}{" "}
            <ProvenanceBadge kind="simulated" />
          </p>
          <p>
            Positions computed this step: <strong>{thisStep}</strong>
          </p>
          <p>
            Positions computed so far: <strong>{total}</strong>
          </p>
        </div>
        <ul className="token-grid__legend">
          {(Object.keys(LEGEND) as CellState[])
            .filter((s) => mode === "cache" || s !== "stored")
            .map((s) => (
              <li key={s}>
                <svg width="16" height="12" aria-hidden="true">
                  <rect
                    className={`token-grid__cell token-grid__cell--${s}`}
                    x="1"
                    y="1"
                    width="14"
                    height="10"
                  />
                </svg>
                {LEGEND[s]}
              </li>
            ))}
        </ul>
        <PlaybackBar
          time={time}
          duration={last}
          playing={playing}
          speed={speed}
          scrubStep={1}
          formatTime={(t, d) =>
            `Step ${String(Math.floor(t) + 1)} of ${String(d + 1)}`
          }
          onPlay={() => {
            if (time >= last) setTime(0);
            setPlaying(true);
          }}
          onPause={() => {
            setPlaying(false);
          }}
          onStep={() => {
            setPlaying(false);
            setTime((t) => Math.min(last, Math.floor(t) + 1));
          }}
          onSeek={(t) => {
            setPlaying(false);
            setTime(t);
          }}
          onSpeed={setSpeed}
        />
      </div>
    </Figure>
  );
}
