# Tasks

## Decisions session (2026-10-02)

The author decided every open item. This session records the decisions and
fixes the docs. Nothing is built.

- [x] 1. Record each decision: DESIGN.md, the SIM.md status line and §11, and
      every "Decisions for the author" list below.
- [x] 2. Apply audit fixes M1–M8 and m1–m19 to the docs. Replace the missing
      commit in AUDIT.md, and mark the visibility and rename items resolved.
- [x] 3. Add 768 px, WebKit, Firefox, and 44 px touch targets to
      CHAPTER_DOD.md.
- [x] 4. Consistency pass: no doc calls a decided item pending, and no two docs
      disagree.
- [x] 5. Commit, push to `main`, and tag `v0.0-decisions`. GitHub still had the
      old name, so the author approved `gh repo rename` in this session.

### Review

- **Where each decision lives:**
  - DESIGN.md (B only)
  - SIM.md status line and §11
  - every "Decisions for the author" list below
  - AUDIT.md B2 and its resolution log
  - SOURCES.md notes 9 and 12
  - the backlog at the end of this file
- **How it was checked:**
  - The palette validator was re-run on B light and dark; every check
    passes. WCAG contrast was recomputed for every changed token.
  - Chapter 3's numbers were recomputed at 70 TFLOPS.
  - New line references were read at the pinned commits:
    - vllm-apc-doc L3, L146, and Note 2
    - `torch_utils.py` L39–41
    - `arg_utils.py` defaults, which also showed a 160 GB tier, now in SIM.md
      §8
- **Fresh-eyes review:** a sub-agent read all the docs and found 13 issues.
  - Fixed: capture size, the sandbox's more-than-8 rule, the tab size, PresetName,
    §9 references, SOURCES gaps, and wording. Static streaming became SIM.md
    §9.20.
  - Left for each chapter's DoD item 6 check: a few "What this leaves out"
    lines that point to another chapter or describe a figure choice.
  - Left as is: the CLI's `SIMULATED` header, which is terminal output, not a
    page label.
- **Not resolved here:**
  - `ffmpeg` was not on PATH on 2026-10-02.
  - Build 1 must push the llmsize fix to `varad-more/llm-calculator`. That is
    outside the granted access, so I ask first.
  - SOURCES.md note 6 was closed by the plans, not by an author decision.

## Build order (approved 2026-10-02)

The AUDIT.md B1 fix order, with SIM.md Q7:

1. **Build 1:** Prompt 1 steps 1–4. The llmsize fix (AUDIT.md M9) comes
   before gen-data runs.
2. **Build 2:** the sim (Prompt 2).
3. **Build 3:** Prompt 1 steps 5–9.
4. **Build 4:** chapters 1–4.
5. **Build 5:** the sandbox.
6. **Build 6:** the audit, run again.
7. **Build 7:** the launch kit.

## Prompt 0: rules and plans

- [x] CLAUDE.md: the author's rules, with grammar fixes only.
- [x] PRODUCT.md: audience, promise, four chapters plus sandbox, non-goals,
      credibility. Author facts checked with `gh` (vllm-metal #549 and #550 merged;
      both benchmark repos exist; llmsize = varad-more/llm-calculator).
- [x] DESIGN.md: directions A (Bench Notes) and B (Signal Box). Request palettes
      checked with a palette validator in light and dark: neighbors pass, all
      pairs cannot (see DESIGN.md). **The author picked B on 2026-10-02; A is
      deleted.**
- [x] docs/SOURCES.md: 11 sources verified, code pinned to commits, 8 notes on
      traps and disagreements.
- [x] tasks/todo.md, tasks/lessons.md.

## Prompt 1: site shell (PLAN, approved 2026-10-02)

Goal: a live, empty-but-real site with the shell every chapter will use.

### Decisions for the author (all decided 2026-10-02)

1. **Design direction:** A or B. This blocks step 6 and the OG images.
   - **Decided: B (Signal Box),** with the author's changes (DESIGN.md).
2. **Repo visibility:** `varad-more/Serving-Explainer` was private. Pages from a
   private repo needs a paid GitHub plan, and the site is public either way.
   Make the repo public?
   - **Decided: public.** Done on 2026-10-02.
3. **URL:** the user site `varad-more.github.io` has the custom domain
   `varadmore.me`, so the repo publishes at `https://varadmore.me/<repo name>/`.
   The prompt wants `/serving-explained/`, which needs the repo renamed.
   - **Decided: renamed to `serving-explained`.** `SITE_URL` is
     `https://varadmore.me/serving-explained/`. The git remote is
     `https://github.com/varad-more/serving-explained.git`.
4. **Permission** for steps that touch things outside this repo:
   - run `corepack enable` (pnpm is not installed; Node 24.21 ships corepack)
   - clone llm-calculator to `../llm-calculator`
   - push to `main` on GitHub
   - enable Pages with `build_type=workflow` through `gh api`
   - **Decided: all four granted,** plus ffmpeg for the launch captures.

### Defaults I chose (accepted by the author, 2026-10-02)

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

- [x] **1. Scaffold.** Done 2026-10-02.
  - **Verified:** `pnpm test` (1 file, 2 tests), `pnpm typecheck` (`tsc -b`
    over the app and scripts projects), `pnpm lint`, and `pnpm build` pass.
    Lint is type-aware: a probe file with an `any` member access failed
    `no-unsafe-member-access`, then was deleted. `dist/index.html` loads its
    script from `/serving-explained/assets/`.
  - **TypeScript is pinned to `~6.0.3`:** typescript-eslint 8.71 supports
    TypeScript below 6.1.0, so 7.0.2 cannot be used yet.
  - `build` is `vite build` until step 3 adds postbuild. `gen:data`,
    `gen:og`, and `gen:sources` point at scripts that steps 3–5 add.
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
  - `LICENSE` (Apache-2.0, for code) and `LICENSE-CONTENT` (CC BY 4.0, for text
    and media), since the repo is already public (Prompt 9 decision 1).
- [x] **2. Routes and router.** Done 2026-10-02.
  - **Verified:** `pnpm test` (2 files, 12 tests: path matching under `/` and
    `/serving-explained/`, with and without trailing slashes, unknown, nested,
    and outside-base paths), plus typecheck, lint, and build. The build emits
    one chunk per route.
  - **Checked in Chromium** against `vite preview`, with no console errors:
    - a Link click changes the URL and title and focuses the new h1
    - Back returns to the landing page
    - `/nope` renders "Page not found"
    - `/kv-cache#x` is rewritten to `/kv-cache/#x`
  - Landing, sandbox, glossary, and not-found pages live in `src/pages/`; the
    lazy map is `src/pages.ts`, and the shell is `src/App.tsx`.
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
- [x] **3. Static HTML per route.** Done 2026-10-02.
  - **Verified:** `pnpm test` (3 files, 17 tests), plus typecheck, lint, and
    build. The postbuild tests cover:
    - one file per route plus `404.html`
    - unique titles and descriptions
    - absolute canonical, `og:url`, `og:image`, and `twitter:image` URLs
    - `noindex` on the 404 page
    - a committed 1200×630 PNG for every route (also an added check)
  - `pnpm build` writes 8 HTML files. Over `vite preview`, curl shows each
    route's own title and `og:image` in the raw HTML. Chromium loads
    `/prefix-caching/` with no console errors and no failed requests (the
    favicon included).
  - `pnpm gen:og` wrote 7 images (34–54 KB). I viewed two of them.
  - `scripts/postbuild.ts` writes `dist/<slug>/index.html` for every route, with
    that route's `<title>`, description, canonical, and `og:*` and `twitter:*`
    tags. The image is `og/<slug>.png`, absolute from `SITE_URL`.
  - It also writes `dist/404.html` (`noindex`) and adds `favicon.svg`, since a
    missing favicon logs a console error.
  - `scripts/gen-og.ts` renders a 1200×630 template per route with Playwright
    into `public/og/`, committed. The template is temporary: Prompt 9 decision
    4 replaces it with cards rendered from the real site.
  - Tests: postbuild output has one file per route, unique titles, and absolute
    OG URLs.
- [x] **4. Generated data from llmsize.** Done 2026-10-02, from the unmerged
  fix commit `5d5d029`, as the author chose.
  - **Verified:** `pnpm test` (4 files, 25 tests, with zod schemas for all four
    files), typecheck, lint, and build pass. The values match this plan's
    numbers: KV per token, weights, usable VRAM, and the Phi-3.5-mini vs.
    Llama-3.2-3B pair. gen-data refused a dirty llmsize checkout.
  - SOURCES.md pins llmsize-math to `5d5d029`. When #1 merges, rerun
    `pnpm gen:data` on llmsize main and re-pin.
  - **llmsize fix:** branch `fix/a10g-tflops`, commit `5d5d029`, PR #1, with CI
    green. It sets the a10g-24 dense figures from the datasheet (fp32 35, tf32
    35, fp16 70, bf16 70, int8 140) and the guard's sparse bf16 (140). llmsize
    `pnpm test` passes 86/86, with Python parity on 16 fixtures; `pnpm goldens`
    produced no fixture diff.
  - **Written and checked against the branch:** `scripts/gen-data.ts`
    and `tests/data.test.ts` (zod schemas). The checks were `pnpm test` (4 files,
    25 tests), typecheck, lint, and build. gen-data refused a dirty checkout and
    left `src/data` unchanged.
  - **Other GPUs checked against their datasheets (plan item, 2026-10-02):**
    - The bf16 figures the site uses match: L4 121, L40S 362.05, and H100 989.4
      against the datasheet's 989.5.
    - The three NVIDIA `source_url`s now redirect to nvidia.com's homepage (curl).
      The figures were read from archived or current copies instead.
    - m4-max-128's 11.6 comes from arXiv:2502.05317 (its notes), not from its
      `source_url`.
    - Waiting on the author: dead links would reach the site through
      gpus.json.
  - **Added beyond the plan:** `vramBytes` and `reservedFractionFrom` per GPU, and
    a `contrast` record in models.json. roofline-ref.json leaves out llmsize's
    `bound`, which compares decode time with prefill time.
  - **Before gen-data runs, fix llmsize (AUDIT.md M9, approved).** In
    `../llm-calculator`, set `a10g-24` to the dense figures in its own
    `source_url` datasheet: bf16 70, fp32 35, and tf32 35 TFLOPS. Check every
    other GPU's compute figures against its `source_url` the same way. Commit
    there, then re-pin llmsize-math in SOURCES.md to that commit. Its links
    must resolve, so the commit has to be pushed to `varad-more/llm-calculator`;
    I ask before pushing there.
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
- [x] **5. Sources data.** Done 2026-10-02. `scripts/gen-sources.ts` turns
  docs/SOURCES.md into `src/data/sources.json`.
  - **Verified:** `pnpm test` (22 files, 164 tests), typecheck, lint, and
    build pass. The JSON holds all 12 sources.
  - The new tests caught a parser bug: the first data row (kwon2023) was taken
    as the table's divider. The parser now checks the divider's shape.
  - The SourceLink check also scans `.tsx`, because the kitchen sink uses
    SourceLink outside MDX.
  - Test: the JSON matches a fresh parse, so it is never stale.
  - Test: every `SourceLink` id used in `src/**/*.mdx` exists.
- [x] **6. Design system** (Direction B, Signal Box). Done 2026-10-02.
  - **Verified:** `pnpm test` (25 files, 174 tests), typecheck, lint, and
    build pass. New tests:
    - the SVG and Canvas request marks draw their slot's pattern and glyph at
      16–64 px, and the label from 24 px
    - no `--highlight` background without `--on-highlight` text
    - the dark token blocks are identical, and light has the same tokens
    - `measured` without `href` fails to type-check
    - postbuild refuses a dist that ships the kitchen sink
  - **Checked in Chromium** on the kitchen sink at 1440 px (light) and 375 px
    (dark), with screenshots read section by section and no console errors.
    Fixed what that found:
    - a glossary popover overflowing 375 px by 61 px
    - a missing disclosure marker on "Show the answer"
    - disabled toggles that looked enabled
    - cramped line badges
  - **Gaps in DESIGN.md filled in tokens.css:**
    - `--req-k-label` (the label-ink column)
    - `--block-shared-edge` and `--badge-ink` (both `--ink`)
    - the callout tokens as their band colors
  - The kitchen sink renders a light and a dark panel (`data-theme` on any
    element), so one page shows every state in both themes. It is built only
    in dev or with `VITE_KITCHEN_SINK=1` (`pnpm build:ks`, into `dist-ks`).
  - The App shell gained:
    - a skip link
    - a header nav without middle dots and with `aria-current`
    - the theme toggle
    - one `<main>`
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
    - RequestMark: a slot's color, pattern, and glyph, as SVG, plus a Canvas
      painter that follows the same spec for the chapter grids.
  - Tests:
    - every request-mark renderer draws its slot's pattern and glyph at every
      size it supports (DESIGN.md; AUDIT.md M3)
    - no CSS rule sets a `--highlight` background without `--on-highlight`
      text (AUDIT.md m1)
  - `/kitchen-sink` is registered only when `import.meta.env.DEV` or
    `VITE_KITCHEN_SINK=1`. A check confirms the production `dist` has no
    kitchen-sink chunk.
- [x] **7. Playwright.** Done 2026-10-02.
  - **Verified:** locally, `pnpm e2e` passes 54 tests in Chromium, WebKit,
    and Firefox, and skips 12: the screenshot tests outside Chromium.
    - Smoke: each of the 7 routes, raw HTML and rendered, plus unique titles
      and og:images and the not-found page.
    - Kitchen sink: a keyboard walk through every control type with a visible
      focus ring; 44 × 44 px targets and no horizontal scroll at 375 and
      768 px; axe in light and dark.
    - Six Chromium screenshots (375, 768, and 1440 px, light and dark).
    - `pnpm test`, typecheck, lint, and build pass.
  - **The new tests found:**
    - WebKit on macOS ignores `min-height` on native selects (23 px), so
      selects are now `appearance: none` with a CSS chevron.
    - The check-yourself boxes were named landmarks with the same name (axe
      `landmark-unique`).
    - One mistake in my own test: Tab order backwards across the playback bar.
  - **Baselines:** macOS ones (`-chromium-darwin.png`) are committed for local
    runs. Linux ones come from the manual workflow
    `.github/workflows/baselines.yml`, which uploads them as an artifact for
    review.
  - `pnpm e2e` builds `dist` and `dist-ks` (the kitchen sink), then serves both
    with `vite preview`. `SMOKE_BASE_URL` points the smoke suite at a live
    site.
  - Smoke test against `vite preview` of the production build: every route
    returns 200 from its own `index.html`, has no console errors, and has a
    unique title and `og:image`, both in the raw HTML and after hydration.
  - Kitchen sink: keyboard checks per control, 44 px targets at 375 and 768,
    and axe with no violations.
  - Projects for Chromium, WebKit, and Firefox. Screenshots in Chromium at 375,
    768, and 1440, in light and dark: 6 baselines (CHAPTER_DOD items 7, 11,
    and 17).
- [x] **8. CI and deploy.** Done 2026-10-02.
  - **Verified:** `pnpm test`, typecheck, lint, and build pass locally. Pages
    is enabled with `build_type=workflow` through `gh api`; the site URL is
    varadmore.me/serving-explained/. The first CI run's result is under
    Results below.
  - Actions at their current majors: checkout v7, setup-node v7,
    configure-pages v6, upload-pages-artifact v5, deploy-pages v5,
    upload-artifact v7. (Checked today; the plan's earlier check said v6, v5,
    v5 for the three Pages actions, and those still match.)
  - The deploy job `needs: ci` and runs only on pushes to `main`. CI uploads
    the Pages artifact; the deploy job runs configure-pages and deploy-pages.
    CI on `main` is never cancelled by a newer push, since it may be
    deploying.
  - `.github/workflows/ci.yml` on every push: pnpm install `--frozen-lockfile`,
    typecheck, lint, test, build with `SITE_URL`, Playwright smoke and kitchen
    sink in all three browsers, then upload the Pages artifact.
  - On `main`, the deploy job runs with `configure-pages`, `upload-pages-artifact`,
    and `deploy-pages`, at their current majors (checked today: v6, v5, v5). It
    uses `concurrency: pages` and least-privilege `permissions`.
  - README stub: one sentence and the live URL.
- [x] **9. Verify live.** Done 2026-10-02 at https://varadmore.me/serving-explained/.
  - **Verified:**
    - curl: all 7 routes return 200 with their own titles; `/no-such-page/`
      returns 404 with the not-found page; `/kv-cache` redirects (301) to
      `/kv-cache/`; preview images and the favicon return 200.
    - `SMOKE_BASE_URL=https://varadmore.me/serving-explained/` smoke suite:
      27 of 27 pass in Chromium, WebKit, and Firefox.
    - Lighthouse 13.5.0, recorded under Results.
  - Every route returns 200 at the Pages URL, checked with curl and with the
    smoke suite pointed at the live site.
  - Lighthouse (mobile and desktop) on `/` and `/kv-cache/`, recorded below.

### Results

- **Live:** https://varadmore.me/serving-explained/ (deployed 2026-10-02).
- **CI:** the first CI-and-deploy run on `main` passed both jobs:
  https://github.com/varad-more/serving-explained/actions/runs/37086424863.
  The Linux baselines came from
  https://github.com/varad-more/serving-explained/actions/runs/37086269474.
- **Lighthouse 13.5.0** (`pnpm dlx lighthouse@13`, Chrome headless,
  2026-10-02):

  | page | form factor | performance | accessibility | best practices | SEO | LCP | CLS | TBT |
  |---|---|---|---|---|---|---|---|---|
  | `/` | mobile | 100 | 100 | 100 | 100 | 1.3 s | 0 | 0 ms |
  | `/` | desktop | 100 | 100 | 100 | 100 | 0.3 s | 0 | 0 ms |
  | `/kv-cache/` | mobile | 100 | 100 | 100 | 100 | 1.2 s | 0 | 0 ms |
  | `/kv-cache/` | desktop | 100 | 100 | 100 | 100 | 0.3 s | 0 | 0 ms |

  Lighthouse 13.5 also reports an "agentic browsing" category: 100 on all
  four. The pages are placeholders, so these scores set a baseline, not a
  verdict on the chapters.

