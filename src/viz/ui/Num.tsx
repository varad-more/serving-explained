import { ProvenanceBadge } from "./ProvenanceBadge.tsx";

/** Keeps a number and its unit on one line. */
const NBSP = "\u00a0";

type Props = {
  value: number;
  /** Decimal places (default 0). */
  digits?: number;
  /** Appended after a space, or directly when it starts with "×" or "%". */
  unit?: string;
  /** Leave the badge off when one nearby already covers this number. */
  badge?: boolean;
} & (
  | { kind: "computed" | "simulated" }
  /** Read from a committed result file: the badge links to it. */
  | { kind: "measured"; href: string }
);

/**
 * A number from data or the sim, in prose (CHAPTER_DOD item 3). It formats the
 * value and attaches its provenance, so prose cannot drift from data.
 */
export function Num(props: Props) {
  const { value, digits = 0, unit, badge = true } = props;
  const text = value.toLocaleString("en-US", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
  const tight = unit !== undefined && /^[×%]/.test(unit);
  return (
    <span className="num-value">
      <span className="num">
        {text}
        {unit && (tight ? unit : `${NBSP}${unit}`)}
      </span>
      {badge && (
        <>
          {" "}
          {props.kind === "measured" ? (
            <ProvenanceBadge kind="measured" href={props.href} inline />
          ) : (
            <ProvenanceBadge kind={props.kind} inline />
          )}
        </>
      )}
    </span>
  );
}
