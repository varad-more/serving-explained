# serving-explained — design

Status: **Direction B, Signal Box, chosen by the author on 2026-10-02.**
Direction A (Bench Notes) is deleted. The author's three changes to B are
applied below:
- sentence-case labels with no tracked caps
- no middle-dot separators in the nav
- every request mark keeps its glyph and pattern at every size

Audit fixes M1, M2, M3, and m1 (docs/AUDIT.md) are applied to the tokens.

## Signal Box

Railway timetables and signal boxes. The page is white with heavy black rules,
square corners, and no shadows. Each engine step is a row on a departure board:
step number, who is in the batch, and blocks free. Requests look like line
badges ("● r3"). Numbers use tabular figures and stay large. The accent is
signal yellow, used only as a bar behind the current step or row.

## Rules

- **Fonts:** system font stacks only. No web fonts, so there are no third-party
  requests (see CLAUDE.md). Self-hosting a font later needs approval.
- **What we avoid:** purple-blue gradients, glassmorphism, glowing dark heroes,
  rounded cards with soft shadows, emoji icons, bento grids, and one sans font
  for everything.
- **Labels** are in sentence case with normal letter spacing. Nothing is set in
  all caps, and no text is tracked out.
- **Request identity:** every request has a slot (1–8), a color, a pattern, a
  glyph, and an id label ("r3"). Color is never the only cue.
- **Request marks at every size:** every mark that stands for a request carries
  its slot's pattern and glyph, however small it is drawn (AUDIT.md M3).
  - Request cells in the block grids never go below about 28 px on desktop and
    40 px on mobile.
  - The smallest request mark anywhere is the 16 px timeline tab. It still
    fits a 12 px glyph.
  - The id label is added when a mark is at least 24 px wide.
  - A render test checks that every request mark has its pattern and glyph.
- **Slot assignment:** a request takes the lowest free slot when it is
  admitted, and keeps it until it leaves. A chapter widget never shows more
  than 8 running requests at once, so no two live requests share a slot. Waiting
  requests have no slot yet: they are drawn in neutral ink with their id label.
  Chapter 3's queues hold more than 8 requests, which is why slots are assigned
  at admission, not arrival.
- **More than 8 running requests** happen only in the sandbox (its decision 2).
  Above 8, the block grid colors blocks by state, not by request: used blocks
  get a solid `--ink-2` fill, and shared, cached, free, and waste blocks keep
  their states below. The selected request is outlined in `--highlight`. The
  timeline draws slots 1–8, labeled "showing 8 of N slots".
- **Request phases** (the chapter 3 timeline) are encoded with ink tones and
  patterns, never request hues, so phase and identity never collide:
  - queued: a dashed `--ink-2` outline with no fill
  - prefill: an `--ink` fill with diagonal stripes in `--surface`
  - decode: a solid `--ink-2` fill
  - finished but holding its slot (a bubble): the gray waste hatch
  - Each request's run in a lane starts with a 16 px slot tab: the slot's color,
    pattern, and glyph. A segment carries the id label when it is 28 px or
    wider.
  - Checked 2026-10-02 (WCAG 2.x): `--ink` and `--ink-2` are at least 7.51:1
    against `--surface` in both themes, and the hatch at least 3.38:1. `--ink`
    and `--ink-2` differ by only 2.05–2.23:1, so the stripes, not the tone,
    tell prefill from decode.
- **Provenance badges** use the same ink in every case and differ in shape and
  text: `simulated` has a dashed outline, `computed` a solid outline, and
  `measured` is filled and carries a link arrow.
- **KV block states:** free blocks have an outline in `--ink-2` (at least 3:1)
  and a fill near the surface color. Wasted slots use the gray hatch. Shared
  prefix blocks get a double outline. Evicted blocks get a dashed outline.
- **Prefix cache states** (chapter 4):
  - **cached:** no references, still keyed. A dotted `--ink-2` fill with its LRU
    rank (1 = next to evict).
  - **shared:** reference count ≥ 2. The double outline plus a "×n" badge,
    filled in `--ink-2`, not one owner's hue.
  - **selected chain:** the selected request's blocks get a `--highlight`
    outline and their logical index.
- **Text on the highlight** always uses `--on-highlight`. In dark mode, `--ink`
  on `--highlight` is 1.35:1. A test fails any CSS rule that sets a
  `--highlight` background without `--on-highlight` text (AUDIT.md m1).
- **Touch:** every control's hit area is at least 44 × 44 px at 375 and 768 px
  wide. Nothing is reachable by hover alone.
- **Motion:** transitions are driven by sim events. Under
  `prefers-reduced-motion`, every duration token is 0 ms.
