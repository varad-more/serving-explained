import { useState } from "react";
import { Figure } from "../../viz/ui/Figure.tsx";
import { ProvenanceBadge } from "../../viz/ui/ProvenanceBadge.tsx";
import { Select } from "../../viz/ui/Select.tsx";
import { DTYPE_BYTES, KIB, kvFormula } from "./budget.ts";
import { MODELS, model } from "./data.ts";
import { MEMORY_BUDGET_DEFAULTS } from "./presets.ts";

const fmt = (n: number) => n.toLocaleString("en-US");
export const modelName = (id: string) =>
  id
    .slice(id.indexOf("/") + 1)
    .replace("-Instruct", "")
    .replace("-instruct", "");

/** Figure 1.3: bytes per token, with every symbol bound to the model picked. */
export function KvFormula() {
  const [slug, setSlug] = useState(MEMORY_BUDGET_DEFAULTS.model);
  const m = model(slug);
  const s = DTYPE_BYTES.bf16;
  const bytes = kvFormula(m, "bf16");
  return (
    <Figure
      number="1.3"
      caption="KV bytes per token for the model you pick, in bf16."
    >
      <Select
        label="Model"
        value={slug}
        options={MODELS.map((x) => ({ value: x.slug, label: modelName(x.id) }))}
        onChange={setSlug}
      />
      <div className="formula">
        <p className="formula__lhs">Bytes per token</p>
        <math aria-label="equals 2 times L times n kv times d h times s">
          <mrow>
            <mo>=</mo>
            <mn>2</mn>
            <mo>×</mo>
            <mi>L</mi>
            <mo>×</mo>
            <msub>
              <mi>n</mi>
              <mtext>kv</mtext>
            </msub>
            <mo>×</mo>
            <msub>
              <mi>d</mi>
              <mi>h</mi>
            </msub>
            <mo>×</mo>
            <mi>s</mi>
          </mrow>
        </math>
        <br />
        <math
          aria-label={`equals 2 times ${String(m.layers)} times ${String(m.kvHeads)} times ${String(m.headDim)} times ${String(s)}`}
        >
          <mrow>
            <mo>=</mo>
            <mn>2</mn>
            <mo>×</mo>
            <mn>{m.layers}</mn>
            <mo>×</mo>
            <mn>{m.kvHeads}</mn>
            <mo>×</mo>
            <mn>{m.headDim}</mn>
            <mo>×</mo>
            <mn>{s}</mn>
          </mrow>
        </math>
        <p className="formula__result" aria-live="polite">
          <span className="num">
            = <strong>{fmt(bytes)} bytes</strong> ={" "}
            <strong>{fmt(bytes / KIB)} KiB</strong> per token
          </span>{" "}
          <ProvenanceBadge kind="computed" />
        </p>
      </div>
      <dl className="formula__terms">
        <div>
          <dt>2</dt>
          <dd>a key and a value</dd>
        </div>
        <div>
          <dt>L = {m.layers}</dt>
          <dd>layers</dd>
        </div>
        <div>
          <dt>
            n<sub>kv</sub> = {m.kvHeads}
          </dt>
          <dd>KV heads</dd>
        </div>
        <div>
          <dt>
            d<sub>h</sub> = {m.headDim}
          </dt>
          <dd>numbers per head</dd>
        </div>
        <div>
          <dt>s = {s}</dt>
          <dd>bytes per number in bf16</dd>
        </div>
      </dl>
    </Figure>
  );
}
