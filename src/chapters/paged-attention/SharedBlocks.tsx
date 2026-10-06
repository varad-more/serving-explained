import { Figure } from "../../viz/ui/Figure.tsx";
import { PlaybackBar } from "../../viz/ui/PlaybackBar.tsx";
import { ProvenanceBadge } from "../../viz/ui/ProvenanceBadge.tsx";
import { RequestMark } from "../../viz/ui/RequestMark.tsx";
import { usePlayhead } from "../../viz/usePlayhead.ts";
import { simulate } from "./frames.ts";
import { SHARED_BLOCKS } from "./presets.ts";

const FRAMES = simulate(SHARED_BLOCKS);
const B = SHARED_BLOCKS.kv.blockSize;
const N = SHARED_BLOCKS.kv.numBlocks;
/** Steps per second at 1×. */
const RATE = 1;

/**
 * Figure 2.6: two requests that share an 8-token prefix, at block size 4 with
 * prefix caching on. Both block tables point at the prefix's two physical
 * blocks, each with reference count 2. Chapter 4 explains how.
 */
export function SharedBlocks() {
  const last = FRAMES.length - 1;
  const ph = usePlayhead(last, RATE);
  const frame = FRAMES[Math.min(last, Math.floor(ph.time))];
  if (!frame) return null;
  const refs = new Map<number, number[]>();
  for (const h of frame.holders)
    for (const b of h.blocks) refs.set(b, [...(refs.get(b) ?? []), h.req]);
  const shared = [...refs].filter(([, rs]) => rs.length > 1).map(([b]) => b);
  const sharers = refs.get(shared[0] ?? -1) ?? [];

  return (
    <Figure
      number="2.6"
      caption="Two requests share a prompt prefix: both tables point at the same physical blocks."
    >
      <div className="shared">
        <div className="shared__tables">
          {frame.holders.map((h) => (
            <p key={h.req} className="shared__row num">
              <RequestMark
                slot={h.slot}
                size={24}
                label={`r${String(h.req)}`}
              />{" "}
              <span>
                r{h.req}&apos;s table: blocks {h.blocks.join(", ")}
              </span>
            </p>
          ))}
          {frame.holders.length === 0 && <p>Both requests have finished.</p>}
        </div>

        <svg
          className="shared__memory"
          viewBox={`0 0 ${String(N * 40)} 44`}
          role="img"
          aria-label={`Physical blocks 0 to ${String(N - 1)}, ${String(B)} tokens each. ${shared.length > 0 ? `Blocks ${shared.join(" and ")} are shared, ref count 2.` : "No block is shared."}`}
        >
          {Array.from({ length: N }, (_, b) => {
            const owners = refs.get(b) ?? [];
            const kind =
              owners.length > 1
                ? "shared"
                : owners.length === 1
                  ? "held"
                  : "free";
            return (
              <g key={b} transform={`translate(${String(b * 40)} 2)`}>
                <rect
                  className={`shared__block shared__block--${kind}`}
                  x={1}
                  y={1}
                  width={36}
                  height={36}
                />
                {kind === "shared" && (
                  <rect
                    className="shared__inner"
                    x={5}
                    y={5}
                    width={28}
                    height={28}
                  />
                )}
                <text
                  className="shared__id"
                  x={19}
                  y={kind === "shared" ? 17 : 24}
                  textAnchor="middle"
                >
                  {b}
                </text>
                {kind === "shared" && (
                  <text
                    className="shared__count"
                    x={19}
                    y={30}
                    textAnchor="middle"
                  >
                    ×{owners.length}
                  </text>
                )}
                {kind === "held" && (
                  <text
                    className="shared__owner"
                    x={19}
                    y={12}
                    textAnchor="middle"
                  >
                    r{owners[0]}
                  </text>
                )}
              </g>
            );
          })}
        </svg>

        <p
          className="shared__readout num"
          aria-live={ph.playing ? "off" : "polite"}
        >
          {shared.length > 0
            ? `Blocks ${shared.join(" and ")}: ref count ${String(sharers.length)}, shared by ${sharers.map((r) => `r${String(r)}`).join(" and ")}.`
            : `Step ${String(frame.step + 1)}: no block is shared.`}{" "}
          <ProvenanceBadge kind="simulated" />
        </p>

        <PlaybackBar
          time={ph.time}
          duration={last}
          playing={ph.playing}
          speed={ph.speed}
          scrubStep={1}
          formatTime={(t, d) =>
            `Step ${String(Math.floor(t) + 1)} of ${String(d + 1)}`
          }
          onPlay={ph.play}
          onPause={() => {
            ph.setPlaying(false);
          }}
          onStep={() => {
            ph.setPlaying(false);
            ph.setTime((t) => Math.min(last, Math.floor(t) + 1));
          }}
          onSeek={(t) => {
            ph.setPlaying(false);
            ph.setTime(t);
          }}
          onSpeed={ph.setSpeed}
        />
      </div>
    </Figure>
  );
}