- **Focus:** a 2px ring in `--focus` with a 2px offset in the background color,
  on every interactive element.

### Token names

```css
/* surfaces and ink */
--bg  --surface  --surface-2  --ink  --ink-2  --rule  --rule-strong
--highlight  --on-highlight  --focus
/* requests, slots 1–8 */
--req-1 … --req-8
/* KV block states */
--block-free  --block-free-edge  --block-waste  --block-shared-edge
/* provenance and callouts */
--badge-ink  --callout-simplification  --callout-reality
/* type, space, motion */
--font-body  --font-display  --font-mono
--step--2 … --step-5   --space-1 … --space-9
--dur-fast  --dur-base  --ease
```

## Type

- `--font-body` and `--font-display`: `"Helvetica Neue", Helvetica, "Nimbus Sans",
  Arial, sans-serif` (a grotesk, not system-ui)
- `--font-mono`, for code only: `ui-monospace, "SF Mono", "Cascadia Mono",
  "Roboto Mono", Menlo, Consolas, monospace`
- Numbers: `font-variant-numeric: tabular-nums` in the body font.
- Scale: ratio 1.25 on a 17px base. Body text is 17/27. Prose is at most 58ch.
  Labels are 12px.

| Token | Size | Use |
|---|---|---|
| `--step--2` | 12px | labels, badges |
| `--step--1` | 14px | captions, controls |
| `--step-0` | 17px | body |
| `--step-1` | 21px | step lead sentence |
| `--step-2` | 27px | h3, board numerals |
| `--step-3` | 33px | h2 |
| `--step-4` | 42px | chapter title, mobile |
| `--step-5` | 52px | chapter title, desktop; key figure numerals |

Headings use bold weight and -0.015em tracking. The chapter number is set huge
in the margin ("01").

## Spacing

A strict 8px grid: `--space-1` to `--space-9` = 4, 8, 16, 24, 32, 48, 64, 80,
120 px. The 4px step is only for hairline gaps between blocks.

## Palette

| Token | Light | Dark |
|---|---|---|
| `--bg` | `#fafaf7` | `#111315` board black |
| `--surface` (figure panel) | `#ffffff` | `#181b1e` |
| `--surface-2` | `#ecece6` | `#23272b` |
| `--ink` | `#111111` (18.1:1) | `#f2f2ee` (16.6:1) |
| `--ink-2` | `#4d4d4d` (8.1:1) | `#a9abad` (8.1:1) |
| `--rule` | `#d6d6d0` | `#2c2f33` |
| `--rule-strong` | `#111111` (2px) | `#e8e8e2` (2px) |
| `--highlight` | `#ffcc00` signal yellow | `#ffcc00` |
| `--on-highlight` | `#111111` (12.5:1) | `#111111` (12.5:1) |
| `--focus` | `#111111` | `#ffcc00` |
| `--block-free` | `#e9e9e3` | `#262a2e` |
| `--block-free-edge` | `#4d4d4d` | `#a9abad` |
| `--block-waste` | hatch of `#8a8a84` on `--surface` (3.47:1) | hatch of `#6a6e75` on `--surface` (3.38:1) |
| `--callout-simplification` | white band, 2px dashed top and bottom rules, bold label | dark values |
| `--callout-reality` | `--surface-2` band, 6px yellow left bar, bold label | dark values |

Contrast figures are against `--bg`, except `--on-highlight` (against
`--highlight`) and the hatch (against `--surface`). The dark hatch was `#5c6066` (2.73:1). It was lightened to pass
3:1, because the hatch is the only cue for wasted slots (AUDIT.md M2).

## Requests

Patterns are drawn in `--surface` over the color fill, so the hue still reads.
Glyphs are SVG paths, not font characters, and are drawn large inside each
mark. In print and forced-colors mode, the patterns and glyphs still carry
identity.

| Slot | Name | Light | Dark | Label ink, light | Label ink, dark | Pattern | Glyph | Badge |
|---|---|---|---|---|---|---|---|---|
| 1 | blue | `#2563c9` | `#4d8ff0` | white 5.67:1 | `#111111` 5.85:1 | solid | ● circle | `● r1` |
| 2 | red-orange | `#d1461b` | `#e2602f` | white 4.56:1 | `#111111` 5.35:1 | 45° lines | ▲ triangle | `▲ r2` |
| 3 | magenta | `#c13b8a` | `#e05ca8` | white 4.93:1 | `#111111` 5.63:1 | dots | ■ square | `■ r3` |
| 4 | amber | `#b06f00` | `#b8820c` | `#111111` 4.60:1 | `#111111` 5.61:1 | horizontal lines | ◆ diamond | `◆ r4` |
| 5 | cyan | `#0f8fb3` | `#1fa3c6` | `#111111` 5.04:1 | `#111111` 6.40:1 | 135° lines | ▼ triangle down | `▼ r5` |
| 6 | moss | `#4f7f12` | `#6e9a28` | white 4.80:1 | `#111111` 5.68:1 | crosshatch | ✚ plus | `✚ r6` |
| 7 | violet | `#7347c7` | `#9a7cf0` | white 6.08:1 | `#111111` 5.86:1 | vertical lines | ⬢ hexagon | `⬢ r7` |
| 8 | green | `#0a865d` | `#1f9e72` | white 4.58:1 | `#111111` 5.57:1 | grid | ✖ cross | `✖ r8` |

