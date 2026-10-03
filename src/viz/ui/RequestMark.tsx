import { useId } from "react";
import {
  GLYPHS,
  markLayout,
  MIN_MARK,
  patternGeometry,
  slotSpec,
} from "./markSpec.ts";

interface Props {
  slot: number;
  /** Pixels; never drawn below MIN_MARK. */
  size?: number;
  /** The id label ("r3"), drawn from LABEL_MIN up. */
  label?: string;
  /** The accessible name; defaults to the label and slot. */
  title?: string;
}

/** A request's mark: slot color, pattern, and glyph at every size (DESIGN.md). */
export function RequestMark({ slot, size = 28, label, title }: Props) {
  const spec = slotSpec(slot);
  const s = Math.max(size, MIN_MARK);
  const { plate, glyph, label: labelBox } = markLayout(s, label !== undefined);
  const { lines, dots } = patternGeometry(spec.pattern, s);
  const fill = `var(--req-${String(slot)})`;
  const ink = `var(--req-${String(slot)}-label)`;
  const shape = GLYPHS[spec.glyph];
  const titleId = useId();
  return (
    <svg
      className="request-mark"
      width={s}
      height={s}
      viewBox={`0 0 ${String(s)} ${String(s)}`}
      role="img"
      aria-labelledby={titleId}
      data-slot={slot}
      data-pattern={spec.pattern}
      data-glyph={spec.glyph}
    >
      <title id={titleId}>
        {title ?? `${label ?? "request"}, slot ${String(slot)}`}
      </title>
      <rect width={s} height={s} fill={fill} />
      <g
        className="request-mark__pattern"
        stroke="var(--surface)"
        fill="var(--surface)"
        strokeWidth={1.25}
      >
        {lines.map(([x1, y1, x2, y2], i) => (
          <line key={`l${String(i)}`} x1={x1} y1={y1} x2={x2} y2={y2} />
        ))}
        {dots.map(([cx, cy], i) => (
          <circle key={`d${String(i)}`} cx={cx} cy={cy} r={1} stroke="none" />
        ))}
      </g>
      <rect
        x={plate.x}
        y={plate.y}
        width={plate.w}
        height={plate.h}
        fill={fill}
      />
      {shape.kind === "circle" ? (
        <circle
          className="request-mark__glyph"
          cx={glyph.x + shape.cx * glyph.w}
          cy={glyph.y + shape.cy * glyph.h}
          r={shape.r * glyph.w}
          fill={ink}
        />
      ) : (
        <polygon
          className="request-mark__glyph"
          points={shape.points
            .map(
              ([x, y]) =>
                `${String(glyph.x + x * glyph.w)},${String(glyph.y + y * glyph.h)}`,
            )
            .join(" ")}
          fill={ink}
        />
      )}
      {labelBox && label !== undefined && (
        <text
          x={labelBox.x + labelBox.w / 2}
          y={labelBox.y + labelBox.h}
          textAnchor="middle"
          fontSize={labelBox.fontSize}
          fontWeight={700}
          fill={ink}
          aria-hidden="true"
        >
          {label}
        </text>
      )}
    </svg>
  );
}
