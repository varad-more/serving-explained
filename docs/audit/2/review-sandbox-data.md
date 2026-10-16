# Launch audit: measured/computed data, sandbox, glossary, SOURCES.md

Reviewer: independent, read-only. Repo HEAD `7cdf3bc`. Date 2026-10-15.
Scripts (mine, not gen-measured.ts code): `SCRATCH/review/measured.py`, `SCRATCH/review/computed.py`.
Raw sources: `SCRATCH/sources/bench-ieb` @ `1c964318` (shallow), `SCRATCH/sources/bench-kvtt` @ `56b5ab5d`,
`SCRATCH/sources/vllm` @ `cfd54ca8` (clean), llm-calculator local clone, objects at `5d5d029` / `51b9746`.

## Counts

- Blockers: **0**. Every `measured` number matches its raw file; no simulated/computed number is presented as real-world performance.
- Major: **3** (D-1, D-2, S-1).
- Minor: **18**.

## Findings

### D-1 (major) Every "SIM.md §…" link is a 404 for the public: the repo is private
- Location: 39 citations site-wide. Sandbox: `src/viz/sandbox/Controls.tsx:34-38` (SIM7/SIM9/SIM12), `src/viz/sandbox/Sandbox.tsx:24-25,212`; rendered sandbox.txt L3, L74, L156, L194, L203. Ch3: 14 (`src/chapters/continuous-batching/index.mdx:12`), ch2 7, ch4 12, ch1 1.
- Evidence: `gh api repos/varad-more/serving-explained` → `"visibility":"private"`; unauthenticated `curl https://github.com/varad-more/serving-explained/blob/main/docs/SIM.md` → 404; `api.github.com/repos/varad-more/serving-explained` → 404. Live bundle (`varadmore.me/serving-explained/assets/*.js`) contains those URLs. A PublicEvent exists at 2026-10-01T10:03Z and tasks/todo.md L2895/L3032 say "the repo is public", so it was made private again since.
- Fix: make the repo public again (Pages keeps working either way), or point SIM links at a public copy. Add an unauthenticated check of one SIM.md URL to the link check.

### D-2 (major) The measured callout states a monotonic TTFT trend the raw files contradict
- Location: `continuous-batching/index.mdx:181` ("On a real engine, running more requests at once raises throughput, and median TTFT rises with it") and `:187` ("as more requests run at once, throughput and median TTFT both rise"); rendered continuous-batching.txt L742/L746.
- Evidence (my recomputation, medians of `requests[k*150:(k+1)*150].ttft_ms`): vLLM 41.2 → 99.6 → **91.2** → 93.7 → 124.3 → 162.8 ms; SGLang 69.9 → **68.8 → 64.0** → 87.1 → 125.7 → 156.1 ms for c = 1, 4, 8, 16, 32, 64. SGLang's median TTFT *falls* from 1 to 8. Throughput is monotonic on both. AUDIT.md m11 asked for "from 1 to 64"; only the number sentence was scoped.
- Fix (wording only, no number changes): "From 1 to 64 requests at once, throughput and median TTFT both rose (median TTFT not at every level)". Same scope in the misconception tail.

### S-1 (major) `scheduler.py L563–684` is cited for admitting waiting requests, but that range has none of it
- Location: `src/chapters/glossary.ts:528-533` "Admission … moves a waiting request into the running batch and gives it blocks" (rendered glossary.txt L152); also ch3 `index.mdx:79` "schedules running requests first, then waiting ones" (rendered L181 block).
- Evidence (vllm @ cfd54ca8): L563 `def schedule`, L629 `# First, schedule the RUNNING requests.`, L684 is still inside the RUNNING loop. The WAITING phase starts at L873 (`# Next, schedule the WAITING requests.`), and admission is `self.running.append(request)` at L1294. SIM.md already has `[S-waiting]` L873–895.
- Fix: Admission → `v1/core/sched/scheduler.py L873–1294`. Ch3 L79 → "L563–684, L873–895". (Ch3 L193 "vLLM schedules every step (L563–684)" is fine.)

### D-3 (minor) Throughput badges link one log line; the number spans two lines and the JSON
- Location: `figures.tsx:104` `log: fileUrl(bench.log, l.logLines[0])` → `#L48` (c=1), `#L53` (c=64), `#L94` (SGLang 42×).
- Evidence: each throughput is tokens from the result JSON over L48→L49 / L53→L56 / L94→L97 timestamps.
- Fix: `#L53-L56` style ranges (`logLines` is already in the JSON).

