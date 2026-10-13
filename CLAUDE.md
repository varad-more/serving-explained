# serving-explained — rules for every session

## What this is
An interactive explainer of LLM serving internals: KV cache, paged attention,
continuous batching, prefix caching, and later chapters. Readers learn by moving
sliders and watching a small simulated engine. It runs entirely in the browser.

## Truth rules (highest priority)
- Every technical claim cites a primary source listed in docs/SOURCES.md: a paper,
  official docs, or a source file at a pinned commit. No source, no claim.
- Every number on screen carries a provenance badge:
  - `simulated`: produced by our toy engine.
  - `computed`: produced by llmsize formulas (generated data in src/data).
  - `measured`: read from a committed result file in the author's benchmark repos,
    and linked to that file.
- Never present simulated numbers as real-world performance.
- Every chapter ends with "What this leaves out": one line per simplification.
- Every claim the prose makes about the simulation ("continuous batching cuts
  waiting under this preset") is asserted by a test against that preset. If the
  test fails, the prose is wrong.
- Never copy text or figures from papers or blogs. Paraphrase, cite, and draw
  original diagrams.

## Architecture
- `src/sim`: pure TypeScript engine. No DOM, no React, no timers, no Math.random.
  Deterministic for a given seed. Serializable state.
- `src/viz`: React components that render sim state and events.
- `src/chapters`: one MDX file per chapter, plus its widgets.
- `src/data`: generated JSON. Never edit by hand; regenerate with scripts.
- `scripts`: generators and tooling.
- `docs`: SIM.md (engine design), SOURCES.md, CHAPTER_DOD.md (added later).

## Stack (fixed)
Vite, React 19, TypeScript (strict), MDX, vitest, fast-check, Playwright, pnpm.
No UI kit, no CSS framework. Ask before adding any runtime dependency.
Allowed without asking: d3-scale, d3-shape, d3-array.

## Visual rules
- Animations are driven by the sim's event log, never by timers mutating state.
- Every animated widget has play, pause, step, scrub, and speed controls.
- Under `prefers-reduced-motion`: no motion; show states with step buttons instead.
- Color is never the only encoding. Use the palette tokens in DESIGN.md.
- Use SVG up to about 2,000 animated elements; use Canvas beyond that.
- Every page must work at 375px and 1440px wide, in light and dark themes.

## Writing rules
- Sentences under 25 words. One idea per scroll step. Concrete numbers.
- Define every term at first use; add it to the glossary.
- No hype words (revolutionary, blazing, magic). US English.

## Workflow
- At the start of every session, read CLAUDE.md, PRODUCT.md, DESIGN.md,
  docs/SIM.md (when it exists), tasks/todo.md, and tasks/lessons.md.
- Plan first in tasks/todo.md, then STOP for approval before writing code.
- Make small commits with clear messages. After each step, run pnpm test,
  pnpm typecheck, pnpm lint, and pnpm build. All must pass before you continue.
- Never call something done without saying how you verified it: which tests,
  which screenshots, which manual check.
- Record mistakes, corrections, and surprises in tasks/lessons.md.

## Stop and ask when
- Two sources disagree, or a claim cannot be sourced.
- A request conflicts with these rules, or scope would grow.
- A new dependency seems necessary.
- You would change the public API of src/sim after it is approved.
- A CLAUDE.md or CHAPTER_DOD.md rule conflicts with an approved plan. You may
  apply the rule without asking only when the change is presentational
  (splitting a step, headings, wording, Go deeper links) and changes no claim,
  number, test, preset, or sim API. List every such change under Deviations
  in your report. Anything else: ask first.

## Never
- Deploy anywhere except through the repo's GitHub Pages workflow.
- Post, publish, or message anything on the author's behalf.
- Add analytics, tracking, cookies, or third-party requests at runtime.
- Commit secrets.
