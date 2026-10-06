import {
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type MouseEvent,
} from "react";
import { MIN_MARK, paintRequestMark } from "../../viz/ui/markSpec.ts";
import { useThemeKey } from "../../viz/useThemeKey.ts";
import { useWidth } from "../../viz/useWidth.ts";
import { cellsOf, describe, type Cell, type GridSpec } from "./cells.ts";
import type { Frame } from "./frames.ts";

/** Desktop: 16 columns (one row is 256 tokens at B 16), cells of 28 px. */
const COLS_WIDE = 16;
/** Mobile: 8 columns, cells about 40 px, at most 48 cells in view. */
const COLS_NARROW = 8;
const NARROW_BELOW = 480;
const WINDOW = 48;
const MAX_CELL = 28;

interface Props {
  frame: Frame | null;
  spec: GridSpec;
  /** "Contiguous" or "Paged": names the grid for screen readers. */
  label: string;
  selected: number | null;
  onSelect: (req: number | null) => void;
}

interface Colors {
  surface: string;
  ink: string;
  ink2: string;
  free: string;
  freeEdge: string;
  waste: string;
  highlight: string;
  focus: string;
  font: string;
  req: { fill: string; ink: string }[];
}

function readColors(el: Element): Colors {
  const css = getComputedStyle(el);
  const v = (name: string) => css.getPropertyValue(name).trim();
  return {
    surface: v("--surface"),
    ink: v("--ink"),
    ink2: v("--ink-2"),
    free: v("--block-free"),
    freeEdge: v("--block-free-edge"),
    waste: v("--block-waste"),
    highlight: v("--highlight"),
    focus: v("--focus"),
    font: v("--font-body"),
    req: Array.from({ length: 8 }, (_, i) => ({
      fill: v(`--req-${String(i + 1)}`),
      ink: v(`--req-${String(i + 1)}-label`),
    })),
  };
}

/** Plain words for one cell, for the live region and the cursor. */
export function cellText(
  cell: Cell | undefined,
  index: number,
  spec: GridSpec,
): string {
  const B = spec.blockSize;
  // Contiguous memory has no blocks: name the cell by its slots.
  const name =
    spec.allocator === "paged"
      ? `Block ${String(index)}`
      : `Slots ${String(index * B)}–${String(index * B + B - 1)}`;
  if (!cell) return name;
  if (cell.kind === "free") return `${name}: free.`;
  if (cell.kind === "gap")
    return `${name}: gap, free space too small for a region.`;
  if (spec.allocator === "paged")
    return `${name}: r${String(cell.req)}, logical block ${String(cell.logical)}, ${String(cell.fill)} of ${String(B)} slots hold KV.`;
  return `${name}: in r${String(cell.req)}'s region, ${String(cell.fill)} of ${String(B)} hold KV.`;
}

/**
 * Figure 2's block grid on a canvas (tasks/todo.md, Prompt 4, "BlockGrid"):
 * one cell per block of B slots, for both allocators. It is one tab stop:
 * arrows move a cell cursor, and Enter selects the cell's request.
 */
