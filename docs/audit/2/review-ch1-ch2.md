# Launch-audit correctness review: chapter 1 (KV cache) and chapter 2 (Paged attention)

Read-only review, 2026-10-15. Rendered text: `text/kv-cache.txt` (K:Lnn) and
`text/paged-attention.txt` (P:Lnn). Sources: `sources/kwon2023.txt` (kwon:Lnn),
`ainslie2023.txt`, `zheng2024.txt`, `yu2022.txt`, vLLM at `cfd54ca8`, llmsize
`docs/MATH.md` at `5d5d029` (MATH:Lnn).

Severity totals: **blocker 0, major 3, minor 13.**

## Counts

| chapter | supported | partly | not supported | no source |
|---|---|---|---|---|
| 1 KV cache (33 claims: prose, captions, notes, leaves-out) | 29 | 3 | 0 | 1 |
| 2 Paged attention (47 claims) | 42 | 4 | 1 | 0 |

Glossary popovers used by the two chapters: 43 checked against their cited
location. All are supported except `pagedattention` (C2-1).

Paraphrase: no near-copies. I compared the sentences closest to the paper:
§3.1 reservation, §7.2 block size, §8 non-LLM, §4.2 block table, and the §2.1
attention description. All are reworded. The "work well" fragment is kept on
purpose (m8).

## Chapter 1 findings

**C1-1 (major)**
- Location: `src/chapters/kv-cache/index.mdx:165`; K:L325, "Models that store less KV per token: MLA and sliding-window attention (The math … KV per token)…"
- Source: llmsize-math "KV per token". MATH:L151 says: "A sliding-window layer has the same per-token cost; it just stores fewer tokens."
- Problem: the cited section contradicts the sliding-window half. MLA (MATH:L144–149) and SSM hybrids (MATH:L157–161) are fine.
- Fix: "Models that store less KV: MLA, with a smaller entry per token, and sliding-window attention, which keeps fewer tokens (KV per token), and hybrids with SSM layers (SSM state)."

**C1-2 (minor)**
- Location: `index.mdx:92–94`; K:L175, "Not all of that gap is GQA. The KV-head ratio alone is 4×. The models also differ in layers (32 and 28) and head dimension (96 and 128)."
- Source: none (our reasoning on computed numbers). There is no `<Claim>`.
- Problem: GQA alone (4×) is larger than the 3.4× gap. The other two differences narrow it: 4 × (32/28) × (96/128) = 3.43. "Not all of that gap is GQA" reads as if other factors added to the gap.
- Fix: "GQA alone would give 4×. Phi's smaller head dimension narrows it, and its extra layers widen it, to 3.4×." Optionally wrap it in a Claim and assert the product.

**C1-3 (minor)**
- Location: `index.mdx:21`; K:L13, "A model reads and writes text as tokens, such as words, one token per step (Kwon et al. 2023 §1)."
- Source: kwon:L78–80 says the model *generates* tokens one at a time. The prompt phase reads all prompt tokens in parallel (kwon:L269–276). The chapter's own Fig 1.2 computes 6 prompt positions in step 1.
- Fix: "A model reads text as tokens, such as words, and writes them one token per step."

**C1-4 (minor, no source)**
- Location: `index.mdx:139`; K:L307, "Real requests are often shorter than the maximum context."
- Source: none on the sentence. It is supported by kwon:L153–155 ("the request's actual length can be much shorter than its maximum length (e.g., Fig. 11)").
- Fix: add `<SourceLink id="kwon2023" at="§1" />` (or §3.1).

**C1-5 (minor)**
- Location: `index.mdx:160`; K:L320, "vLLM's default cap of 256 requests at once on GPUs under 70 GiB, and on A100s."
- Source: arg_utils.py L2876–2885 sets max_num_seqs 1024 on GPUs of at least 70 GiB that are not A100s.
- Problem: the line is correct, but the widget offers the H100. There, Llama-3.1-8B at 256 tokens gives max concurrency 2,071 (64.72 GiB ÷ 32 MiB), above vLLM's 1,024 default. The line covers only the 256 case.
- Fix: append "and 1,024 on larger GPUs such as the H100".