## Prompt 2: sim engine

- [x] Read the vLLM paper (§4.2–4.5 and §7.2–7.3, from the arXiv HTML) and
      vllm-apc-doc myself. A subagent read the V1 scheduler and KV manager code
      at `cfd54ca8`. I re-read `BlockPool.free_blocks`, `prepend_n`, and
      `allocate_slots` myself.
- [x] STOP 1: docs/SIM.md was approved by the author on 2026-10-02. The §2 API
      is frozen, and Q1–Q8 are decided in §11.
- [x] Implementation (Build 2), 2026-10-02, in nine local commits (rng, hash,
      and freeQueue; workload and presets; paged and contiguous; scheduler;
      cost; engine; metrics; invariants; CLI), plus one preset-tuning commit.
  - **Verified:** `pnpm test` (21 files, 161 tests), typecheck, lint, and
    build pass at every commit.
    - G1–G7 matched the hand-written event lists on the first run.
    - 300 property runs check every invariant after every step, with a
      coverage check that preemption, hits, eviction, static, contiguous,
      and chunked runs all occur.
    - The llmsize cross-check is 0.00% apart on all three configs.
    - 1,000 chatbot requests run in 139–152 ms (the limit is 1 s).
    - Every preset runs under both policies with invariants on.
  - **Tuning:** `paged-vs-contiguous` seed 7 → 37 (SIM.md §7 tuning log).
- [x] STOP 2 report, 2026-10-02. Its open points for the author:
  - SIM.md wording to confirm: invariant 8's order, the length streams, the
    output vocabulary, static batch formation, and empty steps.
  - Chapter 3 decision 9's result (recorded there).

## Prompt 3: KV cache chapter (PLAN, approved 2026-10-02)

- [x] Part A: docs/CHAPTER_DOD.md written (22 items).
- [x] Sources: added ainslie2023 (GQA), verified on the ACL Anthology. Note 10
      records an llmsize vs. vLLM gap on memory utilization.
- [x] PRODUCT.md chapter 1 objective and misconception updated to Prompt 3's
      wording, so DoD item 1 checks the current objective.
- [x] Part B: the chapter (Build 4). All 22 DoD items below are ticked.

### Depends on

- **The Prompt 1 shell:** components, routes, postbuild, OG images, gen-data,
  Playwright, and CI. Its decisions were made on 2026-10-02.
- **The sim (Prompt 2):** the step 1–2 figure animates one request's event log,
  per CLAUDE.md's visual rules. SIM.md was approved on 2026-10-02.
- **Order:** the build order at the top of this file (Build 4).

### Decisions for the author (all decided 2026-10-02)

1. **ffmpeg** (`brew install ffmpeg`). Playwright records only webm, and the DoD
   needs mp4 and gif. It is a tool on this machine, not a repo dependency.
   `pnpm capture` stops with a clear message if it is missing.
   - **Decided: approved.**
2. **Badge rule** (DoD item 3). One badge may cover a readout or figure. Numbers
   quoted from a source get a SourceLink instead. Definitional constants get
   neither. This is how I read CLAUDE.md's "every number".
   - **Decided: accepted.**
3. **Step 1 wording.** With a cache, the new token still attends to every earlier
   token. What the cache saves is rerunning the model over earlier tokens to
   rebuild their keys and values (kwon2023 §2.2). So step 1 says "reruns the
   model over every earlier token," not "recomputes attention."
   - **Decided: accepted.**
4. **What "free memory" means.** Free memory is llmsize's usable VRAM minus the
   weights, as the prompt says. vLLM also keeps 8% back by default
   (`gpu_memory_utilization` 0.92, vllm-src) and reserves activation and
   CUDA-graph memory. So the widget's max concurrency is an upper bound. The
   callout says so and links llmsize's full planner.
   - **Decided: accepted.**
5. **Model picker.** It has all 10 dense models. Three of them (Llama-3.1-70B,
   Llama-3.1-405B, Qwen2.5-72B) never fit on one listed GPU in bf16. For those,
   the widget says "weights alone do not fit." The alternative is to drop them.
   - **Decided: keep all three,** with "weights alone do not fit".

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
   - Claim: `no-cache-work`. Sources: kwon2023 §2.2 describes the cache. The
     no-cache count is our reasoning from it, and the text says so (AUDIT.md
     m3).
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
   - A note says vLLM stores KV in blocks of 16 tokens by default, so a request
     is charged in steps of 16 (kwon2023 §7.2; llmsize-math, KV token count).
     Not every engine does; SGLang uses one-token pages (AUDIT.md m4).
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
   - Memory, not compute, is what usually caps the batch (kwon2023 §3; AUDIT.md
     m5).
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
  - one GPU, no tensor parallelism (SIM.md §9.1)
  - dense full-attention models only, so no MLA, sliding window, or hybrid models
    (llmsize-math)
  - fp8 for the KV cache only, with the weights still bf16 (llmsize-math, KV
    dtype)
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
- Screenshots at 375, 768, and 1440 px, light and dark.
- MemoryBudget: arrow-key concurrency from 4 to 8 shows "Does not fit". Changing
  context changes the readout. fp8 doubles it.
- TokenGrid: Step changes the counter.
- Formula: changing the model changes the product.
- CLS is 0, there are no console errors, and axe passes.
- Performance: Event Timing max and p95, and rAF intervals during TokenGrid
  playback, with and without 4× CPU throttling.

**Capture** (`scripts/capture.ts kv-cache`):
- Playwright `recordVideo` runs an 8 s script with the launch-kit media settings
  (Prompt 9, "Media": 600 CSS px wide at 2×): context from 1K to 32K, then fp8,
  then concurrency past the limit.
- ffmpeg writes an H.264 mp4 and a 12 fps GIF, 600 px wide, with a generated
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

Copied from docs/CHAPTER_DOD.md for chapter 1. Each item is ticked with how it
was verified.

**Content**
- [x] 1. Objective first, checked last. The chapter opens with PRODUCT.md's
  objective, word for word. It ends with a CheckYourself on Qwen2.5-7B: free
  memory ÷ KV per request, then fp8. Its numbers are not in the prose. A test
  checks that the shown numbers, rounded as shown, give the shown answers.
