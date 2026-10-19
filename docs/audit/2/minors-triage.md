# Audit 2 minors: triage

Status: **proposed 2026-10-19, waiting for the author's decisions.** No code
has changed.

AUDIT.md lists 55 minors. D-7, D-9, A4, and B1 are fixed, which leaves 51.
The SOURCES.md kwon2023 row has no id; it is the 51st.

Each item was checked again on `main` at `e110d2c`: every one is still open.
Line numbers below are current. Most have not moved since the audit.

Recommendation rules:
- **before**: a first-time reader would notice it, or it makes a claim or
  number wrong.
- **after**: fix after launch.
- **won't**: won't fix, with the reason.

Size: **S** is one sentence, cite, or line. **M** is several sites, a test, or
regenerated screenshot baselines. **L** is a component change or work in
another repo.

## Summary

| call | count | ids |
|---|---|---|
| before | 12 | C1-2, C1-3, C2-6, C2-7, C2-8, C3-5, C3-11, C4-5, S-2, S-7, S-9, SOURCES kwon2023 |
| after | 35 | the rest |
| won't | 4 | A5, D-10, P2, P3 |

The 12 "before" items: 10 are S, C3-5 is M, and S-2 is L. Each of the 11
wording fixes changes prose a claim rests on, so each needs your approval
(CLAUDE.md, "Stop and ask"). Chapter text changes will move some screenshot
baselines on Mac and Linux.

C4-5 meets neither rule. It is "before" because it breaks a Never rule
(CLAUDE.md: never copy text), and the launch audience knows the SGLang paper.

## src/chapters/kv-cache/

| id | where | problem | fix | size | call |
|---|---|---|---|---|---|
| C1-2 | `index.mdx:92` | "Not all of that gap is GQA", but the KV-head ratio alone (4×) is bigger than the 3.4× gap. The other differences shrink it. | "GQA alone gives 4×; the other differences bring it to 3.4×." | S | **before**: wrong, and 4× sits right after 3.4× |
| C1-3 | `index.mdx:21` | The chapter's first sentence says a model reads one token per step. The prompt is read in one parallel step (kwon2023 §2.2), as line 50 says. | "A model reads text as tokens, such as words, and writes them one token per step." | S | **before**: wrong, and line 50 contradicts it |
| C1-4 | `index.mdx:139` | "Real requests are often shorter than the maximum context" has no citation. | Cite kwon2023 §1. | S | after |
| C1-5 | `index.mdx:160` | The 256-request cap line leaves out vLLM's 1,024 default on larger GPUs; the H100 widget shows 2,071 and 1,035 requests fitting. | Add "and 1,024 on larger GPUs such as the H100". | S | after: true, only incomplete |
| C1-6 | `MemoryBudget.tsx:133, 281–297`; `index.mdx:35, 71, 146` | The "Fits…" heading, the bar labels, and three prose sentences carry no badge of their own. | Badge the figure head and the three sentences. | M | after |

## src/chapters/paged-attention/ and its test

| id | where | problem | fix | size | call |
|---|---|---|---|---|---|
| C2-3 | `index.mdx:104` | "The paper measured real systems on real workloads." Its Orca baselines were its own reimplementations; its workloads were synthesized from dataset lengths. | "The paper measured its own implementations, with request lengths from real datasets." | S | after: overstated, not false |
| C2-4 | `index.mdx:88` | "reads … through its table" cites §4.1; the table is §4.3. | Cite §4.1 and §4.3. | S | after |
| C2-5 | `index.mdx:134` | "Against Orca (Max), vLLM ran 4.3× more" has no citation of its own. | Cite §6.2, Fig. 13a. | S | after |
| C2-6 | `index.mdx:193` | "no per-request reservation" reads as if the engine reserves nothing per request. Step 2 says each request reserves max_model_len slots. | "no per-request reservation sizes, as in the paper's Oracle and Pow2 baselines". | S | **before**: contradicts step 2 on a literal reading |
| C2-7 | `index.mdx:50` | "need 64 to 376 slots each": those are request lengths. KV peaks one slot lower (SIM.md invariant 4). | "are 64 to 376 tokens long, 190 on average". | S | **before**: numbers off by one |
| C2-8 | `index.mdx:116, 119` | "never preempts" comes one sentence before preemption is defined (audit 1 m15). | Move the paragraph below the definition. | S | **before**: an undefined term at first use |
| C2-9 | `tests/chapters/paged-attention.test.ts:205–213` | The prose says "every setting accepts them all"; the test checks one setting. The prose is true. | Loop the test over `MAX_MODEL_LENS`. | M | after |
| C2-10 | `index.mdx:167, 169` | "two requests" and "reference count of 2" are typed by hand, not through `<Num>`. Both are correct. | Render them from the preset with `<Num kind="simulated">`. | M | after |

