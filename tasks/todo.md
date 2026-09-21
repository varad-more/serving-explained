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
