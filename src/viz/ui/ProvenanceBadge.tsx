import {
  useCallback,
  useEffect,
  useId,
  useRef,
  type FocusEvent,
  type ToggleEvent,
} from "react";

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

export const MEANING = {
  simulated: "Produced by the toy engine on this page. Not a measurement.",
  computed: "Computed with llmsize's formulas.",
  measured: "Read from a committed benchmark result file. Opens the file.",
} as const;

export type ProvenanceKind = keyof typeof MEANING;

/** Puts the open note under its badge (above it near the bottom), on screen. */
function place(anchor: Element, tip: HTMLElement) {
  const a = anchor.getBoundingClientRect();
  const edge = 16;
  const gap = 6;
  const left = Math.min(
    Math.max(a.left, edge),
    window.innerWidth - tip.offsetWidth - edge,
  );
  const below = a.bottom + gap + tip.offsetHeight <= window.innerHeight - edge;
  tip.style.left = `${String(Math.max(left, edge))}px`;
  tip.style.top = `${String(below ? a.bottom + gap : a.top - gap - tip.offsetHeight)}px`;
}

/**
 * A badge's meaning opens in a note on keyboard focus and, for simulated and
 * computed, on tap or click (AUDIT.md B1). A measured badge is a link, so a
 * tap opens its file; BadgeLegend states its meaning on every page.
 */
export function ProvenanceBadge(props: Provenance) {
  const tipId = useId();
  const anchorRef = useRef<HTMLElement>(null);
  const tipRef = useRef<HTMLSpanElement>(null);
  const size = props.inline ? " badge--inline" : "";

  // Stable for the badge's life, so the listeners it adds come off.
  const follow = useCallback(() => {
    if (anchorRef.current && tipRef.current)
      place(anchorRef.current, tipRef.current);
  }, []);
  const unfollow = useCallback(() => {
    window.removeEventListener("scroll", follow, { capture: true });
    window.removeEventListener("resize", follow);
  }, [follow]);
  useEffect(() => unfollow, [unfollow]);

  const onToggle = (e: ToggleEvent<HTMLSpanElement>) => {
    if (e.newState === "open") {
      follow();
      window.addEventListener("scroll", follow, {
        capture: true,
        passive: true,
      });
      window.addEventListener("resize", follow);
    } else unfollow();
  };
  const onFocus = (e: FocusEvent<HTMLElement>) => {
    if (e.currentTarget.matches(":focus-visible"))
      tipRef.current?.showPopover();
  };
  const onBlur = () => {
    if (tipRef.current?.matches(":popover-open")) tipRef.current.hidePopover();
  };

  const tip = (
    <span
      className="badge-tip"
      id={tipId}
      ref={tipRef}
      popover="auto"
      onToggle={onToggle}
    >
      <strong>{props.kind}:</strong> {MEANING[props.kind]}
    </span>
  );

  if (props.kind === "measured") {
    return (
      <>
        <a
          className={`badge badge--measured${size}`}
          href={props.href}
          ref={(el) => {
            anchorRef.current = el;
          }}
          title={MEANING.measured}
          aria-describedby={tipId}
          onFocus={onFocus}
          onBlur={onBlur}
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
        {tip}
      </>
    );
  }
  return (
    <>
      <button
        type="button"
        className={`badge badge--${props.kind}${size}`}
        ref={(el) => {
          anchorRef.current = el;
        }}
        popoverTarget={tipId}
        title={MEANING[props.kind]}
        aria-describedby={tipId}
        onFocus={onFocus}
        onBlur={onBlur}
        data-inline
      >
        {props.kind}
      </button>
      {tip}
    </>
  );
}

/** One visible key to the badges, near the top of every page that has them. */
export function BadgeLegend() {
  const kinds: ProvenanceKind[] = ["simulated", "computed", "measured"];
  return (
    <dl className="badge-legend" aria-label="What the number badges mean">
      {kinds.map((k) => (
        <div key={k}>
          <dt>
            <span className={`badge badge--${k} badge--inline`}>{k}</span>
          </dt>
          <dd>{MEANING[k]}</dd>
        </div>
      ))}
    </dl>
  );
}
