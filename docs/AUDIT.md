# Launch audit

Status: **audit 1, before the build. Waiting for approval to fix.** Run on
2026-10-01 at commit `d28955c` (local, not pushed).

## Scope: the site does not exist yet

The prompt audits a built site. This repo holds only documents and plans:

- `git ls-files` lists 8 files: CLAUDE.md, DESIGN.md, PRODUCT.md,
  docs/CHAPTER_DOD.md, docs/SIM.md, docs/SOURCES.md, tasks/lessons.md, and
  tasks/todo.md.
- There is no `package.json`, no `src/`, no tests, and no workflow.
- Both candidate site URLs return 404 (curl, 2026-10-01).

So this pass checks only what exists, and says how:

- **Correctness of the planned claims:** a sub-agent read the four chapter plans
  against the source texts.
- **Every external link** in the docs.
- **Contrast** of every design-token pair, and color-blind separation of the
  request palettes.
- **Measured numbers:** recomputed from the raw benchmark files.
- **Author claims** in PRODUCT.md.

Everything that needs running code is listed under "Not run" with the reason.
No number here is estimated or simulated in place of a measurement.

Severity: **blocker** stops launch, **major** must be fixed before launch, and
**minor** is the author's call.

## Summary

| category | blocker | major | minor | not run |
|---|---|---|---|---|
| 0. Build state | 2 | 0 | 0 | — |
| 1. Correctness | 0 | 6 | 17 | 2 items |
| 2. Accessibility | 0 | 3 | 1 | 4 items |
| 3. Mobile and browsers | 0 | 0 | 0 | 3 items |
| 4. Performance | 0 | 0 | 0 | 4 items |
| 5. Resilience | 0 | 0 | 1 | 3 items |

## 0. Build state

**B1 (blocker): no site has been built.** Evidence:
- `git ls-files` (above).
- `curl` returns 404 for https://varadmore.me/serving-explained/ and
  https://varadmore.me/Serving-Explainer/.
- Every runtime check in §2–§5 is blocked by this.
- Fix: carry out the approved plans in tasks/todo.md:
  1. Prompt 1 steps 1–4
  2. the engine
  3. Prompt 1 steps 5–9
  4. chapters 1–4
  5. the sandbox
  6. this audit, run again

**B2 (blocker): open decisions gate the build.** Each is recorded in
tasks/todo.md or docs/SIM.md:
1. **Design direction**, A or B. Every token fix in §2 depends on it.
2. **Repo visibility.** `gh repo view` shows `varad-more/Serving-Explainer` as
   PRIVATE. Pages from a private repo needs a paid plan.
3. **Rename the repo** to `serving-explained` to get the planned URL.
4. **Permissions:**
   - `corepack enable`
   - clone llm-calculator to `../llm-calculator`
   - push to `main`
   - enable Pages
   - `brew install ffmpeg` for the launch captures
5. **SIM.md approval** and Q1–Q8. Q8 is a disagreement between sources that
   needs the author's sign-off.
6. **Chapter decisions:** chapter 1 (5), chapter 2 (6), chapter 3 (10),
   chapter 4 (6), and sandbox (9). These include the DESIGN.md rule changes
   for slot assignment, phase encoding, and prefix-cache states.
7. **M9:** whether to correct llmsize's A10G compute figures upstream before
   gen-data runs.

## 1. Correctness

**Method.** A sub-agent checked every technical claim planned in tasks/todo.md
(chapters 1–4 and the sandbox) against the source texts. It confirmed the
pinned commits: vLLM `cfd54ca8`, llmsize `51b9746`, bench-ieb `1c96431`. I
re-checked M5 and M9 myself, and m15 against vLLM `arg_utils.py` L3079–3089 and
`scheduler.py` L316–327. There are no blockers.

| chapter | supported | partly | not supported | no source |
|---|---|---|---|---|
| 1 KV cache | 10 | 2 | 0 | 0 |
| 2 Paged attention | 15 | 4 | 0 | 0 |
| 3 Continuous batching | 13 | 3 | 0 | 1 |
| 4 Prefix caching | 15 | 3 | 0 | 1 |
| Sandbox | 2 | 2 | 1 | 0 |

**M4 (major): kwon2023 §8 is stretched.** The chapter 2 plan says "paging can
hurt when a workload is compute-bound."
- §8 says this about serving DNNs *that are not LLMs* (2309.06180.txt
  L1557–1562).
