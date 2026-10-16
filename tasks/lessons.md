# Lessons

Mistakes, corrections, and surprises. Newest first.

## 2026-10-16

- **`spawn("pnpm", ["exec", "vite", …])` leaves vite running after
  `kill()`.** Only the pnpm wrapper dies. Preview servers from Oct 2, 9,
  and 15 still held ports 4173–4177, and a new server with `--strictPort`
  quietly failed, so a script screenshotted the wrong build. Rule: spawn the
  binary itself, pick a port nothing uses, and check the page is the build
  you expect.
- **Show HN calls "reading material" off topic.** An explainer can read as
  one. Rule: lead with what people can do on the page.

- **Moving work off load can move it into mount.** Chapter 3's figures
  reused runs its module had already made. With the numbers built ahead of
  time, the inline figures at 412 px ran the sweep on mount: still 114 ms.
  Rule: after moving work, measure at every layout, not only the wide one.
- **A property test that runs the engine on random configs is a timing
  lottery.** fast-check drew configs that took 32 s on CI. Rule: test what
  the property is about (the link round trip) and lean on the engine's own
  determinism test, instead of simulating every draw.
- **Check an artifact's root before comparing it.** The baselines artifact
  drops the `e2e/` prefix, so a byte compare against the wrong paths said
  all 42 changed. Rule: confirm one known-unchanged file matches first.

## 2026-10-15

- **A decision about outside state can undo itself.** Audit 1 recorded the
  repo as public; by audit 2 it was private, and 39 SIM.md links were 404s
  for readers. Rule: every audit re-checks repo visibility and links to it
  anonymously, not through an authenticated `gh`.
- **Post-load perf tests miss load-time work.** Every `@perf` spec passed,
  but chapter 3 runs its sims when its module is imported: a 1.2 s task at
  4× CPU. Lighthouse's TBT caught it. Rule: check long tasks on load too.
- **Playwright wipes its outputDir at the start of every run.** The default
  config's outputDir is `test-results`, so a run there deletes results
  other configs wrote below it. Pass `--output` or back up first.
- **Firefox keeps `activeElement` on the last control** when Tab moves focus
  into the browser chrome. A Tab walk ends when the same element repeats.

- **A reused component carries its scale assumptions.** BlockGrid's summary
  strip drew one SVG rect per block, fine for chapter pools. The sandbox's
  378,492-block pool made playback 150 ms per frame. Rule: when reusing a
  widget, check its element count against CLAUDE.md's SVG budget at the new
  maximum size. Profile before optimizing: the suspected `cellsOf` was not it.
- **`getByLabel` matches substrings.** "events before the playhead" matched
  `getByLabel("Playhead")`. Use `getByRole` with the name for unique controls.
- **WebKit reports a worker load cut off by navigation as a page error.**
  Tests that navigate quickly must wait for the worker to report first.
- **Clamping on every keystroke rewrites what is typed.** "8192" became 64192.
  Keep a draft; apply only in-range values, and clamp on blur or Enter.

- **Test every stop a reader can reach, not only the ones the plan sweeps.**
  A slider stop past the preset's max_model_len threw inside a render and
  unmounted the whole page; the claim tests never moved that slider.
- **A slider whose value is not one of its stops sits at stop 0.** Each
  figure needs stops that include its own starting value.
- **Building frames from snapshots is simple but slow.** Copying every
  request each step cost 41–85 ms per run; replaying the event log costs
  10–20 ms, and a test checks it against the snapshots.
- **An SVG scaled to its measured width has a fractional height.** Chapter
  3's full-page screenshots came out 1 px taller or shorter between CI runs.
  Give every SVG a fixed pixel height; let only its width follow the layout.
- **The wide board reuses one component across steps.** Two steps showing
  the same widget type in different modes kept the first one's state: step
  4's continuous run inherited step 2's "static" setting. Key each figure by
  its mode when its state means different things per step.
- **Sorting every frame is the hidden cost of "so far" readouts.** p50 and
  p99 of thousands of gaps, re-sorted per frame, gave 33 ms frames at 4×
  throttling. Precompute every prefix's statistics once per run (a Fenwick
  tree over ranks); a frame is then a lookup.
- **Firefox measures SVG text at x = 0 a pixel outside the SVG.** Inset
  labels by 2 px; the clipped-text check catches it in Firefox only.
- **Weight a time average the way playback shows it.** A step's end state is
  on screen until the next step ends, not for the step's own duration. The
  two weightings moved chapter 4's numbers by up to 0.4.
- **Snapping taps does not make a small target big.** A tap can map to the
  nearest cell, but each cell's hit area is still its pitch: 39 px at 375.
  Only bigger cells, or fewer columns, reach 44 px.
- **Bigger canvas cells cost frame time.** At 44 px, compare playback fell
  to 50 ms frames at 4× throttling. Redrawing only the cells that changed
  fixed it. A test checks the incremental paint against a full repaint,
  pixel for pixel.
- **Measure a regression against the old code under the same load.** The
  machine was busy (load average 12), and both versions slowed. Running the
  released code first showed the new code was 3× slower, not just noisy.
