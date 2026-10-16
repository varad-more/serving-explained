# Launch audit

Status: **audit 2, on the live site, 2026-10-15; every major fixed on
2026-10-16.** It audits https://varadmore.me/serving-explained/ as deployed
from `27c8c45` (tag `v0.8-sandbox`, CI run 38852776686). The author approved
the fix order; "Fixes" below records each fix and the rerun of the check
that found it. The minors are open for the author to decide.

Audit 1 ran on 2026-10-01, before the build. It is in git at `48d0d4b`, with
its resolution log at `f7feb35`. Every audit 1 item appears below with its
before and after.

Commits after `v0.3-shell` were re-dated on 2026-10-16. Raw files in
`docs/audit/2/` cite the old SHAs; tasks/todo.md maps them.

## Method

Same categories, severities, and method as audit 1. Severity: **blocker**
stops launch, **major** must be fixed before launch, and **minor** is the
author's call.

Pages: the 7 routes, the not-found page, and an A/B sandbox link
(`?v=1&a.sc=static&b.p=chatbot`).

Tooling added for this audit (CI never runs it):
- `playwright.audit.config.ts` runs `e2e/*.audit.ts` against the live site in
  Chromium, WebKit, and Firefox:
  - `text.audit.ts`: the rendered text of every page, for the correctness review
  - `a11y.audit.ts`: axe, a Tab walk, live-region rate, and reduced motion
  - `layout.audit.ts`: sizes, themes, touch, sticky, workers, and hover-only styles
  - `network.audit.ts`: requests, JS bytes, no-JS, worker failure, 404,
    metadata, and in-site links
- `scripts/link-check.ts`: every external link (audit 1 m2), with a unit test
- `scripts/lighthouse.ts`: Lighthouse 13.5.0 on every route, mobile and desktop
- The existing `@perf` specs, with Chromium traces, pointed at the live site

Evidence:
- `docs/audit/2/results.json` holds every run's results.
- `perf.txt`, `contrast.txt`, and `palette.txt` hold the raw numbers.
- The three `review-*.md` files are the sub-agent reports.
- The full raw output stays in `test-results/audit-2/`, which is not
  committed.

Reproduce:

```sh
pnpm exec playwright test -c playwright.audit.config.ts
node scripts/link-check.ts
node scripts/lighthouse.ts
SMOKE_BASE_URL=https://varadmore.me/serving-explained/ PERF=1 \
  pnpm exec playwright test --grep @perf --project=chromium --workers=1
```

Limits of this pass:
- Touch ran on emulated phones (Pixel 7 in Chromium, iPhone 13 in WebKit),
  not real devices.
- Live regions were checked as DOM changes, not with a running screen reader.
- The machine's load average was 3.4–4.4 throughout. That matters for the
  4× CPU numbers (P2).

## Summary

| category | blocker | major | minor | not run |
|---|---|---|---|---|
| 0. Build state | 0 | 1 | 0 | — |
| 1. Correctness | 0 | 5 | 46 | 0 |
| 2. Accessibility | 0 | 1 | 5 | 0 |
| 3. Mobile and browsers | 0 | 0 | 2 | 0 |
| 4. Performance | 0 | 1 | 1 (+1 after fixes: P3) | 0 |
| 5. Resilience | 0 | 2 | 0 | 0 |
| **total** | **0** | **10** | **54** | **0** |

Every item audit 1 marked "not run" ran this time (see "Before and after").
After the fixes (2026-10-16): **0 blockers, 0 majors, 55 minors** (P3 is
new: what P1 leaves on mobile).

## Fixes (2026-10-16)

Each major, in the approved order, with the check that found it, rerun.
"Local" ran on the production build (`vite preview`); "live" ran on the
site after CI run 38875722282 deployed `eb795c3`.

