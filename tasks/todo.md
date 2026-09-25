# Tasks

## Prompt 0: rules and plans

- [x] CLAUDE.md: the author's rules, with grammar fixes only.
- [x] PRODUCT.md: audience, promise, four chapters plus sandbox, non-goals,
      credibility. Author facts checked with `gh` (vllm-metal #549 and #550 merged;
      both benchmark repos exist; llmsize = varad-more/llm-calculator).
- [x] DESIGN.md: directions A (Bench Notes) and B (Signal Box). Request palettes
      checked with a palette validator in light and dark: neighbors pass, all
      pairs cannot (see DESIGN.md). **Waiting on the author's pick.**
- [x] docs/SOURCES.md: 11 sources verified, code pinned to commits, 8 notes on
      traps and disagreements.
- [x] tasks/todo.md, tasks/lessons.md.

## Prompt 1: site shell (PLAN, waiting for approval)

Goal: a live, empty-but-real site with the shell every chapter will use.

### Decisions the author must make first

1. **Design direction:** A or B. This blocks step 6 and the OG images.
2. **Repo visibility:** `varad-more/Serving-Explainer` is private. Pages from a
   private repo needs a paid GitHub plan, and the site is public either way.
   Make the repo public?
3. **URL:** the user site `varad-more.github.io` has the custom domain
   `varadmore.me`, so this repo publishes at `https://varadmore.me/Serving-Explainer/`.
   The prompt wants `/serving-explained/`. That needs the repo renamed to
   `serving-explained`, which I recommend. Either way it is one env var.
4. **Permission** for steps that touch things outside this repo:
   - run `corepack enable` (pnpm is not installed; Node 24.21 ships corepack)
   - clone llm-calculator to `../llm-calculator`
   - push to `main` on GitHub
   - enable Pages with `build_type=workflow` through `gh api`

### Defaults I chose (say so to change any)

- **gen-data imports llmsize's TypeScript source directly** through Node 24's
  type stripping. It never needs to build `packages/core`. Tested against
  llmsize 51b9746: all 20 catalog models resolve. If the import fails, the
  script stops with a clear error. The alternative is building `dist` with
  llmsize's own tsc, which needs `pnpm install` inside the sibling repo.
- **Router: no library.** There are 7 fixed paths: no params, no nested layouts,
  no data loaders. A ~60-line `useSyncExternalStore` hook over `popstate` and a
  `<Link>` that intercepts plain left clicks cover it. react-router would add a
  runtime dependency for features we do not use. It would be the better choice
  only if we needed nested routes or loaders, and none are planned.
- **One env var, `SITE_URL`** (for example `https://varadmore.me/serving-explained/`).
  The base path is its pathname. Canonical and OG URLs need the origin too, so
  a bare base path would not be enough.
- **TypeScript:** the newest version typescript-eslint supports. npm's latest is
  7.0.2, the native port; if typescript-eslint cannot use it, I pin 6.x and say so.
- **Extra dev dependencies** beyond the prompt: `@vitejs/plugin-react`, `@types/mdx`,
  `@types/react`, `@types/react-dom`, `@types/node`, `@eslint/js`,
  `eslint-plugin-react-hooks`, and `@axe-core/playwright` (an accessibility check
  on the kitchen sink). Lighthouse runs through `pnpm dlx lighthouse@13`, so it is
  not a dependency. Runtime dependencies: `react` and `react-dom` only.
- **Component tests run in Playwright** against the kitchen sink. That checks
  keyboard use, focus, and reduced motion in a real browser without adding
  jsdom and Testing Library. vitest covers pure logic only.
- **Screenshot baselines are per platform.** Linux baselines come from a manual
  CI workflow that uploads them as an artifact. I review and commit them. macOS
  baselines are for local runs.
- **`pnpm sim`** prints "engine not built yet" and exits 1 until Prompt 2 adds
  the CLI.
- **Theme choice** is stored in `localStorage`. It is not a cookie and never
  leaves the browser.
- **No robots.txt or sitemap.** `varadmore.me/robots.txt` belongs to the user
  site repo.

### Steps

Each step ends with `pnpm test`, `pnpm typecheck`, `pnpm lint`, and `pnpm build`
passing, then one commit.

- [ ] **1. Scaffold.**
  - Pin pnpm in `packageManager`. Use Vite 8, React 19.3, TypeScript strict
    with `noUncheckedIndexedAccess`, and `@mdx-js/rollup` as a pre plugin.
  - Lint with ESLint flat config (typescript-eslint strict-type-checked plus
    react-hooks) and `prettier --check`.
  - Add vitest and Playwright. Alias `@` to `src` in tsconfig and Vite.
  - Folders: `src/sim` (`.gitkeep` until Prompt 2), `src/viz`, `src/chapters`,
    `src/data`, `scripts`, `docs`. Files at the src root: `src/main.tsx`,
    `src/routes.ts`, `src/router.ts`.
  - Scripts:
    - `dev`, `build` (vite build, then postbuild), `preview`
    - `test` (vitest run), `typecheck` (app and scripts tsconfigs)
    - `lint`, `e2e`
    - `gen:data`, `gen:sources`, `gen:og`
    - `sim`
  - `engines.node >= 24`, because the scripts run as TypeScript.
