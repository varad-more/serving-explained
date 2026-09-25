# serving-explained — design

Status: **two directions proposed, none chosen.** The author picks A or B. The
other one is then deleted from this file.

Both directions share the same token names, component list, and rules. Only the
values and the look differ, so code never depends on which one wins.

## Shared rules

- **Fonts:** system font stacks only. No web fonts, so there are no third-party
  requests (see CLAUDE.md). Self-hosting a font later needs approval.
- **What we avoid:** purple-blue gradients, glassmorphism, glowing dark heroes,
  rounded cards with soft shadows, emoji icons, bento grids, and one sans font
  for everything.
- **Request identity:** every request has a slot (1–8), a color, a glyph, and an
  id label ("r3"). Color is never the only cue.
- **Slot assignment:** a request takes the lowest free slot when it is
  admitted, and keeps it until it leaves. A widget never shows more than 8
  running requests at once, so no two live requests share a slot. Waiting
  requests have no slot yet: they are drawn in neutral ink with their id label.
  (Changed for chapter 3, whose queues hold more than 8 requests; pending
  approval.)
- **Request phases** (the chapter 3 timeline) are encoded with ink tones and
  patterns, never request hues, so phase and identity never collide:
  - queued: a dashed `--ink-2` outline with no fill
  - prefill: a `--ink` fill with diagonal stripes
  - decode: a solid `--ink-2` fill
  - finished but holding its slot (a bubble): the gray waste hatch
  - A 4 px tab in the slot's color and glyph starts each segment, and the
    segment carries the id label. Contrast is checked with the palette
    validator once a direction is chosen.
- **Provenance badges** use the same ink in every case and differ in shape and
  text: `simulated` has a dashed outline, `computed` a solid outline, and
  `measured` is filled and carries a link arrow.
- **KV block states:** free blocks have an outline in `--ink-2` (at least 3:1)
  and a fill near the surface color. Wasted slots use a gray hatch. Shared
  prefix blocks get a double outline. Evicted blocks get a dashed outline.
- **Motion:** transitions are driven by sim events. Under
  `prefers-reduced-motion`, every duration token is 0 ms.
- **Focus:** a 2px ink ring with a 2px offset in the background color, on every
  interactive element.

### Shared token names

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

### How the request palettes were checked

Both palettes were run through a palette validator, light and dark, against
each direction's background. The checks are: OKLCH lightness band, chroma floor,
CVD (color vision deficiency) separation between neighboring slots, the
normal-vision floor, and contrast with the background. Every check passes.

All-pairs separation fails. No 8-hue palette passes it inside a usable lightness
band. Two non-neighboring requests (for example slots 4 and 6) can look alike
to a reader with deuteranopia or protanopia. That is why glyphs and patterns
are required, not optional.

Neighbor results (worst pair, OKLab ΔE ×100; the target is at least 8):

| Palette | CVD neighbors | Normal-vision neighbors | Min contrast vs. bg |
|---|---|---|---|
| A light | 13.5 | 19.7 | 3.45:1 |
| A dark | 14.1 | 22.1 | 4.39:1 |
| B light | 14.4 | 15.1 | 3.59:1 |
| B dark | 14.7 | 15.8 | 5.27:1 |

---

## Direction A — Bench Notes

An engineer's notebook crossed with a printed technical manual. The page is warm
paper, the ink is graphite, and figures look like annotated drawings: hairlines,
dimension arrows ("← 16 tokens →"), hatching for waste, and a faint dot grid.
The prose is set in a serif. Labels and numbers are set in a monospace font.
The accent is a yellow highlighter wash on the active step.

### Type

- `--font-body` and `--font-display`: `Charter, "Bitstream Charter", "Sitka Text",
  Cambria, Georgia, serif`
- `--font-mono`: `ui-monospace, "SF Mono", "Cascadia Mono", "Roboto Mono", Menlo,
  Consolas, monospace`
- Scale: ratio 1.2 on an 18px base. Body text is 18/30. Prose is at most 62ch.