export function BlockGrid({ frame, spec, label, selected, onSelect }: Props) {
  const [wrapRef, width] = useWidth<HTMLDivElement>(600);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sprites = useRef(new Map<string, HTMLCanvasElement>());
  const themeKey = useThemeKey();
  const [cursorState, setCursor] = useState(0);
  const [focused, setFocused] = useState(false);
  const [windowStart, setWindowStart] = useState(0);
  const liveId = useId();

  const B = spec.blockSize;
  const cells = cellsOf(frame, spec);
  const n = cells.length;
  const narrow = width < NARROW_BELOW;
  const cols = narrow ? COLS_NARROW : COLS_WIDE;
  const gap = narrow ? 2 : 4;
  const cell = Math.min(
    MAX_CELL + (narrow ? 16 : 0),
    Math.floor((width - gap * (cols - 1)) / cols),
  );
  const visible = narrow ? Math.min(WINDOW, n) : n;
  const start = narrow ? Math.min(windowStart, n - visible) : 0;
  // A new block size can shrink the grid under the cursor.
  const cursor = Math.min(cursorState, n - 1);
  const rows = Math.ceil(visible / cols);
  const gridW = cols * cell + (cols - 1) * gap;
  const gridH = rows * cell + (rows - 1) * gap;

  useLayoutEffect(() => {
    sprites.current.clear();
  }, [themeKey, cell]);

  useLayoutEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx || cell <= 0) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(gridW * dpr);
    canvas.height = Math.round(gridH * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const colors = readColors(canvas);
    ctx.clearRect(0, 0, gridW, gridH);

    const sprite = (
      slot: number,
      req: number,
      size: number,
      labeled: boolean,
    ) => {
      const key = `${String(slot)}:${String(req)}:${String(size)}:${String(labeled)}`;
      let s = sprites.current.get(key);
      if (!s) {
        s = document.createElement("canvas");
        s.width = Math.round(size * dpr);
        s.height = Math.round(size * dpr);
        const sc = s.getContext("2d");
        const c = colors.req[slot - 1];
        if (sc && c) {
          sc.scale(dpr, dpr);
          paintRequestMark(
            sc,
            slot,
            0,
            0,
            size,
            {
              fill: c.fill,
              ink: c.ink,
              pattern: colors.surface,
              font: colors.font,
            },
            labeled ? `r${String(req)}` : undefined,
          );
        }
        sprites.current.set(key, s);
      }
      return s;
    };

    const hatch = (x: number, y: number, w: number, h: number) => {
      ctx.save();
      ctx.beginPath();
      ctx.rect(x, y, w, h);
      ctx.clip();
      ctx.fillStyle = colors.surface;
      ctx.fillRect(x, y, w, h);
      ctx.strokeStyle = colors.waste;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      for (let d = -h; d < w; d += 5) {
        ctx.moveTo(x + d, y + h);
        ctx.lineTo(x + d + h, y);
      }
      ctx.stroke();
      ctx.restore();
    };

    let gapLabelled = false;
    for (let k = 0; k < visible; k++) {
      const i = start + k;
      const c = cells[i];
      const x = (k % cols) * (cell + gap);
      const y = Math.floor(k / cols) * (cell + gap);
      if (!c || c.kind === "free") {
        ctx.fillStyle = colors.free;
        ctx.fillRect(x, y, cell, cell);
        ctx.strokeStyle = colors.freeEdge;
        ctx.lineWidth = 1;
        ctx.strokeRect(x + 0.5, y + 0.5, cell - 1, cell - 1);
        gapLabelled = false;
      } else if (c.kind === "gap") {
        ctx.fillStyle = colors.surface;
        ctx.fillRect(x, y, cell, cell);
        ctx.strokeStyle = colors.freeEdge;
        ctx.lineWidth = 1.5;
        ctx.setLineDash([2, 3]);
        ctx.strokeRect(x + 1, y + 1, cell - 2, cell - 2);
        ctx.setLineDash([]);
        if (!gapLabelled) {
          ctx.fillStyle = colors.ink2;
          ctx.font = `11px ${colors.font}`;
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillText("gap", x + cell / 2, y + cell / 2);
          gapLabelled = true;
        }
      } else {
        gapLabelled = false;
        if (c.fill === B) {
          ctx.drawImage(sprite(c.slot, c.req, cell, true), x, y, cell, cell);
        } else {
          // Empty slots in the gray hatch; the KV that is there rises from
          // the bottom; a corner mark and the slot's border keep identity.
          hatch(x, y, cell, cell);
          if (c.fill > 0) {
            const s = sprite(c.slot, c.req, cell, true);
            const share = c.fill / B;
            ctx.drawImage(
              s,
              0,
              s.height * (1 - share),
              s.width,
              s.height * share,
              x,
              y + cell * (1 - share),
              cell,
              cell * share,
            );
          }
          const fill = colors.req[c.slot - 1]?.fill ?? colors.ink;
          ctx.strokeStyle = fill;
          ctx.lineWidth = 2;
          ctx.strokeRect(x + 1, y + 1, cell - 2, cell - 2);
          const mini = Math.max(MIN_MARK, Math.round(cell * 0.45));
          ctx.drawImage(
            sprite(c.slot, c.req, mini, false),
            x + 2,
            y + 2,
            mini,
            mini,
          );
        }
      }
      if (c?.kind === "held" && c.req === selected) {
        ctx.strokeStyle = colors.highlight;
        ctx.lineWidth = 3;
        ctx.strokeRect(x + 1.5, y + 1.5, cell - 3, cell - 3);
      }
      if (focused && i === cursor) {
        ctx.strokeStyle = colors.focus;
        ctx.lineWidth = 2;
        ctx.setLineDash([4, 2]);
        ctx.strokeRect(x - 1, y - 1, cell + 2, cell + 2);
        ctx.setLineDash([]);
      }
    }
  }, [
    cells,
    cell,
    cols,
    gap,
    gridW,
    gridH,
    start,
    visible,
    selected,
    cursor,
    focused,
    themeKey,
    B,
  ]);

  const moveTo = (i: number) => {
    const next = Math.max(0, Math.min(n - 1, i));
    setCursor(next);
    // On mobile, show the page of blocks that holds the cursor.
    if (narrow && (next < start || next >= start + visible)) {
      setWindowStart(
        Math.min(n - visible, Math.floor(next / visible) * visible),
      );
    }
  };

  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const moves: Record<string, number> = {
      ArrowLeft: cursor - 1,
      ArrowRight: cursor + 1,
      ArrowUp: cursor - cols,
      ArrowDown: cursor + cols,
      Home: 0,
      End: n - 1,
    };
    const to = moves[e.key];
    if (to !== undefined) {
      moveTo(to);
      e.preventDefault();
    } else if (e.key === "Enter" || e.key === " ") {
      const c = cells[cursor];
      onSelect(c?.kind === "held" ? c.req : null);
      e.preventDefault();
    }
  };

  const onClick = (e: MouseEvent<HTMLCanvasElement>) => {
    const box = e.currentTarget.getBoundingClientRect();
    const col = Math.floor((e.clientX - box.left) / (cell + gap));
    const row = Math.floor((e.clientY - box.top) / (cell + gap));
    if (col < 0 || col >= cols || row < 0) return;
    const i = start + row * cols + col;
    if (i >= start + visible) return;
    setCursor(i);
    const c = cells[i];
    onSelect(c?.kind === "held" ? c.req : null);
  };

  const pageBy = (dir: 1 | -1) => {
    const next = Math.max(0, Math.min(n - visible, start + dir * visible));
    setWindowStart(next);
    setCursor(next);
  };

  return (
    <div className="block-grid" ref={wrapRef}>
      <div
        className="block-grid__focus"
        tabIndex={0}
        role="group"
        aria-label={`${label} memory grid. Arrow keys move between cells; Enter selects the cell's request.`}
        aria-describedby={liveId}
        onKeyDown={onKey}
        onFocus={() => {
          setFocused(true);
        }}
        onBlur={() => {
          setFocused(false);
        }}
      >
        <canvas
          ref={canvasRef}
          className="block-grid__canvas"
          style={{ width: gridW, height: gridH }}
          role="img"
          aria-label={describe(frame, spec)}
          onClick={onClick}
        />
      </div>
      <p className="visually-hidden" id={liveId} aria-live="polite">
        {focused ? cellText(cells[cursor], cursor, spec) : ""}
      </p>
      {narrow && n > visible && (
        <div className="block-grid__window">
          <Summary cells={cells} start={start} visible={visible} />
          <div className="block-grid__pager">
            <button
              type="button"
              className="button"
              disabled={start === 0}
              onClick={() => {
                pageBy(-1);
              }}
            >
              Previous blocks
            </button>
            <button
              type="button"
              className="button"
              disabled={start + visible >= n}
              onClick={() => {
                pageBy(1);
              }}
            >
              Next blocks
            </button>
          </div>
          <p className="block-grid__range num">
            Blocks {start}–{start + visible - 1} of {n}
          </p>
        </div>
      )}
    </div>
  );
}

/** Mobile: an 8 px strip of every block, with a bracket on the visible window. */
function Summary({
  cells,
  start,
  visible,
}: {
  cells: Cell[];
  start: number;
  visible: number;
}) {
  const n = cells.length;
  return (
    <svg
      className="block-grid__summary"
      viewBox={`0 0 ${String(n)} 12`}
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      {cells.map((c, i) => (
        <rect
          key={i}
          x={i}
          y={2}
          width={1}
          height={8}
          className={
            c.kind === "held"
              ? c.fill > 0
                ? `summary--held summary--slot-${String(c.slot)}`
                : "summary--waste"
              : c.kind === "gap"
                ? "summary--gap"
                : "summary--free"
          }
        />
      ))}
      <rect
        className="summary__window"
        x={start}
        y={0.5}
        width={visible}
        height={11}
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}