- [ ] **2. Routes and router.**
  - `src/routes.ts` holds metadata only (slug, title, description, OG image),
    so the Node postbuild script can import it.
  - Pages are `React.lazy` chunks, one per route.
  - Paths are normalized to a trailing slash, since Pages redirects `/x` to `/x/`.
  - On navigation: update `document.title`, scroll to the top or to the hash,
    and move focus to the `h1`.
  - An unknown path renders a not-found page.
  - Placeholders:
    - landing: promise plus a table of contents
    - four chapter MDX files, each in its own folder
    - sandbox
    - glossary, rendered from `src/chapters/glossary.ts`
  - Tests (vitest): path matching with base `/` and with `/serving-explained/`.
- [ ] **3. Static HTML per route.**
  - `scripts/postbuild.ts` writes `dist/<slug>/index.html` for every route, with
    that route's `<title>`, description, canonical, and `og:*` and `twitter:*`
    tags. The image is `og/<slug>.png`, absolute from `SITE_URL`.
  - It also writes `dist/404.html` (`noindex`) and adds `favicon.svg`, since a
    missing favicon logs a console error.
  - `scripts/gen-og.ts` renders a 1200×630 template per route with Playwright
    into `public/og/`, committed.
  - Tests: postbuild output has one file per route, unique titles, and absolute
    OG URLs.
- [ ] **4. Generated data from llmsize.**
  - First read `docs/MATH.md` and `packages/core/src/{kv,weights,model,data}.ts`
    in the checkout. Done for planning, at llmsize 51b9746.
  - `scripts/gen-data.ts` reads `LLMSIZE_DIR` (default `../llm-calculator`) and
    refuses a dirty checkout, so the commit in `_provenance` is true.
  - **Models: 10 qualify on the data.** The rule is no `moe`, `mla`, or `ssm`,
    every layer is `mha`, `gqa`, or `mqa` with a `dense` MLP, and no vision tower.
    That gives:
    - Llama-3.1 8B, 70B, 405B; Llama-3.2-3B
    - Qwen2.5 7B, 72B; Qwen3 8B, 32B
    - Mistral-7B-v0.3
    - Phi-3.5-mini
  - **GQA vs. MHA contrast, picked by the script:** the only MHA model,
    Phi-3.5-mini (32 KV heads × 96, 393,216 B/token in bf16), against the GQA
    model with the closest parameter count, Llama-3.2-3B (8 KV heads × 128,
    114,688 B/token).
  - Per model:
    - `id`, `attention`, `layers`, `attentionHeads`, `kvHeads`, `headDim`
    - `params` (from `parameterCounts`)
    - `weightBytesBf16` and `weightMethod` (from `weightBytes`)
    - `kvBytesPerTokenBf16` and `kvBytesPerTokenFp8` (from
      `kvBytesForSequence(m, 1, {tp:1, pp:1}, {kvDtype, blockSize: 1})`)
    - `embeddingParams` (from `parameterCounts`). The sim's cost model excludes
      the embedding table from streamed bytes, as llmsize does.
  - Per GPU (a10g-24, l4-24, l40s-48, h100-sxm-80, m4-max-128; all present):
    - `id`, `name`
    - `usableVramBytes` (from `usableVram`) and the reserved fraction used
    - `memBandwidthBytesPerSec`, `bf16Tflops`
    - `source_url` and llmsize's `notes`. On m4-max, bf16 is set equal to fp32.
  - Prompt 2's cross-check numbers also come from here: `estimateThroughput`
    results for the 3 configs in SIM.md §10 go into `src/data/roofline-ref.json`,
    along with llmsize's `mbu_decode` and `mfu_prefill` and their sources.
  - Every file gets `_provenance`: llmsize commit, `generated_at`, functions used,
    and a pinned MATH.md URL.
  - Test: a zod schema for each file.
- [ ] **5. Sources data.** `scripts/gen-sources.ts` turns docs/SOURCES.md into
  `src/data/sources.json`.
  - Test: the JSON matches a fresh parse, so it is never stale.
  - Test: every `SourceLink` id used in `src/**/*.mdx` exists.
- [ ] **6. Design system** (the chosen direction).
  - `src/viz/tokens.css`: light by default, dark under `prefers-color-scheme`
    unless `[data-theme=light]`, and `[data-theme=dark]` forced. A tiny inline
    head script sets the theme before paint. The toggle cycles system, light,
    and dark.
  - Components in `src/viz/ui/`:
    - ChapterLayout: sticky figure with IntersectionObserver steps; stacked on
      mobile per DESIGN.md.
    - Step, Figure with caption, Callout (`simplification` and `reality-check`).
    - ProvenanceBadge: a discriminated union, so `measured` without `href` is a
      type error.
    - Slider (native range, label, output), Toggle (`role="switch"`), Select
      (native).
    - PlaybackBar: play, pause, step, scrub, and speed. Play is disabled under
      reduced motion.
    - GlossaryTerm: opens on hover, focus, and tap. Escape closes it, and it
      stays open while hovered.
    - SourceLink, CheckYourself (`<details>`).
  - `/kitchen-sink` is registered only when `import.meta.env.DEV` or
    `VITE_KITCHEN_SINK=1`. A check confirms the production `dist` has no
    kitchen-sink chunk.