- [x] 2. Sources: 35 SourceLinks (33 in prose, 2 in the callout); every id is in sources.json
  (tests/sources.test.ts). Glossary source ids are checked by
  writing.test.ts. Our reasoning is marked twice: step 1 ("Our reasoning from
  kwon2023 §2.2") and the leaves-out line on the no-cache count.
- [x] 3. Provenance: every number from data or the sim renders through `<Num>`
  with a `computed` or `simulated` badge, one per sentence or readout. Widget
  readouts carry their own badges. Quoted numbers (16, 92%, 256, 70 GiB) carry
  SourceLinks. Review item 18 (a typed "two thirds", typed contexts) was fixed.
- [x] 4. Claims are tested: 12 `<Claim>` ids, 12 tests against the exact
  presets and data the chapter imports; the meta-test passes.
- [x] 5. Writing rules: writing.test.ts passes (sentences under 25 words,
  including JSX attributes such as the objective; hype words; US spelling;
  GlossaryTerm ids; glossary definitions). The review found terms used before
  their definition. All now have a definition at first use, and the glossary
  gained 8 entries (now 27).
- [x] 6. End sections: 11 "What this leaves out" lines, each with a source or
  SIM.md §9.1, except the fp8 output-quality line (no source makes a claim
  there; see the review answers). "Go deeper" links kwon2023, ainslie2023, and
  llmsize-math only. The llmsize app link sits in the widget's callout.

**Widgets**
- [x] 7. Keyboard and touch: the interaction tests reach every control with
  Tab or Shift+Tab, assert a focus ring, and operate it with arrows, Home,
  End, or Enter in all three browsers. Hit areas are at least 44 × 44 px at 375
  and 768 (a radio's area is its label). The chart's tooltip also works from
  the keyboard.
- [x] 8. Labels: every control has a visible label. The budget heading,
  readout, context notice, formula result, TokenGrid readout, and chart point
  are polite live regions. The TokenGrid's region is off while playing.
- [x] 9. Playback: TokenGrid has a PlaybackBar. Its frames come from the
  `TOKEN_GRID` run's event log (gridFrames.ts).
- [x] 10. Reduced motion: Play is disabled, nothing autoplays, the widget has
  no CSS transitions, and Step reaches all 6 states (e2e "reduced motion").
- [x] 11. Sizes, themes, and browsers: there is no horizontal scroll and no SVG
  text outside its SVG at 375, 768, and 1440 px, in Chromium, WebKit, and
  Firefox. Screenshots cover light and dark.
- [x] 12. No layout shift: CLS 0 in the budget and TokenGrid interaction tests
  (Chromium). A strict count first found 4 real shifts, all fixed: the skip
  link, a wrapping heading, a rewrapping legend, and a wrapping slider output.
  Input-driven shifts are logged; opening the table is one (0.164).
- [x] 13. No console or page errors: every widget test asserts an empty
  error list.
- [x] 14. axe: no violations at 768 light and dark, and at 1440 light.

**Performance** (`pnpm perf`: Chromium, one worker, alone; traces in
`test-results/kv-cache-perf-*/`)
- [x] 15. Event Timing max: 24 ms at 1×, 32 ms at 4×. p95 over entries of 16 ms
  or more: 24 and 32 ms. Under the full parallel e2e run, 4× reached 40 ms.
- [x] 16. rAF over 5 s of 1× playback, restarted at the end: p50 16.7 ms,
  p95 16.7 ms, max 16.8 ms at 1×; p50 16.7, p95 16.8, max 16.8 ms at 4×. Under
  the full parallel run, 4× p95 rose to 33 ms. That is why perf runs alone.

**Tests and review**
- [x] 17. Screenshots: 6 kv-cache baselines per platform (darwin locally;
  Linux from the baselines workflow, run 37103536903). The 12 kitchen-sink
  baselines were regenerated for the ChapterLayout change. CI run 37103638680
  (branch) and 37103859849 (main) passed with them.
- [x] 18. Interaction: memory budget, TokenGrid, formula, and GQA contrast tests
  pass in all three browsers (42 kv-cache tests). The GQA figure has no
  controls, so its test checks rendered text against data.
- [x] 19. Checks: `pnpm test` (203), `pnpm typecheck`, `pnpm lint`, and
  `pnpm build` pass.
- [x] 20. Fresh-eyes review: 18 findings (2 major, 11 minor, 5 nit). 17 were
  fixed; 1 was answered (step splitting, below).

**Launch assets**
- [x] 21. Capture: `pnpm capture kv-cache` gives a 7.97 s, 1200×1436 H.264 mp4
  (114 KB) and a 600 px, 12 fps GIF (250 KB). It fails outside 6–10 s or at
  3 MB or more.
- [x] 22. Route HTML: dist/kv-cache/index.html has its title, description,
  canonical, og and twitter tags, and a 1200×630 og/kv-cache.png
  (tests/postbuild.test.ts). Live: the smoke suite (27 tests) and the
  kv-cache suite (42 tests, screenshots excluded) pass against
  https://varadmore.me/serving-explained/ in all three browsers;
  og/kv-cache.png returns 200.

### Fresh-eyes review: findings and answers

1. Major. CheckYourself fp8 was 18 from the shown 8.31 ÷ 0.4375. Fixed: GiB
   now shown to 3 places (8.315 ÷ 0.4375 = 19.006), and a test checks it.
2. Major. "Upper bound" holds only if every request has the full context.
   Fixed in step 6 and the callout. The teaser now says shorter requests leave
   room for more (kwon2023 §4.3).
3. GQA gap mixes layers and head dimension. Fixed: a sentence names the 4×
   KV-head ratio and the other differences. Another says GQA takes training
   (ainslie2023 §2.1).
4. Terms used before definition. Fixed: attention, query, request, prompt,
   serving engine, usable and free memory, and max concurrency are defined at
   first use and in the glossary. The leaves-out lines gloss their terms.
5. kv-head glossary entry. Fixed.
6. prefill under chunked prefill. Fixed: "the step or steps"; the glossary
   gives kwon2023's names (prompt phase, generation phase).
7. "Newest token" meant two tokens. Fixed: "the token being processed …
   itself included" and "the token just sampled" (the legend too).
8. No-cache step not fully marked as reasoning. Fixed: "Our reasoning from
   kwon2023 §2.2" and "Counted from the simulated run". The badge stays
   `simulated`, since the counts come from the run's per-step sequence lengths.
9. kv-linear vs. block rounding. Fixed: the claim says every context is a
   multiple of 16. The test now covers every model and dtype, and asserts
   that.
10. "So memory, not compute" and "holds the weights and KV". Fixed: "As the
    vLLM paper argues …" and "mostly holds".
11. CheckYourself lacked inputs. Fixed: the question gives the weights and
    usable memory.
12. Leaves-out gaps. Fixed: sources added and a driver-reserve line added.
    fp8 output quality is now a scope line ("the widget counts bytes"), with
    no claim about accuracy and so no source. Flagged for the author.
13. Steps carry several ideas. Answered, not changed: the six steps and
    their claims are the approved plan's. Splitting them changes the plan.
    Flagged for the author.
14. 256 cap condition. Fixed: "under 70 GiB, and on A100s", L2876–2895.
15. Block size cited to the paper. Fixed: vllm-src config/cache.py L71.
16. "Give or take one". Fixed: "doubles, or doubles plus one", matching the
    test.
17. Citation sections. Fixed: the formula also cites "KV cache"; hybrids cite
    "SSM state"; the callout cites llmsize "vLLM"; weights shared cites
    §2.3; token cites §1; context length cites §2.2. SOURCES.md's cited-for
    column now lists kwon2023 §2.1, §2.3, and §4.3, ainslie2023 §2.1, and the
    vllm-src lines.
18. Hand-typed numbers. Fixed: weights share and the step 6 contexts render
    from data.

### Deviations from the plan (reported)

- "Go deeper" links SOURCES.md ids only (DoD 6). The plan also listed the
  llmsize app; that link is in the widget's simplification callout.
- ChapterLayout on narrow screens shows each figure in full below the step
  that first uses it (DESIGN.md), not a sticky strip. Kitchen-sink baselines
  were regenerated.
- `<Claim>` and `<Num>` are new shared components (DoD 3–4).
- `@mdx-js/mdx` is a new devDependency (already in the lockfile through
  @mdx-js/rollup). The writing test uses it to parse MDX.
- `pnpm capture` takes 2× screenshots in a loop instead of Playwright's
  recordVideo, which records at 1× only.
- Performance tests carry `@perf` and run alone (`pnpm perf`), not in CI.
- The step 4 GQA prose gained two sentences (review item 3), and step 6's
  teaser changed (review item 2).

## Prompt 4: paged attention chapter (PLAN, approved 2026-10-02)

- [x] Read kwon2023 §1, §3, §4.1–4.4, §6.1–6.2, §7.1–7.2, §8, and §9 for this
      plan. The text comes from the PDF, because the arXiv HTML drops numbers
      such as "2.2×" (SOURCES.md note 11).
- [x] PRODUCT.md chapter 2 updated to Prompt 4's objective and misconception.
- [x] SIM.md: added the preset `paged-vs-contiguous` and per-preset engine
      overrides (`seed`, `kv`, `scheduler`) to the `Preset` type. SIM.md was
      approved with them on 2026-10-02.
- [x] The chapter (Build 4). All 22 DoD items below are ticked.

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
- **Paging can hurt other workloads.** For serving DNNs that are not LLMs,
  which are compute-bound, the paper says paging's indirection may slow them
  down (§8). It does not say this of LLM serving (AUDIT.md M4).
- **Waste in earlier systems:** in the §6.2 experiments, token states filled
  only 20.4–38.2% of KV memory in the paper's Orca baselines, vs. 96.3% in vLLM
  (§1, Fig. 2). Orca (Max) reserves the model's maximum length, as our
  contiguous allocator does (§6.1).

### Decisions for the author (all decided 2026-10-02: accepted as recommended)

1. **At most 8 live requests per grid.** DESIGN.md caps every widget at 8 live
   requests, so each one has its own color and glyph.
   - The preset sets `max_num_seqs` to 8, and shrinks KV to 1,280 tokens so that
     memory binds at about the same point.
   - The chapter says vLLM's default cap is 256 on GPUs under 70 GB
     (vllm-src; AUDIT.md M5).
   - The alternative is to let colors repeat beyond 8. I advise against it,
     because two live requests would then look the same.
   - **Decided: accepted.**
2. **A toy GPU.** 1,280 tokens is about 1/48 of the 61,787 tokens an A10G has
   free after Llama-3.1-8B's weights (computed). The widget labels it "toy GPU:
   1,280 tokens of KV". Step times still come from the Llama-3.1-8B on A10G
   roofline, so playback runs at a plausible pace.
   - **Decided: accepted.**
3. **"Gaps between regions."** With equal `max_model_len` regions, a freed
   region always fits the next request exactly. So the only gap is the leftover
   at the end of memory, capacity mod `max_model_len`.
   - At the default 512, that is 256 tokens, 20% of capacity, and the
     `max_model_len` control changes it.
   - The paper's baselines also had gaps from buddy allocation (§3.1, §6.1;
     AUDIT.md m6), which we do not model. The chapter labels the gap "free
     space too small for a region" and says this.
   - Real gaps between regions would need regions sized per request. The author
     kept equal regions for v1 (SIM.md Q4); per-request reservation is in the
     backlog.
   - **Decided: accepted.**
4. **"Requests admitted"** means admitted and not yet finished, so it is the
   running count. The peak-concurrency test uses it.
   - **Decided: accepted.**
5. **Paged can preempt.** Packing more requests in means memory can run out
   mid-generation. The preset is tuned so this is rare (at most 2). The paged
   readout shows a preemption count whenever it is nonzero, rather than hiding
   it.
   - Chapter 3 has no preemption step (AUDIT.md m15). So this chapter defines
     preemption in one sentence where the count first appears: when memory runs
     out, the engine frees the most recently admitted request's blocks and
     recomputes its tokens later (vllm-src; kwon2023 §4.5). The glossary gets
     the term.
   - **Decided: accepted.**
6. **Lockstep is by sim time, not step index.** The two allocators run batches
   of different sizes, so their steps have different durations. One
   `PlaybackBar` sets time t, and each grid shows its own latest `StepEnd` at or
   before t. Arrivals line up, which a shared step index would not do.
   - **Decided: accepted.**

### Preset `paged-vs-contiguous` (SIM.md §7, tentative)

- **Workload:** seed 37 (tuned from 7 on 2026-10-02; SIM.md §7 tuning log); 40
  requests, Poisson at 1.5/s.
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
   - Sources: kwon2023 §3.1, Fig. 3, and §6.1 (Orca Max) (AUDIT.md m7).
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
5. **Same workload, two allocators.** Compare mode, with one `PlaybackBar`
   over sim time. (Split from "Side by side" by the author on 2026-10-15.)
   - Readouts on each side: running, waiting, KV used, waste percent.
   - **Reality-check callout:** the paper's Fig. 2 numbers, labeled as the
     paper's, and next to them a line saying ours are simulated on a toy preset.
   - Claim: `paged-less-waste`. Sources: kwon2023 §1.
6. **When blocks run out.** The same figure.
   - Paged packs more requests in, so memory can run out: preemption.
   - **Misconception callout:** the four facts from "What the paper says."
   - Claims: `paged-admits-more`, `visible-in-20s`.
   - Sources: vllm-src, kwon2023 §4.5, §6.2, §7.1, §8, §9.
7. **Block size.** A slider over 8, 16, 32, 64, and 128, with capacity fixed at
   1,280 tokens. The grid redraws with the new block size.
   - Two small charts come from 5 preset runs: mean paged waste percent vs.
     block size, and mean table length per running request vs. block size. They
     are drawn as two charts, not one with two axes.
   - Prose on speed stays qualitative: too small a block underuses the GPU's
     parallelism (kwon2023 §7.2).
   - The paper's own numbers are quoted with their source: on ShareGPT, sizes
     16–128 work well; on Alpaca, 16 and 32 (AUDIT.md m8). vLLM's default is
     16 (§7.2).
   - Claims: `block-size-raises-waste`, `block-size-shortens-tables`.
8. **Teaser: shared blocks.** A tiny sim run: block size 4, two requests sharing
   an 8-token prefix, prefix caching on. Both tables point at the same physical
   blocks, each with reference count 2. Links to chapter 4.
   - Claim: `shared-refcount`. Sources: kwon2023 §4.4, vllm-apc-doc.
- **CheckYourself** (predict, then run): "Raise `max_model_len` from 512 to
  1024. What happens to contiguous's running count? To paged's?" The answer
  says contiguous drops to 1 and paged does not change at all. The control is
  then unlocked to try it.
  - Claim: `max-model-len-hurts-contiguous-only`.
- **Second CheckYourself** (added 2026-10-15, so the plan agrees with
  PRODUCT.md's knob, block size): "Switch the block size from 16 to 128. At
  most how many empty slots can one request hold? Does mean paged waste rise or
  fall, and do tables grow or shrink?" The answer: at most 127 (B − 1); waste
  rises and tables shrink, with the simulated values. A "Try it" select follows.
  - Claim: `checkyourself-block-size`.
- **What this leaves out:**
  - equal regions only: no buddy allocation and no per-request reservation, so
    the only gap is the tail (kwon2023 §3.1, §6.1; SIM.md §9.15)
  - the toy capacity and the cap of 8; vLLM's default `max_num_seqs` is 256 on
    GPUs under 70 GB
  - one GPU (SIM.md §9.1)
  - step time comes from a roofline, with step overhead 0 and llmsize's MBU of
    0.65 (SIM.md §9.2)
  - the paged kernel's slowdown is not charged to step time (SIM.md §9.4)
  - FCFS only: no priority scheduling, and no per-request `max_tokens`
    (SIM.md §9.10)
  - copy-on-write, beam search, and parallel sampling (kwon2023 §4.4)
  - CPU swapping (kwon2023 §4.5); V1 recomputes instead
  - the null block, lookahead, and async scheduling (SIM.md §9.12, §9.11, and
    §9.3)
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
  - request slot color (DESIGN.md `--req-k`), pattern, and glyph at every
    size, plus an "r3" label when the cell is at least 24 px
  - fill level as a bar growing from the bottom, filled / B
  - reserved, unused slots in the gray hatch (DESIGN.md block states)
  - the gap with a dotted outline and a "gap" label
  - free blocks as an outline only
- **Mobile (375 px):** at most 48 cells per grid, with a zoom-out summary bar.
  - The bar is an 8 px strip of every block, colored and patterned by state,
    with a bracket marking the visible window.
  - Prev and next buttons move the window. Cells never shrink below 40 px.
- **Canvas** (changed while planning chapter 4). Chapter 2 alone stays under
  CLAUDE.md's 2,000-element SVG limit, but chapter 4 reuses this grid and
  reaches about 4,000 elements in compare mode at B 8. One Canvas renderer
  serves both chapters.
  - Hit-testing is grid arithmetic.
  - The canvas has `role="img"` with a text summary. The block table panel and
    a polite live region carry the same information as text.
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
- **`visible-in-20s`:** the three tuning targets in SIM.md §7
  (`paged-vs-contiguous` overrides).
- **`block-size-shortens-tables`:** mean table length falls as B rises.
- **`max-model-len-hurts-contiguous-only`:** at 1024, contiguous's peak running
  is exactly 1, the CheckYourself answer, and the paged run's `hashEvents` is
  identical to the one at 512 (AUDIT.md m18).
- **`shared-refcount`:** the shared blocks have reference count 2 while both
  requests run.
- **Meta-test:** claim ids match test ids.

**`tests/viz/frames.test.ts`** (not a claim test, so outside the meta-test;
AUDIT.md m18): `frames-match-snapshots`. Replaying the log rebuilds the engine
snapshot at every step, so the widget draws what the engine did.

**`e2e/paged-attention.spec.ts`** (Playwright):
- Screenshots at 375, 768, and 1440 px, light and dark, paused at t = 12 s.
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
- `max_model_len`, page, preemption

### DoD checklist (docs/CHAPTER_DOD.md)

Copied from docs/CHAPTER_DOD.md for chapter 2. Each item is ticked with how it
was verified.

**Content**
- [x] 1. Objective first, checked last: PRODUCT.md's objective, word for word.
  Two CheckYourself questions, each answered before a reveal with a "Try it"
  control inside: both allocators' running counts at max_model_len 1024, and
  (added 2026-10-15, PRODUCT.md's knob) block size 16 → 128.
- [x] 2. Sources: 40 SourceLinks, all ids in sources.json
  (tests/sources.test.ts); glossary source ids checked by writing.test.ts. Our
  reasoning is marked in step 8 ("Our reasoning from kwon2023 §2.2").
- [x] 3. Provenance: every number from data or the sim renders through `<Num>`,
  with at least one badge per sentence; widget readouts carry their own badge.
  Paper and vLLM numbers carry SourceLinks. Review item 11 removed the last
  hand-typed numbers from captions and labels.
- [x] 4. Claims: 14 `<Claim>` ids, 14 tests on the configs the chapter imports;
  the meta-test passes. `only-tail-gap` was added after review item 12, and
  `checkyourself-block-size` with the second question (2026-10-15).
  tests/viz/frames.test.ts (frames-match-snapshots) passes at every block size,
  on a preemption-heavy workload, and on the prefix-caching teaser.
- [x] 5. Writing rules: writing.test.ts passes (its sentence splitter now also
  ends a sentence at a closing quote). 19 glossary terms added (46 in all).
- [x] 6. End sections: 12 "What this leaves out" lines, each with a source or a
  SIM.md §9 entry; "Go deeper" links kwon2023, vllm-pa-doc, vllm-src, and
  yu2022 only.

**Widgets**
- [x] 7. Keyboard and touch: in all three browsers the tests Tab (or Shift+Tab)
  to the block grid, token strip, sliders, selects, and Step, check the focus
  ring, and operate them with arrows, Enter, or Home. Hit areas are at least
  44 × 44 px at 375 and 768. Grid cells respond to tap, so below 1024 px they
  are at least 44 px: 6 columns of 49 px at 375, 14 of 46 px at 768 (e2e
  measures every grid). Tokens are 14 px, so below 1024 px they ignore taps
  and a 44 px "Token" slider moves the cursor (2026-10-15).
- [x] 8. Labels: every control has a visible label. Readouts are polite live
  regions when paused (off while playing); the grid cursor, token strip,
  shared-blocks readout, and Try it controls announce too. The grid cursor
  names the cell's request, its block-table entry (or region slots), and its
  fill; an e2e test checks the exact text. Both figures say which keys move
  their cursors (2026-10-15).
- [x] 9. Playback: figures 2.1, 2.2, 2.4, 2.5 (one PlaybackBar over sim time)
  and 2.6 (by step). Frames come from the event log alone and match the
  engine's snapshot at every step (frames-match-snapshots).
- [x] 10. Reduced motion: Play is disabled and Step walks the step ends (e2e).
- [x] 11. Sizes, themes, browsers: no horizontal scroll and no clipped SVG text
  at 375, 768, and 1440 in Chromium, WebKit, and Firefox (a Firefox-only clip
  of the strip labels was fixed).
- [x] 12. No layout shift: 0 in the compare and token-strip tests; readout
  values have fixed widths, the preemption item is laid out at 0, and panels
  reserve their height. Input-driven shift logged: 0.
- [x] 13. No console or page errors in any widget test.
- [x] 14. axe: no violations at 768 light and dark, and 1440 light (after
  making repeated grid sections groups, not landmarks).

**Performance** (`pnpm perf`, Chromium, one worker; traces in
`test-results/paged-attention-perf-*/`)
- [x] 15. Event Timing over control changes, each re-running both sims: max 32 ms
  at 1×, 48 ms at 4×; p95 over entries of 16 ms or more: 32 and 40 ms.
  Measured 2026-10-15 with the 44 px cells, at load average 5–10 from other
  work on the machine (2026-10-09: 24 and 32 ms).
- [x] 16. rAF over 5 s of compare playback at block size 8 (160 cells per grid):
  p50 16.7, p95 16.8, max 16.8 ms at 1×; p50 16.7, p95 16.8, max 33.4 ms at 4×.
  The 44 px cells first dropped 4× to p50 50 ms, so the grid now repaints
  only the cells that changed. An e2e test checks that this matches a full
  repaint pixel for pixel, in all three browsers.

**Tests and review**
- [x] 17. Screenshots: 6 baselines per platform, paused at t = 12 s (darwin
  locally; Linux from the baselines workflow, run 38001280611, where the 12
  existing Linux baselines came back byte-identical). CI runs 38001451362
  (branch) and 38002027933 (main) passed with them.
- [x] 18. Interaction: compare controls, grid keyboard, cursor announcement,
  incremental repaint, token strip (keys, and the slider at 375 px), shared
  blocks, mobile window, reduced motion, and the wide layout: 18 tests × 3
  browsers, all passing.
- [x] 19. Checks: `pnpm test` (226), `pnpm typecheck`, `pnpm lint`, and
  `pnpm build` pass.
- [x] 20. Fresh-eyes review: 22 findings (2 major, 13 minor, 6 nit); 19 fixed,
  3 answered (below).

**Launch assets**
- [x] 21. Capture: `pnpm capture paged-attention`: 8.13 s, 1200×2184 H.264 mp4
  (961 KB) and a 600 px, 12 fps GIF (1.84 MB), compare mode at 2× from t = 0.
  Re-recorded 2026-10-15; it is taller because cells are at least 44 px at
  600 px.
- [x] 22. Route HTML: dist/paged-attention/index.html has its title,
  description, canonical, og and twitter tags, and a 1200×630 image
  (tests/postbuild.test.ts). Live: smoke plus both chapters' specs (114 tests,
  screenshots excluded) pass against https://varadmore.me/serving-explained/
  in all three browsers; og/paged-attention.png returns 200.

### Fresh-eyes review: findings and answers

1. Major. "PagedAttention" undefined. Fixed: step 3 defines it (block manager
   plus kernel), with a glossary entry.
2. Major. Request lengths never stated. Fixed: step 2 gives 64 to 376 slots,
   190 on average; step 5 explains the spread control.
3. Same prefix, same KV: marked "Our reasoning from kwon2023 §2.2".
4. Prefill takes several blocks. Fixed: heading "Take memory as it is needed",
   prompt blocks at start then one at a time, cited to §4.3; caption too.
5. "Queue keeps growing" stronger than its test. Fixed: "grows from 10 at 10 s
   to 17 at 20 s", which the test asserts.
6. "Not side by side" stronger than its test. Fixed: the test now requires no
   two blocks to be neighbors; the claim says so.
7. Paged unchanged at 1024 also needs requests under 384 tokens. Fixed.
8. Kernel tense and undefined baselines. Fixed: past tense, FasterTransformer,
   ShareGPT, OPT-13B, Orca, and Oracle glossed; step 2 now names Orca (Max).
9. A10G count overstated. Fixed: "by llmsize's count, before vLLM's holdback
   and overheads"; a leaves-out line added (SIM.md §9.14).
10. Terms before definition. Fixed: slot, pool, B, block size, reference count,
    roofline, and the vLLM extras are defined at first use.
11. Badges and typed numbers. Fixed in prose, captions, labels, and the MBU line.
12. Gap claims. Fixed: "once both are taken"; new claim `only-tail-gap`, tested at
    every max_model_len.
13. "Up to 8" is the cap. Fixed: "reaches the cap of 8"; contiguous never
    preempts, now in the claim and its test.
14. Preemption citation. Fixed: L746–818 for the victim, L1540–1562 for the
    recompute; glossary cites vllm-src.
15. Table length as a cost. Fixed: heading "Block size changes waste and table
    length"; the paper's speed trade-off stated as the paper's.
16. Block terms on the contiguous grid. Fixed: contiguous cells read "Slots
    16–31: in r6's region"; the grid is a "memory grid"; legend "Free".
17. Step 5 holds several ideas. Answered: the step list is the approved plan's.
18. Footnote is about per head and layer. Fixed.
19. max_model_len glossary second sentence. Fixed: removed.
20. Strip readout mixed indexing. Fixed: "position 0 of 0–15".
21. "Freed only at 0" with caching. Fixed: "goes back to the free queue only at
    0" (vllm-apc-doc L198).
22. Knob vs. CheckYourself, and role="grid". Answered: the plan put the
    prediction on max_model_len; the grid is a canvas, so it is one focusable
    group with a live cell cursor (role="grid" needs cell elements, which
    axe would require).

### Deviations from the plan (reported)

- New claim `only-tail-gap` (review item 12), with its test.
- The grid is `role="group"` with a live cell cursor, not `role="grid"`.
- Step 3's heading is "Take memory as it is needed", and step 6's is "Block
  size changes waste and table length" (review items 4 and 15).
- Compare mode shows the playhead to 2 decimals, so Step visibly moves it.
- Shared e2e helpers moved to e2e/helpers.ts and e2e/perf.ts; chapter 1's
  specs use them, and still pass.

### The author's answers (2026-10-15), and what changed

1. **Step 5 is split** into "Same workload, two allocators" and "When blocks
   run out". No claim, test, or preset changed.
   - Step 5 holds `paged-less-waste` and the reality check.
   - Step 6 holds `paged-admits-more`, the preemption paragraph,
     `visible-in-20s`, and the misconception.
   - `paged-admits-more` moved to step 6 because it says "never preempts"
     and leads into preemption.
2. **A second CheckYourself on block size** (PRODUCT.md's knob), with claim
   `checkyourself-block-size` and a "Try it" select. The plan above lists it.
3. **CLAUDE.md** has the rule on presentational changes under "Stop and
   ask when".

**Checks before re-tagging v0.5-ch2:**
- **Numbers:** 77.6% (contiguous waste), 64–376, and 190 (request lengths)
  all render through `<Num>` from live values, each sentence with a
  simulated badge. None is typed into the page; a grep of src finds no copy.
  - `F.contiguousWaste` comes from `compareFrames`.
  - `F.shortest`, `F.longest`, and `F.meanLength` come from
    `compareConfig("paged").requests`.
- **Touch targets:** fewer columns below 1024 px, so every cell is at least
  44 px. I chose this over snapping taps: the old pitch was 39 px at 375 and
  32 px at 768, under 44 even with snapping.
- **Cursor:** a polite live region announces the focused cell, and the
  figure's visible key line names Tab, the arrows, Home, End, and Enter.
  - Paged: "Block 37: r3's block table maps its logical block 2 here.
    12 of 16 slots hold KV."
  - Contiguous: "Slots 16–31: r6's region, its slots 16–31. …"
- **Chapter 1:** `git diff v0.4-ch1 v0.5-ch2 -- tests/chapters/kv-cache.test.ts`
  is empty. The e2e kv-cache specs changed only by moving inline checks into
  e2e/helpers.ts with the same bodies; their assertions are unchanged.

## Prompt 5: continuous batching chapter (PLAN, approved 2026-10-02)

- [x] Read yu2022 §3 (C1, S1) and agrawal2024 §1, §2.4, §3.1–3.2, and
      §4.1–4.3 from the PDF text. A sub-agent checked agrawal2023 and bench-ieb.
- [x] PRODUCT.md chapter 3 updated to Prompt 5's objective and misconception.
      Prefill stalls now belong in this chapter, not a later one.
- [x] SIM.md changes (approved 2026-10-02):
  - presets `batching-basics` and `long-prompt-stall`
  - a `mixture` length distribution
  - ITL percentiles pooled over every inter-token gap
- [x] DESIGN.md changes: slots are assigned at admission, and request phases
      are encoded with ink and pattern (both approved 2026-10-02).
- [x] The chapter (Build 4). All 22 DoD items below are ticked. Live on
      2026-10-15, tagged v0.6-ch3.

### What the sources say

- **Request-level scheduling** keeps a batch fixed until every request in it
  finishes (yu2022 §3, C1).
  - A finished request cannot return early.
  - A new arrival waits for the whole batch.
  - The engine even keeps computing for finished requests.
- **Iteration-level scheduling** picks requests at every iteration (yu2022 §3,
  S1). The scheduler sees each finish at once, and a new request can start
  after the current iteration.
- **Prefill is compute-bound and decode is memory-bound** (agrawal2024 §1, §3.1,
  Fig. 5).
  - Prefill processes every prompt token in parallel; decode processes one
    token per request.
  - Decode batches leave compute idle, so extra tokens can ride along at little
    cost (Takeaway-2).
- **TTFT and TBT** (agrawal2024 §2.4). TTFT runs from arrival to the first
  output token. TBT is the gap between consecutive output tokens. The prompt's
  ITL is the same quantity; the glossary gives both names.
- **Generation stalls** (agrawal2024 §3.2). A prefill scheduled between a
  request's decodes delays them. Even with mixed prefill and decode batches, as
  in Orca, a batch that holds a long prompt stays slow. That is exactly our
  engine with chunking off (SIM.md §8).
- **Chunked prefill and stall-free batching** (agrawal2024 §4.1–4.2).
  - Sarathi-Serve packs decodes first, then prefill chunks into the leftover
    token budget.
  - vLLM V1 has no phases. It schedules running requests in admission order,
    then waiting ones, under one budget, so decodes usually come first through
    admission order (SIM.md §8; AUDIT.md m9).
  - Chunked prefill itself was introduced in agrawal2023.
- **The token budget trade-off** (agrawal2024 §4.3). A smaller budget lowers
  TBT. It also adds chunking overhead: lower GPU utilization, and repeated reads
  of earlier chunks' KV.

### Numbers behind this plan

These come from the SIM.md §5 roofline with llmsize's constants, for Llama-3.1-8B.
They use the A10G's dense bf16 figure from AWS's datasheet, 70 TFLOPS, which
llmsize takes in Build 1. llmsize's current 125 is the A10's (AUDIT.md M9,
m16; recomputed 2026-10-02).

- **A10G:** a decode step takes 38.5 ms and is memory-bound. Compute time
  overtakes memory time at about 76 tokens per step.
  - A 7,000-token prefill takes about 3.6 s of dense compute plus about 0.41 s
    of attention.
  - A 2,048-token chunk takes about 1.1 s.
- **H100:** the crossover is at about 191 tokens per step.

### Decisions for the author (all decided 2026-10-02)

1. **Slots are assigned at admission** (DESIGN.md). The old rule assigned
   slots in arrival order, wrapping after 8, which breaks once a queue holds
   more than 8 requests.
   - Now a request takes the lowest free slot when it is admitted.
   - Waiting requests are drawn neutral with their id.
   - Chapter 2 works under either rule.
   - **Decided: accepted.**
2. **Phases use ink and pattern, not request hues** (DESIGN.md):
   - queued: a dashed outline
   - prefill: a striped dark fill
   - decode: a solid mid fill
   - bubble: the gray waste hatch
   - A slot tab (the slot's color, pattern, and glyph) and the id label carry
     the request's identity. This follows the prompt's "each with its own color
     and pattern" without clashing with the 8 request hues.
   - **Decided: accepted.**
3. **The timeline's x axis is sim time, not step index.** Each step is as wide
   as it is long, so a stalled step shows as a wide column across every lane.
   Steps over 5× the median get a labeled band. Lockstep comparison is by time
   too, as in chapter 2.
   - **Decided: accepted.**
4. **Static mode streams tokens as they are made.** That flatters static. Orca
   says request-level systems return results only when the whole batch ends
   (yu2022 §3). TTFT counts the first token generated, and E2E counts the batch
   end. This goes in "What this leaves out".
   - **Decided: accepted.**
5. **Chunking off.** The widget raises the budget to `max_model_len` (8,192) and
   shows that it did. vLLM does this only when the budget is unset; an explicit
   smaller budget is a `ValueError` there (vllm-src `arg_utils.py`; AUDIT.md
   m10). The engine keeps its config error (SIM.md §8).
   - **Decided: accepted.**
6. **`max_num_seqs` runs 1–8,** because of DESIGN.md's limit of 8. The chapter
   says vLLM's default is 256 on GPUs under 70 GB (AUDIT.md M5).
   - **Decided: accepted.**
7. **`long-prompt-stall` uses the real A10G KV capacity:** 61,776 tokens, the
   free memory llmsize computes for Llama-3.1-8B (61,787), rounded down to
   whole 16-token blocks. As a chapter preset, it keeps this fixed pool
   (SIM.md Q6).
   - **Decided: accepted.**
8. **Our cost model may not show the throughput side of the trade-off.**
   - GPU efficiency is constant and the step overhead is 0 (SIM.md Q5). So
     splitting a prompt into small chunks costs almost no throughput in the sim.
     Real kernels lose efficiency on small chunks (agrawal2024 §4.3).
   - Option (a): give these presets a step overhead calibrated from bench-ieb
     (Q5), if the files allow it (see "Measured callout").
   - Option (b): keep 0 and say plainly that the sim leaves this cost out.
   - **Update after checking bench-ieb: (a) is not possible.** At concurrency 1,
     vLLM decoded 30.2 tok/s on the A10G, about 33 ms per token. Our roofline
     predicts 38.5 ms. The roofline is slower than the measurement, so the
     leftover that would give a fixed overhead is negative.
   - I recommend (b). The finding also goes into SIM.md Q5.
   - **Decided: (b).** Overhead stays 0, and the chapter says the sim leaves
     this cost out (SIM.md Q5, §9.2).
9. **The misconception's TTFT half is not yet shown.** I can see how bigger
   token budgets hurt p99 ITL in the sim. I cannot yet show from reasoning alone
   that bigger batches hurt TTFT on these presets.
   - The claim is worded after the sim runs.
   - If no preset shows TTFT getting worse, I stop and report. The prose would
     then narrow to ITL.
   - **Decided:** if no preset shows TTFT getting worse, narrow the claim to
     ITL and tell the author.
   - **Result (STOP 2, 2026-10-02): yes, through the token budget.** Raising
     `max_num_batched_tokens` from 512 to 8,192 raises TTFT:
     - mean and p99 both rise at every budget step on `agent-loop` (+17%,
       +29%), `batch-summarize` (+13%, +15%), and `long-prompt-stall`
       (+9.5%, +9%)
     - on `rag`, mean TTFT ends 9% higher, though not at every step
     - p99 ITL rises with the budget on every preset that has long prompts
     - Raising `max_num_seqs` lowers TTFT, because queueing dominates. The
       only exceptions are rises of at most 4% at the knee.
     - So the claim keeps TTFT, scoped to the token budget. The chapter
       words it after its own tests.
10. **A nuance I will test.** When long prompts are rare, chunking can *raise*
    p99 ITL. It turns one big stall (under 1% of gaps, so invisible to p99) into
    several smaller ones (over 1%).
    - The prompt's claim holds on `long-prompt-stall`, because 15% of prompts
      are long.
    - If the sim shows the reversal at 2% long prompts, the chapter says so
      (claim `chunking-spreads-stalls`).
    - **Decided: accepted.**

### Measured callout (optional per the prompt: traceable, so included)

**Where it goes:** step 6, next to the misconception. A real engine shows the
same trade-off at scale: from 1 to 64 concurrent requests, throughput climbs,
and so does median TTFT. It does not rise at every level: vLLM's p50 TTFT fell
from 99.6 to 91.2 ms between 4 and 8 (AUDIT.md m11).

**Files** (bench-ieb at `1c964318`):
- `results_concurrency64/llama-3-1-8b-instruct/throughput_ramp_extended_vllm_1776486559.json`
- `results_concurrency64/llama-3-1-8b-instruct/throughput_ramp_extended_sglang_1776488646.json`
- `logs/phase2_resume_20260418T042547.log`

**What the log records:**
- `:7` GPU "NVIDIA A10G, 23028 MiB"
- `:15–16` image tags `vllm/vllm-openai:v0.18.0-cu130` and
  `lmsysorg/sglang:v0.5.10.post1-cu130`
- `:36` model `meta-llama/Llama-3.1-8B-Instruct`
- `:57` and `:98` the two result filenames
- The result JSONs themselves record only the model and the engine.

**How each number is computed** (I recomputed it myself, and it matches the
sub-agent's script):
- Each file has 900 requests, 150 per concurrency level (1, 4, 8, 16, 32, 64).
  There are no failures, and every request has 256 output tokens.
- The level is the request index // 150, because `request_id` restarts at 0 for
  each level.
- TTFT comes from `requests[].ttft_ms`.
- Throughput per level is 150 × 256 output tokens divided by the time between
  that level's "throughput ramp level" log line and the next one. For the last
  level, the next line is "saved results".

| engine | concurrency | p50 TTFT | output tok/s |
|---|---|---|---|
| vLLM | 1 | 41.2 ms | 30.2 |
| vLLM | 64 | 162.8 ms | 1,279.6 |
| SGLang | 1 | 69.9 ms | 30.2 |
| SGLang | 64 | 156.1 ms | 1,271.1 |

**The callout text** (`measured` badge, linked to all three files):
- From 1 to 64 concurrent requests, output throughput rose about 42× on both
  engines. Median TTFT rose 4.0× on vLLM and 2.2× on SGLang.
- The callout also states the hardware, model, and engine tags.

**Caveats, shown in the callout:**
- one run per engine
- 150 requests per level, so p99 is close to the second-highest sample (that is
  why it shows p50)
- the 4 prompts are 13–18 words, reused with prefix caching on, so TTFT here is
  mostly queueing, not prefill
- throughput includes each level's drain tail
- engine versions come from Docker tags, not digests
- `output_tokens` counts streamed chunks (`engines/base_client.py:116–132`)

**What it does not show:** static vs. continuous batching. Both engines batch
continuously. The callout says so, and makes no engine-vs-engine claim.

### Presets (SIM.md §7, tentative; tuned until the tests pass)

- **`batching-basics`:**
  - seed 11; 48 requests, Poisson at 1.2/s
  - prompt body uniform 32–256
  - output lognormal, median 80, σ 1.0, 8–512 (a wide spread)
  - `max_num_seqs` 8, budget 2048, chunked prefill on
  - KV plentiful (2,000 blocks), prefix caching off
- **Why `batching-basics` should show the gap:**
  - Continuous: 8 slots, with each request taking about 4 s, serves about
    1.8 requests/s.
  - Static: a batch lasts as long as its longest output (about 11 s for 8
    requests) and serves about 0.7 requests/s.
  - At 1.2 arrivals/s, static's queue grows and continuous keeps up.
- **`long-prompt-stall`:**
  - seed 13; 80 requests, Poisson at 1.5/s
  - prompt body: 85% uniform 64–256, 15% uniform 6,000–7,500
  - output lognormal, median 50, σ 0.5, 16–200
  - `max_model_len` 8192, `max_num_seqs` 8, 3,861 blocks
  - compared: chunking on with budget 2048, vs. chunking off with budget 8192
- **Why `long-prompt-stall` should show the stall** (at 70 TFLOPS, AUDIT.md
  M9):
  - Without chunking, each long prompt makes one step of about 3.4–4.3 s, and
    up to 7 decodes wait in it. That is about 1.9% of all gaps, so it shows in
    p99.
  - With chunking, each long prompt makes about 4 steps of about 1.1–1.3 s.
  - The long prompt's own TTFT rises by its steps' decode compute, about 3–5%.

### Scroll steps

1. **Two phases.** Figure `PhaseBars`, for the model and GPU picked inline.
   - A one-request sim run (prompt 1,024, output 4) shows compute time and
     memory time for the prefill step and for a decode step, labeled with the
     bound.
   - The crossover in tokens per step is shown via `<Num>` (simulated).
   - Model and GPU pairs whose weights do not fit are disabled, with the reason.
   - Claims: `prefill-compute-bound`, `decode-memory-bound`.
   - Sources: agrawal2024 §1 and §3.1, kwon2023 §2.2.
2. **Static batching.** The timeline runs `batching-basics` in static mode.
   - Lanes fill as one batch.
   - Short requests finish and turn into gray bubbles until the longest one
     ends.
   - New arrivals pile up in the queue band.
   - Claims: `static-never-admits-mid-batch`, `static-has-bubbles`,
     `static-queue-grows`.
   - Sources: yu2022 §3 (C1).
3. **Continuous batching.** Compare mode: static vs. continuous, same seed, one
   `PlaybackBar`.
   - On the continuous side, the bubbles are gone and the queue stays short.
   - TTFT and ITL are defined here, at first use.
   - Claims: `continuous-lower-ttft` (mean and p99),
     `continuous-higher-throughput`, `continuous-shorter-queue`,
     `continuous-admits-promptly`.
   - Sources: yu2022 §3 (S1), agrawal2024 §2.4.
4. **The cost.** `long-prompt-stall` with chunking off.
   - A long prompt's step is a wide band across every lane.
   - The ITL histogram grows a cluster far to the right, labeled "waited for
     one long prefill".
   - Claim: `long-prefill-stalls`. Sources: agrawal2024 §3.2.
5. **Token budget and chunked prefill.** Compare mode: chunking off vs. on.
   - The band splits into about 4 shorter ones, and p99 ITL drops.
   - Once admitted, a long prompt takes longer to reach its first token, but
     its total TTFT barely moves. Both are shown via `<Num>` (simulated).
   - Prose: a lower budget flattens the steps further; the reader can drag it.
   - If the reversal from decision 10 is kept, it is shown here at 2% long
     prompts.
   - Claims: `chunking-lowers-p99-itl`, `chunking-slows-long-prefill`, and
     `chunking-spreads-stalls` (AUDIT.md m18).
   - Sources: agrawal2023, agrawal2024 §4.1–4.3.
6. **Takeaway: no free setting.** Figure `BudgetSweep`: budgets 64, 128, 256,
   512, 1024, 2048, 4096, and 8192 on `long-prompt-stall`.
   - Three small charts: throughput, p99 ITL, and mean TTFT of the long
     prompts. The current setting is marked.
   - Claims: `no-free-setting`, and `bigger-batches-cost-latency`, the
     misconception claim, worded after the sim (decision 9; AUDIT.md m18).
- **CheckYourself** (predict, then run): "Widen the output-length spread. Does
  the gap between static and continuous grow or shrink?" The knob is PRODUCT.md's.
  - Claim: `spread-widens-gap`. Static's mean TTFT minus continuous's grows with
    σ.
- **What this leaves out:**
  - Static streams tokens and stops computing finished requests (yu2022 §3;
    SIM.md §9.16 and §9.20).
  - There is no batching timeout (SIM.md §9.19).
  - GPU efficiency is constant, so small chunks are not penalized (agrawal2024
    §4.3).
  - Step time comes from a roofline, with step overhead 0 and llmsize's MBU of
    0.65. bench-ieb's measured decode implies about 0.76 (SIM.md §9.2).
  - Output length is fixed per request; real requests stop at EOS or
    `max_tokens` (SIM.md §9.6).
  - KV writes, sampling cost, and activation memory are ignored (SIM.md §9.17).
  - Scheduling is synchronous, while vLLM's is async (SIM.md §9.3).
  - At most 8 seqs, against vLLM's default of 256 on GPUs under 70 GB.
  - FCFS with head-of-line blocking only (SIM.md §9.10).
  - No pipeline-parallel bubbles (agrawal2024 §3.3), and no disaggregated
    prefill.
- **Go deeper:** yu2022, agrawal2023, agrawal2024, kwon2023 §4.5, and vllm-src
  (`scheduler.py`).

### Widget spec

**RequestTimeline** (`src/chapters/continuous-batching/RequestTimeline.tsx`)

- **Layout:**
  - One lane per slot, up to `max_num_seqs` (at most 8), 24 px each.
  - A queue band above the lanes shows neutral chips with ids, and "+n" past
    12.
- **x axis:** sim time.
  - A 30 s window on desktop and 12 s on mobile, with the playhead at
    two-thirds of the window.
  - Segments: prefill, decode, and bubble, plus stall bands. Each request's
    run starts with a 16 px slot tab (color, pattern, and glyph; DESIGN.md),
    and a segment carries the id label when 28 px or wider.
- **Charts below:**
  - queue length over time (a line)
  - TTFT histogram
  - ITL histogram on a log x axis
  - p50 and p99 are drawn as labeled rules.
  - In compare mode the histograms become small multiples, one row per run,
    sharing the x axis. Queue is one chart with 2 series, a legend, and direct
    labels.
  - Hover and focus show tooltips; each chart has a table view under
    `<details>`.
- **Readouts** (`simulated`): output tokens/s, mean and p99 TTFT, p50 and p99
  ITL, both so far and at the end of the run.
- **Controls:**
  - scheduler: radio, static or continuous
  - arrival rate: slider
  - output spread: slider over σ, 0–1.5
  - `max_num_seqs`: slider, 1–8
  - `max_num_batched_tokens`: slider stops 64–8192, the sweep's budgets
  - chunked prefill: `Toggle`. When it is off, the budget control is locked at
    `max_model_len` with the note "raised to 8,192, as vLLM does when no budget
    is set".
  - preset: set per scroll step
- **Compare mode** takes two configs:
  - static vs. continuous in steps 2–3
  - chunking off vs. on in steps 4–5
  - Lockstep is by sim time. Step jumps to the next `StepEnd` in either run.
- **Elements:** about 240 segments plus chart marks, well under 2,000, so SVG.
- **375 px:** 8 lanes are 192 px tall, the window is 12 s, and the charts stack.

**Small figures:** `PhaseBars` (step 1) and `BudgetSweep` (step 6). Both use
SVG and the chart rules in the dataviz references.

### Tests

**`tests/chapters/continuous-batching.test.ts`** (on the exact presets):

- **`prefill-compute-bound`, `decode-memory-bound`:** for every model × GPU pair
  that fits, the bound of the run's first `StepEnd` is compute, and of a decode
  step it is memory.
- **`static-never-admits-mid-batch`:** re-derived from the event log,
  independently of the engine's own invariant 5.
- **`static-has-bubbles`:** idle slot-seconds are more than 25% of held
  slot-seconds in the first 20 s.
- **`static-queue-grows`, `continuous-shorter-queue`:** compared by time-averaged
  queue length.
- **`continuous-lower-ttft`** (mean and p99) and
  **`continuous-higher-throughput`:** the prompt's tests.
- **`continuous-admits-promptly`:** whenever a slot is free at the start of a step
  and a request waits, it is admitted in that step. This holds while memory and
  budget allow, as they do on this preset.
- **`long-prefill-stalls`:** without chunking, p99 ITL is at least 20× p50 ITL.
- **`chunking-lowers-p99-itl`:** the prompt's test.
- **`chunking-slows-long-prefill`** (replaces `chunking-raises-long-ttft`):
  with chunking, the long prompts' mean time from admission to first token
  rises, and their mean TTFT changes by less than 5%. Neither run preempts.
- **`no-free-setting`** (AUDIT.md m18, restated 2026-10-15) on
  `long-prompt-stall`, budgets 64–8,192:
  - p99 ITL rises at every step up (too large brings back stalls)
  - at 64 every step is memory-bound, and 64 loses to 128 on throughput and
    on the long prompts' mean TTFT (too small costs both)
  - memory-bound time falls at every step down from 8,192 to 128
  - the best throughput and the best long-prompt TTFT are at neither end
  - on `batching-basics` (short prompts), budgets 512–8,192 give identical
    results (it depends on the workload)
- **`bigger-batches-cost-latency`:** the misconception claim, worded after the
  sim (decision 9).
- **`spread-widens-gap`**, and **`chunking-spreads-stalls`** (decision 10,
  restated 2026-10-15): at 2% long prompts, chunking raises the share of stall
  steps and lowers max ITL. Stalls stay under 1% of inter-token gaps in both
  runs.
- **Meta-test:** claim ids match test ids.

**`e2e/continuous-batching.spec.ts`** (Playwright):
- Screenshots at 375, 768, and 1440 px, light and dark, paused at t = 15 s.
- **RequestTimeline:**
  - Static → continuous changes the mean TTFT readout.
  - The chunked toggle changes the p99 ITL readout.
  - The budget slider changes it too.
  - Step advances the playhead time.
- **PhaseBars:** changing the GPU changes the times.
- **BudgetSweep:** the current marker moves with the budget.
- CLS 0, no console errors, axe passes.
- **Performance:** Event Timing on control changes, which re-run two
  80-request sims; rAF during compare playback.

**Capture, review, and route:**
- **Capture:** 8 s of static vs. continuous at 2×.
- **Fresh-eyes review:** done by a sub-agent.
- **Route:** `/continuous-batching/`, with the title "Continuous batching".

**Glossary terms added:**
- prefill, decode, compute-bound, memory-bound
- batch, static batching, request-level scheduling, iteration-level
  scheduling, continuous batching
- bubble, TTFT, ITL (TBT), p50, p99, throughput
- token budget (`max_num_batched_tokens`), `max_num_seqs`
- chunked prefill, generation stall, head-of-line blocking

### DoD checklist (docs/CHAPTER_DOD.md)

Copied from docs/CHAPTER_DOD.md for chapter 3. Each item is ticked with how it
was verified.

**Content**
- [x] 1. Objective first, checked last: PRODUCT.md's objective opens the
  chapter. CheckYourself asks "grow or shrink, and why?"; the answer gives the
  mechanism (batches last as long as their longest request) and the confound
  (the mean output grows with σ).
- [x] 2. Sources: every technical sentence has a `SourceLink` or says "our
  reasoning"; `tests/sources.test.ts` and the review checked the ids.
- [x] 3. Provenance: every sim, data, and benchmark number renders through
  `<Num>` from `figures.tsx` (`F`), with a badge in each sentence. Measured
  numbers link their result file or log line; `<Num kind="measured">` is new.
- [x] 4. Claims tested: 17 claims, one test each, plus the meta-test
  (`tests/chapters/continuous-batching.test.ts`, 18 pass).
- [x] 5. Writing rules: `writing.test.ts` passes; terms defined at first use
  (the review's list fixed); nine steps, one idea each.
- [x] 6. End sections: 16 "leaves out" lines, each with a source or SIM.md
  §9 entry; "Go deeper" links SOURCES.md ids only.

**Widgets**
- [x] 7. Keyboard and touch: the e2e tests Tab to the Step button, the
  scheduler radio (arrows), the chunking switch (Space), the budget slider
  (arrows), the GPU select, the sweep's slider (arrows, Home), and both chart
  cursors (arrows, Home, End), with focus rings. Every control is at least
  44 × 44 px at 375 and 768 (e2e, three browsers). Charts have table views.
- [x] 8. Labels: every control has a visible label; readouts and chart
  readouts are polite live regions (off while playing).
- [x] 9. Playback: Figures 3.2–3.6 have a PlaybackBar; the timeline is drawn
  from the event log (`timeline.ts`, checked against the engine in
  `tests/viz/timeline.test.ts`).
- [x] 10. Reduced motion: Play disabled; Step moves to the next step end in
  either run (e2e, three browsers).
- [x] 11. Sizes, themes, browsers: no horizontal scroll or clipped SVG text
  at 375, 768, and 1440 in Chromium, WebKit, and Firefox; screenshots light
  and dark.
- [x] 12. No layout shift: CLS 0 in the interaction test (input-driven
  0.00002, from the toggle).
- [x] 13. No console or page errors (interaction tests).
- [x] 14. axe: no violations at 768 light and dark, and 1440 light.

**Performance** (Chromium, traces saved under test-results)
- [x] 15. Interactions (Step, scheduler, chunking, budget): Event Timing max
  24 ms, p95 24 at 1×; max 32, p95 32 at 4×.
- [x] 16. Compare playback of Figure 3.6 at 4× speed: frames p50/p95/max
  16.7/16.7/16.8 ms at 1× and 16.7/16.8/33.4 ms at 4× CPU. The first 4× run
  failed at p50 33 ms: every frame re-sorted the gaps. Readouts and
  histograms now read prefix statistics built once per run. One later 4× run
  hit p95 33 ms at load average 10; a rerun gave the numbers above.

**Tests and review**
- [x] 17. Screenshots: Chromium at 375, 768, and 1440, light and dark,
  paused at t = 15 s. Darwin baselines local; Linux from the baselines
  workflow (run 38788855492), whose other 18 Linux files were byte-identical
  to the committed ones.
- [x] 18. Interaction: 15 Playwright tests × 3 browsers, 45 pass.
- [x] 19. `pnpm test` (262), `pnpm typecheck`, `pnpm lint`, `pnpm build`.
- [x] 20. Fresh-eyes review by a sub-agent: 33 points, answered below.

**Launch assets**
- [x] 21. Capture: `pnpm capture continuous-batching`: 8.13 s, mp4 358 KB
  (1200 × 1886), GIF 1.63 MB.
- [x] 22. Route HTML: title "Continuous batching – serving-explained",
  description, canonical, og and twitter tags, and og/continuous-batching.png
  at 1200 × 630 (postbuild; live smoke test after deploy).

### Build log

**STOP 1 (2026-10-15): three planned claims fail on the exact presets.**
tests/chapters/continuous-batching.test.ts has one test per planned claim,
plus `preemption-recomputes` for the preemption step the prompt asked for
(AUDIT.md m15). 14 pass. These fail, and no prose is written:

- `chunking-raises-long-ttft`: the long prompts' mean TTFT is 23.98 s with
  chunking and 24.25 s without. TTFT includes queueing, which chunking
  shortens. From admission to first token, chunking does add 5.3%
  (4.03 vs. 3.82 s), as the plan's reasoning expected.
- `no-free-setting`: budget 512 has both the lowest p99 ITL (0.31 s) and the
  lowest long-prompt mean TTFT (22.6 s). It also has the highest throughput
  (58.3 vs. 55.4 tok/s at 8,192). Decision 8 (b) charges nothing for small
  chunks, so the sim shows no cost to a small budget.
- `chunking-spreads-stalls` (decision 10): at 2% long prompts (2 of 80),
  stalls are 0.26% of gaps without chunking and 0.90% with it, both under 1%.
  p99 ITL is 0.128 s off and 0.132 s on: higher with chunking, but from
  ordinary steps, not from the stalls.

Also found:
- `preemption-recomputes` first failed on my test, not the engine. vLLM
  prepends each victim to the waiting queue, so the latest victim is first
  in line; the test now models that.
- Measured callout: recomputed from the three bench-ieb files with the
  plan's method, vLLM at concurrency 64 is 1,279.5 output tok/s, not 1,279.6.
  The other plan values match.

**The author's answers (2026-10-15).** Each replaces a claim that was wrong
as worded; no test is loosened.

1. `chunking-raises-long-ttft` becomes `chunking-slows-long-prefill`.
   - Disproved by: the long prompts' mean TTFT is 23.98 s with chunking and
     24.25 s without, so chunking does not raise it.
   - The new claim: from admission to first token, chunking takes longer
     (4.03 vs. 3.82 s), because the chunks share steps with decodes. Total
     TTFT changes by less than 5% (−1.1%).
2. `no-free-setting`: first find why 512 wins, then sweep 256, 128, and 64.
   - Disproved by: budget 512 had the lowest p99 ITL (0.31 s) and the lowest
     long-prompt TTFT (22.6 s), and the highest throughput (58.3 tok/s;
     55.4 at 8,192).
   - Why 512 wins over larger budgets: the engine is always busy, and the
     total compute is 61.0 s at every budget. Large budgets leave decode-only
     steps whose compute sits idle. Smaller budgets fill it with prefill
     chunks. Memory-bound time falls from 24.6 s at 8,192 to 19.9 s at 512
     and 14.0 s at 128, so the run ends sooner and queues are shorter.
   - The sweep (tok/s, p99 ITL, long-prompt TTFT): 64: 57.8, 0.043 s,
     23.8 s; 128: 62.5, 0.078 s, 20.3 s; 256: 60.4, 0.157 s, 21.4 s; 512:
     58.3, 0.314 s, 22.6 s. At 64 every step is memory-bound, below the
     A10G's crossover of about 76 tokens.
   - So a budget below 512 gets worse: the trade-off branch applies. The
     takeaway: too small a budget costs throughput and long-prompt TTFT, too
     large brings back stalls, and the best sits between and depends on the
     workload. On `batching-basics`, whose prompts are short, budgets 512 to
     8,192 give identical results.
   - agrawal2024 §4.3: small budgets cost GPU utilization and repeated KV
     reads, and the right budget "depends on the desired TBT SLO,
     parallelism configuration, and specific hardware properties."
   - Deviation that follows: the budget slider and `BudgetSweep` now run
     64–8,192 (the plan had 256–8,192 and 512–8,192), so readers can see
     both sides.
3. `chunking-spreads-stalls`: p99 is dropped from this claim.
   - Disproved by: at 2% long prompts, stalls are 0.26% of inter-token gaps
     without chunking and 0.90% with it, both under 1%. So p99 ITL (0.128 vs.
     0.132 s) moves for other reasons.
   - The new claim: a stall step is a step in which a long prompt does
     prefill work, so every running request's next token waits for it.
     Chunking raises stall steps from 0.23% to 0.79% of steps and cuts max
     ITL from 4.09 to 1.22 s.
4. Git: rebase normally and leave commit dates alone.

### Fresh-eyes review: findings and answers

1. Major. "So far" throughput kept falling after a run ended in compare
   mode. Fixed: readouts stop at the run's end; a test checks it.
2. Major. The cause in `chunking-slows-long-prefill` was wrong: other
   prompts' prefill chunks share the long prompt's steps (5,144 tokens),
   not decodes (348). The decided wording named decodes; the author chose
   the corrected cause (2026-10-15). The test asserts other prompts'
   prefill tokens exceed 10 times the decode tokens, and 10 times the
   chunking-off run's.
3. Major. "Slot" meant a KV token in chapter 2. Fixed: "batch slot", defined
   with max_num_seqs in step 2, with a glossary entry.
4. Major. The misconception mixed batch size and token budget. Fixed: "a
   batch grows in two ways"; no untested sim claim about max_num_seqs.
5. Major. The measured callout overstated its link. Fixed: "a related
   trade-off"; the reasoning now says little of TTFT is prefill. Not
   restored: "prefix caching on", which the files do not record.
6. Fixed: the roofline does charge KV re-reads; the line now names GPU
   efficiency (agrawal2024 §4.3) and zero overhead (SIM.md §9.2) apart.
7. Fixed: the p99 sentence is in the claim, asserted: p99 is below every
   stall gap in both runs and rises with chunking.
8. Fixed: the queue chart plots the step-end queue the prose measures.
9. Fixed: a note says what "So far" counts.
10. Fixed: "held" is a solid outline, added to DESIGN.md.
11. Fixed: y range labels, a key, and a note that axes do not start at 0.
    Answer: the 2,048 tick crowded 8,192; the ring and slider show it.
12. Partly: the question now asks "and why", and the answer adds the mean
    output's rise. The question itself is the approved plan's.
13. Fixed: "on Figure 3.2's short prompts"; decode-only steps at 8,192 are
    asserted memory-bound.
14. Fixed: "over all requests".
15. Fixed: "the default for `vllm serve`", cited L2886–2895. Answer: the
    author asked for "on GPUs under 70 GB".
16. Fixed: σ, max_num_seqs, TTFT, ITL, the token budget, Orca, Sarathi-
    Serve, bench-ieb, and the drain defined before use or rephrased.
17. Fixed: step 5 says chunking is off and the budget rises to 8,192.
18. Fixed: "Figure 3.1's crossover of 76".
19. Fixed: both phase claims name their one-request steps.
20. Fixed: "Figure 3.3's continuous run at its starting settings".
21. Fixed: "the first half of the arrival window, the first 20.1 s".
22. Fixed: chunking and rare stalls are two steps; the misconception and
    the measured callout are their own step (nine steps).
23. Fixed: bundled lines split; head-of-line blocking reworded; toy pools,
    MFU, and static's budget and chunking added; §9.13 for prefill machines.
24. Fixed: prompt count and word range come from bench-ieb.json, recomputed
    by the test. "SGLang batches continuously" removed (no source).
25. Fixed: the batch definition covers both kinds of batching.
26. Fixed: every sentence with a number has a badge; typed literals bound.
27. Kept the tested thresholds beside the bound numbers; the ITL ratio is
    now shown.
28. Fixed: glossary says "common name" or "our name".
29. Fixed: kwon2023 is "in 2023"; vllm-src is "at the pinned commit".
30. Fixed: "(does not fit)", with a note on why.
31. Answer: both ranges cover the recompute path; chapter 2's is narrower.
32. Fixed: A10G phrasing, per-level links, and why the ratios differ.
33. Fixed: p99 wording, the sim's single-request decode rate, and
    "continuous's".

### Deviations from the plan (reported)

- The budget controls run 64–8,192 (the author's answer 2).
- Nine steps instead of seven: two splits after the review (presentational).
- A preemption step (the prompt's m15) and a step for rare stalls.
- The phase claims and two others were narrowed to say exactly what their
  tests check; tests gained assertions, none lost one.
- DESIGN.md gained the "held" encoding.

### Landing (2026-10-15)

- Rebased onto main 9cf86c5 (the re-dated chapter 2); dates left alone, as
  the author asked.
- Branch CI first failed on 1 px full-page height differences between Linux
  runs. Fixes: fixed SVG heights, then the screenshot test pins the page to
  a whole pixel (tasks/lessons.md). Baselines run 38823045279; branch CI
  38823044900 green on e6a0d4a.
- main fast-forwarded to e6a0d4a; CI and deploy run 38824231368 succeeded.
- Live: `SMOKE_BASE_URL=https://varadmore.me/serving-explained/` smoke plus
  the kv-cache, paged-attention, and continuous-batching specs, 186 tests in
  three browsers, pass. og/continuous-batching.png returns 200.


## Prompt 6: prefix caching chapter (PLAN, approved 2026-10-02)

- [x] Re-read for this chapter:
  - vllm-apc-doc: L13–22 (block key parts, "We only cache full blocks"),
    L146–147 (touch, and evict on pop), L198 (free), L202–206 (LRU eviction)
  - zheng2024 §3: radix tree, one-token pages, LRU leaf eviction, node
    reference counts, longest-shared-prefix-first scheduling
  - bench-kvtt `proxy/replica_lb.py` at `56b5ab5d`
- [x] PRODUCT.md chapter 4 updated to Prompt 6's objective and misconception.
- [x] SIM.md changes (approved 2026-10-02):
  - presets `shared-system-prompt` and `cache-pressure`
  - a public `blockKeys(tokens, blockSize)`, so the hash-chain figure and its
    test use the engine's own keys
- [x] DESIGN.md: the cached, shared, and selected-chain block states (approved
      2026-10-02).
- [x] The chapter (Build 4). All 22 DoD items below are ticked. Live on
      2026-10-15, tagged v0.7-ch4.

### What the sources say

- **Block key** (vllm-apc-doc L13–19). The key is a hash of the parent block's
  key, the block's tokens, and extra keys (LoRA, multimodal, cache salt). Only
  full blocks are cached (L22).
- **A hit** (vllm-apc-doc L146; vllm-src `KVCacheManager`).
  - The new request "touches" each matched block: reference count +1, and it
    leaves the free queue if it was unused.
  - A full prompt hit is capped at length − 1, rounded down to a block
    (vllm-src `kv_cache_manager.py` L289–295; AUDIT.md m12). So even an
    identical prompt recomputes at least one token.
- **Eviction** (vllm-apc-doc L202–206). Unreferenced blocks stay keyed in the
  free queue. Allocation pops the head, the least recently used block; if that
  block is cached, popping evicts it.
- **Freeing** (vllm-src `block_pool.py` L777–808). Freed blocks are handled in
  reverse order: unkeyed ones go to the front of the queue and keyed ones to
  the tail. vllm-apc-doc L198 says all go to the tail; the author chose the
  code (SIM.md Q8; AUDIT.md M6).
- **Preempted blocks keep their keys** (vllm-src, SIM.md §8). A preempted
  request can hit its own old blocks when it is re-admitted.
- **RadixAttention** (zheng2024 §3).
  - A radix tree maps token sequences to KV, stored in pages of one token, so
    matching works token by token.
  - Eviction removes the least recently used leaf first. A node with a nonzero
    reference count is never evicted.
  - Cache and running requests share one memory pool.
  - A cache-aware scheduler runs requests in longest-shared-prefix-first order.
  - Any comparison with vLLM is our synthesis (SOURCES.md note 4).
- **Replicas** (bench-kvtt `proxy/replica_lb.py` L56–75). The balancer picks a
  replica by fewest outstanding requests or round-robin, and never looks at
  prompts. README L113–115: it runs N independent servers. That each one keeps
  its own cache is our inference, and the text says so (AUDIT.md m14).

### Decisions for the author (all decided 2026-10-02: accepted as recommended)

1. **The teaser has to describe kv-transfer-tax's balancer accurately.** It is
   a fair-baseline balancer, routing by load and not by prefix. Proposed
   sentence: "With several replicas, a hit needs the request to land on the
   replica that holds its prefix; the balancer in kv-transfer-tax routes by load,
   not by prefix." It links `proxy/replica_lb.py` at the pinned commit. The
   first half is our reasoning and is marked as such (AUDIT.md m14).
   - **Decided: accepted.**
2. **Sharing saves memory too.** With caching off, each request holds its own
   copy of the prefix, so fewer requests fit and the off run queues more. The
   chapter says this, and the TTFT gap is not attributed to saved prefill alone.
   Claim: `sharing-saves-memory`.
   - **Decided: accepted.**
3. **Unique prompts can still hit after a preemption.** A preempted request
   reuses its own blocks if they are still cached (vllm-src).
   - The misconception text gets that one exception.
   - The prompt's exact-equality test runs on a config with no preemption.
     "No preemption" is asserted first, so the test cannot pass for the wrong
     reason.
   - Claim: `self-hit-after-preemption`.
   - PRODUCT.md and the sandbox text carry the same exception (AUDIT.md M8).
   - **Decided: accepted.**
4. **"Nothing for decode speed" is tested mechanically.** A decode step reads the
   whole context whether it came from a hit or not, so its cost does not change.
   Claim: `decode-cost-unchanged`, checked on the cost model.
   - I do not claim that p50 ITL is unchanged. With caching on, more requests
     fit, so each decode step reads more KV. The sim may show ITL rising
     slightly, and the chapter would then say so.
   - **Decided: accepted.**
5. **The chapter 2 grid becomes Canvas,** as noted in the chapter 2 plan.
   - **Decided: accepted.**
6. **The KV capacity control keeps tokens fixed** when the block size changes. It
   is shown as "256 blocks (4,096 tokens)", so block size and capacity do not
   move together by accident.
   - **Decided: accepted.**

### Presets (SIM.md §7, tentative; tuned until the tests pass)

- **`shared-system-prompt`:**
  - seed 17; 60 requests, Poisson at 1.5/s
  - one 600-token prefix, shared by 90% of requests
  - prompt body uniform 32–256; output lognormal, median 100, σ 0.6, 16–256
  - toy KV of 4,096 tokens, `max_num_seqs` 8, caching on
  - With caching on, 8 running requests need about 38 + 8 × 17 = 174 blocks.
    With caching off they need about 440, so about 4 fit.
- **`cache-pressure`:**
  - seed 19; 80 requests, Poisson at 2/s
  - 12 prefixes of 256 tokens, shared by 90%
  - prompt body uniform 32–128; output lognormal, median 60
  - KV of 2,048 tokens. All prefixes together need 192 blocks against a pool of
    128, so most are evicted before reuse.
- **Unique-prompt config:** `shared-system-prompt` with share fraction 0. Its
  largest possible load is 8 × 32 = 256 blocks, so it never preempts, and the
  test asserts that.

### Scroll steps

1. **The waste.** Figure `RepeatedPrefill`: the first 12 requests of
   `shared-system-prompt` with caching off.
   - Each bar splits that request's prefill tokens into the shared prefix and
     its own body.
   - A counter shows the prefix recomputed n times, totaling X tokens, via
     `<Num>` (simulated).
   - Preempted requests compute the prefix again. Request 9's second prefill
     appears as a labelled recompute (author, 2026-10-15).
   - Claim: `repeated-prefill`. Sources: vllm-apc-doc (introduction).
2. **Block keys.** Figure `HashChain`: the shared prefix as a row of blocks.
   Each shows its first tokens, its parent's key, and its own key, as 6 hex
   digits from `blockKeys`.
   - A "change one token" control is a slider for the position plus a
     `Toggle`. The changed block's key and every later key are restyled and
     relabeled.
   - A note says vLLM hashes with sha256 by default, while the toy engine uses a
     53-bit hash and checks the tokens on every hit (SIM.md §3).
   - Claims: `one-token-changes-chain`, `full-blocks-only`.
   - Sources: vllm-apc-doc L13–22.
3. **A hit.** The grid with caching on.
   - An arriving request's lookup is animated block by block, from its
     `CacheHit` event: match, match, …, miss, then allocate.
   - Reference-count badges rise on the shared blocks.
   - The share-fraction control shows that the hit rate follows the workload.
   - The prefix-length control shows the knob to predict. A longer shared
     prefix saves more prefill per request, and widens the TTFT gap to caching
     off (PRODUCT.md; AUDIT.md M7).
   - Claims: `caching-lowers-ttft-and-prefill`, `hit-walks-chain`,
     `refcount-counts-sharers`, `sharing-saves-memory`,
     `share-fraction-raises-hits`, `longer-prefix-saves-more` (AUDIT.md m18,
     M7).
   - Sources: vllm-apc-doc L146–147.
4. **Partial blocks.** Figure `PartialBlocks`: the 600-token prefix drawn at
   B 8, 16, 32, 64, and 128.
   - Shared tokens are 600, 592, 576, 576, and 512. Each request recomputes 0,
     8, 24, 24, and 88.
   - Prose also notes the full-hit cap: an identical prompt recomputes its last
     block.
   - Claims: `partial-not-reused`, `shared-tokens-floor`, `full-hit-cap`.
   - Sources: vllm-apc-doc L22, vllm-src.
5. **Eviction.** `cache-pressure` on the grid.
   - Cached blocks show their LRU rank, and `Evict` events mark the evicted
     block.
   - The hit-rate meter falls. The capacity control shows hits recovering as
     blocks are added.
   - Prose: a cached block is evicted only when no unkeyed free block is left
     (AUDIT.md m13). Unkeyed blocks sit at the front of the free queue and keyed
     ones at the back (vllm-src `BlockPool.free_blocks`).
   - Claims: `pressure-lowers-hit-rate`, `evictions-happen`, `lru-evicts-head`,
     `evict-only-when-needed`, `more-blocks-more-hits`.
   - Sources: vllm-src `block_pool.py` L777–808 for the free order, and
     vllm-apc-doc L202–206 for LRU eviction (AUDIT.md M6).
6. **Another design: RadixAttention.** One paragraph, no figure and no benchmark
   numbers.
   - The tree matches token by token, so no partial-block loss. Leaves are
     evicted LRU, with reference counts, in one shared memory pool. The
     scheduler favors requests with the longest cached prefix, while ours is
     FCFS.
   - It is marked as our comparison. Sources: zheng2024 §3, vllm-apc-doc.
7. **Teaser: replicas.** The sentence from decision 1. Sources: bench-kvtt.
- **Misconception callout** (in step 5).
  - Caching cuts prefill only for repeated prefixes that are still cached.
  - Unique prompts get no hits, except a preempted request reusing its own
    blocks.
  - A decode step costs the same.
  - With caching on, more requests run per decode step, so p50 ITL rises
    slightly while p99 falls (decision 4).
  - Claims: `unique-no-hits`, `self-hit-after-preemption`,
    `decode-cost-unchanged`, `caching-raises-p50-itl`.
- **CheckYourself** (predict, then run): "Set the shared prefix to 100 tokens at
  block size 64. What fraction of each prefix is reused?"
  - Answer: 64 of 100 tokens, one full block. The partial block is recomputed.
  - It checks the full-block rule.
  - Claim: `checkyourself-100-at-64`.
- **What this leaves out:**
  - extra keys (LoRA, multimodal, salt) and sha256 (SIM.md §9.8)
  - no cache-aware scheduling, FCFS only (zheng2024 §3; SIM.md §9.10)
  - single replica (SIM.md §9.1)
  - KV offload to CPU or disk (SIM.md §9.13)
  - toy capacity and the cap of 8; vLLM's default `max_num_seqs` is 256 on GPUs
    under 70 GB
  - step time comes from a roofline, with step overhead 0 and llmsize's MBU of
    0.65 (SIM.md §9.2)
  - preemption recomputes; there is no CPU swap (SIM.md §9.9)
  - block 0 is not reserved as a null block (SIM.md §9.12)
  - the prefix cache's own bookkeeping cost, which is CPU time (SIM.md §9.2)
- **Go deeper:** vllm-apc-doc, vllm-src (`block_pool.py`, `kv_cache_utils.py`),
  zheng2024 §3, kwon2023 §4.4 (manual shared prefixes and copy-on-write), and
  bench-kvtt.

### Widget spec

**SharedBlocksGrid** is the chapter 2 `BlockGrid` plus three layers:

- **Block states:** shared blocks get the double outline and a "×n" badge.
  Cached blocks get the dotted fill and their LRU rank. All are from
  DESIGN.md.
- **Selecting a request** outlines its chain in `--highlight`, numbered by
  logical index. The table panel adds a key column, 6 hex digits.
- **Readouts** (`simulated`):
  - a hit-rate meter: tokens hit ÷ tokens queried, first admissions only
  - prefill tokens computed, and tokens saved
  - mean TTFT with caching on and with caching off, side by side. Both runs
    are always computed (a few ms), so this readout appears even outside
    compare mode.
  - evictions, and preemptions when nonzero
- **Controls:** each change regenerates the workload from the same seed and
  re-runs.
  - prefix caching: `Toggle`
  - shared prefix length: slider stops 0, 100, 250, 600, 1000, 1500
  - distinct prefixes: slider, 1–16
  - share fraction: slider, 0–1 in steps of 0.1
  - KV capacity: slider in blocks, with tokens shown
  - block size: 8, 16, 32, 64, 128
- **Compare mode:** caching on vs. off, same seed, lockstep by sim time, one
  `PlaybackBar`. Each side has its own readouts, and TTFT appears on both.
- **Size:** at most 256 cells on desktop and 48 on mobile; beyond that, the
  chapter 2 summary bar and window. Canvas renderer.

**Small figures:** `RepeatedPrefill` (SVG bars), `HashChain` (SVG, about 40
blocks), and `PartialBlocks` (SVG, 5 rows).

### Tests

**`tests/chapters/prefix-caching.test.ts`** (on the exact presets):

- **`caching-lowers-ttft-and-prefill`:** the prompt's test, on
  `shared-system-prompt`. Mean TTFT and total `PrefillChunk` tokens are both
  lower with caching on.
- **`longer-prefix-saves-more`** (the knob to predict; AUDIT.md M7): on
  `shared-system-prompt`, sweep the shared prefix over 0, 100, 250, 600, and
  1000 tokens. Hit tokens per sharing request rise strictly, and so does mean
  TTFT with caching off minus mean TTFT with caching on.
- **`partial-not-reused`:** the prompt's test. At every `CacheHit`, every hit
  block has `filled == B`, and hit tokens are a multiple of B. Checked on all
  presets and every block size.
- **`one-token-changes-chain`:** the prompt's test, on `blockKeys`. Changing
  token i leaves keys before block ⌊i/B⌋ unchanged and changes that block's key
  and every later one. Checked for every i in a 64-token prompt at B 4, 8,
  and 16.
- **`pressure-lowers-hit-rate`, `evictions-happen`:** the prompt's tests.
- **`unique-no-hits`:** the prompt's test.
  - Precondition: 0 preemptions in both runs.
  - Then the hit rate is 0, and per-request TTFTs are exactly equal (`===`)
    with caching on and off.
- **`repeated-prefill`:** with caching off, prefix tokens computed = 600 ×
  (sharing requests + preempted sharing requests): 54 + 9, 37,800 tokens.
  Request 9 is preempted and is in step 1's figure.
- **`full-blocks-only`:** every `CacheInsert` is for a full block.
- **`hit-walks-chain`:** each sharing request after the first hits
  ⌊600/B⌋·B tokens while the prefix stays cached.
- **`refcount-counts-sharers`:** a prefix block's reference count equals the
  running requests that use it.
- **`sharing-saves-memory`:** physical blocks in use (each shared block
  counted once) divided by running requests, averaged over sim time while at
  least one request runs, are lower with caching on. Each step's end state is
  weighted by how long playback shows it. Also: max running 8 vs 6, and the
  time-averaged queue is shorter.
- **`caching-raises-p50-itl`:** with caching on, p50 ITL is higher and p99 ITL
  is lower; mean requests per decode step are higher (the cause).
- **`shared-tokens-floor`, `full-hit-cap`, `checkyourself-100-at-64`.**
- **`lru-evicts-head`:** every `Evict` pops the block at the head of the free
  queue (rank 1).
- **`share-fraction-raises-hits`:** on `shared-system-prompt`, the hit rate rises
  strictly over share fractions 0.25, 0.5, 0.75, and 1.0.
- **`evict-only-when-needed`:** at every `Evict`, the free queue holds no
  unkeyed block. Unkeyed blocks always sit at the front, so popping one would
  come first.
- **`more-blocks-more-hits`:** on `cache-pressure`, the hit rate does not fall
  as capacity grows over 5 settings, and the largest beats the smallest.
- **`self-hit-after-preemption`:** a small config with unique prompts forces a
  preemption. The re-admission's `CacheHit` has tokens > 0.
- **`decode-cost-unchanged`:** cost(step) for the same q and c is identical
  whether c came from a hit or from computed tokens.
- **Meta-test:** claim ids match test ids.

**`e2e/prefix-caching.spec.ts`** (Playwright):
- Screenshots at 375, 768, and 1440 px, light and dark, paused at t = 10 s.
- **SharedBlocksGrid:**
  - The caching toggle changes the hit rate from 0% to above 0.
  - The capacity slider changes the evictions.
  - Selecting a request shows its chain in the table.
- **HashChain:** the change toggle changes the key text of the changed block and
  every later block, and leaves earlier ones alone.
- **PartialBlocks:** the block-size highlight moves.
- CLS 0, no console errors, axe passes.
- **Performance:** Event Timing on control changes, which regenerate and re-run
  two sims; rAF during compare playback at B 8.

**Capture, review, and route:**
- **Capture:** 8 s of caching off vs. on at 2×.
- **Fresh-eyes review:** done by a sub-agent.
- **Route:** `/prefix-caching/`, with the title "Prefix caching".

**Glossary terms added:**
- prefix, system prompt, prefix caching
- block key (hash), parent key
- cache hit, hit rate
- reference count, eviction, LRU
- radix tree, replica

### DoD checklist (docs/CHAPTER_DOD.md)

Copied from docs/CHAPTER_DOD.md for chapter 4. Each item is ticked with how it
was verified.

**Content**
- [x] 1. Objective first, checked last: PRODUCT.md's objective opens the
  chapter. CheckYourself asks "how many, and why"; the answer needs the
  full-block rule.
- [x] 2. Sources: every technical sentence has a `SourceLink` or says "our
  reasoning"; the review checked line ranges at cfd54ca8 and 56b5ab5d.
  Free order cites vllm-src (M6); the RadixAttention contrast is marked as
  ours (note 4).
- [x] 3. Provenance: every sim number renders through `<Num>` from
  `figures.tsx` (`F`), with a badge in each sentence.
- [x] 4. Claims tested: 22 claims, one test each, plus the meta-test.
- [x] 5. Writing rules: `writing.test.ts` passes; terms defined at first use;
  ten steps, one idea each.
- [x] 6. End sections: 12 "leaves out" lines, each with a source or SIM.md
  §9 entry; "Go deeper" links SOURCES.md ids only.

**Widgets**
- [x] 7. Keyboard and touch: e2e Tabs to Step, the caching switch (Space),
  sliders (arrows, Home), selects, the grid cursor (arrows, Home, Enter),
  and the hash chain's switch, with focus rings. Controls and grid cells are
  at least 44 × 44 px at 375 and 768 (three browsers).
- [x] 8. Labels: visible labels on every control; readouts, the lookup line,
  and counters are polite live regions (readouts off while playing).
- [x] 9. Playback: Figures 4.3, 4.5, and 4.6 have a PlaybackBar; frames are
  rebuilt from the event log and checked against the engine's snapshot at
  every step (`tests/viz/cacheFrames.test.ts`, six configs).
- [x] 10. Reduced motion: Play disabled; Step moves to the next step end.
- [x] 11. Sizes, themes, browsers: no horizontal scroll or clipped SVG text
  at 375, 768, and 1440 in three browsers; screenshots light and dark.
- [x] 12. No layout shift: CLS 0 in the interaction test.
- [x] 13. No console or page errors (interaction tests, every prefix stop).
- [x] 14. axe: no violations at 768 light and dark, and 1440 light.

**Performance** (Chromium, traces saved under test-results)
- [x] 15. Controls (Step, caching, capacity, block size): Event Timing max
  24 ms, p95 24 at 1×; max 32, p95 24 at 4×.
- [x] 16. Figure 4.6 at block size 8 (1,024 blocks), 4× speed: frames
  p50/p95/max 16.7/16.7/16.8 ms at 1× and 16.7/16.7/33.3 ms at 4× CPU.
  Snapshot-built frames cost 41–85 ms per run; frames rebuilt from the
  event log cost 10–20 ms.

**Tests and review**
- [x] 17. Screenshots: Chromium at 375, 768, and 1440, light and dark,
  paused at t = 10 s, with the page pinned to a whole pixel.
- [x] 18. Interaction: 17 Playwright tests × 3 browsers, 51 pass.
- [x] 19. `pnpm test`, `pnpm typecheck`, `pnpm lint`, `pnpm build`.
- [x] 20. Fresh-eyes review by a sub-agent: 32 points, answered below.

**Launch assets**
- [x] 21. Capture: `pnpm capture prefix-caching`: caching off vs. on at 2×,
  8.13 s, mp4 514 KB (1200 × 1868), GIF 0.90 MB.
- [x] 22. Route HTML: title "Prefix caching – serving-explained",
  description, canonical, og and twitter tags, and og/prefix-caching.png at
  1200 × 630 (postbuild; live smoke test after deploy).

### Build log

**STOP 1 (2026-10-15): two planned claims fail on the exact presets.**
tests/chapters/prefix-caching.test.ts has one test per planned claim (21).
19 pass. These fail, and no prose is written:

- `repeated-prefill`: with caching off, the prefix is computed 37,800 times,
  not 54 × 600 = 32,400. The caching-off run preempts 10 times; 9 victims
  share the prefix and compute it again (9 × 600 = 5,400). Request 9, in step
  1's figure, is one of them.
- `sharing-saves-memory`: the peak of blocks per running request is 59.0 in
  both runs. A request that runs alone holds its whole chain either way. Over
  time the claim holds: 24.1 blocks per running request with caching on
  against 46.6 off. Caching on also peaks at 8 running against 6, and its
  time-averaged queue is 2.3 against 12.8.

Also found (decision 4): with caching on, p50 ITL is 40.4 ms against 39.7 ms
off (+1.8%), as decision 4 expected. p99 ITL falls, 124 ms against 441 ms,
because the off run's longer prefills and preemptions stall decodes.

**The author's answers (2026-10-15).**

1. `repeated-prefill`: the claim states both parts, 54 requests plus 9
   preempted ones computing the prefix again. The test asserts the identity
   and the exact values. Step 1's figure labels request 9's second prefill as
   a recompute.
2. `sharing-saves-memory`: the peak becomes the time average defined above,
   plus max running and mean queue. The prose defines the metric in one
   sentence.
3. `caching-raises-p50-itl`: added. The test asserts direction, not
   magnitude, plus the cause. The prose says "slightly" and shows the bound
   numbers.
4. Order: chapter 3 lands first (v0.6-ch3); then this branch is rebased onto
   it, and the prose is written.

All 22 claims pass (`pnpm test`; the meta-test waits for the MDX). Numbers
moved with the exact definition. STOP 1 weighted each step's end state by
that step's own duration; playback shows a state until the next step ends.
Blocks per running request are now 24.0 vs 46.9 (was 24.1 vs 46.6). The queue
is 2.4 vs 13.2 (was 2.3 vs 12.8). p50 ITL 40.4 vs 39.7 ms, p99 124 vs 441 ms.
Requests per decode step are 6.0 vs 4.5.

### Fresh-eyes review: findings and answers

1. Major. Figure 4.5 crashed the page at the 1,500-token prefix stop.
   Fixed: per-figure stops (author, 2026-10-15) and
   `tests/viz/cacheControls.test.ts`, which runs every stop of every control.
2. Major. Figure 4.5's prefix slider started off its stops. Fixed: its stops
   are 0, 128, 256, 512, and 640 (768 would clip prompts); e2e walks them.
3. Major. 1,500 clipped every body and broke the knob claim. The author
   dropped the stop; the claim test sweeps the control's own stops.
4. Major. "Saved" and "Prefill computed" were unclear. Fixed: "Tokens
   computed" and "Tokens reused", with a note on what each counts.
5. Major. System prompts cited the wrong doc. Fixed: zheng2024 §3; chat
   history dropped from the prose.
6. Fixed: the lookup cites doc L143 and vllm-src
   single_type_kv_cache_manager.py L797–805.
7. Fixed: the decode sentence is our reasoning, scoped to vLLM's defaults
   (cascade attention off, config/model.py L284–290); a leaves-out line.
8. Fixed: the self-hit exception cites vllm-src.
9. Fixed: "with caching off it computes its tokens again".
10. Fixed by wording: the comparison names Figure 4.3's longer prompt and
    bigger pool. The test is unchanged.
11. Fixed: "Our reading:".
12. Fixed: step 3 split in three; the misconception has its own step.
13. Fixed: Figure 4.6 is introduced in the misconception's step.
14. Fixed: TTFT, ITL, p50/p99, block table, max_num_seqs wrapped; free
    queue and admission added to the glossary; LoRA and salt reworded;
    "preset" and kv-transfer-tax replaced or introduced.
15. Fixed: badges in every sentence; r9, the run's size, and the caption's
    prompt count come from F.
16. Fixed: "between GPUs on one machine".
17. Fixed: synthetic tokens, cascade attention, and async scheduling added;
    the pool line links §9.14.
18. Fixed: unkeyed blocks go first; LRU orders the cached ones.
19. Fixed: the legend says recomputes include outputs.
20. Fixed: the sweep values are named, and "average hit".
21. Fixed. 22. Fixed: "in a full block". 23. Fixed: L2866–2895; the author's
    wording "under 70 GB" stays.
24. Fixed: "by load or in turn, never by prefix" (author, 2026-10-15).
25. Fixed: "Our name for vLLM's block hash". 26. Fixed. 27. Fixed.
28. Fixed: captions say "at its starting settings".
29. Answer: each figure's legend defines its dashed outline.
30. Fixed: "×n" moves up when a chain number is drawn.
31. Fixed: cached blocks are half height in the summary strip.
32. Answer: the site cites vLLM paths without the `vllm/` prefix.

### Deviations from the plan (reported)

- The prefix stops: 1,500 dropped (the author's answer); Figure 4.5 has its
  own stops.
- The replica sentence reads "by load or in turn" (the author's answer) and
  is split in two for the 25-word rule.
- A request's lookup is a "latest lookup" line, not animated block by block:
  a step lasts about 40 ms of sim time.
- The 48-cell window applies below 1024 px, as the plan's "48 on mobile"
  says; chapter 2 windows only below 480 px.
- Figure 4.6 (compare mode) shows in the last three steps.
- Ten steps instead of seven (splits after the review).
- BlockGrid gained optional props; chapter 2 is unchanged (its baselines
  pass).

### Landing (2026-10-15)

- Rebased onto v0.6-ch3. Baselines run 38840114869 (the other 24 Linux
  files, chapter 2's included, were byte-identical); branch CI green on
  9d73c95.
- main fast-forwarded to 9d73c95; CI and deploy run 38841634233 succeeded.
- Live: smoke plus all four chapter specs, 243 tests in three browsers,
  pass. og/prefix-caching.png returns 200.


## Prompt 7: sandbox (PLAN, approved 2026-10-02)

- [x] SIM.md §12 (approved 2026-10-02): input limits, capacity derived from GPU memory, the
      share-link format v1, and `ConfigError` codes plus `ENGINE_VERSION` in
      §2.
- [ ] The sandbox (Build 5).

### Depends on

- the engine (Prompt 2)
- the chapter widgets: `MemoryBudget` (chapter 1), `BlockGrid` (chapters 2 and 4),
  `RequestTimeline` (chapter 3)
- the Prompt 1 shell
- The 3 example share links need the live site (Prompt 1 step 9).

### Decisions for the author (all decided 2026-10-02: accepted as recommended)

1. **KV capacity: from GPU memory, or the preset's toy pool.**
   - The generic presets (chatbot, rag, batch-summarize, agent-loop) derive
     capacity from GPU memory (SIM.md §12.1). That answers Q6 for them. The CLI
     does the same, so CLI and sandbox give the same hash for the same preset.
   - Chapter presets keep their documented toy pools, so the sandbox reproduces
     the chapters exactly.
   - A "KV capacity: from GPU memory / fixed blocks" control switches between
     the two.
   - **Decided: accepted.** It is also the answer to SIM.md Q6.
2. **More than 8 running requests** (the sandbox allows `max_num_seqs` up to
   1,024; vLLM's default is 256 on GPUs under 70 GB and 1,024 on larger ones
   that are not A100s; AUDIT.md M5). DESIGN.md's 8-hue limit still holds:
   - **Block grid:** above 8 running requests it colors by state (used, shared,
     cached, free, waste), not by request. The selected request is outlined.
   - **Timeline:** it draws slots 1–8, labeled "showing 8 of N slots". The
     charts and summary cover every request.
   - **Decided: accepted.**
3. **The worker does the heavy work.** It runs the sim, `metrics`, histograms,
   timeline segments, and grid frames, using the same pure functions the
   chapters run on the main thread. The main thread receives compact derived
   batches (typed arrays, transferred, not copied) and frames on request.
   - It never holds the raw log, which reaches about 1.3 million events at
     5,000 requests.
   - Cancel is `worker.terminate()`, which always works, and the next run gets a
     fresh worker.
   - **Decided: accepted.**
4. **Links carry a short log hash** (`h`, `hb`), so opening a link proves the run
   reproduced, or says it did not (SIM.md §12.2).
   - **Links are self-contained.** They encode every key that differs from the
     frozen `V1_DEFAULTS`, not from a preset. Presets will be retuned, and a
     preset-relative link would silently change meaning.
   - **Decided: accepted.**
5. **No zod in the browser.** It would be a runtime dependency. One parameter
   table (key, type, range, default) drives parsing, clamping, encoding, the
   notices, and the SIM.md table test.
   - **Decided: accepted.**
6. **Model slugs** (`llama-3.1-8b`) are added to models.json by gen-data, so
   links stay short and stable.
   - **Decided: accepted.**
7. **The sandbox's claims are its preset descriptions** (PRODUCT.md). Each
   preset's one-line description is a `<Claim>` with a test. They are written
   after the engine runs, from what it actually shows.
   - A description that says prefix caching saves nothing keeps the exception
     for a preempted request reusing its own blocks (AUDIT.md M8).
   - **Decided: accepted.**
8. **Memory risk at 5,000 requests.** If the worker's event log is too heavy, the
   fix would be an engine option to skip per-token events. That changes the
   frozen sim API, so I would stop and ask.
   - **Decided: accepted.**
9. **Event batches.** The prompt says the UI receives snapshots and event
   batches.
   - Derived data (segments, series, and frames) covers the views.
   - Raw events arrive on request, for a window: `events {t0, t1}` returns them
     as typed-array columns, capped at 50,000.
   - They feed an "Events at the playhead" list, like the CLI's event dump.
   - The full log stays in the worker.
   - **Decided: accepted.**

### Architecture

- **`src/viz/sandbox/sim.worker.ts`:** a Vite module worker
  (`new Worker(new URL(…, import.meta.url), { type: 'module' })`).
- **main → worker:** `run {config}` and `frame {t}`.
- **main → worker** also sends `events {t0, t1}`, the raw-event window from
  decision 9.
- **worker → main:**
  - `progress {simTime, finished, total}`, about every 50 ms
  - `events {columns}` (typed arrays, transferred)
  - `batch` (segments and per-step series, as typed arrays)
  - `frame {t, owner, fill, state}`, transferred
  - `done {metrics, histograms, hash, engineVersion}`
  - `error {code, message}`
- **Scrubbing:** the worker keeps keyframes within a 32 MB budget and replays
  events from the nearest one.
- **Runs over 300 ms** show a progress bar and a Cancel button. That covers the
  prompt's "longer than 2 seconds" with room to spare. The views fill in as
  batches arrive.
- **Inputs** are debounced by 150 ms. A new run terminates the old worker.
- **The 16 ms rule** is checked in Playwright with rAF intervals (max ≤ 34 ms,
  meaning no missed frame) and Event Timing input delay (max ≤ 16 ms). The
  Long Tasks API only reports tasks of 50 ms or more, so it cannot check 16 ms.
  - **Scope:** from the first render until the page closes, during runs, control
    changes, scrubbing, and A/B updates. Loading the page's JS chunk is
    excluded, and the report gives that time separately.
  - The views apply batches at most once per animation frame. A batch over a
    4 ms budget is split.

### Controls

Controls sit in native `<details>` groups: a left column on desktop, stacked
above the views on mobile. Each control has a visible label, its default
("default 16"), a reset button ("Reset block size to 16"), and, where a chapter
covers it, a "What is this?" link to the chapter's anchor.

- **Hardware and model:**
  - GPU, model, and KV dtype → chapter 1
  - GPU memory fraction
  - KV capacity mode
- **Memory:**
  - allocator and block size → chapter 2
  - prefix caching → chapter 4
- **Scheduler:** static or continuous, `max_num_seqs`, `max_num_batched_tokens`,
  and chunked prefill → chapter 3.
- **Workload:**
  - preset: the 4 generic presets plus `paged-vs-contiguous`, `batching-basics`,
    `long-prompt-stall`, `shared-system-prompt`, and `cache-pressure`
  - arrival rate → chapter 3
  - prompt and output length distributions: kind plus parameters. A mixture is
    edited as up to 4 rows.
  - shared prefix (k, L, p) → chapter 4
  - number of requests
  - seed, with a re-roll button. Re-roll uses `crypto.getRandomValues` in the
    UI, never in `src/sim`.

### Views

- **MemoryBudget** (chapter 1) shows the static split: weights, KV pool, and
  held-back memory. It adds "KV in use now" from the sim at the playhead.
- **BlockGrid** (Canvas, window plus summary bar) and **RequestTimeline**, as in
  the chapters, with the aggregate modes from decision 2.
- **Summary panel** (`simulated`):
  - throughput
  - TTFT and ITL, p50 and p99
  - KV utilization, mean and peak
  - waste, mean %
  - hit rate and preemptions
- **A/B mode:**
  - A and B config tabs, with "Copy A to B"
  - two workers, one `PlaybackBar` in lockstep by sim time
  - Views sit side by side on desktop and stacked on mobile.
  - **Diff table:** metric, A, B, Δ, and Δ%, with ▲ or ▼ in ink only, since
    whether a change is better depends on the metric. |Δ%| < 1% reads "same";
    identical runs read "identical (same log hash)".
- **Share:**
  - "Copy link" uses `navigator.clipboard`, falling back to a selected text
    field.
  - "Download JSON" (Blob plus `a[download]`) holds:
    - config and metrics
    - hashes and `ENGINE_VERSION`
    - the data `_provenance`
    - `"provenance": "simulated"`

### Tests

**vitest:**
- **`sandbox/url.test.ts`:**
  - Every preset round-trips: encode, decode, re-run, and get a log hash equal
    to the direct run's.
  - fast-check over random valid configs (up to 50 requests) gives an equal
    config and an equal hash.
  - Fuzz: random strings, huge values, unicode, and injection-looking text
    never throw. The result is always valid and within range, and the notices
    name what was dropped.
  - The SIM.md §12.1 table matches the code's limits.
- **`sandbox/guardrails.test.ts`:**
  - Llama-3.1-70B on a10g-24 gives the weights message, with computed numbers
    and the llmsize link.
  - A pool too small for `ml` gives the KV message.
- **`sandbox/worker.test.ts`:** calls the worker's handler directly. It checks
  the message order, frame-at-t equal to the engine's snapshot, and `done`
  carrying the right hash.
- **`tests/chapters/sandbox.test.ts`:** one test per preset description claim,
  plus the claims meta-test.

**Playwright, `e2e/sandbox.spec.ts`:**
- **Screenshots:** 375, 768, and 1440 px, light and dark, default and A/B.
- **Share link:** "Copy link", then open it in a new page. It shows "reproduced
  exactly" with the same hash.
- **Download:** the JSON parses and holds the config, metrics, and hash.
- **Invalid URLs:** 25 fuzzed query strings. Each renders with defaults and a
  notice, with no console errors.
- **Worker:** start a 5,000-request run and cancel within 1 s. The UI is idle
  within 100 ms, and no progress messages arrive after that.
- **5,000-request run:** a second run completes. Arrow keys hit a slider every
  100 ms while it runs. Pass: max input delay ≤ 16 ms and max rAF interval
  ≤ 34 ms. Also reported with 4× throttling.
- **A/B:** changing B's scheduler updates the diff table.
- **Events list:** scrubbing changes the events listed at the playhead.
- **Self-contained links:** a link made before a preset's definition changes
  (simulated in the test by patching the preset) still decodes to the same
  config and hash.
- CLS 0, no console errors, and axe passes.
- **Every chapter test still passes** (CI runs all of them).

### DoD items that apply (docs/CHAPTER_DOD.md)

- **Applies:**
  - 2 sources (control help text)
  - 3 provenance
  - 4 claims (the preset descriptions)
  - 5 writing rules
  - 7–20
  - 22 route HTML
- **Does not apply:**
  - 1 (no chapter objective; PRODUCT.md gives the sandbox's objective instead)
  - 6 (no end sections)
  - 21 (no launch capture)
- **Report:** three share links, made once the site is live:
  1. chatbot, static vs. continuous
  2. `long-prompt-stall`, chunked prefill off vs. on
  3. Qwen3-32B on h100-sxm-80 with KV capacity from GPU memory, bf16 vs. fp8 KV

### Build log

- [x] Step 1 (262f26e): the parameter table drives parsing, clamping,
  encoding, and notices; url.test checks it against SIM.md §12.1.
- [x] Step 2 (821fa92): the worker, its message protocol, cancel by
  `terminate()`, and frames rebuilt by replaying events from keyframes.
- [x] Steps 3 and 4 (de6fc79, 62c493f, ed9f711): controls, views, the A/B
  diff, share links with hash checks, and the nine preset claims.
- [x] Fresh-eyes review fixes (below), with new unit and e2e tests.
- [x] Big pools: BlockGrid's summary strip drew one SVG rect per block
  (378,492 on Qwen2.5-7B, M4 Max, fp8, block size 8, gf 0.99). Playback ran
  at 150 ms per frame. Over 2,000 blocks it now draws runs, then bins
  (`tests/viz/summaryStrip.test.ts`); playback holds 16.7 ms. Chapter pools
  are under 2,000 blocks, so their figures are unchanged.

### Fresh-eyes review: findings and answers

Major:
1. Fixed: an A/B link whose B is all defaults now carries `b.s`; url.test
   covers B = V1_DEFAULTS.
2. Fixed: the hash check applies only while the settings match the opened
   link; after an edit the banner says the hashes no longer apply (e2e).
3. Fixed: the preset select shows "(custom)" and no description unless the
   settings equal the preset's (`matchesPreset`, e2e).
4. Fixed: rag says "each with a 60% chance"; the test asserts the fraction.
5. Fixed: the grid draws by state when any holder is in slot 9 or above;
   worker.test checks 80 frames and that the case occurs.
6. Fixed: number fields keep a draft; values apply only in range, and clamp
   on blur or Enter (e2e types 8192, then 10 → 64).
7. Fixed: a null config halts the worker, and keyed state hides old results.
8. Fixed: simulated badges on the status, progress, grid, lanes, charts,
   events, and summary; computed on the KV pool and max context.

Minor:
9. Fixed: the "Cannot run" prefix, computed badge, and llmsize link show only
   for guardrails, and the llmsize sentence only for GPU-derived pools.
10. Fixed: run state is keyed by config, so stale results never show.
11. Fixed: agent-loop split; writing.test now checks the descriptions.
12. Fixed: "at least max_model_len: here max(bt, ml)", citing arg_utils.py
    L3079–3087.
13. Fixed: the bt help names 8,192 and 16,384 and says the sandbox keeps
    2,048; the cap help links llmsize and SIM.md §9.14.
14. Fixed: SIM.md §7 and §12.1 links on arrivals, the shared prefix,
    prefix caching, and max_model_len; max context carries a computed badge.
15. Fixed: "Prompt length after the shared prefix".
16. Fixed: defaults in words ("lognormal, median 200, σ 0.8, 16–2,048").
17. Fixed: group rows use aria-labelledby; sub-fields are named in full.
18. Fixed: share metrics change in "pp"; summary.test covers the rules.
19. Fixed: a legend with swatches and separate badges; memory outside the
    budget is a flat tint, not the waste hatch.
20. Fixed: the lede separates simulated and computed numbers and links §9.
21. Fixed: "Whole run" and "at the playhead" captions; "Events in the 0.25 s
    before the playhead", with "The latest 120 of N".
22. Fixed: summary labels link the glossary; "KV wasted" added to it.
23. Fixed: per-field clip and σ notices, "and N more", duplicate keys, `hb`
    without B, and `b.zz` no longer turning A/B on.
24. Fixed: the switch is disabled under contiguous-max.
25. Fixed: a cancelled or failed run says it was not checked.
26. Fixed: memoized cells, summary, and placeholders; the summary strip
    fix above was the main cost.
27. Fixed: control groups start closed below 1,024 px.
28. Fixed: Step moves to the next step end of either run.
29. Fixed: tests assert model and GPU, each preset's prefix groups and
    fraction, and paged-vs-contiguous's mean running too.

Nits: 31–36 and 38 fixed. 30: "70 GB" is the author's wording, and
L2866–2895 covers all three branches. 37: preset slugs match the CLI and
the chapters, so they stay.

### Deviations from the plan (reported)

- A custom memory bar replaces chapter 1's `MemoryBudget`.
- Worker batches merge per animation frame; the 4 ms split rule was not
  needed (5,000 requests: max input delay 2.7 ms at 1×).
- A/B runs sit side by side from 1,280 px, not 1,024 px.
- The preset select sits at the top of the controls, not in Workload.
- The events list shows the 0.25 s before the playhead, latest 120 rows.
- The self-contained-link test runs in vitest, not Playwright.
- Links escape only `%&=#+` and whitespace, so they stay readable.
- BlockGrid (chapter 2) gained run and bin drawing above 2,000 blocks.

### Landing (2026-10-15)

- Baselines run 38849111030: 12 new sandbox Linux files; the other 30,
  chapter 2's included, came back byte-identical. Branch CI green on
  10403da (run 38849362725).
- main fast-forwarded to 10403da; CI and deploy run 38850817535 succeeded.
- Live: smoke, all four chapter specs, and the sandbox spec, 322 tests in
  three browsers, pass.
- Live share links, each "reproduced exactly" for A and B in all three
  browsers, with no notices:
  1. chatbot, static vs. continuous: h 127aeadc, hb 0d8d398f.
  2. long-prompt-stall, chunked prefill off vs. on: h 013597eb, hb 1fc5d416.
  3. Qwen3-32B on h100-sxm-80, bf16 vs. fp8 KV: h 11f6c736, hb 11615908.
- Perf (Chromium, local): 5,000 requests at 1×, max input delay 2.7 ms and
  max frame 16.8 ms; 4×, 8.1 ms and 49.9 ms (reported). A/B, 5 s playback:
  309 frames, max 16.8 ms; a control change: max 16.8 ms.

## Prompt 8: launch audit

- [x] Audit 1, before the build: `docs/AUDIT.md`. Most of the audit needs a
      running site, so those items are marked "not run" with the reason (B1).
      What it checks now:
      - planned claims against their sources (a sub-agent pass, §1)
      - 48 external links
      - every design-token contrast pair, and color-blind separation
      - the measured callout's numbers, recomputed from the raw files
      - the author claims
- [x] §1 filled from the sub-agent's report: 0 blockers, 6 majors, 17 minors.
      M9 (llmsize's A10G TFLOPS) needs the author. STOP for approval.
- [x] 2026-10-02: the author decided B2 and M9. The doc fixes for M1–M8 and
      m1–m19 are applied (AUDIT.md, "Resolution log"). B1 stays open until the
      build. m2 is a build task.
- [ ] After the build (Build 6), run the whole audit again and record before
      and after numbers.

## Prompt 9: launch kit (PLAN; decisions 1, 3, 4, and 7 approved 2026-10-02)

Drafts only. I post nothing, publish nothing, message no one, and change no
GitHub settings. CLAUDE.md says the same. (Enabling Pages belongs to Prompt 1
step 8, which the author approved.)

### Depends on

- **The site, built and live** (AUDIT.md B1). Media, previews, and the live link
  all come from the final build.
- **The URL:** decided. The repo is `varad-more/serving-explained`, and every
  link in every draft uses `https://varadmore.me/serving-explained/`.
- **The license:** decided (decision 1).
- **Current community rules:** checked on 2026-10-01 (decision 5). Check them
  again before posting.

### Decisions for the author (decided 2026-10-02, except decision 2)

1. **License.** Apache-2.0 for code, which matches llmsize: its `LICENSE` and
   both `package.json` files say Apache-2.0.
   - For the chapter text, figures, and media, I suggest CC BY 4.0. Others could
     then reuse the explanations with credit, which code licenses do not cover
     well.
   - The alternative is Apache-2.0 for everything: one license, simpler.
   - **Decided: Apache-2.0 for code, and CC BY 4.0 for text and media.** Both
     files are added in Build 1, because the repo is already public.
2. **Hero GIF.** I will record both candidates, the paged-vs-contiguous grid and
   the static-vs-continuous timeline, at the same length and size.
   - A fresh-eyes sub-agent sees each as a frame strip with no caption and
     says what it shows.
   - The one it reads correctly and faster is my recommendation. You see both.
   - **Still open, by design:** you pick after seeing both clips, once the site
     is built (Build 7).
3. **Add CHANGELOG.md.** The checklist credits people who report errors "in the
   changelog", and there is none yet. I propose Keep a Changelog format, where a
   "Fixed" entry reads "… (reported by @handle)".
   - **Decided: yes.**
4. **Previews from the real site.** Prompt 1 planned template-only preview images.
   This prompt wants them generated from the real site, so `gen-og` changes:
   - A route `/og-cards/` exists only when `VITE_OG=1`, like the kitchen sink.
     It renders each route's card: title, one line, and the route's main widget
     at a fixed playhead, in the DESIGN.md style.
   - Playwright screenshots each card at 1200×630 into `public/og/<slug>.png`,
     and the repo preview at 1280×640 into `docs/launch/social-preview.png`.
     GitHub's limit for the preview is 1 MB.
   - **Decided: yes,** previews are generated from the real site.
5. **Community rules, checked 2026-10-01 by a sub-agent.** Reddit blocked live
   requests, so the Reddit rules come from Wayback copies of old.reddit, dated
   2026-07 and 2026-08. Each file records its rules with URLs and dates.
   - **Show HN:** something people can try, so the link goes to the live site,
     not the README. No signup.
     - The title begins "Show HN:". No uppercase, exclamation points, or praise,
       no site name, and no gratuitous numbers.
     - The 80-character limit is reported by users (item 29094764), not written
       in the guidelines. The test still enforces it.
     - Do not ask for upvotes or comments.
   - **r/LocalLLaMA:** posts must be about LLMs.
     - Self-promotion stays under 10% of your activity, and affiliation must be
       disclosed.
     - Flairs: Discussion, Tutorial | Guide, Resources, and others. Whether a
       flair is required could not be verified.
   - **r/MachineLearning:**
     - Project posts carry "[P]" by convention; a written requirement could not
       be verified.
     - No promotion of paid products, and a strict spam policy.
     - A monthly "[D] Self-Promotion Thread" exists. The mods may redirect a
       project post there.
     - So: a main-post draft, plus a short version for the thread.
   - **X:** 280 characters, and every URL counts as 23 (docs.x.com). That a link
     reduces reach is reported, not measured.
   - **LinkedIn:** 3,000 characters (LinkedIn help a528176). The "see more"
     cutoff is not documented; guides say about 140 characters on mobile. The
     hook goes in the first 140.
   - No decision needed. The drafts and fact sheets follow these rules.
6. **What you apply yourself:** making the repo public, the rename, the settings
   in `repo-settings.md`, and every post.
   - **Updated 2026-10-02:** the repo is public and renamed. The settings and
     every post remain yours.
7. **Hacker News and r/LocalLLaMA ban LLM-written text, so I write notes there,
   not drafts.** Rules checked 2026-10-01:
   - HN guidelines say "Please don't put generated text in HN posts."
   - dang's Show HN tips (item 22336638, edited 2026-03-28) say "Write your text
     by hand. Don't use an LLM to generate any of it (not even a tiny bit,
     including to edit or spruce it up)."
   - r/LocalLLaMA rule 3 says "Completely/primarily LLM generated copy, code is
     not allowed."
   - So `show-hn.md` and `reddit-localllama.md` become fact sheets: the rules,
     the title constraints, the facts with links, and a suggested structure. You
     write the words. I check your text against the facts and the rules if you
     want.
   - r/MachineLearning, X, and LinkedIn state no such rule, so those stay full
     drafts. Your call if you want the same approach everywhere.
   - **Decided: fact sheets for HN and r/LocalLLaMA, and full drafts for
     r/MachineLearning, X, and LinkedIn.**

### Media

All captures are recorded from the production build (`vite preview`) by
`scripts/capture.ts`, which DoD item 21 already plans.

- **Viewport:** 600 CSS px wide at `deviceScaleFactor` 2, light theme. The
  widget lays out as it would at 600 px, so its text stays at real size, and a
  GIF scaled to 600 px wide stays readable.
- **Loop:** each script ends in its start state. Where it cannot (sim playback
  fills the grid), the last 0.4 s cross-fades to the first frame (ffmpeg
  `xfade`).
- **Encodes:**
  - MP4: H.264, CRF 28, `yuv420p`, `+faststart`, no audio
  - GIF: 12 fps, 600 px wide, a palette per clip (`palettegen stats_mode=diff`,
    `paletteuse dither=bayer`)
- **Size limits:** the script fails if a chapter GIF is 3 MB or more, the hero
  is 5 MB or more, or a clip is outside 6–10 s.
- **Clips:**
  - `kv-cache`: the memory budget. Context 1K → 32K, then fp8, then
    concurrency past the limit, then back.
  - `paged-attention`: contiguous vs. paged at 2×.
  - `continuous-batching`: static vs. continuous at 2×.
  - `prefix-caching`: caching off vs. on at 2×.
  - `hero`: decision 2.
- **Previews:** 7 route cards at 1200×630 (/, the four chapters, sandbox,
  glossary) and the 1280×640 repo preview (decision 4).

### Files to write (Build 7)

- **`README.md`,** in the prompt's order, at most about 120 lines. The only
  badges are CI and license.
  - **Pitch:** "Interactive explainers of how LLM servers manage GPU memory and
    schedule requests, run on a small simulated engine in your browser."
  - The hero GIF, then the live link.
  - **Chapters,** one line each, with what the reader will be able to explain:
    - KV cache: why it, not the weights, caps concurrency
    - Paged attention: how blocks cut waste to one partial block per request
    - Continuous batching: why scheduling trades TTFT, ITL, and throughput
    - Prefix caching: when shared prefixes hit, and why eviction lowers hits
    - Sandbox: one line
  - **"Why you can trust it":**
    - every claim cites docs/SOURCES.md
    - every number is badged simulated, computed, or measured
    - tests in `tests/chapters/` check the prose against the engine
    - docs/SIM.md lists every simplification
  - **How it works,** in 3 sentences, and how to run it: `pnpm install`,
    `pnpm dev`, `pnpm test`, `pnpm sim --preset chatbot`.
  - **"Found a mistake?"** links the technical-error issue form.
  - **Credits:**
    - papers: kwon2023, yu2022, agrawal2023, agrawal2024, zheng2024,
      ainslie2023
    - vLLM docs and source
    - llmsize
    - inference-engine-benchmark-system and kv-transfer-tax
  - **License:** Apache-2.0 for code, CC BY 4.0 for text and media.
- **`LICENSE`** (Apache-2.0) and **`LICENSE-CONTENT`** (CC BY 4.0, listing the
  paths it covers) already exist from Build 1. The README links both.
- **`CONTRIBUTING.md`:**
  - how to propose a chapter (the chapter-idea form, then a plan in the
    CHAPTER_DOD format)
  - the truth rules, quoted from CLAUDE.md
  - how to run the tests: `pnpm test`, `typecheck`, `lint`, `build`, `e2e`
  - how to add a source to SOURCES.md
- **`CHANGELOG.md`** (decision 3).
- **`.github/ISSUE_TEMPLATE/`,** as GitHub issue forms:
  - `technical-error.yml`: required fields for the claim (quoted), the location
    (page and section), and a source (a link plus section). Optional: what you
    think is correct.
  - `bug-report.yml`: page, browser and OS, steps, expected vs. actual, and a
    share link if it happened in the sandbox.
  - `chapter-idea.yml`: the mechanism, who it helps, the primary sources, and
    which engine change it needs.
  - `config.yml`: blank issues off.
- **`docs/launch/repo-settings.md`:**
  - description: under 350 characters, from the pitch
  - topics: llm, llm-inference, llm-serving, vllm, kv-cache, paged-attention,
    continuous-batching, prefix-caching, explainer, interactive, simulation,
    education, typescript, react
  - website: the live URL
  - social preview: `docs/launch/social-preview.png`
  - what to click, step by step, for you to apply
- **`docs/launch/show-hn.md`,** a fact sheet, not a draft (decision 7). You
  write the words.
  - the rules, with URLs and dates, and the title constraints: under 80
    characters including "Show HN: ", and no uppercase, exclamation points, or
    praise
  - **Facts for the first comment,** each with its link:
    - who made it: name, the vllm-metal PRs #549 and #550, the two benchmark
      repos, all stated without adjectives per PRODUCT.md
    - why it exists
    - how the sim works: a deterministic TS engine modeled on vLLM V1's
      scheduler and block manager, a roofline step cost using llmsize's
      constants, and widgets driven by its event log
    - what it leaves out: the top items from SIM.md §9, with a link to the full
      list
  - a suggested structure
- **`docs/launch/reddit-localllama.md`,** a fact sheet like `show-hn.md`
  (decision 7). Suggested angle: practical, leading with "why my 8B model fits
  only N requests on a 24 GB card".
- **`docs/launch/reddit-machinelearning.md`,** a full draft: method-first, with
  what is modeled, what is simplified, and the sources. It has a main post plus
  a short version for the monthly self-promotion thread (decision 5).
- Each of the three lists the current rules it follows, with the URL and date.
- **`docs/launch/x-thread.md`:**
  - 6–8 posts, each at most 280 characters, counting every URL as 23
    (decision 5)
  - the hook and the link in post 1 or the last post
  - one post per chapter, each with its GIF
  - one post on "why you can trust it"
- **`docs/launch/linkedin.md`:** one short post, with the first two lines working
  before "see more".
- **`docs/launch/checklist.md`:**
  - **Before anything:**
    - CI is green and the audit is green
    - every route returns 200 live
    - every route's preview is checked (Playwright plus the platforms' own
      preview inspectors, which you run)
    - you check it on a real phone
    - the repo is public, with its settings applied
  - **Order:**
    1. Show HN, at a time you can answer comments for about 3 hours
    2. the X thread and LinkedIn the same day
    3. r/LocalLLaMA the next day
    4. r/MachineLearning per its rules
  - **Feedback:**
    - factual-error reports go first: reproduce, fix, add a test, and add a
      changelog entry crediting the reporter
    - reply with the commit link
    - put taste debates into issues
    - never edit a post to hide a correction

### Tests

**`tests/launch.test.ts`** (vitest):
- **Length:** README.md is at most 130 lines (the prompt says "about 120").
- **Writing rules** (CLAUDE.md) on README, CONTRIBUTING, and `docs/launch/*.md`:
  sentences under 25 words, outside code blocks and titles, and no banned hype
  words.
- **Post limits:**
  - Show HN: no title is generated (decision 7). Once you add yours to
    `show-hn.md`, the test checks it is under 80 characters, prefix included.
  - X posts: each at most 280, counting every URL as 23
  - LinkedIn: the post within its limit
- **Images and media:**
  - chapter GIFs under 3 MB and the hero under 5 MB, all 600 px wide
  - MP4s between 6 and 10 s, checked with `ffprobe` (skipped with a message if
    ffmpeg is missing)
  - `social-preview.png` is exactly 1280×640 and under 1 MB
  - every `public/og/*.png` is 1200×630
- **Links:** every link in README.md and `docs/launch/` resolves, through the
  link-check script from AUDIT.md m2.

### Report after writing

- every file written
- the final media sizes and durations
- the two hero candidates, so you can pick
- what I need from you: the hero pick, your own text for HN and r/LocalLLaMA,
  and anything the rules check turns up

## Backlog

- **Per-request reservation for contiguous-max** (SIM.md Q4, not in v1). Add
  `reserve: 'max-model-len' | 'request-max'`, where the second reserves
  `prompt + outputLen`, Orca's per-request reservation (yu2022 §4.2). It would
  show real gaps between regions, which equal regions cannot.
