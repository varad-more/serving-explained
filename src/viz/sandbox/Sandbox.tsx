import { useEffect, useMemo, useState } from "react";
import gpus from "../../data/gpus.json" with { type: "json" };
import models from "../../data/models.json" with { type: "json" };
import { ENGINE_VERSION } from "../../sim/index.ts";
import { PlaybackBar } from "../ui/PlaybackBar.tsx";
import { ProvenanceBadge } from "../ui/ProvenanceBadge.tsx";
import { usePlayhead } from "../usePlayhead.ts";
import { Controls } from "./Controls.tsx";
import {
  encodeLink,
  parseLink,
  type Link,
  type SandboxConfig,
} from "./params.ts";
import { RunView } from "./RunView.tsx";
import { diff, LABELS } from "./summary.ts";
import { useRun } from "./useRun.ts";
// The chapter widgets the views reuse bring their chapters' styles.
import "../../chapters/paged-attention/paged-attention.css";
import "../../chapters/continuous-batching/continuous-batching.css";
import "./sandbox.css";

const short = (hash: string | undefined) => hash?.slice(0, 8) ?? null;

/** The link to this page for `link`, on whatever origin and base it is served. */
function linkUrl(link: Link): string {
  return `${window.location.origin}${import.meta.env.BASE_URL}sandbox/?${encodeLink(link)}`;
}