- [ ] **7. Playwright.**
  - Smoke test against `vite preview` of the production build: every route
    returns 200 from its own `index.html`, has no console errors, and has a
    unique title and `og:image`, both in the raw HTML and after hydration.
  - Kitchen sink: keyboard checks per control and axe with no violations.
  - Screenshots at 375 and 1440, in light and dark: 4 baselines.
- [ ] **8. CI and deploy.**
  - `.github/workflows/ci.yml` on every push: pnpm install `--frozen-lockfile`,
    typecheck, lint, test, build with `SITE_URL`, Playwright smoke and kitchen
    sink, then upload the Pages artifact.
  - On `main`, the deploy job runs with `configure-pages`, `upload-pages-artifact`,
    and `deploy-pages`, at their current majors (checked today: v6, v5, v5). It
    uses `concurrency: pages` and least-privilege `permissions`.
  - README stub: one sentence and the live URL.
- [ ] **9. Verify live.**
  - Every route returns 200 at the Pages URL, checked with curl and with the
    smoke suite pointed at the live site.
  - Lighthouse (mobile and desktop) on `/` and `/kv-cache/`, recorded below.

### Results

_Empty until the steps run._

## Prompt 2: sim engine

- [x] Read the vLLM paper (§4.2–4.5 and §7.2–7.3, from the arXiv HTML) and
      vllm-apc-doc myself. A subagent read the V1 scheduler and KV manager code
      at `cfd54ca8`. I re-read `BlockPool.free_blocks`, `prepend_n`, and
      `allocate_slots` myself.
- [ ] STOP 1: docs/SIM.md is written and waiting for approval, with 8 open
      questions in §11.
- [ ] Implementation, after approval. It depends on Prompt 1 steps 1 (vitest)
      and 4 (gen-data, for the roofline cross-check).
- [ ] STOP 2 report.

## Prompt 3: KV cache chapter (PLAN, waiting for approval)

- [x] Part A: docs/CHAPTER_DOD.md written (22 items).
- [x] Sources: added ainslie2023 (GQA), verified on the ACL Anthology. Note 10
      records an llmsize vs. vLLM gap on memory utilization.
- [x] PRODUCT.md chapter 1 objective and misconception updated to Prompt 3's
      wording, so DoD item 1 checks the current objective.
- [ ] Part B: the chapter, after approval.

### Depends on

- **The Prompt 1 shell:** components, routes, postbuild, OG images, gen-data,
  Playwright, and CI. All of its decisions are still open.
- **The sim (Prompt 2):** the step 1–2 figure animates one request's event log,
  per CLAUDE.md's visual rules. SIM.md approval is still open.
- **Proposed order:** Prompt 1 steps 1–4, then the sim, then Prompt 1 steps 5–9,
  then this chapter.

### Decisions for the author

1. **ffmpeg** (`brew install ffmpeg`). Playwright records only webm, and the DoD
   needs mp4 and gif. It is a tool on this machine, not a repo dependency.
   `pnpm capture` stops with a clear message if it is missing.
2. **Badge rule** (DoD item 3). One badge may cover a readout or figure. Numbers
   quoted from a source get a SourceLink instead. Definitional constants get
   neither. This is how I read CLAUDE.md's "every number".
3. **Step 1 wording.** With a cache, the new token still attends to every earlier
   token. What the cache saves is rerunning the model over earlier tokens to
   rebuild their keys and values (kwon2023 §2.2). So step 1 says "reruns the
   model over every earlier token," not "recomputes attention."
4. **What "free memory" means.** Free memory is llmsize's usable VRAM minus the
   weights, as the prompt says. vLLM also keeps 8% back by default
   (`gpu_memory_utilization` 0.92, vllm-src) and reserves activation and
   CUDA-graph memory. So the widget's max concurrency is an upper bound. The
   callout says so and links llmsize's full planner.
5. **Model picker.** It has all 10 dense models. Three of them (Llama-3.1-70B,
   Llama-3.1-405B, Qwen2.5-72B) never fit on one listed GPU in bf16. For those,
   the widget says "weights alone do not fit." The alternative is to drop them.

### Numbers behind this plan (llmsize 51b9746, computed today)

| model | KV per token, bf16 | weights | max context |
|---|---|---|---|
| Llama-3.1-8B | 131,072 B (128 KiB) | 14.96 GiB | 131,072 |
| Llama-3.2-3B | 114,688 B (112 KiB) | 5.98 GiB | 131,072 |
| Phi-3.5-mini | 393,216 B (384 KiB) | 7.12 GiB | 131,072 |
| Qwen2.5-7B | 57,344 B (56 KiB) | 14.19 GiB | 32,768 |

- **Usable memory:** the A10G and L4 have 22.50 GiB (llmsize reserves 6.25% on
  GDDR6). The L40S has 45.00, the H100 SXM 79.68, and the M4 Max 96.00 (Metal's
  75% cap).
- **Llama-3.1-8B on an A10G in bf16:** 7.54 GiB is free. Max concurrency is 15 at
  4K tokens, 7 at 8K, 1 at 32K, and 0 at 128K. The model's own full context
  does not fit even once. On an H100: 129, 64, 16, and 4.