**C1-6 (minor, DoD 3)**
- Location: `MemoryBudget.tsx:128–140` against the badge at L154. Rendered K:L240–247: "Fits: uses 18.96 GiB of 22.50 GiB", "Weights 14.96 GiB", "KV cache 4.00 GiB (4 × 1.00 GiB)", "Free 3.54 GiB".
- Problem: the only `computed` badge in that view sits on the "Max concurrency" line under the bar. It reads as covering that line only.
- Fix: put the badge on the heading line, or once at the figure head.
- Same pattern in prose:
  - `index.mdx:71`, K:L108: "That is 128 KiB."
  - `index.mdx:35`, K:L21: first sentence, "6 … up to 11"
  - `index.mdx:146`, K:L311: "requests of 16,384 tokens"

  Each sentence has no badge of its own and leans on its neighbor's. This is low risk.

## Chapter 2 findings

**C2-1 (major)**
- Location: `src/chapters/paged-attention/index.mdx:72`; P:L66, "The paper calls the whole design PagedAttention: a block manager hands out blocks, and an attention kernel reads them wherever they sit (Kwon et al. 2023 §4.1–4.2)." The same wording is in the glossary entry `pagedattention` (`src/chapters/glossary.ts:197–202`).
- What the paper says:
  - PagedAttention is "an attention algorithm" (kwon:L14–16; §4 L461–462: "we develop a new attention algorithm, PagedAttention, and build an LLM serving engine, vLLM").
  - The block manager is vLLM's KV cache manager, "enabled by PagedAttention" (§4.2 kwon:L541–542, L598–603). §10 repeats the split (kwon:L1598–1602).
  - Only the §1 overview blurs the two (kwon:L176–186).
- Fix: "The paper calls the attention algorithm that reads blocks wherever they sit PagedAttention. vLLM's block manager, which hands the blocks out, is built on it (§4.1–4.2)." Mirror this in the glossary.

**C2-2 (major, M3 residual)**
- Location: `BlockGrid.tsx:592–603` (`summaryClass`) and 638–677 (`Summary`), with `paged-attention.css:189–212`.
- Problem: on mobile, whenever the grid is windowed (80 blocks > 48 visible at B=16), the 12 px summary strip fills each held block with its slot color only. It has no pattern, glyph, or label. That breaks DESIGN.md L31–32 ("every mark that stands for a request carries its slot's pattern and glyph, however small") and CLAUDE.md ("Color is never the only encoding"). This is the same failure M3 was raised for.
- Fix: draw every held block with the neutral `summary--held` fill and drop the `summary--slot-k` fills. The strip only needs to show occupancy and the window.

**C2-3 (minor)**
- Location: `index.mdx:104`; P:L155, "The paper measured real systems on real workloads."
- Source: kwon §6.1:
  - The Orca baselines are the authors' own reimplementation with an assumed buddy allocator (kwon:L1201–1206).
  - The workloads are synthesized from ShareGPT and Alpaca lengths, with Poisson arrivals (kwon:L1178–1189).
- Fix: "The paper measured its own implementations on A100 GPUs, with request lengths from real datasets."

**C2-4 (minor)**
- Location: `index.mdx:88`; P:L108, "The attention kernel reads each request's keys and values through its table, so the blocks need not touch (Kwon et al. 2023 §4.1)."
- Source: §4.1 (kwon:L516–529) covers fetching non-contiguous blocks, but not the table. The table lookup is in §4.3 (kwon:L676–678), §4.4 (L895–897), and §7.1 (L1440–1441).
- Fix: cite §4.1 and §4.3.

**C2-5 (minor)**
- Location: `index.mdx:134`; P:L223, "Against Orca (Max), vLLM ran 4.3× more."
- Problem: the sentence has no SourceLink. Its citation is two sentences back.
- Source: supported by kwon:L1285–1287.
- Fix: add `(§6.2, Fig. 13a)`.

**C2-6 (minor)**
- Location: `index.mdx:193`; P:L372, "Regions of different sizes: no buddy allocation and no per-request reservation…"
- Problem: the engine *does* reserve a region per request (SIM.md §4.3 L429–431), so the wording contradicts it. The intended meaning matches SIM.md §9.15.
- Fix: "no per-request reservation sizes, as in the paper's Oracle and Pow2 baselines (§6.1)".

