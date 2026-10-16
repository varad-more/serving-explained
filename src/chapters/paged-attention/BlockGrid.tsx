import {
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type MouseEvent,
} from "react";
import { MIN_MARK, paintRequestMark } from "../../viz/ui/markSpec.ts";
import { useMediaQuery } from "../../viz/useMediaQuery.ts";
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
/**
 * Below 1024 px, DESIGN.md's mobile layout (checked at 375 and 768 px), a
 * tap selects a cell, so every cell is a touch target: at least 44 px
 * (CHAPTER_DOD item 7). The grid shows as many columns as fit at that size.
 */
const TOUCH_CELL = 44;

interface Props {
  frame: Frame | null;
  spec: GridSpec;
  /** "Contiguous" or "Paged": names the grid for screen readers. */
  label: string;
  selected: number | null;
  onSelect: (req: number | null) => void;
  /** Chapter 4: cells built from its own frames, in place of cellsOf(frame). */
  cells?: Cell[];
  /** Chapter 4: the canvas's accessible name, in place of describe(frame). */
  summary?: string;
  /** Chapter 4: blocks to outline dashed (evicted this step). */
  marked?: ReadonlySet<number>;
  /** Chapter 4: number the selected request's blocks by logical index. */
  showLogical?: boolean;
  /** Wider than 480 px, show at most this many cells, with a pager. */
  maxCells?: number;
}

interface Colors {
  surface: string;
  ink: string;
  ink2: string;
  free: string;
  freeEdge: string;
  waste: string;
  highlight: string;
  onHighlight: string;
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
    onHighlight: v("--on-highlight"),
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
  if (cell.kind === "used")
    return `${name}: r${String(cell.req)}'s logical block ${String(cell.logical)}. ${String(cell.fill)} of ${String(B)} slots hold KV.`;
  if (cell.kind === "cached")
    return `${name}: cached. No request holds it, and it keeps its key. Eviction order ${String(cell.rank)} (1 goes next).`;
  if (cell.kind === "shared")
    return `${name}: shared by ${cell.reqs.map((r, i) => `r${String(r)} (logical block ${String(cell.logical[i] ?? 0)})`).join(", ")}. ${String(B)} of ${String(B)} slots hold KV.`;
  if (spec.allocator === "paged")
    return `${name}: r${String(cell.req)}'s block table maps its logical block ${String(cell.logical)} here. ${String(cell.fill)} of ${String(B)} slots hold KV.`;
  const from = cell.logical * B;
  return `${name}: r${String(cell.req)}'s region, its slots ${String(from)}–${String(from + B - 1)}. ${String(cell.fill)} of ${String(B)} hold KV.`;
}

/** The selected request's logical index for this cell, or null. */
function chainIndex(c: Cell | undefined, selected: number | null) {
  if (selected === null || !c) return null;
  if (c.kind === "held" || c.kind === "used")
    return c.req === selected ? c.logical : null;
  if (c.kind === "shared") {
    const i = c.reqs.indexOf(selected);
    return i >= 0 ? (c.logical[i] ?? null) : null;
  }
  return null;
}

/**
 * Figure 2's block grid on a canvas (tasks/todo.md, Prompt 4, "BlockGrid"):
 * one cell per block of B slots, for both allocators. It is one tab stop:
 * arrows move a cell cursor, and Enter selects the cell's request.
 */