- **fp8 KV is exactly half of bf16** in llmsize: 1-byte elements, with
  per-tensor scales ignored (llmsize-math, KV dtype). vLLM stores fp8 as 1 byte
  (vllm-src `torch_utils.py` L39–41).

### Data (added to Prompt 1 step 4)

- `models.json` gets `maxContext`, from llmsize's `maxPositionEmbeddings`.
- New `src/data/kv-ref.json` holds llmsize's `kvBytesForSequence` for every model
  × {bf16, fp8} × context stop, at block size 16. The widget's arithmetic is
  tested against it, so browser math cannot drift from llmsize.

### Scroll steps

Each step has one idea, one figure state, its claim ids, and its sources.

1. **Without a cache, work keeps growing.** The model makes one token per step.
   Without a cache, each step reruns the model over the whole sequence and
   rebuilds keys and values for every earlier token.
   - **Figure A (TokenGrid, no-cache mode):** one request with a 6-token prompt
     and 6 outputs, from a sim run.
     - Rows are Llama-3.1-8B's 32 layers; columns are token positions.
     - Each step lights every column it computes.
     - Counter: positions computed this step, and in total (6, 7, … 11; 51 in
       total).
   - Claim: `no-cache-work`. Sources: kwon2023 §2.2.
2. **With a cache, each step adds one column.** The figure switches to cache
   mode. Each step computes one new column in every layer and stores it. Earlier
   columns are read, not rebuilt. In total, 11 positions are computed instead of
   51.
   - The newest sampled token has no column yet. Its keys and values are
     computed in the next step (SIM.md §3).
   - Claims: `cache-one-column`, `cache-total`. Sources: kwon2023 §2.2.
3. **How big one column is.** A MathML formula (native, no dependency):
   bytes per token = 2 × L × n_kv × d_h × s. Every symbol is bound live to the
   model picked inline, with the product and a `computed` badge.
   - A note says engines store whole blocks of 16 tokens, so a request is
     charged in steps of 16 (llmsize-math, KV token count).
   - Claim: `formula-matches-data`. Sources: llmsize-math (KV per token),
     kwon2023 §3.
4. **GQA: fewer KV heads, smaller cache.** The data has a contrast, so this step
   stays.
   - Phi-3.5-mini gives each of its 32 query heads its own KV head. Llama-3.2-3B
     shares 8 KV heads among 24 query heads.
   - Per token, that is 384 KiB vs. 112 KiB (3.4×). The weights differ by only
     1.2× (7.1 vs. 6.0 GiB).
   - On an A10G at 8K tokens: 5 requests vs. 18.
   - Claim: `gqa-smaller`. Sources: ainslie2023 §2.2, llmsize-math.
5. **The memory budget** (main widget, sticky). The weights bar stays fixed.
   KV = per-request bytes × requests. Drag context, then drag concurrency past
   the limit.
   - The default state fits: Llama-3.1-8B, A10G, bf16, 8K tokens, 4 requests.
     At 8 requests it does not fit.
   - **The misconception, stated honestly.** On an A10G, the weights do take two
     thirds of usable memory (14.96 of 22.50 GiB). What they leave over is what
     sets concurrency. Switch to an H100 and the weights stay 14.96 GiB. At 8K
     tokens, 64 requests then hold 64 GiB of KV, 4.3× the weights. So weights
     are a fixed cost, and the KV cache is what grows.
   - Claims: `weights-fixed`, `kv-linear`, `default-crosses`,
     `kv-outgrows-weights` (on the H100 at 8K tokens and max concurrency, KV is
     more than 4× the weights).
   - Sources: kwon2023 §1 (weights persist; KV is allocated per request) and §3;
     llmsize-math.
6. **Takeaway.** Max concurrency ≈ free memory ÷ KV bytes per request.
   - Doubling context halves it. fp8 KV doubles it.
   - Memory, not compute, is what caps the batch (kwon2023 §3).
   - Teaser: real requests are shorter than the max. How the engine reserves
     memory for them decides how close it gets to this number. That is the next
     chapter.
   - Claims: `max-conc-formula`, `double-context-halves`, `fp8-doubles`.
- **CheckYourself:** "Qwen2.5-7B stores 56 KiB per token. On an A10G, about how
  many 16K-token requests fit? What happens with fp8?" Numbers come from data
  through `<Num>`, and the answer is revealed with its working.
- **What this leaves out:**
  - activation, CUDA-graph, logits, and runtime memory (llmsize-math, Overhead)
  - vLLM's 8% holdback (vllm-src)
  - the `max_num_seqs` cap of 256 in `vllm serve` on GPUs under 70 GB (vllm-src)
  - every request held at full context (chapter 2)
  - prefix sharing (chapter 4)
  - one GPU, no tensor parallelism
  - dense full-attention models only, so no MLA, sliding window, or hybrid models
    (llmsize-math)
  - fp8 for the KV cache only, with the weights still bf16
  - the no-cache count is token positions, not FLOPs or time
- **Go deeper:** kwon2023 §2–3, ainslie2023, llmsize-math, and the llmsize app
  for full planning.

### Widget spec

**MemoryBudget** (`src/chapters/kv-cache/MemoryBudget.tsx`). The pure math lives
in `budget.ts`.