| item | fix | commit | check rerun | result |
|---|---|---|---|---|
| G1 | the author made the repo public | — | `scripts/link-check.ts`, anonymous `curl` | 85 links: 84 ok, 1 Cloudflare challenge (ACM DOI), 0 failed; SIM.md 200 |
| C1-1 | sliding-window keeps fewer tokens | `2400e25` | fresh sub-agent against MATH.md L151 | fixed |
| C2-1 | PagedAttention is the algorithm; vLLM's block manager hands out blocks | `2400e25` | fresh sub-agent against kwon2023 §1, §4 | fixed |
| C3-1 | "from 1 to 64", and the trend is not at every level | `2400e25` | fresh sub-agent recomputed the medians from the raw JSONs | fixed |
| C3-2 | states caching is off here and on by default in vLLM; new claim `caching-off-here` | `2400e25`, `101a314` | fresh sub-agent; `pnpm test` | partly at first: two cites incomplete, glossary overclaimed. Fixed in `101a314`. |
| C4-1 | admission cites `scheduler.py` L873–1294 | `2400e25` | fresh sub-agent | fixed |
| R2 | `useRun` handles the worker's `error` event and a failed constructor | `92948dd` | `network.audit.ts` "worker failure", 3 browsers; two new e2e tests | blocked worker and no `Worker` both show the error, no page error; the tests fail on the old code |
| R1 | a `<noscript>` message on every route | `f1974b9` | `network.audit.ts` "no JavaScript"; a new smoke test | every page shows "serving-explained needs JavaScript…" |
| C2-2 | one neutral fill for held blocks in the summary strip | `c2f219d` | a new render test; screenshots | 8 slots give 1 class; the 375 and 768 px diffs sit on the strip |
| P1 | chapters 3–4 read prose numbers from generated JSON (`pnpm gen:figures`); Figure 3.7 reads its sweep points | `b7ff702` | long tasks on load; Lighthouse | live, 1× CPU: no task over 50 ms on chapters 3–4 at 412 or 1440 px (was 296–314 and 131–137 ms). Lighthouse mobile 99 and 99–100 (TBT 117–121 and 90–102 ms; was 73 and 82, TBT 1,694 and 715 ms). Desktop 100. The proposed gate was 100 on mobile: P3. |

Changes beyond the fixes, each needed for the checks to pass:
- The approved C3-1 sentence was 25 words, one over the writing rule; it
  now reads "raised throughput and median TTFT". The claim is the same.
- C3-2's re-check made two further changes, each to match its source. It
  added `config/model.py` L2228–2230 and `scheduler.py` L930–938, and changed
  the glossary's "any of its blocks" to "its leading blocks". The cache
  lookup stops at the first miss.
- `tests/sandbox/url.test.ts`: the random-config round trip compares built
  engine configs instead of simulating each one twice. CI run 38870280620
  failed when that took 32 s; the engine's determinism has its own test.
- The audit scripts take `AUDIT_OUT` for their output folder.
- Screenshot baselines: 22 Mac and 22 Linux (run 38874325842) changed,
  the same 22 on each. The other 20 Linux baselines are byte-identical.
- `scripts/link-check.ts` waits 3 s and 6 s before its retries: GitHub
  answered one burst with a 503 that a second later was a 200.

### Live, after the fixes

The whole audit, rerun on the live site at `eb795c3` with the same commands
(`AUDIT_OUT=test-results/audit-2b`). Evidence:
`docs/audit/2/results-after-fixes.json` and `perf-after-fixes.txt`.

- **Audit suite** (3 browsers): 402 passed, 20 failed, 43 skipped. The 20
  are open minors: A1 (axe `landmark-unique`, 12 landing runs) and the touch
  check's known false positives (8). One counts a playhead that moved less
  than one scrub step; the other, sliders already at their maximum.
- **axe:** 108 runs; only A1.
- **Tab walks:** every page in 3 browsers ends cleanly with a ring on every
  stop. WebKit still shows B2.
- **Live regions:** unchanged; A2 and A3 remain.
- **Reduced motion:** passes everywhere.
- **Sizes and themes:** 162 runs; overflow 0, no clipped labels, no small
  targets.
- **R1:** every page shows the no-JavaScript message.
- **R2:** a blocked worker and a missing `Worker` both show the error, with
  no page error, in all 3 browsers.
- **Requests:** no third-party request and no cookie on any page.
  - JS as served: at most 125 KB (sandbox).
  - Chapter 3 is now 120 KB (was 121).
- **404 and metadata:** unchanged, pass.
- **In-site links:** 27, none broken.
- **External links:** 85; 84 ok and 1 Cloudflare challenge.
- **Lighthouse:** 100 on every route and form, except chapter 3 mobile 99
  and chapter 4 mobile 99–100.
- **Long tasks on load at 1×:** none on chapters 2–4 or the sandbox.
  Chapter 1, unchanged, showed one 54 ms task at 412 px under load average 5;
  audit 2 saw none there.
- **Interaction suites** (smoke, 4 chapters, sandbox; 3 browsers): 331
  passed, 74 skipped, 0 failed.
- **`@perf`** (load average 12): 10 of 11 pass; chapter 3 at 4× fails as
  before (P2).
- **Checks:** `pnpm test` 355 passed; `pnpm typecheck`, `pnpm lint`, and
  `pnpm build` pass. CI and deploy run 38875722282 passed.

## 0. Build state

**B1 is resolved.** All 7 routes return 200 with their own HTML. The 404 page
and the metadata are in §5.