- **Id labels** sit on the solid slot color in the label ink above. The
  pattern stops at the label's box, so those ratios hold.
- **Slot 8 light** was `#0a8a5f`, where the best label reached only 4.36:1. It
  was darkened to `#0a865d` to pass 4.5:1 (AUDIT.md M1).

### How the request palettes were checked

Both palettes were run through a palette validator against `--bg`, light and
dark. The checks are: OKLCH lightness band, chroma floor, CVD (color vision
deficiency) separation between neighboring slots, the normal-vision floor, and
contrast with the background. Every check passes. The light palette was
re-run on 2026-10-02 after the slot 8 change.

All-pairs separation fails. No 8-hue palette passes it inside a usable lightness
band. Two non-neighboring requests (for example slots 4 and 6) can look alike
to a reader with deuteranopia or protanopia. That is why every request mark
carries its pattern and glyph.

Neighbor results (worst pair, OKLab ΔE ×100; the target is at least 8):

| Palette | CVD neighbors | Normal-vision neighbors | Min contrast vs. bg |
|---|---|---|---|
| light | 14.4 | 15.1 | 3.59:1 |
| dark | 14.7 | 15.8 | 5.27:1 |

## Motion

`--dur-fast` 80ms, `--dur-base` 160ms, `--ease` `steps(4, end)`. Changes snap
in short steps, like a split-flap board. Nothing glides.

## Chapter layout

Desktop, 1024px and wider. The board (figure) is wide on the left and sticky.
The steps are a numbered timetable column on the right.

```
┌──────────────────────────────────────────────────────────────────────┐
│ serving-explained ━━━━ 01 KV   02 Paged   03 Batch   04 Prefix   ◐  │
├━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┳━━━━━━━━━━━━━━━━━━━━━━┤
│ ┌──────────────────────────────────────────┐ ┃ 01                   │
│ │ Step  Batch            Free  Waiting     │ ┃ The KV cache         │
│ │ 041   ● r1 ▲ r2 ■ r3    12   ◆ r4        │ ┃                      │
│ │█042█  ● r1 ▲ r2 ■ r3    11   ◆ r4  █████ │ ┃ ██ 1 ██████████████  │
│ │ 043   …                                  │ ┃ Each new token adds  │
│ │ ┌──┬──┬──┬──┬──┬──┬──┬──┐               │ ┃ keys and values for  │
│ │ │● │● │▲ │▲ │▲ │■ │  │  │  KV blocks    │ ┃ 32 layers.           │
│ │ └──┴──┴──┴──┴──┴──┴──┴──┘  [simulated]  │ ┃                      │
│ ├──────────────────────────────────────────┤ ┃ 2                    │
│ │ ▶  ❚❚  ⏭   ━━━━━●━━━━━━━   1×            │ ┃ …                    │
│ └──────────────────────────────────────────┘ ┃ ≤ 58ch               │
│   cols 1–8, sticky: top 64px                  ┃ cols 9–12            │
└──────────────────────────────────────────────────────────────────────┘
```

Mobile, 375px. The board collapses into a compact strip, sticky at the top at
36% of the small viewport height. It holds the current step row, the block
grid, and the playback bar. The full board opens as a separate figure below
each step. If the viewport is under 560px tall, the strip stops being sticky
and each step gets a "Show in figure" button.

From 600 to 1023px wide (the 768px check), the mobile layout is used, with the
strip at full width and prose still capped at 58ch.

```
┌───────────────────────┐
│ serving-explained  ◐  │
├━━━━━━━━━━━━━━━━━━━━━━━┤
│ 042 ● ▲ ■  Free 11    │  ← sticky strip
│ ●●▲▲▲■□□              │
│ ▶ ❚❚ ⏭ ━━●━━━ 1×     │
├━━━━━━━━━━━━━━━━━━━━━━━┤
│ 01 The KV cache       │
│ ██ 1 ████████████████ │
│ Each new token adds   │
│ keys and values …     │
│ ┃ Reality check …     │
│ 2 …                   │
└───────────────────────┘
```