/** The sandbox page (tasks/todo.md, Prompt 7). */
export function Sandbox() {
  const [opened] = useState(() => parseLink(window.location.search.slice(1)));
  const [a, setA] = useState<SandboxConfig>(opened.a);
  const [b, setB] = useState<SandboxConfig | null>(opened.b);
  const [tab, setTab] = useState<"a" | "b">("a");
  const [selected, setSelected] = useState<number | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [copiedNote, setCopiedNote] = useState("");
  const runA = useRun(a);
  const runB = useRun(b);
  const ab = b !== null;

  const duration = Math.max(
    runA.done?.duration ?? runA.progress?.simTime ?? 0,
    ab ? (runB.done?.duration ?? runB.progress?.simTime ?? 0) : 0,
    0.001,
  );
  const ph = usePlayhead(duration);
  const time = Math.min(ph.time, duration);

  // Frames follow the playhead; the hook keeps one request in flight.
  const { requestFrame: frameA, requestEvents: eventsA } = runA;
  const { requestFrame: frameB, requestEvents: eventsB } = runB;
  const doneA = runA.done !== null;
  const doneB = runB.done !== null;
  useEffect(() => {
    if (doneA) frameA(time);
    if (doneB) frameB(time);
  }, [time, doneA, doneB, frameA, frameB]);
  // The events list follows the playhead once it rests.
  useEffect(() => {
    if (ph.playing) return;
    const id = setTimeout(() => {
      const t0 = Math.max(0, time - 0.25);
      if (doneA) eventsA(t0, time);
      if (doneB) eventsB(t0, time);
    }, 120);
    return () => {
      clearTimeout(id);
    };
  }, [time, ph.playing, doneA, doneB, eventsA, eventsB]);

  // The address bar holds the settings (no hashes), so a reload keeps them.
  useEffect(() => {
    const id = setTimeout(() => {
      const query = encodeLink({ a, b, h: null, hb: null });
      window.history.replaceState(null, "", `?${query}`);
    }, 300);
    return () => {
      clearTimeout(id);
    };
  }, [a, b]);

  const verify = (want: string | null, run: typeof runA, name: string) => {
    if (!want || !run.done) return null;
    const got = short(run.done.hash);
    return got === want
      ? `${name} reproduced exactly (log hash ${want}).`
      : `${name}'s log hash is ${got ?? "?"}, but the link says ${want}: the engine or its data changed since the link was made.`;
  };
  const checks = [
    verify(opened.h, runA, ab ? "Run A" : "The run"),
    ab ? verify(opened.hb, runB, "Run B") : null,
  ].filter((x): x is string => x !== null);

  const table = useMemo(
    () =>
      runA.done && runB.done
        ? diff(
            { done: runA.done, series: runA.series },
            { done: runB.done, series: runB.series },
          )
        : null,
    [runA.done, runA.series, runB.done, runB.series],
  );

  const link: Link = {
    a,
    b,
    h: short(runA.done?.hash),
    hb: ab ? short(runB.done?.hash) : null,
  };

  const copy = async () => {
    const url = linkUrl(link);
    try {
      await navigator.clipboard.writeText(url);
      setCopied(null);
      setCopiedNote("Link copied.");
    } catch {
      setCopied(url);
    }
  };
  const download = () => {
    const data = {
      provenance: "simulated",
      engineVersion: ENGINE_VERSION,
      link: linkUrl(link),
      config: { a, b },
      metrics: { a: runA.done?.summary ?? null, b: runB.done?.summary ?? null },
      hashes: { a: runA.done?.hash ?? null, b: runB.done?.hash ?? null },
      _provenance: { models: models._provenance, gpus: gpus._provenance },
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "serving-explained-sandbox.json";
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const editing = tab === "b" && b ? b : a;
  const setEditing = (c: SandboxConfig) => {
    if (tab === "b" && b) setB(c);
    else setA(c);
  };

  return (
    <div className="sandbox">
      <h1>Sandbox</h1>
      <p className="sandbox__lede">
        Combine all four mechanisms on one workload. Predict which matters most,
        then run it. Every number here is simulated by the toy engine on this
        page, not measured. <ProvenanceBadge kind="simulated" />
      </p>
      {opened.notices.length > 0 && (
        <div className="sb-notices" role="status">
          <p>
            <strong>Some settings in the link were not used:</strong>
          </p>
          <ul>
            {opened.notices.slice(0, 12).map((x, i) => (
              <li key={i}>{x}</li>
            ))}
          </ul>
        </div>
      )}
      {opened.h && (
        <p className="sb-verify" role="status">
          {checks.length > 0
            ? checks.join(" ")
            : "Checking the run against the hash in the link…"}
        </p>
      )}

      <div className="sandbox__layout">
        <aside className="sandbox__controls">
          <div className="sb-ab">
            <button
              type="button"
              className="button"
              aria-pressed={ab}
              onClick={() => {
                if (ab) {
                  setB(null);
                  setTab("a");
                } else {
                  setB({ ...a });
                  setTab("b");
                }
              }}
            >
              {ab ? "Stop comparing" : "Compare A and B"}
            </button>
            {ab && (
              <>
                <div
                  className="sb-tabs"
                  role="tablist"
                  aria-label="Configuration"
                >
                  {(["a", "b"] as const).map((t) => (
                    <button
                      key={t}
                      type="button"
                      role="tab"
                      aria-selected={tab === t}
                      className="sb-tab"
                      onClick={() => {
                        setTab(t);
                      }}
                    >
                      {t.toUpperCase()}
                    </button>
                  ))}
                </div>
                <button
                  type="button"
                  className="button"
                  onClick={() => {
                    setB({ ...a });
                  }}
                >
                  Copy A to B
                </button>
              </>
            )}
          </div>
          <Controls
            config={editing}
            onChange={setEditing}
            name={ab ? tab.toUpperCase() : "A"}
          />
        </aside>

        <div className="sandbox__views">
          <div className="sb-share">
            <button
              type="button"
              className="button"
              data-link={linkUrl(link)}
              onClick={() => void copy()}
            >
              Copy link
            </button>
            <button type="button" className="button" onClick={download}>
              Download JSON
            </button>
            <span className="sb-note" role="status">
              {copiedNote}
            </span>
            {copied && (
              <label className="sb-copy">
                Copy this link:
                <input
                  readOnly
                  value={copied}
                  ref={(el) => {
                    el?.select();
                  }}
                />
              </label>
            )}
          </div>
          <PlaybackBar
            time={time}
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
              ph.setTime(Math.min(duration, time + duration / 200));
            }}
            onSeek={(t) => {
              ph.setPlaying(false);
              ph.setTime(t);
            }}
            onSpeed={ph.setSpeed}
          />
          {ab && (
            <table className="sb-diff num">
              <caption>
                A against B <ProvenanceBadge kind="simulated" />
              </caption>
              <thead>
                <tr>
                  <th scope="col">Metric</th>
                  <th scope="col">A</th>
                  <th scope="col">B</th>
                  <th scope="col">Δ</th>
                  <th scope="col">Δ%</th>
                </tr>
              </thead>
              <tbody>
                {(
                  table ??
                  LABELS.map((l) => ({
                    ...l,
                    a: "–",
                    b: "–",
                    delta: "",
                    deltaPct: "",
                    arrow: "",
                  }))
                ).map((r) => (
                  <tr key={r.key}>
                    <th scope="row">{r.label}</th>
                    <td>{r.a}</td>
                    <td>{r.b}</td>
                    <td>
                      {r.arrow && <span aria-hidden="true">{r.arrow} </span>}
                      {r.delta}
                    </td>
                    <td>{r.deltaPct}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <div className={ab ? "sb-pair" : undefined}>
            <RunView
              name={ab ? "A" : "Run"}
              config={a}
              run={runA}
              time={time}
              selected={selected}
              onSelect={setSelected}
            />
            {b && (
              <RunView
                name="B"
                config={b}
                run={runB}
                time={time}
                selected={selected}
                onSelect={setSelected}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