**G1 (major, fixed 2026-10-16 by the author): the GitHub repo is private again.** Audit 1 recorded decision
B2.2 as "public, done 2026-10-02". Now:
- `gh repo view varad-more/serving-explained` reports `"visibility":"PRIVATE"`.
- Anonymous requests to the repo and to `docs/SIM.md` return 404.
- Effect: every "SIM.md §…" link on the site is a 404 for readers. That is 39
  citations, including every chapter's "What this leaves out" pointer to
  §9, and 5 on the sandbox.
- The link check fails 6 SIM.md URLs (§3, §4, §5, §7, §9, and the file).
- Pages keeps serving the site, so nothing else on it breaks.
- Fix (the author's call; I change no GitHub settings): make the repo public.
  Or serve SIM.md from the site and point the links there.

## 1. Correctness

**Method.** Three sub-agents that did not write the chapters checked every
claim against its source, on the live rendered text:
- chapters 1–2
- chapters 3–4
- the sandbox, landing, glossary, all measured and computed numbers, and
  SOURCES.md

They read the papers' PDF text (pypdf) and vLLM at `cfd54ca8`. bench-ieb and
bench-kvtt were fetched fresh at their pinned commits, and llmsize read at
`5d5d029`. I re-checked each major against its source myself. Their reports
are `docs/audit/2/review-*.md`.

| page | supported | partly | not supported | no source |
|---|---|---|---|---|
| 1 KV cache | 29 | 3 | 0 | 1 |
| 2 Paged attention | 42 | 4 | 1 | 0 |
| 3 Continuous batching (page + glossary popovers) | 50 | 13 | 0 | 1 |
| 4 Prefix caching (page + glossary popovers) | 57 | 4 | 1 | 1 |

**Passes:**
- **Measured numbers.** Every `measured` number matches its raw file. The
  reviewer re-derived each one with their own script from bench-ieb at
  `1c964318`:
  - vLLM throughput 30.2 → 1,279.5 tok/s, 42×
  - p50 TTFT 41.2 → 162.8 ms (vLLM) and 69.9 → 156.1 ms (SGLang)
  - SGLang 42×, 150 requests per level, 4 prompts of 13–18 words

  The vendored copies are byte-identical to the pinned files (blob ids). Every
  badge URL resolves anonymously at the pinned commit.
- **Computed numbers.** The sampled values match llmsize `5d5d029`:
  - KV bytes per token for 6 models, including GQA, MHA, and fp8
  - weights, and usable VRAM (A10G 22.50 GiB, H100 79.68 GiB)
  - chapter 1's concurrency stops
  - chapter 3's roofline: prefill 0.531 s, memory 38.8 ms, crossover 76
    tokens, 25.8 tok/s
- **The A10G is 70 TFLOPS** everywhere on the site (M9).
- **Claim tests.** `pnpm test`: 42 files, 349 tests pass. That includes
  every claim id and the meta-tests. Each test asserts what its prose says,
  except C2-9, C3-11, and C4-8.
- **No near-copy paraphrase**, except C4-5. No simulated or computed number
  is presented as real-world performance.
- **Author claims.** vllm-metal #549 merged 2026-07-25 and #550 on
  2026-07-28. The site makes no credibility claim (D-9).

**Majors** (each re-checked against the source):

- **C1-1:** *(fixed 2026-10-16)* chapter 1's "What this leaves out" says sliding-window attention
  stores "less KV per token" (`kv-cache/index.mdx:165`). The cited llmsize
  MATH.md "KV per token" section says the opposite: "A sliding-window layer
  has the same per-token cost; it just stores fewer tokens." Fix: say it
  stores fewer tokens.
- **C2-1:** *(fixed 2026-10-16)* "The paper calls the whole design PagedAttention: a block
  manager … and an attention kernel" (`paged-attention/index.mdx:72`, and the
  glossary's `pagedattention`). kwon2023 calls PagedAttention "an attention
  algorithm" (§1, §4: kwon2023.txt L174, L461–481). It builds vLLM's block
  manager on top. Fix: PagedAttention is the attention algorithm; vLLM adds
  the block manager.
- **C3-1:** *(fixed 2026-10-16)* chapter 3's measured callout says "as more requests run at once,
  throughput and median TTFT both rise" (`continuous-batching/index.mdx:187`,
  and L181). The raw files disagree in the middle levels. Median TTFT at 1,
  4, 8, 16, 32, and 64 requests (recomputed here):
  - vLLM: 41.2, 99.6, **91.2**, 93.7, 124.3, 162.8 ms
  - SGLang: 69.9, **68.8, 64.0**, 87.1, 125.7, 156.1 ms

  Audit 1's m11 fix reached only the sentence with the numbers. Fix: "from 1
  to 64" in both sentences. No number changes.