- **Controls,** in this order:
  - Model and GPU: `Select`.
  - KV dtype: a native radio pair, bf16 and fp8. Arrow keys work natively.
  - Context: a `Slider` over log stops 256, 384, 512, 768, 1K, … 96K, 128K. Stops
    above the model's max are dropped, and the max itself is added if it is not
    a stop. When the model changes, context is clamped to the new max and a
    polite live region says so.
  - Concurrency: a `Slider` over 1, 2, 3, 4, 6, 8, 12, … 384, 512. That is a log
    scale; a linear 1–512 slider is unusable at small values.
- **Stacked bar:** fixed SVG height and a fixed scale, so there is no layout
  shift.
  - Weights, KV, and free segments are each labeled with GiB, using pattern plus
    token color, never color alone.
  - **Does not fit:** past the capacity line, KV runs into a hatched overflow
    zone with a break mark. The heading reads "Does not fit: needs X GiB of
    Y GiB."
  - **Weights alone too big:** the bar shows only the overflow, and the readout
    gives 0 with the reason.
- **Readout:** "Max concurrency at 8,192 tokens: 7" (`computed`).
- **Line chart:** log–log, with context on x and max concurrency on y. A slope of
  −1 shows "double the context, half the requests."
  - The current point is marked. The curve stops below 1 request, with the label
    "no request fits past N tokens."
  - Focus and hover show a tooltip; a table view sits under `<details>`.
- **Simplification callout:** the overheads and the holdback above, with a link
  to llmsize.
- **375 px:** controls stack above the figure, and the bar and chart go full
  width.

**TokenGrid** (`src/chapters/kv-cache/TokenGrid.tsx`): figures for steps 1–2.

- 32 × 12 cells (384 SVG rects), driven by one sim run's event log.
- The `PlaybackBar` scrubs engine steps 0–5.
- Under reduced motion: no transitions, step buttons only.

**Presets** (`src/chapters/kv-cache/presets.ts`) export the TokenGrid run config
and the MemoryBudget defaults. Both the chapter and its tests import them.

### Tests

**`tests/chapters/kv-cache.test.ts`** (vitest), one test per claim id:
- `formula-matches-data`: for every picker model and dtype, 2 × L × n_kv × d_h × s
  equals `models.json` and `kv-ref.json` (llmsize).
- `max-conc-formula`: the widget's max concurrency equals
  ⌊(usable − weights) / kvBytesForSequence⌋. Checked from kv-ref for every
  model × GPU × dtype × context stop.
- `double-context-halves`: wherever the model fits and both c and 2c are stops,
  mc(2c) = ⌊mc(c) / 2⌋. This is exact, because every stop is a multiple of 16.
- `fp8-doubles`: mc(fp8) is 2·mc(bf16) or 2·mc(bf16) + 1 (floor rounding).
- `weights-fixed`, `kv-linear`, `default-crosses`, `kv-outgrows-weights`,
  `gqa-smaller` (ratio ≥ 3 in KV, ≤ 1.25 in weights).
- `no-cache-work`, `cache-one-column`, `cache-total`: from the TokenGrid preset's
  sim log.
- Meta-test: the claim ids in `kv-cache.mdx` match the test ids exactly.

**`tests/chapters/writing.test.ts`** (all chapters): sentence length, hype words,
GlossaryTerm ids, and SourceLink ids.

**`e2e/kv-cache.spec.ts`** (Playwright):
- Screenshots at 375 and 1440 px, light and dark.
- MemoryBudget: arrow-key concurrency from 4 to 8 shows "Does not fit". Changing
  context changes the readout. fp8 doubles it.
- TokenGrid: Step changes the counter.
- Formula: changing the model changes the product.
- CLS is 0, there are no console errors, and axe passes.
- Performance: Event Timing max and p95, and rAF intervals during TokenGrid
  playback, with and without 4× CPU throttling.

**Capture** (`scripts/capture.ts kv-cache`):
- Playwright `recordVideo` at 1280×720 runs an 8 s script: context from 1K to
  32K, then fp8, then concurrency past the limit.
- ffmpeg writes an H.264 mp4 and a 12 fps GIF at 720 px with a generated
  palette. The script asserts the GIF is under 3 MB.

**Review and route:** a fresh-eyes review by a sub-agent (DoD item 20). The
route `/kv-cache/` gets the title "The KV cache", its description, and
`og/kv-cache.png`.

**Glossary terms added:**
- token, context length, layer
- key, value, KV cache
- attention head, KV head, head dimension
- MHA, GQA
- bf16, fp8, GiB
- prefill, decode, concurrency

### DoD checklist (docs/CHAPTER_DOD.md)

Each item is ticked with how it was verified.

- [ ] 1 objective and CheckYourself
- [ ] 2 sources
- [ ] 3 provenance
- [ ] 4 claims tested
- [ ] 5 writing rules
- [ ] 6 end sections
- [ ] 7 keyboard
- [ ] 8 labels
- [ ] 9 playback
- [ ] 10 reduced motion
- [ ] 11 sizes and themes
- [ ] 12 no layout shift
- [ ] 13 no console errors
- [ ] 14 axe
- [ ] 15 interactions within 100 ms
- [ ] 16 60 fps
- [ ] 17 screenshots
- [ ] 18 interaction tests
- [ ] 19 checks pass
- [ ] 20 fresh-eyes review
- [ ] 21 capture
- [ ] 22 route HTML

