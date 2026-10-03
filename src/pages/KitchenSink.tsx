/**
 * Every component in every state, in both themes. Registered only in dev
 * builds or with VITE_KITCHEN_SINK=1; the production dist has no chunk for it
 * (checked by postbuild). Playwright's keyboard, target-size, axe, and
 * screenshot tests run here.
 */
import { useEffect, useRef, useState, type CSSProperties } from "react";
import type { GlossaryEntry } from "../chapters/glossary.ts";
import { Callout } from "../viz/ui/Callout.tsx";
import { ChapterLayout, ChapterStep } from "../viz/ui/ChapterLayout.tsx";
import { CheckYourself } from "../viz/ui/CheckYourself.tsx";
import { Figure } from "../viz/ui/Figure.tsx";
import { GlossaryTerm } from "../viz/ui/GlossaryTerm.tsx";
import { PlaybackBar } from "../viz/ui/PlaybackBar.tsx";
import { ProvenanceBadge } from "../viz/ui/ProvenanceBadge.tsx";
import { RequestMark } from "../viz/ui/RequestMark.tsx";
import { paintRequestMark, SLOTS } from "../viz/ui/markSpec.ts";
import { Select } from "../viz/ui/Select.tsx";
import { Slider } from "../viz/ui/Slider.tsx";
import { SourceLink } from "../viz/ui/SourceLink.tsx";
import { Step } from "../viz/ui/Step.tsx";
import { Toggle } from "../viz/ui/Toggle.tsx";
import "./kitchen.css";

const DEMO_GLOSSARY: readonly GlossaryEntry[] = [
  {
    id: "kitchen-sink",
    term: "Kitchen sink",
    definition:
      "This page: every component in every state, for review and tests.",
  },
];

const CONTEXT_STOPS = [
  256, 512, 1024, 2048, 4096, 8192, 16384, 32768, 65536, 131072,
];
const kilo = (n: number) => (n >= 1024 ? `${String(n / 1024)}K` : String(n));
const MEASURED_FILE =
  "https://github.com/varad-more/inference-engine-benchmark-system/blob/1c964318addd2c742b53b0f0cf4a2cad791cace9/logs/phase2_resume_20260418T042547.log";

export default function KitchenSink() {
  return (
    <div className="kitchen">
      <h1>Kitchen sink</h1>
      <p>
        Every component in every state, in both themes. This page is not part of
        the site; it exists for review and tests.
      </p>
      {(["light", "dark"] as const).map((theme) => (
        <section
          key={theme}
          className="kitchen__panel"
          data-theme={theme}
          aria-labelledby={`kitchen-${theme}`}
        >
          <h2 id={`kitchen-${theme}`}>
            {theme === "light" ? "Light theme" : "Dark theme"}
          </h2>
          <Panel />
        </section>
      ))}
    </div>
  );
}

