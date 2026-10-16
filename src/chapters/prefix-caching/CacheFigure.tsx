import { memo, useCallback, useDeferredValue, useMemo, useState } from "react";
import { Figure } from "../../viz/ui/Figure.tsx";
import { PlaybackBar } from "../../viz/ui/PlaybackBar.tsx";
import { ProvenanceBadge } from "../../viz/ui/ProvenanceBadge.tsx";
import { Select } from "../../viz/ui/Select.tsx";
import { Slider } from "../../viz/ui/Slider.tsx";
import { Toggle } from "../../viz/ui/Toggle.tsx";
import { useMediaQuery } from "../../viz/useMediaQuery.ts";
import { usePlayhead } from "../../viz/usePlayhead.ts";
import { BlockGrid } from "../paged-attention/BlockGrid.tsx";
import type { GridSpec } from "../paged-attention/cells.ts";
import {
  frameAt,
  lookupAt,
  simulateCache,
  type CacheFrame,
  type CacheRun,
} from "./cacheFrames.ts";
import { cacheCells, hex6 } from "./cells.ts";
import {
  BLOCK_SIZES,
  CAPACITIES,
  cacheConfig,
  PREFIX_STOPS,
  PRESSURE,
  SHARED,
  type CacheOptions,
  type PresetKey,
} from "./presets.ts";

/**
 * - hit: `shared-system-prompt`, one run, caching on (step 3)
 * - pressure: `cache-pressure`, one run (step 5)
 * - compare: caching off vs. on, in lockstep (steps 6–7)
 */
export type Mode = "hit" | "pressure" | "compare";

const PRESET: Record<Mode, PresetKey> = {
  hit: "shared-system-prompt",
  pressure: "cache-pressure",
  compare: "shared-system-prompt",
};
const START: Record<Mode, CacheOptions> = {
  hit: SHARED,
  pressure: PRESSURE,
  compare: SHARED,
};
const CAPTION: Record<Mode, { number: string; caption: string }> = {
  hit: {
    number: "4.3",
    caption:
      "At its starting settings: requests that share one system prompt, with prefix caching on. Shared blocks show how many tables point at them.",
  },
  pressure: {
    number: "4.5",
    caption: `At its starting settings: ${String(PRESSURE.groups)} system prompts compete for a small pool. Cached blocks show their place in the eviction order.`,
  },
  compare: {
    number: "4.6",
    caption: "The same requests with prefix caching off and on, in lockstep.",
  },
};

const cache = new Map<string, CacheRun>();
/** A preset run under the grid's settings, cached; the oldest goes past 16. */
export function cacheRun(preset: PresetKey, o: CacheOptions): CacheRun {
  const key = JSON.stringify([preset, o]);
  let run = cache.get(key);
  if (!run) {
    run = simulateCache(cacheConfig(preset, o));
    cache.set(key, run);
    if (cache.size > 16) cache.delete(cache.keys().next().value ?? "");
  }
  return run;
}

const n = (x: number) => x.toLocaleString("en-US");
const pct = (x: number) => `${(100 * x).toFixed(0)}%`;
const secs = (x: number) => `${x.toFixed(2)} s`;

/**
 * Figures 4.3, 4.5, and 4.6: chapter 2's block grid with prefix-cache
 * states (DESIGN.md). Every control re-runs both sims from the same seed and
 * keeps the playhead.
 */