**C2-7 (minor)**
- Location: `index.mdx:50`; P:L55, "this chapter's 40 requests need 64 to 376 slots each, 190 on average".
- Problem: `F.shortest`, `F.longest`, and `F.meanLength` are prompt + output lengths. A request's KV peaks at prompt + output − 1. That is SIM.md §6 inv. 4 (L515–518) and chapter 1's own rule, "12 tokens hold 11 positions" (K:L65). So each request needs one slot fewer than stated.
- Fix: "are 64 to 376 tokens long, 190 on average".

**C2-8 (minor, m15 residual)**
- Location: `index.mdx:116` against 119. P:L215 "…and never preempts…" comes one sentence before P:L217, where preemption is defined.
- Fix: move the `paged-admits-more` paragraph below the preemption paragraph, or say "never has to free a running request's memory".

**C2-9 (minor, test weaker than prose)**
- Location: `index.mdx:177`; P:L346, "…so every setting accepts them all."
- Problem: `max-model-len-hurts-contiguous-only` (`tests/chapters/paged-attention.test.ts:205–213`) checks paged event equality only at 1,024 against 512.
- Fix: loop the hash check over all of `MAX_MODEL_LENS`.

**C2-10 (minor, DoD 3)**
- Location: `index.mdx:167, 169`. "runs two requests" and "reference count of 2" are typed by hand, though they come from `SHARED_BLOCKS`.
- Risk is low: `shared-refcount` pins the count at 2.
- Fix: render them through `<Num>`.

Not on the page: SOURCES.md, kwon2023 "cited for", describes the §4.1 footnote as "one block table per request for all layers". The paper chose the other design, separate blocks and tables per head and layer (kwon:L490–493). The chapter's line (P:L382) is correct. Only the doc is off.

## Claim-by-claim notes

### Chapter 1: supported (one line each)

- Tokens and request (§1, §2.2): kwon:L78, L253–255.
- Query, key, and value, and attention over itself and earlier tokens (§2.1): kwon:L232–243.
- No-cache rerun, marked as reasoning: kwon:L280–284.
- The cache stores and reuses K/V (§2.2): kwon:L261–263, L282–284.
- Query heads read one KV head; MHA/GQA (Ainslie §2.2): ainslie L85–91.
- Uptraining needs more training (Ainslie §2.1): L63–66, L77–83.
- 2·L·n_kv·d_h·s formula: MATH:L144 plus L180.
- Block 16 default: cache.py L71, applied at L333. Backends may override it (platforms/interface.py L687–697); the default is still 16.
- Rounded up to blocks: MATH:L166–171.
- SGLang one-token pages (Zheng §3): zheng L226–227.
- Weights + KV take most memory (§1): kwon:L90–97.
- Requests share weights (§2.3): kwon:L295–296.
- KV is per request (§1): kwon:L69–70.
- Usable VRAM: MATH:L199–202.
- fp8 is one byte: torch_utils.py L39–41 (`torch.uint8`).
- "Memory, not compute, usually limits" (§3): kwon:L346–351. The paper states it flatly; "usually" softens it.
- Blocks reserved on demand (§4.3): kwon:L612–616, L685–689.
- 0.92 holdback: cache.py L101.
- Activations and graphs: MATH:L276.
- Overheads: MATH:L206.
- fp8 scale ignored: MATH:L137–138.

### Chapter 2: supported (one line each)

- §3.1 contiguous allocation and max-length reservation: kwon:L400–408.
- Reserved vs. internal vs. external fragmentation: kwon:L412–416.
- Orca (Max), Oracle, and buddy allocator: kwon:L1203–1216.
- Blocks like pages: kwon:L541–542.
- Logical/physical blocks and the block table with #filled: kwon:L543–545, L598–603.
- Blocks taken on demand: kwon:L612–633, L685–689.
- 20.4–38.2% vs. 96.3%: kwon:L114–125, L162–164.
- Preemption takes `running[-1]` under FCFS: scheduler.py L771–772, L803–804.
- Recompute: L1562 `num_computed_tokens = 0`. V1 removed swap (v1_guide.md L160, L185).
- 20–26% kernel slowdown vs. FasterTransformer: kwon:L1442–1445.
- 2–4× throughput at the same latency: kwon:L20–22, L1575–1577.
- 2.2× / 4.3× on ShareGPT with OPT-13B: kwon:L1284–1287.
- Oracle knows output lengths: kwon:L1207–1209.
- §8 non-LLM DNNs: kwon:L1524–1529.
- §7.2 trade-off and ranges: kwon:L1451–1467.
- KV depends on earlier tokens (§2.2): kwon:L263–264.
- Free queue at refcount 0: prefix_caching.md L198.
- max_model_len: config/model.py L217–219.
- 256 cap: arg_utils.py L2886–2895.
- Separate tables perform the same: kwon:L490–493.
- yu2022 §4.2 max_tokens reservation: yu L908–926.