- **A clicked button that disables itself drops focus in Firefox.** Tab then
  starts after the button and never wraps back. Focus a target directly when
  keyboard reach is not what the test is about.
- **`git add -A` earlier stages everything for the next commit.** A commit
  meant for one file took all of them. Stage per commit, and check
  `git diff --cached --stat` first.
- **"Front of the queue" means prepend.** vLLM prepends each preempted
  request to the waiting queue, so the latest victim goes first. A test that
  queued victims first-in, first-out failed against a correct engine.
- **TTFT includes the queue.** The plan reasoned that chunking adds a long
  prompt's decode work to its TTFT. On an overloaded preset, chunking also
  shortens the queue, and the queue dominates. Reason about every part of a
  metric before predicting its sign.

## 2026-10-09

- **Don't kill processes in a command.** A command that included
  `pkill -f "vite preview"` was rejected. Playwright's webServer reuses a
  running preview server, and `pnpm build` refreshes the `dist` it serves, so
  nothing needs killing.
- **Named `<section>`s are landmarks.** Figures 2.1, 2.2, and 2.4 each had
  sections named "Contiguous" and "Paged", and axe failed `landmark-unique`.
  Repeated widget parts are `role="group"`, which is not a landmark.
- **Firefox's SVG text box starts about 3 px left of its x.** Labels at
  x = 0 failed the clipped-text check in Firefox only. Inset SVG labels by a
  few pixels.
- **Step feedback needs a fine enough clock.** One engine step is about
  40 ms, so a time shown to 0.1 s did not change on Step. Compare mode
  shows 2 decimals.
- **Seeking a React range input in a test** needs the native `value` setter
  plus an `input` event; setting `.value` alone is invisible to React.

## 2026-10-02

- **Case-insensitive file names bit twice.** `TokenGrid.tsx` beside
  `tokenGrid.ts` broke the ESLint project service, as `RequestMark.tsx` and
  `requestMark.ts` did before. Rule: never give a `.ts` and a `.tsx` file
  names that differ only in case; name the logic file for what it holds
  (`gridFrames.ts`).
- **Prettier rewrites MDX into block JSX.** It split one-line `<Claim>`
  paragraphs over several lines and added `{" "}`, which changes how MDX
  parses them. `*.mdx` is now in .prettierignore, like `*.md`.
- **MDX drops a paragraph that holds only JSX.** A `<Claim>` alone on its line
  became a bare span outside any `<p>`, so two claims ran together. The fix is
  CSS: a claim outside a paragraph displays as one.
- **Playwright's recordVideo ignores deviceScaleFactor,** and so does
  headless Chromium's screencast: both give 1× frames. `pnpm capture` takes
  2× screenshots in a loop instead (about 20 fps here).
- **Measure layout shift strictly first.** Counting input-driven shifts found
  three real ones that CLS would hide: a wrapping heading, a rewrapping
  legend, and a slider output that wrapped. CLS itself skips shifts within
  500 ms of input, so the test asserts on the rest and logs the input total.
- **Right-aligned numbers in a fixed box still shift.** "9" to "10" moves the
  text's start. Left-align the number inside its fixed width.
- **Frame timing needs the machine to itself.** Under the full parallel e2e
  run, frame p95 rose from 16.7 to 33 ms. Performance tests are tagged
  `@perf` and run alone with `pnpm perf`.
- **Use a transform to reveal a skip link.** Moving it with `top` on focus is
  a layout shift.
- **Never name a zsh variable `path`.** It is tied to `PATH`, so `for path in
  …` emptied PATH and every command after it failed. Rule: use `route`, `p`,
  or `file` in shell loops.
- **Tab order tests must walk forward in DOM order.** Chromium and WebKit wrap
  Tab around the document; Firefox hands focus to the browser chrome. A test
  that tabbed backwards passed in two browsers by accident. Rule: visit
  controls in DOM order, or press Shift+Tab toward an earlier control (the
  chapter 1 `tabTo` picks the direction), and run keyboard tests in all three
  browsers.
- **WebKit on macOS ignores `min-height` on native selects.** They stay 23 px
  tall until `appearance: none`. Rule: measure target sizes in WebKit, not
  only Chromium.

- **A property test can pass without reaching the path it is for.** 300 random
  runs passed with zero preemptions: the generator spread arrivals too thin to
  fill memory. Rule: count the interesting events across a property test's
  runs and assert a floor, so a weak generator fails loudly.
- **When a test and the engine disagree, work out which is wrong by hand
  first.** Two scheduler tests and one cross-check threshold were wrong, not
  the engine (a 12-token prompt fills three blocks of 4, not two). Writing the
  golden event lists by hand before running found no engine bug.
- **Close stdin on every shell command.** A stray `cat > file` with no input
  hung for two minutes. Rule: append `< /dev/null` to commands that might read
  stdin, and never leave a redirect without a heredoc.
- **pnpm 12 has no `-s` flag.** Use `pnpm <script>` or `node scripts/x.ts`.