## src/chapters/continuous-batching/

| id | where | problem | fix | size | call |
|---|---|---|---|---|---|
| C3-3 | `index.mdx:79`; SIM.md L740 | "running requests first, then waiting ones" cites `scheduler.py` L563–684; the waiting loop starts at L873. | Cite L563–684 and L873–895. | S | after |
| C3-4 | `index.mdx:117`; `glossary.ts:437` | The token budget cites agrawal2024 §4.1; it is defined in §4.2 and sized in §4.3. | Cite §4.2–4.3 in both places. | S | after |
| C3-5 | `index.mdx:136, 235`; `prefix-caching/index.mdx:195`; `Controls.tsx:775, 802`; SIM.md L588, L727, L978 | "under 70 GB": the code says 70 GiB and gives A100s 256 too. Three different line ranges cite one default. Chapters 1–2 already say "70 GiB, and on A100s". Includes D-6 and S-3. | Use chapter 1–2's wording and one range (L2876–2895) at every site. | M | **before**: the unit is wrong, and the chapters disagree |
| C3-6 | `index.mdx:28`; `glossary.ts:334` | "computes some prompt tokens or makes one output token" cites Orca. Partial prompts are chunked prefill. | Cite agrawal2024 for the chunking half. | S | after |
| C3-8 | `index.mdx:229` | The 0.45 and 0.65 utilizations are not in the cited MATH.md section. They are in llmsize's data. | Link llmsize `generated.ts` L506 and L513 at `2cef2af`. | S | after |
| C3-9 | `index.mdx:201` | `runner.py#L433` supports "words" only; "reused in turn" is L535. | Cite L433 and L535. | S | after |
| C3-10 | `index.mdx:203` | "Each level's throughput includes the time its last requests took to finish" has no source. It is our own method. | Mark it as our method and link `scripts/gen-measured.ts` L12–14. | S | after |
| C3-11 | `index.mdx:164` | "the budget matters only when prompts are long" is a general rule the test does not cover. It fails in the sim below the short prompts' length. | "Here, the budget matters only for the long prompts." | S | **before**: an untested sim claim, wrong as a general rule |
| C3-12 | `index.mdx:230` | "What this leaves out" calls only Figure 3.4's pool a toy. Figures 3.2–3.3 and 3.5–3.7 also differ from vLLM's pool. | One line covering every figure's pool. | S | after |
| C3-13 | `index.mdx:236` | The head-of-line-blocking line reads as our simplification. vLLM's default FCFS blocks the same way. | "Under it, as in vLLM's default, a request that cannot start holds up the queue." | S | after |
| D-3 | `numbers.tsx:91` | Throughput badges link one log line; each number spans a range (L53–L56). | Build the anchor from both `logLines` values. | S | after |
| D-4 | `index.mdx:194`; `glossary.ts:410` | bench-ieb starts its TTFT clock when the client sends, so client-side waiting is not counted. The glossary's TTFT includes queueing. Server-side queueing is counted in both. | One clause saying where bench-ieb starts the clock. | S | after |
| D-5 | `index.mdx:199` | The image tags rest on the log's pull-check lines; the pinned script has the image variables commented out. The log agrees. | "The run's preflight lists the images …" | S | after |

## src/chapters/prefix-caching/ and its test