- Fix: say "for non-LLM workloads", or drop it.

**M5 (major): "vLLM's default `max_num_seqs` is 256" is missing its condition.**
- It appears in the chapter 2, chapter 3, and sandbox plans.
- `arg_utils.py` L2876–2885 sets 1024 on GPUs with at least 70 GB that are not
  A100s, which includes the h100-sxm-80 we list. 256 applies only in the
  `else` branch (L2886–2895).
- Fix: add "on GPUs under 70 GB" everywhere, as chapter 1 and SIM.md already
  do.

**M6 (major): chapter 4's eviction step cites the doc that contradicts its prose.**
- The prose says unkeyed freed blocks go to the front of the free queue
  (vllm-src `block_pool.py` L795–806). The cited vllm-apc-doc L198 says all go
  to the tail.
- That conflict is SOURCES.md note 9, still pending as SIM.md Q8.
- Fix: cite vllm-src for that step, after the author signs off on Q8.

**M7 (major): chapter 4's knob to predict has no test.** PRODUCT.md L14–15
requires one. The knob: a longer shared prefix means fewer prefill tokens and a
shorter TTFT.
- Fix: a test `longer-prefix-saves-more`, sweeping the prefix length on
  `shared-system-prompt`.

**M8 (major): PRODUCT.md states absolutes the chapter 4 plan contradicts.**
- L66–68 ("nothing … for unique prompts") and L75–77 ("saves nothing when prompts
  share no prefix") are absolute.
- The plan's `self-hit-after-preemption` shows the one exception
  (`scheduler.py` L1558, `block_pool.py` L795–801).
- Fix: add "except a preempted request reusing its own blocks" to PRODUCT.md and
  the sandbox text.

**M9 (major, two sources disagree, so I stop and ask): llmsize's A10G compute
figures do not match the datasheet it cites.**
- llmsize `data/gpus.json` gives `a10g-24` bf16 at 125 TFLOPS, fp32 31.5, and
  tf32 62.5. Its `source_url` is AWS's datasheet:
  https://d1.awsstatic.com/product-marketing/ec2/NVIDIA_AWS_A10G_DataSheet_FINAL_02_17_2022.pdf
- That datasheet (read with pypdf) says: BF16 70 TF dense (140 with sparsity),
  FP32 35 TF, TF32 35 TF dense. llmsize's values match the A10, not the A10G.
- Bandwidth (600 GB/s) matches.
- **Effect:** every compute-bound time on the A10G, our main hardware, comes out
  1.8× too fast. That covers chapter 3's prefill times and the crossover (about
  135 → 76 tokens per step), and the preset estimates built on them.
- Decode times are memory-bound and unaffected, and so is the SIM.md §10
  cross-check.
- The fix belongs in llmsize, the author's repo, before gen-data runs.
- The other three NVIDIA GPUs' bf16 figures equal half their sparsity figures,
  the usual dense value. I did not fetch those datasheets in this pass. gen-data
  should record each figure's source page.

**Minor** (wording and coverage; the fix is in parentheses):
- m3: `no-cache-work` is our inference from kwon2023 §2.2, which never
  describes the no-cache case. (Mark it as reasoning.)
- m4: "engines store whole blocks of 16" is not true of every engine. SGLang
  uses one-token pages. (Say "vLLM stores".)
- m5: "memory, not compute, caps the batch" is stated flatly. kwon2023 also
  shows a compute-bound exception. (Say "usually", as PRODUCT.md does.)
- m6: buddy-allocation gaps are attributed to Fig. 3. (Cite §3.1 and §6.1.)
- m7: yu2022 §4.2 does not support *contiguous* max-length regions. Orca reserves
  each request's own max tokens. (Cite kwon2023 §3.1 and §6.1 "Max".)