export function CacheFigure({ mode }: { mode: Mode }) {
  const [options, setOptions] = useState<CacheOptions>(START[mode]);
  const [selected, setSelected] = useState<number | null>(null);
  // Controls answer at once; the sims re-run in a deferred render.
  const shown = useDeferredValue(options);
  const preset = PRESET[mode];
  const runs = useMemo(
    () => ({
      on: cacheRun(preset, { ...shown, caching: true }),
      off: cacheRun(preset, { ...shown, caching: false }),
    }),
    [preset, shown],
  );
  const visible =
    mode === "compare"
      ? [
          { name: "Caching off", run: runs.off },
          { name: "Caching on", run: runs.on },
        ]
      : [
          {
            name: shown.caching ? "Caching on" : "Caching off",
            run: shown.caching ? runs.on : runs.off,
          },
        ];
  const duration = Math.max(...visible.map((v) => v.run.duration));
  const ph = usePlayhead(duration);
  // The plan's sizes: at most 256 cells on desktop and 48 on mobile.
  const desktop = useMediaQuery("(min-width: 1024px)");
  const set = useCallback((patch: Partial<CacheOptions>) => {
    setOptions((o) => ({ ...o, ...patch }));
  }, []);
  const spec: GridSpec = {
    allocator: "paged",
    blockSize: shown.blockSize,
    capacity: shown.capacity,
    maxModelLen: runs.on.config.scheduler.maxModelLen,
  };
  const current = visible.map((v) => ({
    ...v,
    frame: frameAt(v.run.frames, ph.time),
  }));
  const holders = [
    ...new Set(
      current.flatMap(({ frame }) => frame?.holders.map((h) => h.req) ?? []),
    ),
  ].sort((a, b) => a - b);
  const nextEnd = () =>
    Math.min(
      duration,
      ...visible.map(
        (v) => v.run.frames.find((f) => f.t > ph.time + 1e-9)?.t ?? duration,
      ),
    );
  const lookup = lookupAt(runs.on, ph.time);
  const { number, caption } = CAPTION[mode];

  return (
    <Figure number={number} caption={caption}>
      <div className="cache" data-mode={mode}>
        <Controls
          mode={mode}
          options={options}
          set={set}
          blockCount={options.capacity / options.blockSize}
        />
        <p className="cache__ttft num" aria-live="polite">
          Mean TTFT over the whole run: caching on{" "}
          {secs(runs.on.m.summary.ttft.mean)}, off{" "}
          {secs(runs.off.m.summary.ttft.mean)}.{" "}
          <ProvenanceBadge kind="simulated" />
        </p>
        {current.map(({ name, run, frame }) => (
          <div
            key={name}
            className="paged__grid"
            role="group"
            aria-label={name}
          >
            <div className="paged__head">
              <h3 className="paged__name">{name}</h3>
              <Readout frame={frame} live={!ph.playing} />
            </div>
            <BlockGrid
              frame={null}
              spec={spec}
              label={name}
              selected={selected}
              onSelect={setSelected}
              cells={cacheCells(
                frame,
                run.config.kv.numBlocks,
                shown.blockSize,
              )}
              summary={summaryOf(name, frame, run.config.kv.numBlocks)}
              marked={new Set(frame?.evicted ?? [])}
              showLogical
              maxCells={desktop ? 256 : 48}
            />
          </div>
        ))}
        {(mode !== "compare" ? shown.caching : true) && (
          <p className="cache__lookup num" aria-live="polite">
            {lookup
              ? `Latest lookup with caching on: r${String(lookup.req)} at ${lookup.t.toFixed(2)} s hit ${String(lookup.hit.length)} ${lookup.hit.length === 1 ? "block" : "blocks"} (${n(lookup.hitTokens)} tokens), then took ${String(lookup.allocated.length)} new ${lookup.allocated.length === 1 ? "block" : "blocks"}.`
              : "No request has been admitted yet."}
          </p>
        )}
        <p className="cache__note">
          Readouts count up to the playhead. Hit rate counts each request&apos;s
          first admission. Tokens computed include recomputes after a
          preemption, and tokens reused include hits when a preempted request
          comes back.
        </p>
        <Legend />
        <p className="paged__keys">
          Keys: Tab to a grid, then arrows move the cell cursor, Home and End
          jump to the ends, and Enter selects the cell&apos;s request.
        </p>
        <PlaybackBar
          time={ph.time}
          duration={duration}
          playing={ph.playing}
          speed={ph.speed}
          formatTime={(t) => `${t.toFixed(2)} s`}
          onPlay={ph.play}
          onPause={() => {
            ph.setPlaying(false);
          }}
          onStep={() => {
            ph.setPlaying(false);
            ph.setTime(nextEnd());
          }}
          onSeek={(t) => {
            ph.setPlaying(false);
            ph.setTime(t);
          }}
          onSpeed={ph.setSpeed}
        />
        <div className="paged__select">
          <Select
            label="Show a request's chain"
            value={selected === null ? "" : String(selected)}
            options={[
              { value: "", label: "None" },
              ...[
                ...new Set([
                  ...holders,
                  ...(selected === null ? [] : [selected]),
                ]),
              ].map((r) => ({ value: String(r), label: `r${String(r)}` })),
            ]}
            onChange={(v) => {
              setSelected(v === "" ? null : Number(v));
            }}
          />
          {selected !== null && (
            <ChainPanel
              req={selected}
              current={current}
              blockSize={shown.blockSize}
            />
          )}
        </div>
      </div>
    </Figure>
  );
}

function summaryOf(name: string, f: CacheFrame | null, blocks: number) {
  if (!f) return `${name}: no requests yet.`;
  let used = 0;
  let shared = 0;
  let cached = 0;
  for (let b = 0; b < blocks; b++) {
    const r = f.refCount[b] ?? 0;
    if (r > 0) used++;
    if (r > 1) shared++;
    if ((f.rank[b] ?? 0) > 0) cached++;
  }
  return `${name} at ${f.t.toFixed(2)} s: ${String(f.running)} running, ${String(f.waiting)} waiting; ${String(used)} of ${String(blocks)} blocks in use, ${String(shared)} shared, ${String(cached)} cached.`;
}

