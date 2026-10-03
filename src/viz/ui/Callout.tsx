import type { ReactNode } from "react";

const LABELS = {
  simplification: "Simplification",
  "reality-check": "Reality check",
} as const;

/** A side note: what the sim simplifies, or how real systems compare. */
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