- m8: "did best" for block sizes 16 and 32 on Alpaca. (The paper says "work
  well".)
- m9: "decodes first, as vLLM V1 does" overstates V1, which has no phases.
  Decodes come first through admission order. (Reword.)
- m10: "raised to `max_model_len`, as vLLM does" holds only when the budget is
  unset. An explicit smaller budget is a `ValueError`. (Add "when unset" in the
  chapter 3 and sandbox plans and SIM.md §12.)
- m11: "throughput climbs with concurrency, and so does TTFT" is not true at
  every level. vLLM's p50 TTFT goes 99.6 → 91.2 ms from 4 to 8. (Say "from 1
  to 64".)
- m12: the full-hit cap cites "SIM.md §8", which is not a source id. (Cite
  vllm-src `kv_cache_manager.py` L289–295.)
- m13: "never-keyed" should be "unkeyed". A block that was evicted and then
  partly refilled is also unkeyed.
- m14: the replica teaser's "each keeps its own cache" is inferred, not stated by
  bench-kvtt. (Mark it as reasoning.)
- m15: chapter 2 says preemption is "explained in chapter 3", but chapter 3 has
  no preemption step. (Add a short step to chapter 3, or point to SIM.md.)
- m16: chapter 3 uses llmsize's A10G TFLOPS (see M9).
- m17: "What this leaves out" is missing SIM.md §9 items:
  - chapter 2: §9.1, §9.2, and §9.10
  - chapter 3: §9.2, §9.6, and §9.17. Its "no batching timeout" should be added
    to §9.
  - chapter 4: §9.9 and §9.12. Its "hit rate as in vLLM" line is not a
    simplification and should go.
- m18: claim ids and tests do not match:
  - chapter 2: `frames-match-snapshots` has no claim, so the meta-test would
    fail. The CheckYourself answer "drops to 1" is untested.
  - chapter 3: `chunking-spreads-stalls` is in no step. The misconception claim
    has no id. `no-free-setting` has no assertion.
  - chapter 4: `caching-lowers-ttft-and-prefill` is in no step.
- m19: SOURCES.md's "cited for" column is missing sections the plans cite:
  - kwon2023: §2.2, §4.1 with its footnote, §4.4, §1/Fig. 1
  - agrawal2024: §1, §2.4, §3.1/Fig. 5, §3.3, §4.3
  - zheng2024: one-token pages, the shared pool
  - vllm-apc-doc: L3, L146, Note 2
  - vllm-src: `torch_utils.py`

**Passes:**
- Every planned claim has a source, except the two flagged.
- The measured callout's numbers match the raw files.
- No "What this leaves out" line contradicts SIM.md.
- llmsize's usable VRAM for the A10G (22.5 GiB = 23,040 MiB) matches the
  23,028 MiB that nvidia-smi reported in bench-ieb's log (`:7`), within 0.05%.

## 2. Accessibility

Contrast was computed with the WCAG 2.x formula for every token pair in
DESIGN.md, in both directions and both themes. Color-blind separation was
checked with the dataviz palette validator (OKLab ΔE, deutan, protan, and tritan
simulation).

**Passes:**
- **Body text:** `--ink` and `--ink-2` on `--bg`, `--surface`, `--surface-2`, and
  `--block-free` are at least 4.5:1 everywhere. The lowest is 5.58:1 (A light,
  `--ink-2` on `--block-free`).
- **Focus ring:** at least 11.44:1 against `--bg` and `--surface`.
- **Block edges:** free-block edges are at least 5.58:1.
- **Request colors** are at least 3.73:1 against `--surface` (A light, slot 5).
- **Neighboring request slots** pass color-blind separation in all four themes,
  with a worst neighbor ΔE of 13.5.

**M1 (major): id labels fail 4.5:1 on two request colors.** WCAG 1.4.3.
- A light slot 3 (`#2389b5`): the best label color reaches 4.35:1.
- B light slot 8 (`#0a8a5f`): the best reaches 4.36:1.
- Every other slot passes with white or dark ink (minimum 4.56:1).
- Fix: darken those two hues until a label reaches 4.5:1, then re-run the
  palette validator. Or draw labels on a `--surface` chip.

**M2 (major): the waste hatch fails 3:1 in both dark themes.** WCAG 1.4.11.
- A dark: hatch `#6b665c` on `--surface` is 2.82:1.
- B dark: hatch `#5c6066` is 2.73:1.
- The hatch is the only visual cue for wasted slots in chapter 2.
- Fix: lighten the hatch ink to at least 3:1. Checked: `#77726a` on A dark
  `--surface` is 3.37:1, and `#6a6e75` on B dark `--surface` is 3.38:1.

**M3 (major): request hue cannot carry identity, because all pairs fail.**
- `--pairs all` fails color-blind separation in every theme. The worst pairs:
  - B light moss vs. amber: ΔE 0.2 (protan)
  - A dark olive vs. vermilion: ΔE 1.2 (deutan)
- It also fails the normal-vision floor (all below 15):
  - A dark cerulean vs. cobalt: 5.9
  - B light green vs. moss: 7.5
- This matters more now. The slot rule changed in the chapter 3 plan: requests
  take the lowest free slot, so non-neighboring slots appear together all the
  time.
- DESIGN.md already makes glyphs and patterns required. One gap remains:
  direction B says blocks narrower than 14 px "drop the glyph", which leaves
  those blocks with hue only.
- Fix:
  - Every request mark carries its pattern, and its glyph or id label, at every
    size.
  - Cells never go below the size that fits a glyph (the plans already set
    28 px on desktop and 40 px on mobile).
  - Add a render test: every request mark has a pattern and a glyph or label.

**m1 (minor): `--ink` on `--highlight` is 1.35:1 in B dark.** B dark's highlight
is `#ffcc00`, so normal ink on it is unreadable. The `--on-highlight` token
exists for this.
- Fix: a lint rule and test that `--highlight` backgrounds always use
  `--on-highlight` text.

**Not run (B1):**
- axe on every route in both themes
- the keyboard walkthrough
- `aria-live` summaries at a polite rate
- `prefers-reduced-motion` behavior

The plans specify each one in docs/CHAPTER_DOD.md items 7–14.

## 3. Mobile and browsers

**Not run (B1):**
- Chromium, WebKit, and Firefox at 375, 768, and 1440 px
- touch: thumb-sized sliders, no hover-only paths, 44 px targets
- Safari: sticky, SVG text, workers

Note for the build: CHAPTER_DOD.md tests 375 and 1440 px in Chromium only. This
audit adds 768 px, WebKit, Firefox, and 44 px targets. CHAPTER_DOD.md should
gain them.

## 4. Performance

**Not run (B1):**
- Lighthouse on every route
- JS per route under 200 KB gzipped
- LCP on simulated 4G and layout shift
- per-widget frame times

There are no measured or estimated numbers here.

## 5. Resilience

**Links.** 48 unique external URLs appear in the docs. 43 return 200. The other
5:
- **The two site URLs return 404:** the site is not deployed (B1).
- **Three return 403 to scripts:** https://doi.org/10.1145/3600006.3613165 and
  the two USENIX pages.
  - Each response carries `cf-mitigated: challenge` (a Cloudflare bot check).
  - The DOI itself resolves: 302 to dl.acm.org.
  - These are reachable for readers.

**m2 (minor): the link check in CI must treat Cloudflare challenges as
reachable.** Otherwise it fails on three good links. Fix: in the link-check
script, accept a 403 that carries `cf-mitigated: challenge`, and list such
hosts in the report.

**Not run (B1):**
- no network requests after load
- the no-JS and worker-failure fallbacks
- the 404 page and per-route metadata

## Checks that passed

- **Measured numbers** (chapter 3's planned callout). I recomputed them from
  `results_concurrency64/…/throughput_ramp_extended_{vllm_1776486559,sglang_1776488646}.json`
  and `logs/phase2_resume_20260418T042547.log` (bench-ieb at `1c964318`).
  - Median TTFT: 41.2 → 162.8 ms (vLLM) and 69.9 → 156.1 ms (SGLang).
  - Output throughput: 30.2 → 1,279.6 and 30.2 → 1,271.1 tok/s, from the log's
    timestamps.
  - All match the plan.
  - The log records the GPU (`:7`), the image tags (`:15–16`), and the model
    (`:36`).
- **Author claims** (PRODUCT.md): `gh pr view` shows vllm-metal #549 merged
  2026-07-25 and #550 merged 2026-07-28. Both match "merged July 2026".

## Fix order after approval

1. **Now, in docs only:**
   - M1–M3 and m1 in DESIGN.md, once a direction is chosen
   - M4–M8 and m3–m19 in tasks/todo.md, PRODUCT.md, SIM.md, and SOURCES.md.
     M6 waits for Q8, and M9 waits for the author.
   - add 768 px, WebKit, Firefox, and 44 px targets to CHAPTER_DOD.md
2. **After the B2 decisions:** build in the B1 order.
3. **After the build:** run this whole audit again, and update this file with
   before and after numbers for every item.