function Panel() {
  return (
    <>
      <Tokens />
      <h3>Type</h3>
      <p className="kitchen__type" style={{ fontSize: "var(--step-2)" }}>
        Step 2: h3 and board numerals
      </p>
      <p className="kitchen__type" style={{ fontSize: "var(--step-1)" }}>
        Step 1: a step's lead sentence
      </p>
      <p>Step 0: body text, at most 58 characters wide.</p>
      <p className="label">Labels: 12 px, sentence case</p>
      <p>
        Numbers use tabular figures:{" "}
        <span className="num">1,280 tokens, 61,787 tokens</span>.
      </p>

      <h3>Provenance badges</h3>
      <p>
        Simulated <ProvenanceBadge kind="simulated" />, computed{" "}
        <ProvenanceBadge kind="computed" />, and measured{" "}
        <ProvenanceBadge kind="measured" href={MEASURED_FILE} />.
      </p>

      <h3>Callouts</h3>
      <Callout kind="simplification">
        <p>The toy engine runs on one GPU, with no tensor parallelism.</p>
      </Callout>
      <Callout kind="reality-check">
        <p>
          A real server also reserves memory for activations and CUDA graphs.
        </p>
      </Callout>

      <h3>Controls</h3>
      <Controls />

      <h3>Playback</h3>
      <PlaybackDemo />
      <p className="label">Playing</p>
      <PlaybackBar {...noop} time={12.5} duration={40} playing speed={1} />
      <p className="label">At the end</p>
      <PlaybackBar
        {...noop}
        time={40}
        duration={40}
        playing={false}
        speed={2}
      />
      <p className="label">Reduced motion</p>
      <PlaybackBar
        {...noop}
        time={5}
        duration={40}
        playing={false}
        speed={1}
        reducedMotion
      />

      <h3>Text</h3>
      <p>
        A citation: <SourceLink id="kwon2023" at="§4.2" />. A defined term,
        closed:{" "}
        <GlossaryTerm id="kitchen-sink" entries={DEMO_GLOSSARY}>
          kitchen sink
        </GlossaryTerm>
        .
      </p>
      <p className="kitchen__open-term">
        The same term, open:{" "}
        <GlossaryTerm id="kitchen-sink" entries={DEMO_GLOSSARY} defaultOpen>
          kitchen sink
        </GlossaryTerm>
        .
      </p>
      <CheckYourself question="Which control does this box sit under? (closed)">
        <p>The kitchen sink's text section.</p>
      </CheckYourself>
      <CheckYourself
        question="Which control does this box sit under? (open)"
        defaultOpen
      >
        <p>The kitchen sink's text section.</p>
      </CheckYourself>

      <h3>Request marks</h3>
      <RequestMarks />

      <h3>Steps and figures</h3>
      <Step n={1}>
        <p>An inactive step.</p>
      </Step>
      <Step n={2} active>
        <p>The active step: its number sits on the signal-yellow bar.</p>
      </Step>
      <Figure number="0.1" caption="Requests r1 to r3, drawn with their marks.">
        <p>
          {[1, 2, 3].map((slot) => (
            <span key={slot} className="request-badge">
              <RequestMark slot={slot} size={16} title={`r${String(slot)}`} /> r
              {slot}{" "}
            </span>
          ))}
        </p>
      </Figure>

      <h3>Chapter layout</h3>
      <ChapterLayout
        number={0}
        title="A chapter"
        objective={<p>Say what this layout does at each width.</p>}
        figures={{
          demo: (active) => (
            <Figure
              number="0.2"
              caption={`The figure for step ${String(active)}.`}
            >
              <p className="num">Step {active} of 3</p>
            </Figure>
          ),
        }}
      >
        <ChapterStep figure="demo">
          <p>The first step. Scroll to make the next one active.</p>
        </ChapterStep>
        <ChapterStep figure="demo">
          <p>The second step.</p>
        </ChapterStep>
        <ChapterStep figure="demo">
          <p>The third step.</p>
        </ChapterStep>
      </ChapterLayout>
    </>
  );
}

const noop = {
  onPlay: () => undefined,
  onPause: () => undefined,
  onStep: () => undefined,
  onSeek: () => undefined,
  onSpeed: () => undefined,
};

function Tokens() {
  const swatch = (name: string, style: CSSProperties) => (
    <li key={name} className="swatch">
      <span className="swatch__chip" style={style} aria-hidden="true" />
      <code>{name}</code>
    </li>
  );
  return (
    <>
      <h3>Tokens</h3>
      <ul className="swatches">
        {[
          "bg",
          "surface",
          "surface-2",
          "rule",
          "rule-strong",
          "ink",
          "ink-2",
          "highlight",
          "focus",
        ].map((t) => swatch(`--${t}`, { background: `var(--${t})` }))}
      </ul>
      <ul className="swatches">
        {SLOTS.map((s) => (
          <li key={s.slot} className="swatch">
            <span
              className="swatch__chip swatch__chip--text"
              style={{
                background: `var(--req-${String(s.slot)})`,
                color: `var(--req-${String(s.slot)}-label)`,
              }}
            >
              r{s.slot}
            </span>
            <code>--req-{s.slot}</code>
          </li>
        ))}
      </ul>
      <ul className="swatches">
        {swatch("free", {
          background: "var(--block-free)",
          outline: "2px solid var(--block-free-edge)",
          outlineOffset: "-2px",
        })}
        {swatch("waste", {
          background:
            "repeating-linear-gradient(45deg, var(--block-waste) 0 2px, var(--surface) 2px 6px)",
        })}
        {swatch("shared", {
          background: "var(--ink-2)",
          outline: "4px double var(--block-shared-edge)",
          outlineOffset: "-4px",
        })}
        {swatch("cached", {
          background:
            "radial-gradient(var(--ink-2) 1px, var(--surface) 1.5px) 0 0 / 5px 5px",
          outline: "2px solid var(--block-free-edge)",
          outlineOffset: "-2px",
        })}
        {swatch("evicted", {
          background: "var(--block-free)",
          outline: "2px dashed var(--block-free-edge)",
          outlineOffset: "-2px",
        })}
      </ul>
    </>
  );
}