export function BlockGrid({
  frame,
  spec,
  label,
  selected,
  onSelect,
  cells: given,
  summary,
  marked,
  showLogical = false,
  maxCells = Infinity,
}: Props) {
  const [wrapRef, width] = useWidth<HTMLDivElement>(600);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sprites = useRef(new Map<string, HTMLCanvasElement>());
  const colorsRef = useRef<Colors | null>(null);
  /** What each visible cell last showed, so a frame repaints only changes. */
  const painted = useRef({ layout: "", cells: [] as string[] });
  const themeKey = useThemeKey();
  const [cursorState, setCursor] = useState(0);
  const [focused, setFocused] = useState(false);
  const [windowStart, setWindowStart] = useState(0);
  const liveId = useId();

  const B = spec.blockSize;
  const cells = given ?? cellsOf(frame, spec);
  const n = cells.length;
  const desktop = useMediaQuery("(min-width: 1024px)");
  const narrow = width < NARROW_BELOW;
  const gap = narrow ? 2 : 4;
  const cols = desktop
    ? narrow
      ? COLS_NARROW
      : COLS_WIDE
    : Math.max(
        1,
        Math.min(COLS_WIDE, Math.floor((width + gap) / (TOUCH_CELL + gap))),
      );
  const fit = Math.floor((width - gap * (cols - 1)) / cols);
  const cell = desktop ? Math.min(MAX_CELL + (narrow ? 16 : 0), fit) : fit;
  // Whole rows of cells, at most WINDOW of them (maxCells when wider).
  const most = narrow ? WINDOW : maxCells;
  const visible = Math.min(Math.max(cols, Math.floor(most / cols) * cols), n);
  const start = Math.min(windowStart, n - visible);
  // A new block size can shrink the grid under the cursor.
  const cursor = Math.min(cursorState, n - 1);
  const rows = Math.ceil(visible / cols);
  const gridW = cols * cell + (cols - 1) * gap;
  const gridH = rows * cell + (rows - 1) * gap;

  useLayoutEffect(() => {
    sprites.current.clear();
    colorsRef.current = null;
  }, [themeKey, cell]);

  useLayoutEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx || cell <= 0) return;
    const dpr = window.devicePixelRatio || 1;
    // Resizing reallocates the canvas, so only do it when the size changes.
    const w = Math.round(gridW * dpr);
    const h = Math.round(gridH * dpr);
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    colorsRef.current ??= readColors(canvas);
    const colors = colorsRef.current;
    const layout = [w, h, cell, cols, gap, start, visible, themeKey].join(":");
    const full = painted.current.layout !== layout;
    if (full) ctx.clearRect(0, 0, gridW, gridH);
    const before = full ? [] : painted.current.cells;
    const shown: string[] = [];

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

    // The waste hatch, drawn once per cell size and then copied.
    const hatch = (x: number, y: number) => {
      const size = cell;
      const key = `hatch:${String(size)}`;
      let s = sprites.current.get(key);
      if (!s) {
        s = document.createElement("canvas");
        s.width = Math.round(size * dpr);
        s.height = Math.round(size * dpr);
        const sc = s.getContext("2d");
        if (sc) {
          sc.scale(dpr, dpr);
          sc.fillStyle = colors.surface;
          sc.fillRect(0, 0, size, size);
          sc.strokeStyle = colors.waste;
          sc.lineWidth = 1.5;
          sc.beginPath();
          for (let d = -size; d < size; d += 5) {
            sc.moveTo(d, size);
            sc.lineTo(d + size, 0);
          }
          sc.stroke();
        }
        sprites.current.set(key, s);
      }
      ctx.drawImage(s, x, y, size, size);
    };

    // The cached dots, drawn once per cell size and then copied.
    const dots = (x: number, y: number) => {
      const size = cell;
      const key = `dots:${String(size)}`;
      let s = sprites.current.get(key);
      if (!s) {
        s = document.createElement("canvas");
        s.width = Math.round(size * dpr);
        s.height = Math.round(size * dpr);
        const sc = s.getContext("2d");
        if (sc) {
          sc.scale(dpr, dpr);
          sc.fillStyle = colors.surface;
          sc.fillRect(0, 0, size, size);
          sc.fillStyle = colors.ink2;
          for (let dy = 2.5; dy < size; dy += 4)
            for (let dx = 2.5; dx < size; dx += 4) {
              sc.beginPath();
              sc.arc(dx, dy, 1, 0, 2 * Math.PI);
              sc.fill();
            }
          sc.strokeStyle = colors.ink2;
          sc.lineWidth = 1;
          sc.strokeRect(0.5, 0.5, size - 1, size - 1);
        }
        sprites.current.set(key, s);
      }
      ctx.drawImage(s, x, y, size, size);
    };

    let gapLabelled = false;
    for (let k = 0; k < visible; k++) {
      const i = start + k;
      const c = cells[i];
      const x = (k % cols) * (cell + gap);
      const y = Math.floor(k / cols) * (cell + gap);
      const labelGap = c?.kind === "gap" && !gapLabelled;
      gapLabelled = c?.kind === "gap";
      const chain = chainIndex(c, selected);
      const sig = [
        c?.kind === "held"
          ? `${String(c.slot)}.${String(c.req)}.${String(c.fill)}`
          : c?.kind === "shared"
            ? `shared.${String(c.reqs.length)}`
            : c?.kind === "cached"
              ? `cached.${String(c.rank)}`
              : c?.kind === "used"
                ? `used.${String(c.fill)}`
                : (c?.kind ?? "free"),
        labelGap,
        chain,
        marked?.has(i) ?? false,
        focused && i === cursor,
      ].join(":");
      shown.push(sig);
      if (before[k] === sig) continue;
      // The cursor ring reaches into the gap around a cell; clear that too.
      ctx.clearRect(x - gap, y - gap, cell + 2 * gap, cell + 2 * gap);
      if (!c || c.kind === "free") {
        ctx.fillStyle = colors.free;
        ctx.fillRect(x, y, cell, cell);
        ctx.strokeStyle = colors.freeEdge;
        ctx.lineWidth = 1;
        ctx.strokeRect(x + 0.5, y + 0.5, cell - 1, cell - 1);
      } else if (c.kind === "shared") {
        // Shared: --ink-2 fill, a double outline, and "×n" (DESIGN.md).
        ctx.fillStyle = colors.ink2;
        ctx.fillRect(x, y, cell, cell);
        ctx.strokeStyle = colors.ink;
        ctx.lineWidth = 1.5;
        ctx.strokeRect(x + 0.75, y + 0.75, cell - 1.5, cell - 1.5);
        ctx.strokeStyle = colors.surface;
        ctx.strokeRect(x + 3.75, y + 3.75, cell - 7.5, cell - 7.5);
        ctx.fillStyle = colors.surface;
        ctx.font = `700 11px ${colors.font}`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        // Above the chain number's tab when this block is in the selected chain.
        const badgeY = chain !== null && showLogical ? y + 9 : y + cell / 2;
        ctx.fillText(`×${String(c.reqs.length)}`, x + cell / 2, badgeY);
      } else if (c.kind === "used") {
        // Held, by state: solid --ink-2; the empty part of the newest block
        // keeps the waste hatch.
        if (c.fill < B) hatch(x, y);
        ctx.fillStyle = colors.ink2;
        const share = c.fill / B;
        ctx.fillRect(x, y + cell * (1 - share), cell, cell * share);
        ctx.strokeStyle = colors.ink2;
        ctx.lineWidth = 1;
        ctx.strokeRect(x + 0.5, y + 0.5, cell - 1, cell - 1);
      } else if (c.kind === "cached") {
        // Cached: a dotted --ink-2 fill and its eviction order (DESIGN.md).
        dots(x, y);
        ctx.fillStyle = colors.surface;
        const plate = Math.min(cell - 6, 18);
        ctx.fillRect(x + (cell - plate) / 2, y + (cell - 14) / 2, plate, 14);
        ctx.fillStyle = colors.ink;
        ctx.font = `700 11px ${colors.font}`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(String(c.rank), x + cell / 2, y + cell / 2);
      } else if (c.kind === "gap") {
        ctx.fillStyle = colors.surface;
        ctx.fillRect(x, y, cell, cell);
        ctx.strokeStyle = colors.freeEdge;
        ctx.lineWidth = 1.5;
        ctx.setLineDash([2, 3]);
        ctx.strokeRect(x + 1, y + 1, cell - 2, cell - 2);
        ctx.setLineDash([]);
        if (labelGap) {
          ctx.fillStyle = colors.ink2;
          ctx.font = `11px ${colors.font}`;
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillText("gap", x + cell / 2, y + cell / 2);
        }
      } else {
        if (c.fill === B) {
          ctx.drawImage(sprite(c.slot, c.req, cell, true), x, y, cell, cell);
        } else {
          // Empty slots in the gray hatch; the KV that is there rises from
          // the bottom; a corner mark and the slot's border keep identity.
          hatch(x, y);
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
      if (chain !== null) {
        ctx.strokeStyle = colors.highlight;
        ctx.lineWidth = 3;
        ctx.strokeRect(x + 1.5, y + 1.5, cell - 3, cell - 3);
        // An ink corner flag: yellow is never the only cue (AUDIT.md A4).
        ctx.beginPath();
        ctx.moveTo(x, y + cell);
        ctx.lineTo(x, y + cell - 9);
        ctx.lineTo(x + 9, y + cell);
        ctx.closePath();
        ctx.fillStyle = colors.ink;
        ctx.fill();
        ctx.strokeStyle = colors.surface;
        ctx.lineWidth = 1;
        ctx.stroke();
        if (showLogical) {
          // The logical index on a highlight tab, in --on-highlight.
          const label = String(chain);
          ctx.font = `700 10px ${colors.font}`;
          const w = Math.ceil(ctx.measureText(label).width) + 6;
          ctx.fillStyle = colors.highlight;
          ctx.fillRect(x + cell - w, y + cell - 13, w, 13);
          ctx.fillStyle = colors.onHighlight;
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillText(label, x + cell - w / 2, y + cell - 6.5);
        }
      }
      if (marked?.has(i)) {
        ctx.strokeStyle = colors.ink;
        ctx.lineWidth = 2;
        ctx.setLineDash([3, 2]);
        ctx.strokeRect(x + 1, y + 1, cell - 2, cell - 2);
        ctx.setLineDash([]);
      }
    }
    // Last, so a neighbor's repaint never clears part of the ring.
    if (focused && cursor >= start && cursor < start + visible) {
      const k = cursor - start;
      const x = (k % cols) * (cell + gap);
      const y = Math.floor(k / cols) * (cell + gap);
      ctx.strokeStyle = colors.focus;
      ctx.lineWidth = 2;
      ctx.setLineDash([4, 2]);
      ctx.strokeRect(x - 1, y - 1, cell + 2, cell + 2);
      ctx.setLineDash([]);
    }
    painted.current = { layout, cells: shown };
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
    marked,
    showLogical,
  ]);

  const moveTo = (i: number) => {
    const next = Math.max(0, Math.min(n - 1, i));
    setCursor(next);
    // When the grid is windowed, show the page of blocks that holds the cursor.
    if (visible < n && (next < start || next >= start + visible)) {
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
          aria-label={summary ?? describe(frame, spec)}
          data-cols={cols}
          onClick={onClick}
        />
      </div>
      <p className="visually-hidden" id={liveId} aria-live="polite">
        {focused ? cellText(cells[cursor], cursor, spec) : ""}
      </p>
      {n > visible && (
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

/** CLAUDE.md's SVG budget: a larger pool's strip is drawn in runs or bins. */
const MAX_RECTS = 2000;

/**
 * The strip is too thin for a glyph, so it never shows which request holds
 * a block: color alone would carry it (CLAUDE.md; AUDIT.md C2-2). The grid
 * above it does.
 */
const summaryClass = (c: Cell) =>
  c.kind === "held"
    ? c.fill > 0
      ? "summary--held"
      : "summary--waste"
    : c.kind === "gap"
      ? "summary--gap"
      : c.kind === "shared" || c.kind === "used"
        ? "summary--shared"
        : c.kind === "cached"
          ? "summary--cached"
          : "summary--free";

/**
 * The strip's rects: one per block up to MAX_RECTS blocks. Beyond, runs of
 * equal blocks; and when even the runs are too many, bins of blocks, each
 * drawn as its most common kind.
 */
export function summaryRects(cells: Cell[]) {
  const rects: { x: number; w: number; cls: string }[] = [];
  if (cells.length <= MAX_RECTS) {
    cells.forEach((c, i) => rects.push({ x: i, w: 1, cls: summaryClass(c) }));
    return rects;
  }
  const add = (x: number, w: number, cls: string) => {
    const last = rects.at(-1);
    if (last?.cls === cls) last.w += w;
    else rects.push({ x, w, cls });
  };
  const classes = cells.map(summaryClass);
  classes.forEach((cls, i) => {
    add(i, 1, cls);
  });
  if (rects.length <= MAX_RECTS) return rects;
  rects.length = 0;
  const size = Math.ceil(cells.length / (MAX_RECTS / 2));
  for (let b = 0; b < classes.length; b += size) {
    const count = new Map<string, number>();
    for (const cls of classes.slice(b, b + size))
      count.set(cls, (count.get(cls) ?? 0) + 1);
    const [mode] = [...count].reduce((a, x) => (x[1] > a[1] ? x : a));
    add(b, Math.min(size, classes.length - b), mode);
  }
  return rects;
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
  const rects = useMemo(() => summaryRects(cells), [cells]);
  return (
    <svg
      className="block-grid__summary"
      viewBox={`0 0 ${String(n)} 12`}
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      {rects.map((r) => (
        <rect
          key={r.x}
          x={r.x}
          // Cached blocks are half height, so shape tells them from shared.
          y={r.cls === "summary--cached" ? 6 : 2}
          width={r.w}
          height={r.cls === "summary--cached" ? 4 : 8}
          className={r.cls}
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
