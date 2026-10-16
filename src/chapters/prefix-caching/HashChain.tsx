import { useMemo, useState } from "react";
import { blockKeys } from "../../sim/index.ts";
import { Figure } from "../../viz/ui/Figure.tsx";
import { ProvenanceBadge } from "../../viz/ui/ProvenanceBadge.tsx";
import { Slider } from "../../viz/ui/Slider.tsx";
import { Toggle } from "../../viz/ui/Toggle.tsx";
import { hex6 } from "./cells.ts";
import { cacheConfig, SHARED, sharers } from "./presets.ts";

let prompt: number[] | null = null;
/** The preset's shared system prompt: its tokens, as the engine sees them. */
export function sharedPrompt(): number[] {
  if (!prompt) {
    const config = cacheConfig("shared-system-prompt", SHARED);
    const [group] = [...sharers(config.requests, SHARED.prefixLen).values()];
    prompt = group?.[0]?.prompt.slice(0, SHARED.prefixLen) ?? [];
  }
  return prompt;
}

/**
 * Figure 4.2: the shared prompt as a chain of blocks. Each block's key comes
 * from the engine's own blockKeys, so changing one token changes that
 * block's key and every key after it.
 */
export function HashChain() {
  const tokens = sharedPrompt();
  const B = SHARED.blockSize;
  const [position, setPosition] = useState(Math.floor(tokens.length / 2));
  const [changed, setChanged] = useState(false);
  const before = useMemo(() => blockKeys(tokens, B), [tokens, B]);
  const after = useMemo(() => {
    if (!changed) return before;
    const edited = tokens.map((t, i) => (i === position ? t + 1 : t));
    return blockKeys(edited, B);
  }, [tokens, B, before, changed, position]);
  const blocks = Math.ceil(tokens.length / B);
  const first = Math.floor(position / B);
  const moved = after.filter((k, i) => k !== before[i]).length;
  return (
    <Figure
      number="4.2"
      caption={`The ${tokens.length.toLocaleString("en-US")}-token system prompt in blocks of ${String(B)}. Keys are shown as 6 hex digits.`}
    >
      <div className="cache">
        <div className="paged__controls">
          <Slider
            label="Token to change"
            value={position}
            min={0}
            max={tokens.length - 1}
            format={(v) =>
              `token ${String(v)} (block ${String(Math.floor(v / B))})`
            }
            onChange={setPosition}
          />
          <Toggle label="Change it" checked={changed} onChange={setChanged} />
        </div>
        <p className="cache__counter num" aria-live="polite">
          {changed && first >= after.length
            ? `Token ${String(position)} is in the last block, which is not full and has no key: no key changes.`
            : changed
              ? `Changing token ${String(position)} changes the keys of blocks ${String(first)}–${String(after.length - 1)}: ${String(moved)} of ${String(after.length)}. Blocks before ${String(first)} keep theirs.`
              : `${String(after.length)} full blocks have keys; the last ${String(tokens.length - after.length * B)} tokens fill only part of a block, which has no key.`}{" "}
          <ProvenanceBadge kind="simulated" />
        </p>
        <ol className="chain" aria-label="Blocks of the system prompt">
          {Array.from({ length: blocks }, (_, b) => {
            const key = after[b];
            const parent = b === 0 ? null : after[b - 1];
            const isNew = changed && b >= first && key !== undefined;
            return (
              <li
                key={b}
                className="chain__block"
                data-changed={isNew}
                data-partial={key === undefined}
              >
                <span className="chain__name">
                  {b} · t{b * B}–{Math.min(tokens.length, (b + 1) * B) - 1}
                </span>
                <span className="chain__parent">
                  parent{" "}
                  {parent === null || parent === undefined
                    ? "none"
                    : hex6(parent)}
                </span>
                <span className="chain__key">
                  {key === undefined ? "not full: no key" : `key ${hex6(key)}`}
                </span>
              </li>
            );
          })}
        </ol>
      </div>
    </Figure>
  );
}