/** Memoized: playback re-renders the figure every frame, not its controls. */
const Controls = memo(function Controls({
  mode,
  options: o,
  set,
  blockCount,
}: {
  mode: Mode;
  options: CacheOptions;
  set: (patch: Partial<CacheOptions>) => void;
  blockCount: number;
}) {
  return (
    <div className="paged__controls cache__controls">
      {mode !== "compare" && (
        <Toggle
          label="Prefix caching"
          checked={o.caching}
          onChange={(caching) => {
            set({ caching });
          }}
        />
      )}
      <Slider
        label="Shared prefix length"
        value={o.prefixLen}
        stops={PREFIX_STOPS[PRESET[mode]]}
        format={(v) => `${n(v)} tokens`}
        onChange={(v) => {
          set({ prefixLen: v });
        }}
      />
      <Slider
        label="Distinct prefixes"
        value={o.groups}
        min={1}
        max={16}
        format={(v) => String(v)}
        onChange={(v) => {
          set({ groups: v });
        }}
      />
      <Slider
        label="Share of requests with a prefix"
        value={o.fraction}
        min={0}
        max={1}
        step={0.1}
        format={pct}
        onChange={(v) => {
          set({ fraction: Math.round(v * 10) / 10 });
        }}
      />
      <Slider
        label="KV capacity"
        value={o.capacity}
        stops={CAPACITIES}
        format={(v) => `${n(v / o.blockSize)} blocks (${n(v)} tokens)`}
        onChange={(v) => {
          set({ capacity: v });
        }}
      />
      <Slider
        label="Block size"
        value={o.blockSize}
        stops={BLOCK_SIZES}
        format={(v) => `${String(v)} tokens`}
        onChange={(v) => {
          set({ blockSize: v });
        }}
      />
      <p className="cache__note">
        The pool stays at the same number of tokens when the block size changes:{" "}
        {n(blockCount)} blocks now.
      </p>
    </div>
  );
});

/** Hit rate, prefill computed and saved, evictions, preemptions (`simulated`). */
function Readout({
  frame: f,
  live,
}: {
  frame: CacheFrame | null;
  live: boolean;
}) {
  const rate = f && f.queryTokens > 0 ? f.hitTokens / f.queryTokens : 0;
  return (
    <div className="paged__readout" aria-live={live ? "polite" : "off"}>
      <dl className="num">
        <div>
          <dt>Hit rate</dt>
          <dd className="w4">{pct(rate)}</dd>
        </div>
        <div>
          <dt>Tokens computed</dt>
          <dd className="w6">{n(f?.prefillTokens ?? 0)}</dd>
        </div>
        <div>
          <dt>Tokens reused</dt>
          <dd className="w6">{n(f?.savedTokens ?? 0)}</dd>
        </div>
        <div>
          <dt>Evictions</dt>
          <dd className="w4">{n(f?.evictions ?? 0)}</dd>
        </div>
        {/* Laid out even at 0, so its first appearance moves nothing. */}
        <div data-hidden={(f?.preemptions ?? 0) === 0}>
          <dt>Preemptions</dt>
          <dd className="w2">{f?.preemptions ?? 0}</dd>
        </div>
      </dl>
      <ProvenanceBadge kind="simulated" />
    </div>
  );
}

/** The selected request's chain: logical block, physical block, fill, key. */
function ChainPanel({
  req,
  current,
  blockSize: B,
}: {
  req: number;
  current: { name: string; frame: CacheFrame | null }[];
  blockSize: number;
}) {
  return (
    <div
      className="table-panel"
      tabIndex={0}
      role="group"
      aria-label={`r${String(req)}'s chain`}
    >
      {current.map(({ name, frame }) => {
        const h = frame?.holders.find((x) => x.req === req);
        if (!h)
          return (
            <p key={name} className="table-panel__none">
              {name}: r{req} holds no blocks now (waiting or finished).
            </p>
          );
        return (
          <table key={name} className="table-panel__table num">
            <caption>
              {name}: r{req}&apos;s block table
            </caption>
            <thead>
              <tr>
                <th scope="col">Logical</th>
                <th scope="col">Physical</th>
                <th scope="col">Filled</th>
                <th scope="col">Key</th>
                <th scope="col">Tables</th>
              </tr>
            </thead>
            <tbody>
              {h.blocks.map((b, i) => {
                const key = frame?.hash[b] ?? NaN;
                return (
                  <tr key={b}>
                    <td>{i}</td>
                    <td>{b}</td>
                    <td>
                      {Math.min(B, Math.max(0, h.computed - i * B))} of {B}
                    </td>
                    <td>{Number.isNaN(key) ? "none" : hex6(key)}</td>
                    <td>{frame?.refCount[b] ?? 0}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        );
      })}
    </div>
  );
}

const Legend = memo(function Legend() {
  return (
    <ul className="paged__legend">
      <li>
        <span
          className="legend-swatch legend-swatch--held"
          aria-hidden="true"
        />
        One request&apos;s block: color, pattern, and glyph per request
      </li>
      <li>
        <span
          className="legend-swatch cache-swatch--shared"
          aria-hidden="true"
        />
        Shared: ×n tables point at it
      </li>
      <li>
        <span
          className="legend-swatch cache-swatch--cached"
          aria-hidden="true"
        />
        Cached: no request holds it; the number is its eviction order
      </li>
      <li>
        <span
          className="legend-swatch legend-swatch--free"
          aria-hidden="true"
        />
        Free, with no key
      </li>
      <li>
        <span
          className="legend-swatch cache-swatch--evicted"
          aria-hidden="true"
        />
        Evicted this step and reused
      </li>
      <li>
        <span
          className="legend-swatch legend-swatch--selected"
          aria-hidden="true"
        />
        Selected request&apos;s chain, numbered by logical block
      </li>
    </ul>
  );
});
