import { Figure } from "../../viz/ui/Figure.tsx";
import { ProvenanceBadge } from "../../viz/ui/ProvenanceBadge.tsx";
import { useWidth } from "../../viz/useWidth.ts";
import { cacheRun } from "./CacheFigure.tsx";
import { REPEATED_FIGURE, SHARED } from "./presets.ts";
import { prefixPrefill } from "./stats.ts";

/** One prefill attempt: the first, or a recompute after a preemption. */
export interface Attempt {
  prefix: number;
  body: number;
  recompute: boolean;
}

/**
 * Prefill tokens of the first requests of `shared-system-prompt` with
 * caching off, split into the shared prefix and the rest, per attempt.
 */
export function repeatedPrefill() {
  const run = cacheRun("shared-system-prompt", { ...SHARED, caching: false });
  const L = SHARED.prefixLen;
  const ids = run.config.requests
    .slice(0, REPEATED_FIGURE.requests)
    .map((r) => r.id);
  const shares = new Map(
    run.config.requests.map((r) => [
      r.id,
      run.config.requests.some(
        (o) =>
          o.id !== r.id &&
          o.prompt.length > L &&
          r.prompt.length > L &&
          o.prompt.slice(0, L).join(",") === r.prompt.slice(0, L).join(","),
      ),
    ]),
  );
  const rows = new Map<number, Attempt[]>(ids.map((id) => [id, []]));
  for (const e of run.events) {
    const attempts = rows.get("req" in e ? e.req : -1);
    if (!attempts) continue;
    if (e.type === "Admit")
      attempts.push({ prefix: 0, body: 0, recompute: attempts.length > 0 });
    if (e.type === "PrefillChunk") {
      const a = attempts.at(-1);
      if (!a) continue;
      const pre = shares.get(e.req)
        ? Math.max(0, Math.min(e.start + e.tokens, L) - e.start)
        : 0;
      a.prefix += pre;
      a.body += e.tokens - pre;
    }
  }
  return {
    rows: ids.map((id) => ({ req: id, attempts: rows.get(id) ?? [] })),
    total: prefixPrefill(run.config, run.events, L),
    requests: run.config.requests.length,
  };
}

const ROW = 24;
const LABEL = 40;

/** Figure 4.1: the shared prefix, computed again by every request. */
export function RepeatedPrefill() {
  const [ref, W] = useWidth<SVGSVGElement>(600);
  const { rows, total, requests } = repeatedPrefill();
  const widest = Math.max(
    ...rows.map((r) => r.attempts.reduce((s, a) => s + a.prefix + a.body, 0)),
  );
  const x = (tokens: number) => (tokens / widest) * (W - LABEL - 8);
  const H = rows.length * ROW + 24;
  const n = (v: number) => v.toLocaleString("en-US");
  return (
    <Figure
      number="4.1"
      caption={`Prefill work of the first ${String(rows.length)} requests with prefix caching off. Most start with the same ${n(SHARED.prefixLen)}-token system prompt.`}
    >
      <div className="cache">
        <svg
          ref={ref}
          className="cache__svg"
          viewBox={`0 0 ${String(W)} ${String(H)}`}
          height={H}
          role="img"
          aria-label={rows
            .map(
              (r) =>
                `r${String(r.req)}: ${r.attempts.map((a) => `${a.recompute ? "recompute, " : ""}${n(a.prefix)} prefix and ${n(a.body)} other tokens`).join("; ")}`,
            )
            .join(". ")}
        >
          {rows.map((r, i) => {
            let at = LABEL;
            const y = i * ROW + 4;
            return (
              <g key={r.req}>
                <text className="chart__tick" x={2} y={y + 13}>
                  r{r.req}
                </text>
                {r.attempts.map((a, k) => {
                  const x0 = at;
                  const wp = x(a.prefix);
                  const wb = x(a.body);
                  at += wp + wb + 2;
                  return (
                    <g key={k} className={a.recompute ? "rp--recompute" : ""}>
                      <rect
                        className="rp__prefix"
                        x={x0}
                        y={y}
                        width={wp}
                        height={16}
                      />
                      <rect
                        className="rp__body"
                        x={x0 + wp}
                        y={y}
                        width={wb}
                        height={16}
                      />
                      {a.recompute && (
                        <text className="rp__label" x={x0 + 4} y={y + 12}>
                          recompute
                        </text>
                      )}
                    </g>
                  );
                })}
              </g>
            );
          })}
          <text className="chart__tick" x={LABEL} y={H - 4}>
            0
          </text>
          <text className="chart__tick" x={W - 8} y={H - 4} textAnchor="end">
            {n(widest)} tokens
          </text>
        </svg>
        <ul className="paged__legend">
          <li>
            <span
              className="legend-swatch rp-swatch--prefix"
              aria-hidden="true"
            />
            The shared system prompt
          </li>
          <li>
            <span
              className="legend-swatch rp-swatch--body"
              aria-hidden="true"
            />
            The rest of the prompt
          </li>
          <li>
            <span
              className="legend-swatch rp-swatch--recompute"
              aria-hidden="true"
            />
            Computed again after a preemption
          </li>
        </ul>
        <p className="cache__counter num">
          Over all {n(requests)} requests, the prefix is computed{" "}
          {n(total.sharers + total.preempted.length)} times: {n(total.tokens)}{" "}
          tokens. <ProvenanceBadge kind="simulated" />
        </p>
      </div>
    </Figure>
  );
}
