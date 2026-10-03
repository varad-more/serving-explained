/**
 * DESIGN.md and AUDIT.md M3: every request mark carries its slot's pattern
 * and glyph at every size. Both renderers are checked: the SVG component and
 * the Canvas painter.
 */
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { RequestMark } from "../../src/viz/ui/RequestMark.tsx";
import {
  GLYPHS,
  MIN_MARK,
  paintRequestMark,
  patternGeometry,
  SLOTS,
  type CanvasLike,
} from "../../src/viz/ui/markSpec.ts";

const SIZES = [MIN_MARK, 20, 24, 28, 40, 64];

describe("the slot spec", () => {
  it("gives every slot its own pattern and glyph", () => {
    expect(new Set(SLOTS.map((s) => s.pattern)).size).toBe(8);
    expect(new Set(SLOTS.map((s) => s.glyph)).size).toBe(8);
  });

  it("draws strokes or dots for every pattern but solid, at every size", () => {
    for (const s of SLOTS) {
      for (const size of SIZES) {
        const g = patternGeometry(s.pattern, size);
        const marks = g.lines.length + g.dots.length;
        if (s.pattern === "solid") expect(marks).toBe(0);
        else
          expect(marks, `${s.pattern} at ${String(size)}`).toBeGreaterThan(1);
      }
    }
  });
});

describe("SVG RequestMark", () => {
  it("draws the slot's pattern and glyph at every size, and the label from 24 px", () => {
    for (const s of SLOTS) {
      for (const size of SIZES) {
        const html = renderToStaticMarkup(
          <RequestMark
            slot={s.slot}
            size={size}
            label={`r${String(s.slot)}`}
          />,
        );
        expect(html).toContain(`data-pattern="${s.pattern}"`);
        expect(html).toContain(`data-glyph="${s.glyph}"`);
        const strokes =
          (html.match(/<line /g) ?? []).length +
          (html.match(/<circle [^>]*r="1"/g) ?? []).length;
        if (s.pattern !== "solid")
          expect(strokes, `${s.pattern} at ${String(size)}`).toBeGreaterThan(1);
        expect(html).toMatch(/class="request-mark__glyph"/);
        expect(html.includes(`>r${String(s.slot)}</text>`)).toBe(size >= 24);
      }
    }
  });

  it("never draws below the minimum size", () => {
    expect(renderToStaticMarkup(<RequestMark slot={1} size={4} />)).toContain(
      `width="${String(MIN_MARK)}"`,
    );
  });
});

/** Records calls, so the painter can be checked without a browser. */
function recorder(): CanvasLike & { calls: string[]; fills: string[] } {
  const calls: string[] = [];
  const fills: string[] = [];
  const ctx = {
    calls,
    fills,
    fillStyle: "",
    strokeStyle: "",
    lineWidth: 1,
    font: "",
    textAlign: "start",
    textBaseline: "alphabetic",
  } as unknown as CanvasLike & { calls: string[]; fills: string[] };
  for (const name of [
    "save",
    "restore",
    "translate",
    "beginPath",
    "closePath",
    "moveTo",
    "lineTo",
    "arc",
    "stroke",
    "fillRect",
    "fillText",
  ]) {
    (ctx as unknown as Record<string, unknown>)[name] = () => calls.push(name);
  }
  ctx.fill = () => {
    calls.push("fill");
    fills.push(ctx.fillStyle as string);
  };
  return ctx;
}

describe("Canvas paintRequestMark", () => {
  const colors = {
    fill: "#fill",
    ink: "#ink",
    pattern: "#pattern",
    font: "sans-serif",
  };

  it("draws the slot's pattern and glyph at every size, and the label from 24 px", () => {
    for (const s of SLOTS) {
      for (const size of SIZES) {
        const ctx = recorder();
        paintRequestMark(ctx, s.slot, 0, 0, size, colors, `r${String(s.slot)}`);
        const g = patternGeometry(s.pattern, size);
        if (g.lines.length > 0) expect(ctx.calls).toContain("stroke");
        expect(
          ctx.calls.filter((c) => c === "arc").length,
        ).toBeGreaterThanOrEqual(g.dots.length);
        // The glyph is the last fill in the label ink.
        expect(ctx.fills.at(-1)).toBe("#ink");
        const shape = GLYPHS[s.glyph];
        if (shape.kind === "poly") {
          expect(
            ctx.calls.filter((c) => c === "lineTo").length,
          ).toBeGreaterThanOrEqual(shape.points.length - 1);
        }
        expect(ctx.calls.includes("fillText")).toBe(size >= 24);
      }
    }
  });
});
