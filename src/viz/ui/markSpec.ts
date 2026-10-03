/**
 * One spec for every request mark (DESIGN.md, "Requests"): each slot has a
 * color, a pattern, and a glyph, and every mark carries all three at every
 * size (AUDIT.md M3). The SVG component and the Canvas painter both draw from
 * this module, so the two cannot drift.
 *
 * Layout of a mark of `size` px: the slot color fills the square; the pattern,
 * in --surface, shows in a frame around a solid plate; the glyph, in the
 * slot's label ink, sits on the plate; from 24 px the id label sits on the
 * plate below the glyph.
 */

export type Pattern =
  | "solid"
  | "diag45"
  | "dots"
  | "horizontal"
  | "diag135"
  | "crosshatch"
  | "vertical"
  | "grid";

export type GlyphName =
  | "circle"
  | "triangle"
  | "square"
  | "diamond"
  | "triangle-down"
  | "plus"
  | "hexagon"
  | "cross";

export interface SlotSpec {
  slot: number;
  name: string;
  pattern: Pattern;
  glyph: GlyphName;
}

/** DESIGN.md's requests table, slots 1–8. */
export const SLOTS: readonly SlotSpec[] = [
  { slot: 1, name: "blue", pattern: "solid", glyph: "circle" },
  { slot: 2, name: "red-orange", pattern: "diag45", glyph: "triangle" },
  { slot: 3, name: "magenta", pattern: "dots", glyph: "square" },
  { slot: 4, name: "amber", pattern: "horizontal", glyph: "diamond" },
  { slot: 5, name: "cyan", pattern: "diag135", glyph: "triangle-down" },
  { slot: 6, name: "moss", pattern: "crosshatch", glyph: "plus" },
  { slot: 7, name: "violet", pattern: "vertical", glyph: "hexagon" },
  { slot: 8, name: "green", pattern: "grid", glyph: "cross" },
];

export function slotSpec(slot: number): SlotSpec {
  const spec = SLOTS[slot - 1];
  if (!spec) throw new RangeError(`no request slot ${String(slot)}`);
  return spec;
}

/** The smallest mark: the 16 px timeline tab, which still fits a 12 px glyph. */
export const MIN_MARK = 16;
/** Marks this wide or wider carry the id label. */
export const LABEL_MIN = 24;

type Point = readonly [number, number];
/** Glyph geometry in a unit square. */
export type Shape =
  | { kind: "circle"; cx: number; cy: number; r: number }
  | { kind: "poly"; points: readonly Point[] };

const PLUS: readonly Point[] = [
  [0.34, 0.06],
  [0.66, 0.06],
  [0.66, 0.34],
  [0.94, 0.34],
  [0.94, 0.66],
  [0.66, 0.66],
  [0.66, 0.94],
  [0.34, 0.94],
  [0.34, 0.66],
  [0.06, 0.66],
  [0.06, 0.34],
  [0.34, 0.34],
];

/** Rotates a unit-square point about the center. */
function turn([x, y]: Point, degrees: number): Point {
  const a = (degrees * Math.PI) / 180;
  const dx = x - 0.5;
  const dy = y - 0.5;
  return [
    0.5 + dx * Math.cos(a) - dy * Math.sin(a),
    0.5 + dx * Math.sin(a) + dy * Math.cos(a),
  ];
}

export const GLYPHS: Record<GlyphName, Shape> = {
  circle: { kind: "circle", cx: 0.5, cy: 0.5, r: 0.42 },
  triangle: {
    kind: "poly",
    points: [
      [0.5, 0.08],
      [0.94, 0.88],
      [0.06, 0.88],
    ],
  },
  square: {
    kind: "poly",
    points: [
      [0.14, 0.14],
      [0.86, 0.14],
      [0.86, 0.86],
      [0.14, 0.86],
    ],
  },
  diamond: {
    kind: "poly",
    points: [
      [0.5, 0.04],
      [0.96, 0.5],
      [0.5, 0.96],
      [0.04, 0.5],
    ],
  },
  "triangle-down": {
    kind: "poly",
    points: [
      [0.06, 0.12],
      [0.94, 0.12],
      [0.5, 0.92],
    ],
  },
  plus: { kind: "poly", points: PLUS },
  hexagon: {
    kind: "poly",
    points: Array.from({ length: 6 }, (_, k) => turn([0.5, 0.04], 60 * k)),
  },
  cross: { kind: "poly", points: PLUS.map((p) => turn(p, 45)) },
};

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface MarkLayout {
  /** The solid plate inside the pattern frame. */
  plate: Box;
  /** The glyph's square. */
  glyph: Box;
  /** The label's baseline box, or null below LABEL_MIN. */
  label: (Box & { fontSize: number }) | null;
}

export function markLayout(size: number, labeled: boolean): MarkLayout {
  const inset = Math.max(2, Math.round(size * 0.15));
  const inner = size - 2 * inset;
  const plate = { x: inset, y: inset, w: inner, h: inner };
  if (labeled && size >= LABEL_MIN) {
    const fontSize = Math.max(8, Math.round(inner * 0.36));
    const g = Math.max(6, inner - fontSize - 2);
    return {
      plate,
      glyph: { x: inset + (inner - g) / 2, y: inset + 1, w: g, h: g },
      label: {
        x: inset,
        y: inset + inner - fontSize - 1,
        w: inner,
        h: fontSize + 1,
        fontSize,
      },
    };
  }
  const g = Math.max(12, Math.round(inner * 0.82));
  const off = (size - g) / 2;
  return { plate, glyph: { x: off, y: off, w: g, h: g }, label: null };
}