## Prompt 4: paged attention chapter (PLAN, waiting for approval)

- [x] Read kwon2023 §1, §3, §4.1–4.4, §6.1–6.2, §7.1–7.2, §8, and §9 for this
      plan. The text comes from the PDF, because the arXiv HTML drops numbers
      such as "2.2×" (SOURCES.md note 11).
- [x] PRODUCT.md chapter 2 updated to Prompt 4's objective and misconception.
- [x] SIM.md draft: added the preset `paged-vs-contiguous` and per-preset engine
      overrides (`seed`, `kv`, `scheduler`) to the `Preset` type. SIM.md is not
      approved yet, so this is still a draft change.
- [ ] The chapter, after approval.

### Depends on

- Everything chapter 1 depends on, plus chapter 1 itself, for the recap link.
- The engine's contiguous-max allocator and the `StepEnd.kv` fields from
  SIM.md §2.2.

### What the paper says, for the misconception and the reality check

All of these are from kwon2023, checked in the PDF.

- **It calls PagedAttention "an attention algorithm"** (§1). The kernel was
  rewritten to read keys and values from blocks that are not contiguous.
- **That kernel is slower:** 20–26% higher attention-kernel latency than
  FasterTransformer's (§7.1, Fig. 18a). The causes are block-table access,
  extra branches, and variable lengths.
- **The gain is end to end:** 2–4× throughput at similar latency against
  FasterTransformer and Orca (abstract, §9). It comes from batching more
  requests (§6.2, §9). On ShareGPT with OPT-13B, vLLM runs 2.2× more requests at
  once than Orca (Oracle) and 4.3× more than Orca (Max) (§6.2, Fig. 13a).
- **Paging can hurt** when a workload is compute-bound and memory is not the
  limit (§8).
- **Waste in earlier systems:** in the §6.2 experiments, token states filled
  only 20.4–38.2% of KV memory in the paper's Orca baselines, vs. 96.3% in vLLM
  (§1, Fig. 2). Orca (Max) reserves the model's maximum length, as our
  contiguous allocator does (§6.1).

### Decisions for the author

1. **At most 8 live requests per grid.** DESIGN.md caps every widget at 8 live
   requests, so each one has its own color and glyph.
   - The preset sets `max_num_seqs` to 8, and shrinks KV to 1,280 tokens so that
     memory binds at about the same point.
   - The chapter says vLLM's default cap is 256 (vllm-src).
   - The alternative is to let colors repeat beyond 8. I advise against it,
     because two live requests would then look the same.
2. **A toy GPU.** 1,280 tokens is about 1/48 of the 61,787 tokens an A10G has
   free after Llama-3.1-8B's weights (computed). The widget labels it "toy GPU:
   1,280 tokens of KV". Step times still come from the Llama-3.1-8B on A10G
   roofline, so playback runs at a plausible pace.
3. **"Gaps between regions."** With equal `max_model_len` regions, a freed
   region always fits the next request exactly. So the only gap is the leftover
   at the end of memory, capacity mod `max_model_len`.
   - At the default 512, that is 256 tokens, 20% of capacity, and the
     `max_model_len` control changes it.
   - The paper's baselines also had gaps from buddy allocation (Fig. 3), which
     we do not model. The chapter labels the gap "free space too small for a
     region" and says this.
   - Real gaps between regions would need SIM.md Q4 (regions sized per request).
     This chapter's tests do not need it.
4. **"Requests admitted"** means admitted and not yet finished, so it is the
   running count. The peak-concurrency test uses it.
5. **Paged can preempt.** Packing more requests in means memory can run out
   mid-generation. The preset is tuned so this is rare (at most 2). The paged
   readout shows a preemption count whenever it is nonzero, rather than hiding
   it. Preemption itself is explained in chapter 3.
6. **Lockstep is by sim time, not step index.** The two allocators run batches
   of different sizes, so their steps have different durations. One
   `PlaybackBar` sets time t, and each grid shows its own latest `StepEnd` at or
   before t. Arrivals line up, which a shared step index would not do.

### Preset `paged-vs-contiguous` (SIM.md §7, tentative)

- **Workload:** seed 7; 40 requests, Poisson at 1.5/s.
  - Prompt body uniform 32–128 tokens, with no shared prefix.
  - Output lognormal, median 100, σ 0.6, clipped to 16–256.
- **Lengths:** the workload's `maxModelLen` is 384, and the engine's
  `max_model_len` defaults to 512. Every `max_model_len` option (384, 512, 640,
  768, 1024) therefore leaves the requests unchanged, so the control isolates
  the reservation.
- **KV:** 1,280 tokens (80 blocks at B 16), prefix caching off.
- **Scheduler:** continuous, `max_num_seqs` 8, budget 2048, chunked prefill on.
  The cost model is Llama-3.1-8B on a10g-24.
- **Why it shows the difference within about 20 s at 1× playback:**
  - A decode step takes about 38 ms, so a request takes about 4 s.
  - Contiguous fits 2 regions (1,024 tokens plus the 256-token gap), so it serves
    about 0.5 requests/s. At 1.5 arrivals/s, its queue grows by about 1 per
    second.
  - Paged holds about 140 tokens per request, so about 8 fit, enough for about
    2 requests/s.
