import type { ReactNode } from "react";

const LABELS = {
  simplification: "Simplification",
  "reality-check": "Reality check",
  misconception: "A common misconception",
} as const;

/** A side note: what the sim simplifies, how real systems compare, or a misconception. */
export function Callout({
  kind,
  children,
}: {
  kind: keyof typeof LABELS;
  children: ReactNode;
}) {
  return (
    <aside className={`callout callout--${kind}`}>
      <p className="callout__label">{LABELS[kind]}</p>
      {children}
    </aside>
  );
}