export type Segment = readonly [number, number, number, number];

/** The pattern's strokes and dots inside a size × size box. */
export function patternGeometry(
  pattern: Pattern,
  size: number,
  spacing = 4,
): { lines: Segment[]; dots: Point[] } {
  const lines: Segment[] = [];
  const dots: Point[] = [];
  const offsets: number[] = [];
  for (let v = spacing / 2; v < size; v += spacing) offsets.push(v);
  const horizontal = () => {
    for (const y of offsets) lines.push([0, y, size, y]);
  };
  const vertical = () => {
    for (const x of offsets) lines.push([x, 0, x, size]);
  };
  const rising = () => {
    // "/": x + y = c
    for (let c = spacing / 2; c < 2 * size; c += spacing) {
      const x1 = Math.min(c, size);
      const y2 = Math.min(c, size);
      lines.push([x1, c - x1, c - y2, y2]);
    }
  };
  const falling = () => {
    // "\": y = x + c
    for (let c = -size + spacing / 2; c < size; c += spacing) {
      const x0 = Math.max(0, -c);
      const x1 = Math.min(size, size - c);
      lines.push([x0, x0 + c, x1, x1 + c]);
    }
  };
  switch (pattern) {
    case "solid":
      break;
    case "diag45":
      rising();
      break;
    case "diag135":
      falling();
      break;
    case "crosshatch":
      rising();
      falling();
      break;
    case "horizontal":
      horizontal();
      break;
    case "vertical":
      vertical();
      break;
    case "grid":
      horizontal();
      vertical();
      break;
    case "dots":
      for (const y of offsets) for (const x of offsets) dots.push([x, y]);
      break;
  }
  return { lines, dots };
}

/** The slice of CanvasRenderingContext2D the painter uses. */
export interface CanvasLike {
  fillStyle: string | CanvasGradient | CanvasPattern;
  strokeStyle: string | CanvasGradient | CanvasPattern;
  lineWidth: number;
  font: string;
  textAlign: CanvasTextAlign;
  textBaseline: CanvasTextBaseline;
  save(): void;
  restore(): void;
  translate(x: number, y: number): void;
  beginPath(): void;
  closePath(): void;
  moveTo(x: number, y: number): void;
  lineTo(x: number, y: number): void;
  arc(x: number, y: number, r: number, start: number, end: number): void;
  fill(): void;
  stroke(): void;
  fillRect(x: number, y: number, w: number, h: number): void;
  fillText(text: string, x: number, y: number): void;
}

/** Resolved colors: the canvas cannot read CSS custom properties itself. */
export interface MarkColors {
  /** --req-k */
  fill: string;
  /** --req-k-label */
  ink: string;
  /** --surface */
  pattern: string;
  /** The body font family. */
  font: string;
}

/** Paints a request mark at (x, y). Mirrors the SVG RequestMark. */
export function paintRequestMark(
  ctx: CanvasLike,
  slot: number,
  x: number,
  y: number,
  size: number,
  colors: MarkColors,
  label?: string,
): void {
  const spec = slotSpec(slot);
  const layout = markLayout(Math.max(size, MIN_MARK), label !== undefined);
  const s = Math.max(size, MIN_MARK);
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = colors.fill;
  ctx.fillRect(0, 0, s, s);

  const { lines, dots } = patternGeometry(spec.pattern, s);
  ctx.strokeStyle = colors.pattern;
  ctx.fillStyle = colors.pattern;
  ctx.lineWidth = 1.25;
  if (lines.length > 0) {
    ctx.beginPath();
    for (const [x1, y1, x2, y2] of lines) {
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
    }
    ctx.stroke();
  }
  for (const [cx, cy] of dots) {
    ctx.beginPath();
    ctx.arc(cx, cy, 1, 0, 2 * Math.PI);
    ctx.fill();
  }

  const { plate, glyph } = layout;
  ctx.fillStyle = colors.fill;
  ctx.fillRect(plate.x, plate.y, plate.w, plate.h);

  ctx.fillStyle = colors.ink;
  const shape = GLYPHS[spec.glyph];
  ctx.beginPath();
  if (shape.kind === "circle") {
    ctx.arc(
      glyph.x + shape.cx * glyph.w,
      glyph.y + shape.cy * glyph.h,
      shape.r * glyph.w,
      0,
      2 * Math.PI,
    );
  } else {
    shape.points.forEach(([px, py], i) => {
      const gx = glyph.x + px * glyph.w;
      const gy = glyph.y + py * glyph.h;
      if (i === 0) ctx.moveTo(gx, gy);
      else ctx.lineTo(gx, gy);
    });
    ctx.closePath();
  }
  ctx.fill();

  if (layout.label && label !== undefined) {
    ctx.font = `700 ${String(layout.label.fontSize)}px ${colors.font}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "bottom";
    ctx.fillText(
      label,
      layout.label.x + layout.label.w / 2,
      layout.label.y + layout.label.h,
    );
  }
  ctx.restore();
}