- These are estimates. I tune the numbers until the tests in "Tests" pass, then
  write the final values into SIM.md.

### Scroll steps

1. **Recap.** Each token adds KV in every layer. For Llama-3.1-8B that is
   128 KiB per token, via `<Num>` (computed). Links to chapter 1.
2. **Contiguous reservation.** The grid runs the preset with the contiguous
   allocator only.
   - Each arriving request reserves 512 tokens at once. Filled slots grow;
     the rest of the region stays hatched as "reserved, not holding KV."
   - The leftover at the end is marked "gap."
   - Prose: the paper splits our "reserved" into slots kept for future tokens
     and slots never used (Fig. 3).
   - Claims: `contiguous-wastes-most`, `contiguous-waste-split`.
   - Sources: kwon2023 §3.1 and Fig. 3; yu2022 §4.2.
3. **The paged idea.** The same preset with the paged allocator only.
   - Blocks of 16 tokens fill left to right. A new block is taken only when the
     last one is full, like pages in an operating system.
   - Claims: `paged-on-demand`, `paged-waste-bound`.
   - Sources: kwon2023 §4.2–4.3.
4. **The block table.** One running request's tokens are shown as a strip
   grouped into logical blocks, next to its table and the physical grid.
   - Hovering, tapping, or arrowing to a token highlights its logical block,
     its table row, and its physical block.
   - The figure pauses at a step where that request's blocks are scattered.
   - Claim: `table-scattered`. Sources: kwon2023 §4.1–4.2.
5. **Side by side.** Compare mode, with one `PlaybackBar` over sim time.
   - Readouts on each side: running, waiting, KV used, waste percent.
   - **Reality-check callout:** the paper's Fig. 2 numbers, labeled as the
     paper's, and next to them a line saying ours are simulated on a toy preset.
   - **Misconception callout:** the four facts from "What the paper says."
   - Claims: `paged-admits-more`, `paged-less-waste`, `visible-in-20s`.
   - Sources: kwon2023 §1, §6.2, §7.1, §8, §9.
6. **Block size.** A slider over 8, 16, 32, 64, and 128, with capacity fixed at
   1,280 tokens. The grid redraws with the new block size.
   - Two small charts come from 5 preset runs: mean paged waste percent vs.
     block size, and mean table length per running request vs. block size. They
     are drawn as two charts, not one with two axes.
   - Prose on speed stays qualitative: too small a block underuses the GPU's
     parallelism (kwon2023 §7.2).
   - The paper's own numbers are quoted with their source: on ShareGPT, sizes
     16–128 did best; on Alpaca, 16 and 32. vLLM's default is 16 (§7.2).
   - Claims: `block-size-raises-waste`, `block-size-shortens-tables`.
7. **Teaser: shared blocks.** A tiny sim run: block size 4, two requests sharing
   an 8-token prefix, prefix caching on. Both tables point at the same physical
   blocks, each with reference count 2. Links to chapter 4.
   - Claim: `shared-refcount`. Sources: kwon2023 §4.4, vllm-apc-doc.
- **CheckYourself** (predict, then run): "Raise `max_model_len` from 512 to
  1024. What happens to contiguous's running count? To paged's?" The answer
  says contiguous drops to 1 and paged does not change at all. The control is
  then unlocked to try it.
  - Claim: `max-model-len-hurts-contiguous-only`.
- **What this leaves out:**
  - buddy allocation and its gaps (kwon2023 Fig. 3)
  - the toy capacity and the cap of 8; vLLM's default `max_num_seqs` is 256
  - the paged kernel's slowdown is not charged to step time (SIM.md §9.4)
  - copy-on-write, beam search, and parallel sampling (kwon2023 §4.4)
  - CPU swapping (kwon2023 §4.5); V1 recomputes instead
  - the null block, lookahead, and async scheduling (SIM.md §9)
  - one table per request for all layers (kwon2023 §4.1 footnote: no
    performance difference)
  - block-size effects on kernel speed are left qualitative
- **Go deeper:** kwon2023 §3–4 and §7, vllm-pa-doc (kernel history), vllm-src
  (`block_pool.py`, `kv_cache_manager.py`), yu2022 §4.2.

### Widget spec

**BlockGrid** (`src/chapters/paged-attention/BlockGrid.tsx`). Frames are
rebuilt from the event log in `frames.ts`.

- **Geometry:** one cell is one block (B slots) for both allocators. The
  contiguous address space uses the same cells, so the two grids line up.
  - Desktop has 16 columns of cells about 28 px wide. Mobile has 8 columns,
    about 40 px.
  - At B 16 that is 80 cells. B 8 has 160 and B 128 has 10.
- **Cell encoding:**
  - request slot color (DESIGN.md `--req-k`), plus glyph, plus an "r3" label
    when the cell is at least 24 px
  - fill level as a bar growing from the bottom, filled / B
  - reserved, unused slots in the gray hatch (DESIGN.md block states)
  - the gap with a dotted outline and a "gap" label
  - free blocks as an outline only
- **Mobile (375 px):** at most 48 cells per grid, with a zoom-out summary bar.
  - The bar is an 8 px strip of every block, colored and patterned by state,
    with a bracket marking the visible window.
  - Prev and next buttons move the window. Cells never shrink below 40 px.