### What this leaves out against SIM.md §9

Chapter 1 (most lines are about llmsize's memory model, not the engine, and
each carries a source):

| line | maps to | contradicts the engine? |
|---|---|---|
| overheads | §9.14 and §9.17 | no |
| 92% holdback | §9.14 | no |
| 256 cap | SIM §8 L727–728 | no (C1-5) |
| full context | widget-only, kwon §4.3 | no |
| no prefix sharing | vllm-apc-doc | no |
| one GPU | §9.1 | no |
| driver reserve | llmsize | no |
| MLA, SWA, SSM | §9.18 | no (C1-1 wording) |
| fp8 scale | llmsize | no |
| output quality | own statement | no |
| no-cache reasoning | own statement | no |

Chapter 2:

| line | maps to | contradicts the engine? |
|---|---|---|
| L372 | §9.15 | wording conflicts (C2-6) |
| L373 | §9.14 toy pools, plus arg_utils | no |
| L374 | §9.14 | no |
| L375 | §9.1 | no |
| L376 | §9.2 (0.65 = SIM §5 L487 = llmsize `assumptions.json` `mbu_decode`) | no |
| L377 | §9.4 | no |
| L378 | §9.10 | no |
| L379 | §9.7 | no |
| L380 | §9.9 | no |
| L381 | §9.12, §9.11, §9.3 | no |
| L382 | kwon §4.1 fn 1; the engine keeps one table per request | no |
| L383 | kwon §7.2 | no |

Not listed, optional: §9.5 (synthetic tokens), §9.6 (fixed output lengths), and
§9.17 (KV writes and sampling, which affect step times).

## Numbers

Computed values were recomputed from the llmsize configs and data at
`5d5d029`. All match the page.

| quantity | calculation | page shows |
|---|---|---|
| KV per token, Llama-3.1-8B | 2·32·8·128·2 = 131,072 B, with d_h = 4096/32 | 131,072 B = 128 KiB |
| KV per token, Phi-3.5-mini | 2·32·32·96·2, with d_h = 3072/32 | 384 KiB |
| KV per token, Llama-3.2-3B | 2·28·8·128·2 | 112 KiB, ratio 3.43 → "3.4×" |
| KV per token, Qwen2.5-7B | 2·28·4·128·2 | 56 KiB |
| A10G usable | 24 GiB × 15/16 (reservedVramFraction 0.0625) | 22.50 GiB |
| H100 usable | 80 × 0.996 | 79.68 GiB |
| Llama-3.1-8B weights | 16,060,556,376 B | 14.96 GiB, 66.5% → "66%" |
| A10G at 4 requests | | used 18.96, free 3.54 GiB |
| A10G max concurrency | ⌊7.542 GiB / KV per request⌋ | 241 at 256; 15 at 4K; 7 at 8K; 3 at 16K; 1 at 32K and 48K; 0 at 64K |
| H100 at 8K | ⌊64.72⌋ | 64; KV 64.00 GiB; 4.28 → "4.3×" |
| Phi-3.5-mini / Llama-3.2-3B weights | | 7.12 / 5.98 GiB → "1.2×"; fits at 8K: 5 and 18 |
| Qwen2.5-7B CheckYourself | 8.927 GB free; ÷ 0.875 GiB = 9.50; fp8 ÷ 0.4375 = 19.005 | 14.185, 8.315, 9, 19 |
| Chapter 2 A10G room | ⌊8,098,634,664 / 131,072⌋; ÷ 1,280 | 61,787 tokens; 48.3 → "48" |
| MBU | `mbu_decode` | 0.65 |

Quoted numbers all match their sources: 16, 0.92, 256 / 70 GiB, 20.4–38.2%,
96.3%, 20–26%, 2–4×, 2.2×, 4.3×, and 16–128 / 16 and 32.

