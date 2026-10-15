import { useState } from "react";
import { ProvenanceBadge } from "../../viz/ui/ProvenanceBadge.tsx";
import { Select } from "../../viz/ui/Select.tsx";
import { secs } from "./charts.tsx";
import { BASICS, BASICS_STATIC, SIGMAS } from "./presets.ts";
import { runTimeline } from "./timeline.ts";

/** CheckYourself's control: the output-length spread, and both mean TTFTs. */
export function SpreadTry() {
  const [sigma, setSigma] = useState<number>(BASICS.sigma);
  const ttft = (o: typeof BASICS) =>
    runTimeline("batching-basics", { ...o, sigma }).m.summary.ttft.mean;
  const s = ttft(BASICS_STATIC);
  const c = ttft(BASICS);
  return (
    <div className="try">
      <Select
        label="Try it: output length spread (σ)"
        value={String(sigma)}
        options={SIGMAS.map((v) => ({ value: String(v), label: v.toFixed(2) }))}
        onChange={(v) => {
          setSigma(Number(v));
        }}
      />
      <p className="num" aria-live="polite">
        Mean TTFT: static {secs(s)}, continuous {secs(c)}. The gap is{" "}
        {secs(s - c)}. <ProvenanceBadge kind="simulated" />
      </p>
    </div>
  );
}