- **Check a stated fact about outside state before building on it.** The
  decisions said the repo "is renamed" and ffmpeg "is installed". `gh api`
  still showed `Serving-Explainer`, and `ffmpeg` was not on PATH. Rule: verify
  each "it is done" with a command, and report any gap before relying on it.
- **A type that lists a table's rows must grow with the table.** SIM.md's
  `PresetName` named 5 presets while §7's table had 9. Rule: when adding a row,
  grep for every union, list, or test that enumerates the rows.
- **A corrected constant moves every number derived from it.** Fixing the A10G
  TFLOPS (M9) changed chapter 3's crossover from 135 to 76 tokens and every
  prefill time. Rule: when a constant changes, grep for each number computed
  from it, and recompute.
- **Extend numbered checklists instead of renumbering them.** The DoD's item
  numbers are cited across tasks/todo.md. New checks went into existing items
  (7, 11, 17, 18), so no reference broke.

## 2026-10-01

- **Some communities ban LLM-written posts.** HN ("Write your text by hand…
  not even a tiny bit") and r/LocalLLaMA (rule 3) forbid the drafts a launch
  prompt asks for. Rule: check each venue's rules before drafting. Where text
  must be hand-written, give the author facts and constraints, not prose.

- **Check data against its own cited source.** llmsize's A10G bf16 figure (125
  TFLOPS) is the A10's. The AWS datasheet it links says 70 dense. Rule: for
  every hardware constant that sets on-screen numbers, open the `source_url`
  and compare, even in the author's own repos.
- **Audit what exists, and say what could not run.** Prompt 8 asked for a launch
  audit before any code existed. The useful pass was the claims, links,
  tokens, and data. Every runtime item is marked "not run" with the reason, and
  none is estimated.

- **Check that a linked repo does what the prompt implies.** Prompt 6 suggested
  linking kv-transfer-tax's "replica load-balancing work" for prefix-aware
  routing. Its balancer routes by load only (`proxy/replica_lb.py` L56–75).
  Rule: read the linked code before writing the sentence that links it.

- **Check the sign before calibrating with a leftover.** SIM.md Q5 planned to get
  a step overhead as measured TPOT minus the roofline. The roofline turned out
  slower than the measurement (38.5 vs. 33 ms), so the leftover was negative.
  Rule: compute the leftover before planning around it.
- **A benchmark's run log can carry what its result files do not.** bench-ieb's
  JSONs omit GPU and engine version, but `logs/phase2_resume_*.log` records both
  for the concurrency-64 runs. Look for logs before calling a number untraceable.

- **The arXiv HTML drops numbers.** kwon2023's HTML lost "2.2×" and "1.7×–2.7×"
  from §6.2, leaving "vLLM processes more requests". Rule: read quoted numbers
  from the PDF text (pypdf), and get figure values from the PDF's text labels.
- **Design rules constrain presets.** DESIGN.md's "at most 8 live requests" caps
  every widget preset at `max_num_seqs` 8. Check DESIGN.md before choosing
  preset sizes.

- **Prompts can carry technical slips too.** Prompt 3 said that without a cache
  each token "recomputes attention over every earlier token." With a cache it
  still attends to every earlier token; what the cache saves is rebuilding their
  keys and values. Rule: check a prompt's technical wording against the sources
  before it becomes prose.

- **Check that a prompt's inputs exist.** Prompt 1 said to read DESIGN.md and
  tasks/, but the setup session had stopped at an approval gate before writing
  them. Rule: at session start, list every file the prompt names and report any
  that are missing before doing anything else.
- **llmsize is `varad-more/llm-calculator`** (package `@llmsize/core`). No repo is
  named `llmsize`.
- **The Pages URL follows the repo name.** The author's user site has the custom
  domain `varadmore.me`, so this repo publishes at
  `varadmore.me/Serving-Explainer/` unless the repo is renamed.
- **Node 24 imports llmsize's TypeScript source directly** (type stripping), so
  gen-data does not need to build `packages/core`. Verified on llmsize 51b9746.
- **Source traps:** vllm-pa-doc is a legacy doc; automatic prefix caching must
  cite vllm-apc-doc, not kwon2023; chunked prefill was introduced in
  agrawal2023, not agrawal2024. Benchmark READMEs contradict their own result
  files, so `measured` badges cite result files only.
- **Design docs drift from code.** vllm-apc-doc's free-queue order no longer
  matches `BlockPool.free_blocks`. When a doc and code at a pinned commit
  disagree, cite the code for current behavior and record the gap.
- **Turning off chunked prefill in vLLM V1 does not restore prefill-first
  scheduling.** It only stops prompts from being split; decodes still share the
  step. Do not describe the "off" setting as the old V0 behavior.
- **Eight hues cannot pass all-pairs CVD separation.** Only neighboring slots
  pass. Glyphs and patterns carry request identity; color is the third cue.
- **Check dated text before re-dating commits.** The 2026-10-15 re-date put
  chapter 2's revisions on Oct 10, though they record the author's Oct 15
  answers. Rule: no commit moves earlier than a date its message or diff
  records. Every cited SHA changes too, so update the docs that cite them.
