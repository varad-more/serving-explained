# Chapter definition of done

A chapter is done when every item below is checked. Copy the list into
tasks/todo.md for each chapter and tick it there. The final report goes item by
item and says how each one was verified.

Items marked **(rule)** spell out how a requirement is checked, where the
requirement alone would leave room to argue.

## Content

1. **Objective first, checked last.** The chapter opens with its learning
   objective from PRODUCT.md. It ends with a CheckYourself question that needs
   the mechanism to answer, not recall of a sentence.
2. **Sources.** Every technical claim has a `SourceLink` to a docs/SOURCES.md id.
   A test fails if any id used in the chapter is missing from sources.json.
3. **Provenance.** Every number from data or the sim carries a `ProvenanceBadge`
   (`computed`, `simulated`, or `measured`). **(rule)**
   - One badge may cover a whole readout or figure.
   - A number quoted from a source (for example, "block size 16 by default")
     carries a `SourceLink` instead.
   - Definitional constants, such as the 2 for keys and values, need neither.
   - No number from data is typed into prose by hand. It renders through `<Num>`,
     which formats the value and attaches its badge, so prose cannot drift from data.
4. **Claims are tested.** Every prose claim about simulated or computed behavior
   is wrapped in `<Claim id="…">`. `tests/chapters/<slug>.test.ts` has one test per
   id. Each test runs against the exact preset object the chapter imports.
   **(rule)** A meta-test fails if a claim id has no test or a test has no claim.
5. **Writing rules** (CLAUDE.md), checked by `tests/chapters/writing.test.ts`:
   - no sentence of 25 words or more
   - no word from the banned hype list
   - every `GlossaryTerm` id exists in the glossary
   - one idea per scroll step, US English, every term defined at first use,
     checked in the fresh-eyes review (item 20)
6. **End sections.** The chapter ends with "What this leaves out," one line per
   simplification with its source or SIM.md §9 entry. Then comes "Go deeper,"
   which links SOURCES.md ids only.

## Widgets

7. **Keyboard.** Every control can be reached with Tab and operated with arrow
   keys, Enter, or Space. Focus is always visible.
8. **Labels.** Every control has a visible label tied to it. Readouts that change
   are announced through a polite live region.
9. **Playback.** Every animated widget has a `PlaybackBar` (play, pause, step,
   scrub, speed) and is driven by the sim's event log.
10. **Reduced motion.** Under `prefers-reduced-motion: reduce` there are no
    transitions and no autoplay. Step buttons show every state.
11. **Sizes and themes.** Works at 375 px and 1440 px, light and dark, with no
    horizontal scroll and no clipped labels.
12. **No layout shift.** Cumulative layout shift is 0 during the interaction
    test, measured with a `layout-shift` PerformanceObserver.
13. **No console errors** or page errors during any Playwright test.
14. **axe** reports no violations on the chapter page.

## Performance

**(rule)** "A mid-range laptop" means Chromium with its CPU throttled 4× through
CDP, on the dev machine. The report gives numbers with and without throttling.
Each run saves a Playwright trace (`context.tracing`) and a Chromium performance
trace (`browser.startTracing`) under `test-results/` for inspection.

15. **Interactions respond within 100 ms.** Event Timing entries cover every
    input in the interaction test. Pass: the maximum duration is 100 ms or less.
    Report the max and p95.
16. **Animation holds 60 fps.** Frame intervals come from `requestAnimationFrame`
    over 5 s of playback at default speed. Pass: the p95 interval is 18 ms or
    less, and no frame is over 50 ms. Report the p50, p95, and max.

## Tests and review

17. **Screenshots.** Playwright screenshot tests at 375 and 1440 px, light and
    dark: 4 baselines.
18. **Interaction.** One Playwright test per widget. It moves a control and
    asserts that the visible result changes, checking rendered text, not just
    the DOM.
19. **Checks.** `pnpm test`, `pnpm typecheck`, `pnpm lint`, and `pnpm build` pass.
20. **Fresh-eyes review.** A sub-agent that did not write the chapter reads it as
    a skeptical expert.
    - It checks each claim against its cited source.
    - It checks the text against CLAUDE.md's writing rules.
    - It lists each problem with its location.
    - Every problem is fixed or answered. The report lists what was found and
      what changed.

## Launch assets

21. **Capture.** `pnpm capture <slug>` records 6 to 10 seconds of the main
    widget, with Playwright driving a scripted interaction.
    - It writes `media/<slug>.mp4` (H.264) and `media/<slug>.gif`.
    - The script fails if the GIF is 3 MB or larger.
22. **Route HTML.** `dist/<slug>/index.html` has its own title, description,
    canonical URL, `og:*` and `twitter:*` tags, and a 1200×630 preview image at
    `og/<slug>.png`. This is checked by the postbuild test and by the smoke test
    against the live site.