| Token | Size | Use |
|---|---|---|
| `--step--2` | 13px | badge text, axis ticks (mono) |
| `--step--1` | 15px | captions, sidenotes, controls |
| `--step-0` | 18px | body |
| `--step-1` | 22px | step lead sentence |
| `--step-2` | 26px | h3 |
| `--step-3` | 31px | h2 |
| `--step-4` | 37px | chapter title, mobile |
| `--step-5` | 45px | chapter title, desktop |

Headings use semibold weight and -0.01em tracking. Figure numbers use tabular
figures in the mono font.

### Spacing

A 4px base: `--space-1` to `--space-9` = 4, 8, 12, 16, 24, 32, 48, 64, 96 px.

### Palette

| Token | Light | Dark |
|---|---|---|
| `--bg` | `#f4efe6` paper | `#1b1a17` warm charcoal |
| `--surface` (figure panel) | `#fbf8f2` | `#22211e` |
| `--surface-2` | `#ece5d8` | `#2a2825` |
| `--ink` | `#1d1b18` (15.0:1) | `#ece6da` (14.0:1) |
| `--ink-2` | `#5a554c` (6.5:1) | `#b3ab9c` (7.6:1) |
| `--rule` | `#d3cabb` | `#3d3a33` |
| `--rule-strong` | `#1d1b18` | `#ece6da` |
| `--highlight` | `#f3dc6b` highlighter | `#5c4c12` |
| `--on-highlight` | `#1d1b18` (12.5:1) | `#ece6da` (6.8:1) |
| `--focus` | `#1d1b18` | `#ece6da` |
| `--block-free` | `#e6dfd1` | `#2f2d29` |
| `--block-free-edge` | `#5a554c` | `#b3ab9c` |
| `--block-waste` | hatch of `#8c8576` on `--surface` | hatch of `#6b665c` |
| `--callout-simplification` | `#ece5d8` with a dashed ink left rule | `#2a2825` |
| `--callout-reality` | `--surface` with a solid 3px ink left rule | same, dark values |

Contrast figures are against `--bg`.

### Requests (A)

Patterns are drawn in `--surface` over the color fill, so the hue still reads.
Glyphs are SVG paths, not font characters.

| Slot | Name | Light | Dark | Pattern | Glyph |
|---|---|---|---|---|---|
| 1 | cobalt | `#1f5fa8` | `#4a8ad6` | solid | ● circle |
| 2 | vermilion | `#c4421a` | `#e0603a` | 45° lines | ▲ triangle |
| 3 | cerulean | `#2389b5` | `#3399c2` | dots | ■ square |
| 4 | ochre | `#9a6400` | `#c08a1e` | horizontal lines | ◆ diamond |
| 5 | plum | `#a3367a` | `#c8579c` | 135° lines | ▼ triangle down |
| 6 | olive | `#5f7a00` | `#84a024` | crosshatch | ✚ plus |
| 7 | violet | `#6c4bb0` | `#9179d6` | vertical lines | ⬢ hexagon |
| 8 | viridian | `#0b7d5e` | `#2a9e7b` | grid | ✖ cross |

### Motion (A)

`--dur-fast` 120ms, `--dur-base` 240ms, `--ease` `cubic-bezier(.2,.7,.2,1)`.
Blocks fade and slide into their slot, like ink settling on paper.

### Chapter layout (A)

Desktop, 1024px and wider. Prose sits on the left and the figure is sticky on
the right. Sidenotes (callouts) sit in the gutter beside the step that owns them.