function Controls() {
  const [context, setContext] = useState(8192);
  const [count, setCount] = useState(4);
  const [caching, setCaching] = useState(true);
  const [gpu, setGpu] = useState<"a10g-24" | "h100-sxm-80">("a10g-24");
  return (
    <>
      <Slider
        label="Context length"
        value={context}
        stops={CONTEXT_STOPS}
        format={(v) => `${kilo(v)} tokens`}
        onChange={setContext}
      />
      <Slider
        label="Requests"
        value={count}
        min={1}
        max={16}
        onChange={setCount}
      />
      <Slider
        label="Disabled slider"
        value={4}
        min={1}
        max={16}
        onChange={() => undefined}
        disabled
      />
      <Toggle label="Prefix caching" checked={caching} onChange={setCaching} />
      <Toggle
        label="Off and disabled"
        checked={false}
        onChange={() => undefined}
        disabled
      />
      <Toggle
        label="On and disabled"
        checked
        onChange={() => undefined}
        disabled
      />
      <Select
        label="GPU"
        value={gpu}
        options={[
          { value: "a10g-24", label: "NVIDIA A10G 24GB" },
          { value: "h100-sxm-80", label: "NVIDIA H100 SXM 80GB" },
        ]}
        onChange={setGpu}
      />
      <Select
        label="Disabled select"
        value="a"
        options={[{ value: "a", label: "Only option" }]}
        onChange={() => undefined}
        disabled
      />
    </>
  );
}

/** A working bar: the playhead moves on animation frames while playing. */
function PlaybackDemo() {
  const [time, setTime] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const duration = 40;
  useEffect(() => {
    if (!playing) return;
    let last = performance.now();
    let frame = requestAnimationFrame(function tick(now) {
      const dt = ((now - last) / 1000) * speed;
      last = now;
      setTime((t) => Math.min(duration, t + dt));
      frame = requestAnimationFrame(tick);
    });
    return () => {
      cancelAnimationFrame(frame);
    };
  }, [playing, speed]);
  useEffect(() => {
    if (time >= duration) setPlaying(false);
  }, [time]);
  return (
    <PlaybackBar
      time={time}
      duration={duration}
      playing={playing}
      speed={speed}
      onPlay={() => {
        setPlaying(true);
      }}
      onPause={() => {
        setPlaying(false);
      }}
      onStep={() => {
        setTime((t) => Math.min(duration, t + 1));
      }}
      onSeek={setTime}
      onSpeed={setSpeed}
    />
  );
}

function RequestMarks() {
  return (
    <>
      <p className="label">SVG at 16 (no label), 24, 28, and 40 px</p>
      {[16, 24, 28, 40].map((size) => (
        <p key={size} className="marks">
          {SLOTS.map((s) => (
            <RequestMark
              key={s.slot}
              slot={s.slot}
              size={size}
              label={size >= 24 ? `r${String(s.slot)}` : undefined}
            />
          ))}
        </p>
      ))}
      <p className="label">Canvas at 28 and 40 px</p>
      <CanvasMarks size={28} />
      <CanvasMarks size={40} />
      <p className="label">Line badges</p>
      <p>
        {SLOTS.map((s) => (
          <span key={s.slot} className="request-badge">
            <RequestMark slot={s.slot} size={16} title={`r${String(s.slot)}`} />{" "}
            r{s.slot}{" "}
          </span>
        ))}
      </p>
    </>
  );
}

function CanvasMarks({ size }: { size: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const gap = 8;
  const width = SLOTS.length * (size + gap);
  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = size * dpr;
    ctx.scale(dpr, dpr);
    const css = getComputedStyle(canvas);
    const v = (name: string) => css.getPropertyValue(name).trim();
    for (const [i, s] of SLOTS.entries()) {
      const k = String(s.slot);
      paintRequestMark(
        ctx,
        s.slot,
        i * (size + gap),
        0,
        size,
        {
          fill: v(`--req-${k}`),
          ink: v(`--req-${k}-label`),
          pattern: v("--surface"),
          font: v("--font-body"),
        },
        `r${k}`,
      );
    }
  }, [size, width]);
  return (
    <canvas
      ref={ref}
      className="marks__canvas"
      style={{ width, height: size }}
      role="img"
      aria-label={`Request marks r1 to r8 at ${String(size)} px, drawn on a canvas`}
    />
  );
}