Simulated numbers:
- Every prose sentence and every figure readout carries a `simulated` badge (P:L28, 82, 112, 191, 249, 289, 330, 354, 369; K:L38, 81), except the minor cases in C1-6 and C2-10.
- The values are consistent across the page: 3.3% and 9.5 at B=16 in Fig 2.5 and both CheckYourselfs; 77.6% twice.
- No number is presented as real-world performance. The Reality check (P:L155) and the step-time leaves-out line (P:L376) disclaim it.

## Tests

`pnpm vitest run tests/chapters/kv-cache.test.ts tests/chapters/paged-attention.test.ts`: **29/29 passed.**

`tests/viz/frames.test.ts`, `requestMark.test.tsx`, and `summaryStrip.test.ts`: 16/16 passed.

Every `<Claim>` id has a test, and the meta-tests pass.

Chapter 1: every test asserts the prose exactly, or bounds a value the page renders through `<Num>`:
- no-cache-work: [6..11], sum 51
- cache-one-column, cache-total
- formula-matches-data: 10 models × 2 dtypes, plus kv-ref
- gqa-smaller: ≥3×, ≤1.25×, fits >3×. The exact values render through Num.
- weights-fixed, kv-linear
- default-crosses: 66% within ±2 pts
- kv-outgrows-weights: >4
- max-conc-formula
- double-context-halves: exact identity
- fp8-doubles: exact

Chapter 2:
- Exact or sufficient: contiguous-waste-split, only-tail-gap, paged-on-demand, paged-waste-bound, table-scattered, paged-admits-more, paged-less-waste, block-size-raises-waste and block-size-shortens-tables (strict), checkyourself-block-size, shared-refcount.
- contiguous-wastes-most: >50%. The 77.6% renders through Num.
- visible-in-20s: weaker (≥6 running, ≤2 preemptions) than the 8 and 1 shown, but those values render through Num, and "grows" is asserted.
- max-model-len-hurts-contiguous-only: partial (C2-9).

## Audit 1 items, re-checked on the live text

| item | status | evidence |
|---|---|---|
| M4 | fixed | P:L223, "For neural networks other than LLMs, which are limited by compute… (§8)"; kwon:L1524–1529 |
| M5 | fixed | K:L320 and P:L373, "on GPUs under 70 GiB, and on A100s"; arg_utils.py L2876–2895 (C1-5 is a coverage note only) |
| m3 | fixed | K:L17 "Our reasoning from Kwon et al. 2023 §2.2…", K:L21 "Counted from the simulated run", K:L328 |
| m4 | fixed | K:L110: "vLLM… stores the cache in blocks of 16… Not every engine does this: SGLang… one token at a time (Zheng §3)" |
| m5 | fixed | K:L7 and K:L305, "usually" |
| m6 | fixed | P:L60 and P:L372 cite §3.1 and §6.1 for external fragmentation and buddy allocation |
| m7 | fixed | P:L53: §3.1 for the reservation, §6.1 for Orca (Max); SIM.md L732 |
| m8 | fixed | P:L234 "16 and 32 worked well"; kwon:L1461–1462 |
| m15 | partly | defined where introduced (P:L217), but "never preempts" at P:L215 comes one sentence earlier (C2-8) |
| m17 | fixed | P:L375 (§9.1), P:L376 (§9.2), P:L378 (§9.10) |
| m18 (ch 2) | fixed | `tests/viz/frames.test.ts:71–89` exists and passes. The CheckYourself answers are asserted by `max-model-len-hurts-contiguous-only` (test:205–213) and `checkyourself-block-size` (test:215–232) |
| M3 | partly | see below |

M3 detail:
- Fixed:
  - `RequestMark` and `paintRequestMark` draw the pattern and glyph at ≥16 px, and the label from 24 px (markSpec.ts:155–177, 278–350; requestMark.test passes).
  - BlockGrid full cells use the labeled sprite (BlockGrid.tsx:388). Partial cells add a 16 px pattern + glyph corner mark (L412–419).
  - Cells are ≥28 px desktop and ≥44 px touch (L23, L29, L164–169).
  - TokenStrip and SharedBlocks use RequestMark.
- Regressed: the mobile summary strip is color-only (C2-2).
