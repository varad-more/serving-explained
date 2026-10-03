/**
 * Where a number comes from (CLAUDE.md truth rules). The kinds share one ink
 * and differ in shape and text: simulated is dashed, computed is solid, and
 * measured is filled and links to its result file. `measured` without `href`
 * does not type-check.
 */
export type Provenance = (
  | { kind: "simulated" }
  | { kind: "computed" }
  | { kind: "measured"; href: string }
) & {
  /** A smaller badge for numbers inside prose. */
  inline?: boolean;
};

const MEANING = {
  simulated: "Produced by the toy engine on this page. Not a measurement.",
  computed: "Computed with llmsize's formulas.",
  measured: "Read from a committed benchmark result file. Opens the file.",
} as const;

export function ProvenanceBadge(props: Provenance) {
  const size = props.inline ? " badge--inline" : "";
  if (props.kind === "measured") {
    return (
      <a
        className={`badge badge--measured${size}`}
        href={props.href}
        title={MEANING.measured}
        data-inline
      >
        measured
        <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
          <path
            d="M2 8 L8 2 M3.5 2 H8 V6.5"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
          />
        </svg>
      </a>
    );
  }
  return (
    <span
      className={`badge badge--${props.kind}${size}`}
      title={MEANING[props.kind]}
    >
      {props.kind}
    </span>
  );
}