```
┌──────────────────────────────────────────────────────────────────────┐
│ serving-explained   1 KV cache · 2 Paged · 3 Batching · 4 Prefix  ◐ │
├──────────────────────────────┬───────────────────────────────────────┤
│ Chapter 1                    │ ┌───────────────────────────────────┐ │
│ The KV cache                 │ │ Fig. 1.2  KV memory per request   │ │
│                              │ │  · · · · · · · · · · · · · · · ·  │ │
│ ▌Step 1 (highlighted)        │ │  ● r1 ▓▓▓▓▓▓▓▓░░  ← 16 tokens →   │ │
│  Each new token adds keys    │ │  ▲ r2 ▓▓▓▓░░░░░░                  │ │
│  and values for 32 layers.   │ │  · · · · · · · · · · · · · · · ·  │ │
│                     ┆sidenote│ │  [simulated]                      │ │
│ Step 2                       │ ├───────────────────────────────────┤ │
│  …                           │ │ ▶ ❚❚ ⏭  ──●────────  1×           │ │
│                              │ └───────────────────────────────────┘ │
│  ≤ 62ch                      │   sticky: top 72px, height 100vh-96px │
└──────────────────────────────┴───────────────────────────────────────┘
   cols 1–5                       cols 6–12
```

Mobile, 375px. The figure is sticky at the top, at 44% of the small viewport
height (min 240px). Steps scroll under it. Sidenotes become inline callouts. If
the viewport is under 560px tall, the figure stops being sticky and each step
gets a "Show in figure" button.

```
┌───────────────────────┐
│ ≡ serving-explained ◐ │
├───────────────────────┤
│ Fig. 1.2 (sticky)     │
│ ● r1 ▓▓▓▓▓▓░░         │
│ ▲ r2 ▓▓▓░░░░░         │
│ ▶ ❚❚ ⏭ ──●──── 1×     │
├───────────────────────┤
│ ▌Step 1               │
│  Each new token adds  │
│  keys and values …    │
│ ┆ Simplification: …   │
│                       │
│  Step 2 …             │
└───────────────────────┘
```

---

## Direction B — Signal Box

Railway timetables and signal boxes. The page is white with heavy black rules,
square corners, and no shadows. Each engine step is a row on a departure board:
step number, who is in the batch, and blocks free. Requests look like line
badges ("● r3"). Numbers use tabular figures and stay large. The accent is
signal yellow, used only as a bar behind the current step or row.

### Type

- `--font-body` and `--font-display`: `"Helvetica Neue", Helvetica, "Nimbus Sans",
  Arial, sans-serif` (a grotesk, not system-ui)
- `--font-mono`: same stack as A, for code only
- Numbers: `font-variant-numeric: tabular-nums` in the body font.
- Scale: ratio 1.25 on a 17px base. Body text is 17/27. Prose is at most 58ch.
  Labels are 12px caps with 0.08em tracking.

| Token | Size | Use |
|---|---|---|
| `--step--2` | 12px | caps labels, badges |
| `--step--1` | 14px | captions, controls |
| `--step-0` | 17px | body |
| `--step-1` | 21px | step lead sentence |
| `--step-2` | 27px | h3, board numerals |
| `--step-3` | 33px | h2 |
| `--step-4` | 42px | chapter title, mobile |
| `--step-5` | 52px | chapter title, desktop; key figure numerals |

Headings use bold weight and -0.015em tracking. The chapter number is set huge
in the margin ("01").

### Spacing

A strict 8px grid: `--space-1` to `--space-9` = 4, 8, 16, 24, 32, 48, 64, 80,
120 px. The 4px step is only for hairline gaps between blocks.

### Palette

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
| `--block-waste` | hatch of `#8a8a84` on `--surface` | hatch of `#5c6066` |
| `--callout-simplification` | white band, 2px dashed top and bottom rules, caps label | dark values |
| `--callout-reality` | `--surface-2` band, 6px yellow left bar, caps label | dark values |

Contrast figures are against `--bg`.

### Requests (B)

Glyphs come first and are drawn large inside each block when there is room.
Blocks narrower than 14px drop the glyph; identity then comes from the row
label, the legend, and hover or focus highlighting of every block of that
request.

