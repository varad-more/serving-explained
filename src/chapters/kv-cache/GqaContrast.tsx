import { Figure } from "../../viz/ui/Figure.tsx";
import { ProvenanceBadge } from "../../viz/ui/ProvenanceBadge.tsx";
import { GIB, KIB, maxConcurrency } from "./budget.ts";
import { CONTRAST, gpu, model, type ModelEntry } from "./data.ts";
import { modelName } from "./KvFormula.tsx";
import { GQA_CONTRAST } from "./presets.ts";

const HEAD = 9;
const PITCH = 12;

/** Query heads above, KV heads below; a line joins each query head to the KV head it reads. */
function Heads({ m }: { m: ModelEntry }) {
  const group = m.attentionHeads / m.kvHeads;
  const width = m.attentionHeads * PITCH;
  const kvPitch = width / m.kvHeads;
  return (
    <svg
      className="heads"
      viewBox={`0 0 ${String(width)} 54`}
      width={width}
      height={54}
      role="img"
      aria-label={`${String(m.attentionHeads)} query heads share ${String(m.kvHeads)} KV heads, ${String(group)} to each.`}
    >
      {Array.from({ length: m.attentionHeads }, (_, q) => {
        const kv = Math.floor(q / group);
        const qx = q * PITCH + PITCH / 2;
        const kx = kv * kvPitch + kvPitch / 2;
        return (
          <g key={q}>
            <line
              className="heads__link"
              x1={qx}
              y1={HEAD + 2}
              x2={kx}
              y2={54 - HEAD - 2}
            />
            <rect
              className="heads__query"
              x={qx - HEAD / 2}
              y={1}
              width={HEAD}
              height={HEAD}
            />
          </g>
        );
      })}
      {Array.from({ length: m.kvHeads }, (_, kv) => (
        <rect
          key={kv}
          className="heads__kv"
          x={kv * kvPitch + kvPitch / 2 - HEAD / 2}
          y={54 - HEAD - 1}
          width={HEAD}
          height={HEAD}
        />
      ))}
    </svg>
  );
}

/** Figure 1.4: the MHA model against the GQA model nearest its size. */
export function GqaContrast() {
  const g = gpu(GQA_CONTRAST.gpu);
  const rows = [model(CONTRAST.mha), model(CONTRAST.gqa)];
  return (
    <Figure
      number="1.4"
      caption={`Query heads (top) and KV heads (bottom); requests that fit on ${g.name} at ${GQA_CONTRAST.context.toLocaleString("en-US")} tokens.`}
    >
      <div className="gqa">
        {rows.map((m) => (
          <section key={m.id} className="gqa__row" aria-label={modelName(m.id)}>
            <p className="gqa__name">
              <strong>{modelName(m.id)}</strong>, {m.attention.toUpperCase()}
            </p>
            <Heads m={m} />
            <dl className="gqa__facts num">
              <div>
                <dt>KV heads</dt>
                <dd>
                  {m.kvHeads} of {m.attentionHeads}
                </dd>
              </div>
              <div>
                <dt>KV per token</dt>
                <dd>
                  {(m.kvBytesPerTokenBf16 / KIB).toLocaleString("en-US")} KiB
                </dd>
              </div>
              <div>
                <dt>Weights</dt>
                <dd>{(m.weightBytesBf16 / GIB).toFixed(2)} GiB</dd>
              </div>
              <div>
                <dt>Requests that fit</dt>
                <dd>{maxConcurrency(g, m, "bf16", GQA_CONTRAST.context)}</dd>
              </div>
            </dl>
          </section>
        ))}
        <ProvenanceBadge kind="computed" />
      </div>
    </Figure>
  );
}