- **SVG:** compare mode at B 8 has about 960 elements, under DESIGN's
  2,000-element limit, so no Canvas.
- **Selection:**
  - Tapping or clicking a cell selects its request.
  - From the keyboard, the grid is one tab stop: arrow keys move a cell cursor
    and Enter selects (roving focus, `role="grid"`).
  - A request `Select` is the fallback.
- **BlockTablePanel:**
  - paged: rows of logical i → physical id, with fill out of B
  - contiguous: region start, length, and used
- **PlaybackBar:**
  - Time t runs from 0 to the end; 1× is 1 sim second per wall second, with
    speeds of 0.5×, 1×, 2×, and 4×.
  - Step jumps to the next `StepEnd`.
  - The rendered frame is a pure function of t and the log. rAF only moves the
    playhead.
- **Controls:** each change re-runs both sims (40 requests, a few ms) and keeps
  t.
  - block size: a slider over 5 stops
  - arrival rate: a slider, 0.5–3/s in steps of 0.25
  - output spread: a slider over lognormal σ, 0–1.0 in steps of 0.1, with the
    median fixed
  - `max_model_len`: a select over 384, 512, 640, 768, and 1024
- **Readouts per grid** (`simulated`):
  - running, waiting, and KV used %
  - waste % (contiguous: reserved-unused % + gap %; paged: last-block %)
  - preemptions, when nonzero
  - The live region speaks on pause and step only, not during play.

**TokenStrip** (step 4) and **SharedBlocks** (step 7) are small figures. They
share the frame builder.

### Tests

**`tests/chapters/paged-attention.test.ts`** (vitest, on the exact
`paged-vs-contiguous` preset):

- **`paged-admits-more`:** peak running, paged > contiguous (strictly).
- **`paged-waste-bound`:** at every step, for every request holding blocks,
  blocks × B − computed tokens ≤ B − 1. Checked at every block-size option.
- **`contiguous-waste-split`:** reserved-unused + gaps equals the total waste,
  where the total is computed independently from the snapshot regions as
  capacity − tokens held − usable free space.
- **`block-size-raises-waste`:** mean paged waste rises strictly over 8, 16, 32,
  64, and 128.
- **`contiguous-wastes-most`:** mean contiguous waste over the first 20 s is more
  than 50% of capacity.
- **`paged-less-waste`:** paged mean waste is below contiguous's.
- **`paged-on-demand`:** at every step, every block in a table except the last
  is full.
- **`table-scattered`:** at the step-4 figure's step, the selected request's
  physical blocks are not consecutive.
- **`visible-in-20s`:** the three tuning targets in "Preset".
- **`block-size-shortens-tables`:** mean table length falls as B rises.
- **`max-model-len-hurts-contiguous-only`:** at 1024, contiguous's peak running
  falls, and the paged run's `hashEvents` is identical to the one at 512.
- **`shared-refcount`:** the shared blocks have reference count 2 while both
  requests run.
- **`frames-match-snapshots`:** replaying the log rebuilds the engine snapshot at
  every step, so the widget draws what the engine did.
- **Meta-test:** claim ids match test ids.

**`e2e/paged-attention.spec.ts`** (Playwright):
- Screenshots at 375 and 1440 px, light and dark, paused at t = 12 s.
- **BlockGrid:**
  - Step changes the readouts.
  - Block size 16 → 64 changes the paged waste %.
  - `max_model_len` 512 → 1024 changes contiguous's running count.
- **TokenStrip:** an arrow key moves the highlighted row ("logical 2 → physical
  37").
- **SharedBlocks:** Step shows "ref count 2".
- **At 375 px:** at most 48 cells, a visible summary bar, and Next moves the
  window.
- CLS 0, no console errors, axe passes.
- **Performance** (with and without 4× throttling):
  - Event Timing on control changes, which re-run both sims.
  - rAF intervals during compare playback at B 8, the heaviest frame.

**Capture, review, and route:**
- **Capture:** 8 s of compare mode at 2× from t = 0, as mp4 and GIF.
- **Fresh-eyes review:** done by a sub-agent.
- **Route:** `/paged-attention/` with the title "Paged attention" and
  `og/paged-attention.png`.

**Glossary terms added:**
- block, block size, block table
- logical block, physical block
- contiguous allocation, reservation
- internal fragmentation, external fragmentation, gap
- reference count
- `max_model_len`, page

### DoD checklist (docs/CHAPTER_DOD.md)

- [ ] 1 objective and CheckYourself
- [ ] 2 sources
- [ ] 3 provenance
- [ ] 4 claims tested
- [ ] 5 writing rules
- [ ] 6 end sections
- [ ] 7 keyboard
- [ ] 8 labels
- [ ] 9 playback
- [ ] 10 reduced motion
- [ ] 11 sizes and themes
- [ ] 12 no layout shift
- [ ] 13 no console errors
- [ ] 14 axe
- [ ] 15 interactions within 100 ms
- [ ] 16 60 fps
- [ ] 17 screenshots
- [ ] 18 interaction tests
- [ ] 19 checks pass
- [ ] 20 fresh-eyes review
- [ ] 21 capture
- [ ] 22 route HTML