| id | where | problem | fix | size | call |
|---|---|---|---|---|---|
| C4-2 | `index.mdx:146, 191` | "cascade attention … can share those reads" cites `config/model.py` L284–290, which says only that it is off by default. | Also cite `v1/attention/backends/flash_attn.py` L871 and L947–972. | S | after |
| C4-3 | `index.mdx:192` | "asynchronous scheduling, which shifts TTFT" has no source. Chapter 3's line cites it and says "plans one step ahead". | Use chapter 3's wording and cite. | S | after |
| C4-4 | `index.mdx:171` | "A large service runs several replicas of a model" has no source. | Fold it into the "Our reasoning" line after it. | S | after |
| C4-5 | `index.mdx:28` | The system-prompt sentence is a near-copy of zheng2024 §3 ("different program instances often share some common parts (e.g., system prompts)"). | "Many requests open with the same tokens, such as a system prompt." | S | **before**: breaks the no-copy rule |
| C4-6 | `index.mdx:49`; `tests/chapters/prefix-caching.test.ts:180` | 64, 4, 8, and 16 are typed by hand inside a `<Claim>`, and again as literals in the test. | Export them from the presets; use them in the test and through `<Num>`. | M | after |
| C4-8 | `tests/chapters/prefix-caching.test.ts:271` | The test asserts at least 4 sharers; the page shows 8. A drop to 5 would pass. | Assert equality with `F.hit.mostSharers`. | S | after |
| A2 | `CacheFigure.tsx:188` | The lookup readout is a polite live region that speaks during play: 4 announcements in 3 s. | Turn it off while playing, as `RunView.tsx:316` does. | S | after |

## src/chapters/glossary.ts

| id | where | problem | fix | size | call |
|---|---|---|---|---|---|
| C3-7 | `:369` | "roofline" cites MATH.md for max(compute, memory). That form is agrawal2024 §3.1 and SIM.md §5. | Cite those two. | S | after |
| C4-7 | `:528` | "free queue" cites only the free path. Allocation is `block_pool.py` L669–703. | Cite L669–703 and L777–808. | S | after |
| S-5 | `:500` | "cache hit" cites L146–147; the lookup is L143. | Cite L143–146, as chapter 4 does. | S | after |
| S-7 | `:167`; `kv-cache/index.mdx:164` | "The size of that reserve is an assumption." It is assumed only for the H100; for the A10G, L4, L40S, and M4 Max, llmsize derives it from the GPU's specs. MATH.md uses the same words, so llmsize's text and data disagree. | "For some GPUs, such as the H100, the size of that reserve is an assumption." | S | **before**: false for 4 of 5 GPUs |
| S-8 | `:213` | "block size" cites only kwon2023 for vLLM's default of 16. | Cite `config/cache.py` L71 in its place. One source per entry, so keeping both changes the glossary type. | S | after |
| S-9 | `:181, :283` | "In this chapter" reads oddly on the standalone glossary page. | "In chapter 1" and "In chapter 2's contiguous grid". | S | **before**: visible on /glossary/ |
| S-10 | `:153` | "such as vLLM or SGLang" cites the vLLM paper, which predates SGLang. | Drop "or SGLang". | S | after |

## src/viz/ui/SourceLink.tsx

| id | where | problem | fix | size | call |
|---|---|---|---|---|---|
| S-2 | `:30` | About 44 vLLM code cites open the repo root at `cfd54ca8`. A reader who clicks cannot find the file or lines. Labels like "config/cache.py" leave out `vllm/`. | Build `blob/cfd54ca8/vllm/<path>#Lx-Ly` from each cite's `at`, then run the link check on every one. Some `at` strings hold two ranges. | L | **before**: every reader who checks a cite hits it |

## docs/SOURCES.md

| id | where | problem | fix | size | call |
|---|---|---|---|---|---|
| kwon2023 row | `:13` | Says the paper uses one block table for all layers. The paper chose separate blocks and tables per head and layer (§4.1 footnote: "we choose the second one"). Shown only on GitHub, not on the site. | Say what the paper chose, then regenerate `src/data/sources.json`. | S | **before**: wrong |