- **C3-2:** *(fixed 2026-10-16)* "Once admitted again, it computes its prompt and every token…
  vLLM V1 recomputes this way" (`continuous-batching/index.mdx:102–103`, and
  the glossary's `preemption`). vLLM turns prefix caching on by default
  (`config/cache.py` L140; `arg_utils.py` L2964). A re-admitted request then
  reuses its own cached blocks, which is what chapter 4 says (M8). The two
  chapters contradict each other. Chapter 3's runs have caching off, but the
  page never says so. Fix: state the condition, and add a "What this leaves
  out" line.
- **C4-1:** *(fixed 2026-10-16)* the glossary's "Admission" cites `scheduler.py L563–684`
  (`glossary.ts:532`). That range is `schedule()`'s start and the loop over
  running requests (L629). Waiting requests start at L873 ("Next, schedule
  the WAITING requests"), and admission happens by L1294. Fix: cite
  L873–1294.

**Minor.** Each has its location, evidence, and fix in the review file named.

Chapter 1 (`review-ch1-ch2.md`):
- C1-2: "Not all of that gap is GQA" misleads; the KV-head ratio alone (4×) exceeds the 3.4× gap.
- C1-3: "one token per step" (`index.mdx:21`); the prompt is read in one parallel step.
- C1-4: "Real requests are often shorter than the maximum context" has no citation (kwon2023 §1 supports it).
- C1-5: the 256-request cap line leaves out vLLM's 1,024 default on H100-class GPUs.
- C1-6: `MemoryBudget`'s "Fits…" heading and bar labels, and three prose sentences, carry no badge of their own.

Chapter 2 (`review-ch1-ch2.md`):
- C2-3: "The paper measured real systems on real workloads"; its Orca baselines were reimplementations, its workloads synthesized.
- C2-4: "reads … through its table" cites §4.1; the table is §4.3.
- C2-5: "Against Orca (Max), vLLM ran 4.3× more" has no citation of its own (§6.2, Fig. 13a).
- C2-6: "no per-request reservation"; the engine does reserve a region per request.
- C2-7: "need 64 to 376 slots" is one too many; KV peaks at length − 1.
- C2-8: "never preempts" comes one sentence before preemption is defined (audit 1 m15, partly fixed).
- C2-9: the `max-model-len-hurts-contiguous-only` test checks one setting; the prose says "every setting".
- C2-10: "two requests" and "reference count of 2" are typed by hand, not through `<Num>`.

Chapter 3 (`review-ch3-ch4.md`):
- C3-3: "running requests first, then waiting ones" cites L563–684; the waiting loop is L873 (audit 1 m9).
- C3-4: the token budget cites agrawal2024 §4.1; it is defined in §4.2 (also in the glossary).
- C3-5: three different `arg_utils.py` ranges across chapters 3–4, the sandbox, and SOURCES.md for the same default. The code says 70 GiB, not GB, and an A100-80GB also gets 256 (audit 1 M5).
- C3-6: "computes some prompt tokens or makes one output token" cites Orca; partial prompts are chunked prefill.
- C3-7: the glossary's "roofline" cites MATH.md for max(compute, memory); that is agrawal2024 §3.1 and SIM.md §5.
- C3-8: the 0.45 and 0.65 utilizations are not in the cited MATH.md section; they come from llmsize's data.
- C3-9: `runner.py L433` supports "words" only; "reused in turn" is L535.
- C3-10: "Each level's throughput includes the time its last requests took to finish" has no source.
- C3-11: "the budget matters only when prompts are long" is broader than its test.
- C3-12: "What this leaves out" calls only Figure 3.4's pool a toy; Figures 3.2–3.3 and 3.5–3.7 also differ from vLLM's pool.
- C3-13: the head-of-line-blocking line implies it is our simplification; vLLM's default FCFS blocks too.

Chapter 4 (`review-ch3-ch4.md`):
- C4-2: "cascade attention … can share those reads" is not in the cited `config/model.py` L284–290.
- C4-3: "asynchronous scheduling, which shifts TTFT" has no source.
- C4-4: "A large service runs several replicas" has no source.
- C4-5: the system-prompt sentence is a near-copy of zheng2024 §3.
- C4-6: 64, 4, 8, and 16 are typed by hand inside a `<Claim>`.
- C4-7: the glossary's "free queue" cites the free path for allocation, which is `block_pool.py` L669–703.
- C4-8: the `refcount-counts-sharers` test asserts at least 4; the page shows 8.

Data, sandbox, glossary, and SOURCES.md (`review-sandbox-data.md`):
- D-3: throughput badges link one log line; each number spans a range (L53–L56).
- D-4: bench-ieb's TTFT clock starts when the client sends, so it excludes client-side waiting. The glossary's TTFT includes queueing.
- D-5: the image tags rest on the log's pull-check lines; the pinned script has the image variables commented out.
- D-7: *(resolved 2026-10-16: #1 and #2 merged; `src/data` and every link re-pinned to llmsize `2cef2af`, no number changed; the live app shows 70)* llmsize PR #1 (the A10G fix) is still open, so the pin is off llmsize's `main`. The live llmsize app, which chapter 1 links, still shows 125 TFLOPS. PR #2's dead GPU `source_url`s are also open.
- D-8: llmsize's M4 Max bf16 figure (11.6 TFLOPS) is not in its `source_url`.
- D-9: there is no About page, though PRODUCT.md puts credibility there. The author is never named.
- D-10: SIM.md links point at `main`, not a pinned commit.
- S-2: vllm-src links open the repo root; labels like "config/cache.py" omit `vllm/`.
- S-5: the glossary's "cache hit" cites L146–147; the lookup is L143.
- S-7: the glossary's "usable memory" calls the driver reserve an assumption; for the A10G, L4, and L40S, llmsize derives it from ECC.
- S-8: the glossary's "block size" cites only kwon2023; add `config/cache.py` L71.
- S-9: the glossary's "free memory" and "gap" say "In this chapter" on the glossary page.
- S-10: the glossary's "serving engine … or SGLang" cites the vLLM paper, which predates SGLang.
- S-11: the sandbox's "Weights 15.0 GiB" has no badge of its own.
- SOURCES.md's kwon2023 row misdescribes the §4.1 footnote (`review-ch1-ch2.md`, end).

## 2. Accessibility

**axe** (axe-core via `@axe-core/playwright`). It ran on 9 pages × light and
dark × 375 and 1440 px × 3 browsers, which is 108 runs. At 1440 px it also
scanned every chapter step's figure in Chromium. The only violation is A1.

**Tab walk** (every page, 3 browsers, 1440 px). Each walk starts at "Skip to
content" and leaves the page after the last control:
- landing 15 stops, kv-cache 75, paged-attention 85, continuous-batching 101
- prefix-caching 71, sandbox 98, sandbox A/B 121, glossary 80, not-found 10

Every stop shows a focus ring, and none is visited twice. In Chromium and
Firefox every stop is scrolled into view; for WebKit see B2. The existing
interaction suites cover arrow keys, Enter, and Space in every widget; their
live run is under "Before and after".

**Live regions** (Chromium, every step's figure at 1440 px). The test played
for 3 s and then pressed Step 3 times:
- Chapters 1–3 and the sandbox announce nothing during play.
- On Step, a chapter readout announces 0.3–1 times per step.

**Reduced motion** (9 pages × 375 and 1440 px × 3 browsers):
- No autoplay.
- No running animation at any step.
- No element with a transition or animation.
- Every Play button is disabled.

**Contrast and color** (WCAG 2.x from `src/viz/tokens.css`, both themes, and
the dataviz palette validator; `docs/audit/2/contrast.txt`,
`palette.txt`):
- Body text is at least 6.27:1, and id labels at least 4.56:1 (M1).
- The waste hatch on `--surface` is at least 3.38:1 (M2).
- The focus ring is at least 9.95:1.
- Request colors on `--surface` are at least 3.75:1.
- Neighboring request slots pass color-blind separation: worst ΔE 14.4
  light and 14.7 dark (deutan).
- All-pairs still fails, as audit 1 found. Glyphs and patterns carry
  identity (M3).

**C2-2 (major, fixed 2026-10-16): the block grids' summary strip shows
request identity by color only.** Below each block grid on mobile, held blocks are filled with
their slot color (`BlockGrid.tsx:592–603`, `summary--slot-N`). There is no
pattern or glyph. That breaks CLAUDE.md ("Color is never the only encoding")
and DESIGN.md's request-mark rule; it is what remains of audit 1 M3. Fix: one
neutral `summary--held` fill. The grid above carries identity.

**Minor:**
- A1: the landing page has two `nav` landmarks named "Chapters" (`App.tsx:47`, `Landing.tsx:18`). axe's `landmark-unique` (moderate) fires in all 12 landing runs.
- A2: chapter 4's lookup readout (`cache__lookup`) is a polite live region that speaks during play: 4 announcements in 3 s at steps 3–10. CHAPTER_DOD item 8 and the chapter 4 plan keep readouts quiet while playing.
- A3: Step announces nothing in two places: the sandbox, where "KV in use at the playhead" and the event list change silently, and the figures at chapter 2 steps 1–2. Every other figure announces on Step.
- A4: *(fixed 2026-10-16: underlines on highlighted text states, ink flags or an outline on highlighted marks, in both themes; `tests/viz/css.test.ts`)* `--highlight` is the only cue for several states in the light theme: the current nav item, the active step number, the active strip block, bar, and band, and the selected sandbox tab. Yellow on `--surface` is 1.51:1, under WCAG 1.4.11's 3:1. Dark is 11.44:1.
- A5: in the summary strip, waste next to free blocks is 2.85:1 in light and 2.82:1 in dark, under 3:1.

## 3. Mobile and browsers

**Sizes and themes.** 9 pages × 375, 768, and 1440 px × light and dark × 3
browsers, 162 runs. On the wide board, every chapter step was checked too:
- horizontal overflow: 0 everywhere
- clipped SVG labels: none
- targets under 44 px at 375 and 768 px: none

**Touch** (Pixel 7 in Chromium and iPhone 13 in WebKit, every page):
- no target under 44 px, and no overflow
- every enabled Step tap advances its playhead, and every slider moves on a
  tap
- Range inputs are 44 px tall.

**Hover-only styles.** No `:hover` rule reveals content. **Safari and
WebKit:**
- **Sticky board:** WebKit, like Chromium and Firefox, keeps it 24 px from
  the top through every step.
- **Short screens:** below 560 px tall it stops being sticky and shows "Show
  in figure" (6–10 per chapter).
- **SVG text:** no clipped labels.
- **Workers:** the A/B sandbox finishes both runs in all 3 browsers in under
  1 s.

**Minor:**
- B1: *(fixed 2026-10-16: keyboard focus and a tap open each badge's meaning; every page with badges shows one legend; `e2e/badges.spec.ts`)* a provenance badge's meaning is only in its `title` tooltip ("Produced by the toy engine on this page. Not a measurement."), so touch and keyboard readers can't reach it. The visible word ("simulated") carries the main point (`ProvenanceBadge.tsx:47`).
- B2: in WebKit only, Tab focuses two sandbox inputs without scrolling them into view at 1440 px: "GPU memory fraction" (A/B) and "Prompt length: max". This may be WebKit's scroll timing; confirm by hand.

## 4. Performance

**Lighthouse 13.5.0** (mobile: simulated slow 4G and 4× CPU; desktop preset):

| page | form | perf | a11y | best pr. | SEO | LCP | CLS | TBT | JS KB |
|---|---|---|---|---|---|---|---|---|---|
| landing | mobile | 100 | 100 | 100 | 100 | 1.21 s | 0 | 0 ms | 71 |
| landing | desktop | 100 | 100 | 100 | 100 | 0.31 s | 0 | 0 ms | 71 |
| kv-cache | mobile | 100 | 100 | 100 | 100 | 1.40 s | 0 | 2 ms | 106 |
| kv-cache | desktop | 100 | 100 | 100 | 100 | 0.35 s | 0 | 0 ms | 105 |
| paged-attention | mobile | 100 | 100 | 100 | 100 | 1.42 s | 0 | 71 ms | 113 |
| paged-attention | desktop | 100 | 100 | 100 | 100 | 0.33 s | 0 | 0 ms | 113 |
| continuous-batching | mobile | **73** | 100 | 100 | 100 | 1.63 s | 0 | **1,694 ms** | 121 |
| continuous-batching | desktop | **83** | 100 | 100 | 100 | 0.34 s | 0 | **383 ms** | 121 |
| prefix-caching | mobile | **82** | 100 | 100 | 100 | 1.55 s | 0 | **715 ms** | 116 |
| prefix-caching | desktop | 98 | 100 | 100 | 100 | 0.35 s | 0 | 131 ms | 116 |
| sandbox | mobile | 100 | 100 | 100 | 100 | 1.55 s | 0 | 2 ms | 126 |
| sandbox | desktop | 100 | 100 | 100 | 100 | 0.38 s | 0 | 0 ms | 126 |
| glossary | mobile | 100 | 100 | 100 | 100 | 1.23 s | 0 | 0 ms | 79 |
| glossary | desktop | 100 | 100 | 100 | 100 | 0.34 s | 0 | 0 ms | 79 |

**JS per route** (as served, from the network log):
- The largest is the A/B sandbox: 125 KB with its worker (156 KB at gzip -9).
- Every route is under 200 KB.

**Per-widget frames** (`@perf` specs, Chromium, live site;
`docs/audit/2/perf.txt`):
- Every chapter at 1×: input max 24 ms, frames p95 16.8 ms, max 16.8 ms.
- At 4×: kv-cache, paged-attention, and prefix-caching pass (input max 32
  ms, frame p95 16.8 ms, max 33.4 ms).
- The sandbox's 5,000-request run passes: input delay 0.6 ms at 1× and
  6.8 ms at 4×.
- A/B playback passes: 305 frames in 5 s, max 16.8 ms.

**P1 (major, fixed 2026-10-16; residual P3): chapters 3 and 4 block the
main thread on load.** Their
figure modules run the chapter's simulations when they are imported
(`continuous-batching/figures.tsx:115`, `export const F`). Longest task on
load (PerformanceObserver, Chromium, live):
- continuous-batching: 302 ms at 1×, 1,206 ms at 4×
- prefix-caching: 137 ms at 1×, 515 ms at 4×
- kv-cache: none at 1×, 91 ms at 4×

During that time a tap or key press waits. Lighthouse scores chapter 3 at 73
mobile and 83 desktop (TBT 1,694 and 383 ms), and chapter 4 at 82 mobile.
Fix: compute the figures' numbers at build time (like `src/data`), or after
first paint.

**P3 (minor, added 2026-10-16): what P1 leaves on mobile.** At 412 px every
inline figure mounts on load and runs its own simulations. That is 66–98 ms
per figure at Lighthouse's 4× CPU, about a quarter of that at 1×. Lighthouse
mobile: chapter 3 99 and chapter 4 99–100, against the gate of 100 proposed
for P1. The fix would mount inline figures as they near the viewport. That
touches the shared chapter layout, deep links, and the narrow-width tests,
so it is the author's call.

**P2 (minor): chapter 3's Figure 3.6 at 4× CPU sits at the edge of the 18 ms
p95 rule.** It failed on the live site 3 times in 3 (p95 33.3 ms, max 33.4).
Locally, the pre-sandbox build `246347f` failed 1 run in 2, and the current
build 1 in 2, under the same load. So it is not a regression; one frame in 20
takes two vsyncs. No frame is over 50 ms.

## 5. Resilience

**Links** (`scripts/link-check.ts`). It found 84 unique external URLs in the
repo's text, the site's source, and the rendered pages:
- 73 return 2xx.
- 1 is a Cloudflare challenge (the ACM DOI), now counted as reachable (m2).
- 10 fail:
  - the 6 SIM.md URLs and 3 repo URLs in tasks/todo.md (G1)
  - the old `/Serving-Explainer/` URL, which audit 1 quotes
- The two USENIX pages that audit 1 saw challenged now return 200.

All 27 in-site links and anchors resolve, for example the sandbox's "Learn"
links to chapter sections.

**Requests:**
- No page makes a third-party request in any browser, before or after load.
- No page sets a cookie. localStorage holds only `theme`.
- After the load event, the only requests are the page's own route chunks,
  their CSS, and the sandbox worker.

**404 and metadata:**
- `/no-such-page/` returns 404 with "Page not found" and `noindex`.
- `/kv-cache/no-such-page/` and missing assets return 404.
- `/kv-cache` redirects (301) to `/kv-cache/`.
- Every route's raw HTML has its own title, description, canonical URL,
  `og:*`, `twitter:card` `summary_large_image`, and `lang="en"`. Its
  preview image returns 200 at 1200 × 630.

**R1 (major, fixed 2026-10-16): without JavaScript every page is blank.** With JavaScript off,
every route returns 200 with its title, but the body's text is empty. There
is no `<noscript>` message. Readers with scripts blocked see a white page with
no explanation. Fix: a `<noscript>` line in `index.html`. Prerendering the
prose is the larger option.

**R2 (major, fixed 2026-10-16): a sandbox worker that fails to load hangs
the run, with no error.**
- If the worker script fails to load (blocked here with a route abort), the
  run stays at "Run, 0 of 0 requests done" indefinitely. `useRun.ts` has no
  `onerror` handler on the worker.
- This happens in practice when a deploy replaces the hashed worker file
  while a reader's tab is open.
- With no `Worker` at all, the page throws "Worker is not a constructor"
  (uncaught), and runs stay "waiting".
- Fix: handle the worker's `error` event and a failed constructor, and show
  the error state with a reload hint.

## Before and after: audit 1 items

| item | audit 1 (2026-10-01) | audit 2 (2026-10-15) |
|---|---|---|
| B1 | blocker: no site | **resolved:** live, all routes 200, CI and deploy green |
| B2.1 design | open | resolved: B (Signal Box) is what ships |
| B2.2 visibility | open → "public" | **regressed: private again (G1)** |
| B2.3 rename | open | resolved: the site is at `/serving-explained/` |
| B2.4–B2.7 | open | resolved and built; M9's llmsize PR merged 2026-10-16 (D-7) |
| M1 label contrast | 4.35 and 4.36:1 | **fixed:** lowest 4.56:1 (slot 2, light) |
| M2 waste hatch | 2.73:1 (dark) | **fixed:** 3.38:1 dark, 3.47:1 light; the strip is A5 |
| M3 hue-only identity | glyphs dropped under 14 px | **partly:** marks, cells, strips, and timeline comply; the summary strip does not (C2-2) |
| M4 kwon2023 §8 | stretched | fixed |
| M5 `max_num_seqs` 256 | condition missing | fixed; line ranges and GiB disagree (C3-5) |
| M6 free-order cite | contradicting doc | fixed: cites `block_pool.py` L777–808 |
| M7 knob untested | no test | fixed: `longer-prefix-saves-more` asserts both trends |
| M8 absolute "nothing" | absolute | fixed in chapter 4 and PRODUCT.md; chapter 3 contradicts it (C3-2) |
| M9 A10G TFLOPS | 125 | fixed on the site (70); llmsize PR #1 merged 2026-10-16 (D-7) |
| m1 ink on highlight | 1.35:1 possible | fixed: a test forbids it (`tests/viz/css.test.ts`); still 1.35:1 if used |
| m2 link check | needed | **fixed in this audit:** `scripts/link-check.ts` |
| m3–m8 | wording | fixed |
| m9 decodes first | overstated | fixed; the line range misses the waiting loop (C3-3) |
| m10 "when unset" | missing | fixed |
| m11 "from 1 to 64" | missing | **partly:** two sentences still unscoped (C3-1) |
| m12–m14 | cites and wording | fixed |
| m15 preemption | forward reference | **partly:** "never preempts" before the definition (C2-8) |
| m16 A10G in chapter 3 | 125 | fixed: crossover 76 |
| m17 leaves-out gaps | gaps | fixed; C3-12 and C3-13 are framing |
| m18 claim ids | mismatched | fixed: all placed and asserted |
| m19 SOURCES "cited for" | gaps | fixed; one footnote misdescribed, line refs differ (D-6 in C3-5) |
| §3 note: 768 px, WebKit, Firefox, 44 px | added to the DoD | checked: all pass (§3) |
| Body text contrast | at least 5.58:1 (direction A) | at least 6.27:1 (B) |
| Focus ring | at least 11.44:1 | at least 9.95:1 (now including `--surface-2`) |
| Request colors vs surface | at least 3.73:1 | at least 3.75:1 |
| Neighbor ΔE (worst) | 13.5 | 14.4 light, 14.7 dark |
| Links | 48 URLs: 43 ok, 2 site 404, 3 challenged | 84 URLs: 73 ok, 1 challenged, 10 fail (G1) |
| Measured callout | matched the plan | matches the raw files again, and the live page |
| Author claims | #549, #550 merged | unchanged |
| **Not run in audit 1** | | |
| Correctness, 2 items | not named | claim tests and rendered numbers both checked (§1) |
| axe, every route, both themes | not run | 1 violation, minor (A1) |
| Keyboard walkthrough | not run | Tab walks pass in 3 browsers; WebKit B2 |
| `aria-live` at a polite rate | not run | quiet during play except A2; silent Step in A3 |
| Reduced motion | not run | passes everywhere |
| 3 browsers × 375, 768, 1440 | not run | passes everywhere |
| Touch | not run | passes; badge tooltip B1 (fixed 2026-10-16) |
| Safari: sticky, SVG text, workers | not run | passes |
| Lighthouse on every route | not run | 100 everywhere except P1 |
| JS per route under 200 KB | not run | at most 125 KB served |
| LCP on simulated 4G, layout shift | not run | LCP at most 1.63 s; CLS 0 everywhere |
| Per-widget frame times | not run | pass at 1×; P2 at 4× |
| No requests after load | not run | none third-party; own chunks only |
| No-JS and worker-failure fallbacks | not run | **R1, R2** |
| 404 page, per-route metadata | not run | pass |

Audit 1 counted 2 correctness items as not run but did not name them. I read
them as the two checks that needed code: claims about the simulation, and
numbers as rendered. Both ran.

The live interaction suites (smoke, the four chapters, and the sandbox) ran
in all three browsers as part of this audit: 322 passed, 74 skipped (the
screenshot and perf tests), and none failed.

## Fix order (approved 2026-10-16; items 1–6 done, see "Fixes")

1. **G1:** the author decides on repo visibility. If it stays private, move
   SIM.md onto the site. This is a setting, not code, and unblocks 39 links.
2. **Correctness majors** C1-1, C2-1, C3-1, C3-2, C4-1: wording and
   citations only. No number, preset, or sim API changes, and each keeps its
   claim test.
3. **R2:** worker error handling in `useRun.ts`, with an e2e test that blocks
   the worker.
4. **R1:** a `<noscript>` message, checked by a no-JS smoke test.
5. **C2-2:** a neutral summary-strip fill, checked by a render test.
6. **P1:** move chapter 3's and chapter 4's figure numbers off the load
   path: build-time data, the same generator pattern as `src/data`. Gate:
   Lighthouse 100 and no task over 50 ms at 1×.
7. **Minors**, grouped by file, in one pass per chapter: citations and line
   ranges first (C3-3–C3-5, C4-7, S-5, S-8, D-6), then wording, then the
   accessibility and test gaps. Some are the author's call: D-5, D-7, D-8,
   D-9, A4, B1, P2.
8. **Then run this audit again** with the same commands, and update this
   file.