### D-4 (minor) bench-ieb's TTFT excludes client-side waiting; the site's TTFT definition includes queueing
- Location: callout `index.mdx:190-191`; glossary `ttft` ("time in the queue included").
- Evidence: bench-ieb `benchmarks/runner.py` L235-246 creates all 150 tasks up front and starts the clock inside `async with semaphore`; `engines/base_client.py` L114 `start = time.monotonic()` inside `generate`. Server-side queueing is included; waiting for a client slot is not.
- Fix: one clause: "bench-ieb starts the TTFT clock when the client sends the request".

### D-5 (minor) Image tags are backed by the preflight pull check, not by the run
- Location: `index.mdx:195` "The images were … (log L15, L16)".
- Evidence: log L15-16 say "[pull] … already present, skipping pull". At the pinned commit `scripts/run_new_benchmarks.sh` L31-32 has `VLLM_IMAGE`/`SGLANG_IMAGE` commented out, so the pinned script cannot show the run used them (docker run uses `"$VLLM_IMAGE"` at L219). The log is the only evidence; it is consistent.
- Fix (author's call): "The run's preflight lists the images …".

### D-6 (minor) SOURCES.md line references disagree with the pages (both readings are correct at the pin)
- `vllm-src` cited-for: `arg_utils.py L2876–2895`; sandbox uses L2866–2895, ch3 L2886–2895 and L2837–3113. L2866–2875 is the ≥160 GiB branch the sandbox mentions. Harmonize on L2866–2895.
- Note 7: filenames at `:57`, `:98`; bench-ieb.json/site use `:56`, `:97` ("saved results" with the full path). L57/L98 carry only the basename. Prefer :56/:97 in the note.

### D-7 (minor) llmsize pin sits on an unmerged branch; its GPU source_urls are dead at the pin
- `gh pr view 1 -R varad-more/llm-calculator` → `state OPEN, mergeCommit null`. Note 12's re-pin trigger has not fired; the pin need not move. But `5d5d029` is not on llmsize `main`, and the live llmsize (linked from ch1 `MemoryBudget.tsx:168` and PRODUCT.md) still has A10G bf16 = 125 (`51b9746:data/gpus.json`), 1.8× the site's 70.
- PR #2 (also OPEN): at the pin, `source_url` for L4, L40S and H100 302 → `https://www.nvidia.com/en-us/` (homepage). Values themselves verified against current NVIDIA pages (table B2).
- Fix: merge #1 and #2, re-pin to the merge commit, regenerate.

### D-8 (minor) M4 Max bf16 = 11.6 TFLOPS is not in its source_url
- Apple's newsroom page (source_url) gives 128GB and 546GB/s only. 11.6 = 4 × 2.9 TFLOPS FP32 MPS SGEMM on base M4 (arXiv 2502.05317, in llmsize `notes`), with bf16 set equal to fp32. Drives simulated compute times when M4 Max is picked (ch3 Fig 3.1, sandbox).
- Fix (author's call): cite the arXiv source in llmsize `source_url` (PR #2 does this).

### D-9 (minor) No About page; "the author" is never named
- PRODUCT.md L108: "Credibility lives on an About page". `src/routes.ts` has no About route; no footer/header author link. Prose says "The author's benchmark repo" (ch3) and "The author's kv-transfer-tax benchmark" (ch4). The site makes no credibility claim, so nothing is unsupported.
- vllm-metal #549 MERGED 2026-07-25, #550 MERGED 2026-07-28, author varad-more: PRODUCT.md's "Both merged July 2026" holds.
- Fix (author's call): add About, or edit PRODUCT.md.

### D-10 (minor) SIM.md links point at `main`, not a pinned commit
- Section numbers (§9.14, §12.1) can drift. Acceptable for the project's own doc; author's call.

### S-2 (minor) `vllm-src` citations link to the tree root, with paths a reader cannot follow
- `SourceLink.tsx:31` uses `source.url` (tree root) for every `at`. Labels are package-relative ("config/cache.py L101", "engine/arg_utils.py …", "utils/torch_utils.py L39–41", "v1/core/…"), but those live under `vllm/`, while "docs/usage/v1_guide.md" is repo-relative. Sandbox help: 4 links. Glossary: 7.
- Fix: deep-link `blob/<pin>/vllm/<path>#Lx-Ly` (SIM.md already has the URLs).

### S-3 (minor) Sandbox help says "70 GB"/"160 GB"; vLLM's thresholds are GiB
- `Controls.tsx:775-777, 802-806`; rendered sandbox.txt L123, L132. Code: `device_memory >= 70 * GiB_bytes` (arg_utils L2876), `160 * GiB_bytes` (L2866). SOURCES.md says GiB. 70 GiB = 75.2 GB.
- Fix: "70 GiB", "160 GiB".

### S-4 (minor) Glossary "Free queue" cites the free path for an allocation claim
- `glossary.ts:521-526`. "Allocation takes blocks from its head" is in `block_pool.py` get_new_blocks (SIM.md [BP-get] L669–753); L777–808 is `free_blocks`. Fix: "L669–753, L777–808".

### S-5 (minor) Glossary "Cache hit" cites L146–147; the lookup is L143
- `glossary.ts:493-498`; vllm-apc-doc L143 "hashing the prompt tokens … looking up cache blocks"; L146-147 is touch/evict. Fix: "L143–146".

### S-6 (minor) Glossary "Roofline": "the longer of" is ours, not llmsize's
- `glossary.ts:362-367`. MATH.md "Throughput" gives a memory-bound decode formula and a compute-bound prefill formula, scaled by MBU/MFU; the max() is SIM.md §5. Fix: add SIM.md §5, and "peak speed × use".

### S-7 (minor) Glossary "Usable memory": "The size of that reserve is an assumption" is only partly true
- `glossary.ts:164-169`. llmsize: A10G/L4/L40S `reservedFractionFrom: "gpu"` (ECC 1/16, AWS-documented); only H100 is `"assumption"`. The bench-ieb log itself (L7: 23028 MiB = 22.49 GiB) matches llmsize's 22.50 GiB for the A10G. Fix: "For some GPUs, the size of that reserve is an assumption."

### S-8 (minor) Glossary "Block size: vLLM's default is 16" cites only the 2023 paper
- `glossary.ts:211-215` → kwon2023 §7.2 (true in 2023). Current default: `vllm/config/cache.py` L71 `DEFAULT_BLOCK_SIZE = 16`. Add it.

### S-9 (minor) Glossary "Free memory" and "Gap" say "In this chapter" on a standalone page
- `glossary.ts:178-182, 280-285`; rendered glossary.txt L50, L80. Fix: "In chapter 1" / "In chapter 2".

### S-10 (minor) Glossary "Serving engine … such as vLLM or SGLang" cites kwon2023 §1, which predates SGLang
- `glossary.ts:150-155`. Trivial; cite zheng2024 too or drop "or SGLang".

### S-11 (minor) Sandbox "Weights 15.0 GiB" has no badge of its own
- `RunView.tsx:287-290`; the `computed` badge sits on the next legend line (KV pool). Rendered sandbox.txt L225. Author's call.

### Info (no action)
- gen-measured.ts parses timestamps with `Date.parse` (ms). µs-exact: vLLM c=64 = 1,279.503 tok/s vs. 1,279.531 in JSON; SGLang c=64 1,271.068 vs 1,271.102. No displayed digit changes.
- llmsize weight bytes = `measuredWeightBytes` (sum of safetensors file sizes, headers included), not `indexTotalSize` (MATH.md "Preferred path"): +33,880 B on Llama-3.1-8B (0.0002%). No display effect.
- llmsize's Qwen2.5-7B param count omits QKV biases (7,615,487,488 vs 7,615,616,512 = index total_size/2). Prefill FLOPs off by 0.002%. llmsize-side.

## Table A: measured numbers (rendered continuous-batching.txt L746-760, L785)

Method: my own Python (`review/measured.py`): ANSI-stripped log, 1-based lines, ISO timestamps at µs; level k = `requests[150k:150k+150]` (verified `request_id` runs 0..149 in every slice, all `success`, every `output_tokens` = 256); median = `statistics.median`; tok/s = Σ output_tokens / (next level line − this level line), last level to "saved results".

| shown | mine | raw file + field / lines | match |
|---|---|---|---|
| vLLM c=1 throughput **30.2** | 30.1885 (38,400 / 1,272.009 s) | vllm JSON `requests[0:150].output_tokens`; log L48→L49 | yes |
| vLLM c=64 throughput **1,279.5** | 1,279.503 (38,400 / 30.0116 s) | vllm JSON `requests[750:900]`; log L53→L56 | yes |
| vLLM throughput **42×** | 42.38 | above | yes |
| vLLM c=1 p50 TTFT **41.2 ms** | 41.151 | vllm JSON `requests[0:150].ttft_ms` | yes |
| vLLM c=64 p50 TTFT **162.8 ms** | 162.827 | vllm JSON `requests[750:900].ttft_ms` | yes |
| vLLM TTFT **4.0×** | 3.957 | above | yes |
| SGLang throughput **42×** | 42.10 (1,271.07 / 30.1886) | sglang JSON; log L89→L90, L94→L97 | yes |
| SGLang c=1 p50 TTFT **69.9 ms** | 69.869 | sglang JSON `requests[0:150].ttft_ms` | yes |
| SGLang c=64 p50 TTFT **156.1 ms** | 156.122 | sglang JSON `requests[750:900].ttft_ms` | yes |
| **150** requests per level | 150 | `scenario_config.requests_per_level`; 900 = 6 × 150 | yes |
| **4** prompts | 4 (`long_001`–`long_004`) | `requests[].prompt_id`, both files | yes |
| **13 to 18** words | 13 / 18 | `requests[].prompt_len` (runner.py L433 `len(prompt.split())`), both files | yes |
| leaves-out "bench-ieb measured vLLM at **30.2**" | 30.1885 | as row 1 | yes |
| "1 to 64 concurrent" | [1,4,8,16,32,64] | `scenario_config.concurrency_levels`; log L48–53 `concurrency=` | yes |
| GPU "NVIDIA A10G, 23028 MiB", "one A10G" | log L7; script L120 `nvidia-smi --query-gpu=name,memory.total` (one line per GPU), docker `--gpus device=0` (L213) | yes |
| model meta-llama/Llama-3.1-8B-Instruct | log L36 (also L45, L77, L86); `run_metadata.model` in both JSONs | yes (link goes to the vLLM section's L36 only) |
| images v0.18.0-cu130 / v0.5.10.post1-cu130 | log L15, L16 | yes (see D-5) |
| engines | `engine_name` VLLMClient / SGLangClient; log L56 / L97 tie file to section | yes |

Provenance integrity:

| check | result |
|---|---|
| vendored vs raw (`git hash-object`, `cmp`) | log `96844d97…`, vllm JSON `86cb7ada…`, sglang JSON `1e25acf3…`: identical to `HEAD:` blobs in the bench-ieb checkout, to `gh api …/contents?ref=1c964318` shas, to the repo index, and to `_provenance.blobs` |
| badge URLs (anonymous curl) | 3 file URLs at `blob/1c964318…/` → 200; log renders 318 lines, not truncated; `#L7 #L15 #L16 #L36 #L48 #L53 #L89 #L94` exist |
| code links | `runner.py#L433` = `prompt_len=len(prompt.split())`; `base_client.py#L116-L132` = streamed-chunk loop to `output_tokens=len(tokens)` |
| live site | bundle `continuous-batching-_mAYYT_i.js` carries the same values and paths as src/data/bench-ieb.json |
| other `measured` uses | none outside ch3 (`grep kind="measured"`: index.mdx 189-191, 196-197, 225 only; KitchenSink is dev-only) |
| repo test | `pnpm vitest run tests/data/bench-ieb.test.ts`: 3/3 pass |

## Table B1: computed numbers (`review/computed.py`, raw llmsize configs + MATH.md at 5d5d029)

| quantity | mine | src/data | rendered | match |
|---|---|---|---|---|
| KV B/token Llama-3.1-8B bf16 (2·32·8·128·2) | 131,072 | 131,072 | "131,072 bytes … 128 KiB" (ch1) | yes |
| same, fp8 | 65,536 | 65,536 | — | yes |
| KV Phi-3.5-mini (MHA, 2·32·32·96·2) | 393,216 = 384 KiB | 393,216 | "384 KiB" | yes |
| KV Llama-3.2-3B (GQA, 2·28·8·128·2) | 114,688 = 112 KiB; ratio 3.43 | 114,688 | "112 KiB … 3.4×" | yes |
| KV Qwen2.5-7B bf16 / fp8 | 57,344 / 28,672 | same | "56 KiB" | yes |
| KV Llama-3.1-70B fp8 | 163,840 | 163,840 | — | yes |
| weights Llama-3.1-8B | 16,060,556,376 B = 14.958 GiB | same | "14.96 GiB", sandbox "15.0 GiB" | yes |
| weights Qwen2.5-7B | 15,231,271,888 B = 14.185 GiB | same | "14.185 GiB" | yes |
| Phi/Llama-3.2-3B weight ratio | 1.189 | — | "1.2×" | yes |
| usable VRAM A10G = 24 GiB·(1−1/16) | 24,159,191,040 = 22.500 GiB | same | "22.50 GiB" | yes |
| usable VRAM H100 = 80 GiB·(1−0.004) | 85,555,748,536.32 = 79.68 GiB | same | (fits 64 @ 8,192; 64.00 GiB; 4.3×) | yes |
| A10G tokens after Llama-8B weights | 61,787.7 → 61,787 | — | "61,787" (ch2) | yes |
| fits @4,096/8,192/32,768 (A10G) | 15 / 7 / 1 | — | "15 … 7 … 1" | yes |
| weights share | 66.48% | — | "66%" | yes |
| Qwen2.5-7B @16,384 bf16 / fp8 | 9 / 19 (19.005) | — | "9 … 19" | yes |
| Phi / Llama-3.2-3B fit @8,192 | 5 / 18 | — | "5 … 18" | yes |
| sandbox pool ⌊(22.5 GiB·0.92 − W)/(16·131,072)⌋ | 2,940 blocks = 47,040 tok = 5.742 GiB | — | "5.7 GiB (47,040 tokens)", "of 2940" | yes |
| roofline decode step, Llama-8B A10G, S=8, ℓ=1024: (W − 2·V·d + kv·8·1024)/(600e9·0.65) | 0.041240 s | 0.041240 | — | yes |
| Fig 3.1 prefill 1,024 compute (2P·C + F_attn)/(70e12·0.45) | 0.5308 s | — | "0.53 s", "531 ms" | yes |
| Fig 3.1 memory (prefill / decode) | 38.83 / 38.83 ms | — | "38.8 ms", "39 ms" | yes |
| Fig 3.1 decode compute | 0.518 ms | — | "0.5 ms" | yes |
| crossover | 76 tokens | — | "76" | yes |
| one-request decode rate | 25.75 tok/s | — | "25.8" | yes |
| MFU / MBU | 0.45 / 0.65 | roofline-ref | "0.45 … 0.65 computed" | yes |
| max context Llama-3.1-8B | 131,072 | 131,072 | sandbox "Up to 131,072" | yes |

## Table B2: llmsize gpus.json (5d5d029) vs vendor sources fetched 2026-10-15

| GPU | field | llmsize | source says | match |
|---|---|---|---|---|
| A10G | bf16 dense | 70 | AWS PDF (source_url): "BFLOAT16 Tensor Core 70 TF \| 140 TF*" | yes |
| A10G | bandwidth | 600 GB/s | "GPU Memory Bandwidth 600 GB/s" | yes |
| A10G | memory | 24 GiB, usable 22.5 | "24 GB GDDR6"; bench-ieb log 23028 MiB | yes |
| L4 | bf16 / BW / mem | 121 / 300 / 24 GiB | L4 datasheet AUG24: "BFLOAT16 242 teraFLOPS*" (sparse), "300 GB/s", "24GB" | yes (source_url dead at pin, D-7) |
| L40S | bf16 / BW / mem | 362.05 / 864 / 48 GiB | nvidia.com/…/l40s: "362.05 I 733*", "864GB/s", "48GB" | yes (dead at pin) |
| H100 SXM | bf16 / BW / mem | 989.4 / 3,352 / 80 GiB | nvidia.com/…/h100: "1,979 teraFLOPS*" (sparse), "3.35TB/s", "80GB" | yes (dead at pin) |
| M4 Max | BW / mem | 546 / 128 GiB | Apple newsroom: "up to 546GB/s", "128GB" | yes |
| M4 Max | bf16 | 11.6 | not in source_url; notes → arXiv 2502.05317 | see D-8 |

## Scope pass lists

**A (measured):** pass. Every number matches its raw file (table A). Vendored = raw = pinned blobs. All badge links resolve to the pinned paths and lines. GPU/model/image/engine attributions are backed by log L7, L36, L15-16, L56/L97. Open: D-2 (trend wording), D-3, D-4, D-5.

**B (computed):** pass on every sampled number (table B1), on GPU figures vs vendor sources (B2), and on usable VRAM for A10G/H100. PR #1: OPEN, `mergeCommit: null`. Note 12's rule keeps the pin at `5d5d029`; no move needed until it merges (D-7).

**C (sandbox, landing, glossary):**
- Landing: no technical claims. Pass.
- Sandbox lede and badges: pass (simulated vs computed labeled; "not from a GPU").
- Help text: cache.py L101 = `gpu_memory_utilization` default 0.92, supported. arg_utils L2866–2895: 1024/256 seqs and 16384/8192/2048 tokens by memory and A100, supported (S-3 units). arg_utils L3079–3087: chunking off → `max(max_model_len, budget)` only when unset, supported. SIM.md §7/§9.14/§12.1: content supports the help text (link 404s, D-1).
- Preset descriptions: `pnpm vitest run tests/chapters/sandbox.test.ts`: 10/10 pass. Each test asserts what its description says: chatbot (model/GPU, 1×128 p 1, pc lowers mean TTFT, static >10×); rag (8×1024 p 0.6, pc <0.5×); batch-summarize (burst, 64, first step >32 waiting, preemptions >0); agent-loop (4×2048 p 0.9, hit rate ≥0.9 over prompt tokens, on <1 s, off >60 s); paged-vs-contiguous (1,280 tokens, max and mean running higher); batching-basics (static >100×); long-prompt-stall (cp off p99 ITL >3×); shared-system-prompt (1×600 p 0.9, TTFT >8×, prefill tokens >5×); cache-pressure (12×256, 2,048-token pool, evictions >0, hit rate <½ of 1 group). The untested adjectives ("long prompts", "short requests", "wide spread") match the preset configs in `src/sim/workload.ts`.
- M8: no sandbox text says prefix caching saves nothing for unique prompts, so the exception is not needed there. PRODUCT.md L79-80 carries it. Pass.
- Glossary: supported: token, request, prompt, context length, layer, attention, query/key/value, KV cache, prefill, decode, attention head, KV head, head dim, MHA, GQA, bf16, fp8 (torch_utils L39–41 = `fp8*: torch.uint8`), GiB, weights, concurrency, slot, PagedAttention, block, logical/physical block, block table, page, contiguous allocation, reservation, max_model_len (model.py L217–219), internal/external fragmentation, reference count (apc L198), preemption (scheduler L1540–1562), kernel, throughput, prefix caching, step, batch, compute/memory-bound, request-level/iteration-level scheduling, static/continuous batching, bubble, TTFT, ITL, max_num_seqs, token budget, chunked prefill, generation stall, head-of-line blocking (L1114–1232 `break`), prefix, system prompt, block key, parent key, hit rate (kv_cache_manager L253–262 + stats preempted split), eviction, LRU (apc L202–206), radix tree, replica (bench-kvtt README L113–115). Not or partly supported: admission (S-1), free queue (S-4), cache hit (S-5), roofline (S-6), usable memory (S-7), block size (S-8), serving engine (S-10). Definitions match chapter usage (batch slot, hit rate = first admissions, KV wasted = allocated − tokens + unusable, as in `summary.ts:43-49`).

**D (SOURCES.md):**
- URLs: all 18 resolve. The doi.org link gives a 302 to dl.acm.org, which answers 403 to curl (bot block). Crossref confirms title and pages 611–626; GQA pp. 4895–4901 confirmed.
- Pinned commits exist (bench-ieb 2026-04-30, kvtt 2026-07-13, vllm 2026-10-01, llmsize 2026-10-02). All three benchmark/llmsize repos are public.
- Line references verified at the pins: apc L3, Note 1/Note 2 (sha256), L146–147, L198, L202–206. vllm-src torch_utils L39–41, cache.py L71/L101, arg_utils L2876–2895 (D-6). Note 9 block_pool L777–808 (unhashed → front, hashed → tail). Note 10 plan.ts @51b9746 `memoryUtilization ?? 0.9`. Note 1: pa doc says historical and `csrc/attention/attention_kernels.cu` is missing at the pin. Note 7: README L421 v0.18.0-cu130 and L539 "0.6.x"; log :7 :15–16 :36 :57 :98. Note 8: README L49 ~7.4 GB/s, RESULTS.md L41/L258 0.28 GB/s, §6b at L233. Note 12: 51b9746 a10g bf16 125, fp32 31.5, tf32 62.5; AWS PDF 70/35/35 dense. kwon2023 2.2×/4.3× (§6.2), 20.4–38.2%/96.3%, 2–4×. yu2022 §4.2 Alg. 1 max_tokens reservation. agrawal2024 §2.4, §4.1–4.3, Alg. 3, Fig. 5. bench-kvtt replica_lb L56–75, README L113–115, 4× A10G, vLLM 0.24.0, NIXL 1.3.1.
- Author claims: vllm-metal #549 merged 2026-07-25 and #550 merged 2026-07-28, both by varad-more; PRODUCT.md's descriptions match the PR titles. The site makes no author-credibility claim, and there is no About page (D-9).