## src/viz/sandbox/

| id | where | problem | fix | size | call |
|---|---|---|---|---|---|
| S-11 | `RunView.tsx:289` | "Weights 15.0 GiB" has no badge; the `computed` badge is on the next line. | Add the badge. The sandbox baselines change. | M | after |
| A3 | `RunView.tsx`; chapter 2 steps 1–2 figures | Step announces nothing in the sandbox and at chapter 2 steps 1–2. Every other figure announces. | A polite readout on Step, as the other figures do. | M | after |
| B2 | `Controls.tsx` | In WebKit at 1440 px, Tab focuses two sandbox inputs without scrolling them into view. It may be WebKit's scroll timing. | Confirm in Safari by hand first. If it is WebKit, won't fix. | S | after |

## Landing and app shell

| id | where | problem | fix | size | call |
|---|---|---|---|---|---|
| A1 | `App.tsx:52`; `Landing.tsx:18` | Two `nav` landmarks are named "Chapters". axe `landmark-unique` (moderate) fails in all 12 landing runs. Screen-reader users hear the same name twice. | Rename the landing list, for example "Chapter list". | S | after: one line, if you want axe clean at launch |

## Palette (`src/viz/tokens.css`)

| id | where | problem | fix | size | call |
|---|---|---|---|---|---|
| A5 | `:44, :82`; strip in `paged-attention.css:184–190` | In the 12 px summary strip, waste next to free is 2.85:1 light and 2.82:1 dark, under 3:1. | Darken `--block-waste`. | M | **won't**: the grid above shows the same blocks with the waste hatch at 3.38:1 or more. Changing the token moves the hatch's contrast and every baseline. |

## SIM.md links

| id | where | problem | fix | size | call |
|---|---|---|---|---|---|
| D-10 | the 4 chapters' line 12 or 163; `Sandbox.tsx:25`; `Controls.tsx:35` | SIM.md links point at `main`, not a pinned commit. | Pin them. | M | **won't**: the site deploys from `main`, so `main`'s SIM.md describes the engine the reader runs. A pin would go stale at the next deploy. |

## src/data/gpus.json (from llmsize)

| id | where | problem | fix | size | call |
|---|---|---|---|---|---|
| D-8 | `gpus.json:72` | The M4 Max's 11.6 bf16 TFLOPS is not in its `source_url`. It comes from arXiv 2502.05317. The number is never shown; it drives simulated times only when the M4 Max is picked. | Fix `source_url` in llmsize, then re-pin and regenerate. | L | after, in llmsize |

## Performance

| id | where | problem | fix | size | call |
|---|---|---|---|---|---|
| P2 | Figure 3.6 | At 4× CPU its frame p95 is 33 ms, over the 18 ms rule. | — | — | **won't**: not a regression (the pre-sandbox build fails the same way), one frame in 20 takes two vsyncs, no frame is over 50 ms, and it ran on a loaded machine. |
| P3 | inline figures at 412 px | Each inline figure mounts on load and runs its sims: Lighthouse mobile 99 on chapters 3–4. | Mount inline figures as they near the viewport. | L | **won't**, unless the real-phone check feels slow: the fix touches the shared chapter layout, deep links, and the narrow-width tests. |

## Folded into other ids

The review files use ids that AUDIT.md merged:
- D-1 became G1, and D-2 became C3-1. S-1 became C4-1; its chapter 3 half is C3-3. All three were fixed or are tracked above.
- D-6 and S-3 are inside C3-5.
- S-4 is C4-7, and S-6 is C3-7.

## How this was checked

Three sub-agents re-read the review files and found each item on `main`. They
read the paper texts, llmsize at `2cef2af`, bench-ieb's `runner.py`, and the
pinned vLLM files. I re-read the four wrong-claim lines in chapters 1–2 and the
C3-5, C3-11, and S-7 sites myself. A1, A2, and A5 were checked against
`App.tsx`, `CacheFigure.tsx`, and `tokens.css`.