| Slot | Name | Light | Dark | Glyph | Badge |
|---|---|---|---|---|---|
| 1 | blue | `#2563c9` | `#4d8ff0` | ● circle | `● r1` |
| 2 | red-orange | `#d1461b` | `#e2602f` | ▲ triangle | `▲ r2` |
| 3 | magenta | `#c13b8a` | `#e05ca8` | ■ square | `■ r3` |
| 4 | amber | `#b06f00` | `#b8820c` | ◆ diamond | `◆ r4` |
| 5 | cyan | `#0f8fb3` | `#1fa3c6` | ▼ triangle down | `▼ r5` |
| 6 | moss | `#4f7f12` | `#6e9a28` | ✚ plus | `✚ r6` |
| 7 | violet | `#7347c7` | `#9a7cf0` | ⬢ hexagon | `⬢ r7` |
| 8 | green | `#0a8a5f` | `#1f9e72` | ✖ cross | `✖ r8` |

As a fallback for print and forced-colors mode, B also uses A's pattern list.

### Motion (B)

`--dur-fast` 80ms, `--dur-base` 160ms, `--ease` `steps(4, end)`. Changes snap
in short steps, like a split-flap board. Nothing glides.

### Chapter layout (B)

Desktop, 1024px and wider. The board (figure) is wide on the left and sticky.
The steps are a numbered timetable column on the right.

```
┌──────────────────────────────────────────────────────────────────────┐
│ SERVING-EXPLAINED ━━━━ 01 KV · 02 PAGED · 03 BATCH · 04 PREFIX   ◐  │
├━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┳━━━━━━━━━━━━━━━━━━━━━━┤
│ ┌──────────────────────────────────────────┐ ┃ 01                   │
│ │ STEP  BATCH            FREE  WAIT        │ ┃ THE KV CACHE         │
│ │ 041   ● r1 ▲ r2 ■ r3    12   ◆ r4        │ ┃                      │
│ │█042█  ● r1 ▲ r2 ■ r3    11   ◆ r4  █████ │ ┃ ██ 1 ██████████████  │
│ │ 043   …                                  │ ┃ Each new token adds  │
│ │ ┌──┬──┬──┬──┬──┬──┬──┬──┐               │ ┃ keys and values for  │
│ │ │● │● │▲ │▲ │▲ │■ │  │  │  KV BLOCKS    │ ┃ 32 layers.           │
│ │ └──┴──┴──┴──┴──┴──┴──┴──┘  [SIMULATED]  │ ┃                      │
│ ├──────────────────────────────────────────┤ ┃ 2                    │
│ │ ▶  ❚❚  ⏭   ━━━━━●━━━━━━━   1×            │ ┃ …                    │
│ └──────────────────────────────────────────┘ ┃ ≤ 58ch               │
│   cols 1–8, sticky: top 64px                  ┃ cols 9–12            │
└──────────────────────────────────────────────────────────────────────┘
```

Mobile, 375px. The board collapses into a compact strip, sticky at the top at
36% of the small viewport height. It holds the current step row, the block
grid, and the playback bar. The full board opens as a separate figure below
each step. The same rule for short viewports as A applies.

```
┌───────────────────────┐
│ SERVING-EXPLAINED  ◐  │
├━━━━━━━━━━━━━━━━━━━━━━━┤
│ 042 ● ▲ ■  FREE 11    │  ← sticky strip
│ ●●▲▲▲■□□              │
│ ▶ ❚❚ ⏭ ━━●━━━ 1×     │
├━━━━━━━━━━━━━━━━━━━━━━━┤
│ 01 THE KV CACHE       │
│ ██ 1 ████████████████ │
│ Each new token adds   │
│ keys and values …     │
│ ┃ REALITY CHECK …     │
│ 2 …                   │
└───────────────────────┘
```

---

## Choosing

| | A — Bench Notes | B — Signal Box |
|---|---|---|
| Feel | calm, hand-annotated, reads like a book | crisp, mechanical, reads like a dashboard |
| Best at | long prose, dimensioned diagrams | many steps, timing, counts |
| Risk | can look quaint if the figures are sloppy | can feel cold; the heavy rules need discipline |
| Identity at small sizes | patterns, then glyph | glyph, then label |
