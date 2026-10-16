# Launch-audit review: chapter 3 (Continuous batching) and chapter 4 (Prefix caching)

Read-only review, 2026-10-15. Live text: `SCRATCH/text/{continuous-batching,prefix-caching,glossary}.txt`.
Sources: vLLM `cfd54ca8` (verified `git log`), bench-kvtt `56b5ab5`, bench-ieb `1c96431`, llmsize `5d5d029`, paper text in `SCRATCH/sources`.
Line refs: `cb.mdx` = src/chapters/continuous-batching/index.mdx, `pc.mdx` = src/chapters/prefix-caching/index.mdx, `gl.ts` = src/chapters/glossary.ts, `cb.txt`/`pc.txt` = rendered text.

**Totals: 0 blocker, 3 major, 18 minor.**

## Counts

| chapter | scope | supported | partly | not supported | no source |
|---|---|---|---|---|---|
| 3 Continuous batching | page text (prose, captions, readouts, callouts, leaves-out, go deeper) | 32 | 9 | 0 | 1 |
| 3 | glossary popovers used (25; 3 are our names/definitions, no source needed) | 18 | 4 | 0 | 0 |
| 4 Prefix caching | page text | 41 | 2 | 0 | 1 |
| 4 | glossary popovers used (20; 1 definitional) | 16 | 2 | 1 | 0 |

Simulated `<Claim>`s are checked against tests (section "Claims vs tests"), not counted above.

## Numbers

- **Computed/simulated, Fig 3.1 (Llama-3.1-8B, A10G).** `src/data/gpus.json` a10g-24 `bf16Tflops: 70`; llmsize `5d5d029:data/gpus.json` bf16 70. Recomputed with SIM.md §5 and `src/data/models.json` (P 8,030,261,248; P_emb 525,336,576; B_w 16,060,556,376; 131,072 B/token), MFU 0.45, MBU 0.65, 600 GB/s:
  - prefill 1,024: compute 0.5308 s (page 0.53 s / 531 ms), memory 38.83 ms (38.8 ms / 39 ms). OK.
  - decode: compute 0.53 ms (0.5 ms), memory 38.83 ms. OK. Decode rate 25.75 tok/s (page 25.8). OK.
  - crossover: 75 tokens memory-bound (38.29 < 38.51 ms), 76 compute-bound (38.80 > 38.51 ms). Page 76. OK. (At 125 TFLOPS it would be ~135.)
- **Quoted-from-source numbers:** max_num_seqs 256 / budget 2048 (arg_utils.py L2890, L2893–2894), budget raised to max_model_len (L3083–3088), sha256 (apc-doc L25), full-hit cap (kv_cache_manager.py L295), all match.
- **Badges (DoD 3):** every figure 3.1–3.7 and 4.1–4.6, every claim paragraph, both CheckYourself answers, and the leaves-out lines carry `simulated`/`computed`/`measured`. The bench-ieb callout uses `measured` throughout and is never presented as sim output; the sim sentences say "In this sim". Exceptions: C4-6 (numbers typed by hand inside a Claim) and C3-1 note (concurrency levels "1 to 64" typed by hand).
- Not checked here: the bench-ieb callout values (another reviewer).

## Claims vs tests

`pnpm vitest run tests/chapters/continuous-batching.test.ts tests/chapters/prefix-caching.test.ts`: **2 files, 41 tests, all pass** (ch3 17 claim ids + meta-test; ch4 22 + meta-test).

Every test asserts what the prose says, at the prose's strength (strict monotonicity where the prose says "at every step", the stated thresholds 25%, 20×, 5%, 1%, exact values where the prose gives exact counts such as 54/9/37,800 and 24.0/46.9/2.4/13.2), with two gaps:
- `no-free-setting` (cb.mdx L161): prose generalizes "the budget matters only when prompts are long"; the test shows only that budgets 512–8,192 give identical runs on batching-basics. See C3-11.
- `refcount-counts-sharers` (pc.mdx L69): prose renders "up to 8"; the test asserts `most >= 4`. The 8 is data-rendered (figures.tsx `mostSharers`), so not wrong; see C4-8.

## Findings: chapter 3

**C3-1 (major).** cb.mdx L187 (cb.txt L746): "A real engine shows a related trade-off: as more requests run at once, throughput and median TTFT both rise." Also cb.mdx L181 (cb.txt L742): "On a real engine, running more requests at once raises throughput, and median TTFT rises with it".
- Cited: bench-ieb `results_concurrency64/llama-3-1-8b-instruct/throughput_ramp_extended_{vllm_1776486559,sglang_1776488646}.json`.
- Source says: median TTFT per level (1, 4, 8, 16, 32, 64), 150 requests each: vLLM 41.2, 99.6, **91.2**, 93.7, 124.3, 162.8 ms; SGLang 69.9, **68.8, 64.0**, 87.1, 125.7, 156.1 ms. SGLang's median TTFT falls from 1 to 8; vLLM's falls from 4 to 8. The unqualified "as more requests run" is contradicted. Only the endpoint sentence (L189, "from 1 to 64") is right.
- Fix: "from 1 to 64 requests at once, throughput and median TTFT both rise" in both sentences. Optional: render 1 and 64 via `<Num kind="measured">` (they are typed by hand at L189).

**C3-2 (major).** cb.mdx L102–103 (cb.txt L318): "Once admitted again, it computes its prompt and every token it had made before its next token. vLLM V1 recomputes this way; it no longer swaps…". Same in glossary `preemption` (gl.ts L299–304: "vLLM V1 computes its tokens again later").
- Cited: vllm-src docs/usage/v1_guide.md L160–186; scheduler.py L1540–1562.
- Source says: v1_guide L160, L185–186 says only that GPU-CPU swapping was removed. scheduler.py L1558–1562 frees the blocks (hashed ones keep their hash, block_pool.py L795–801) and sets `num_computed_tokens = 0`. On re-admission, `get_computed_blocks` (kv_cache_manager.py L286–300) finds the request's own cached blocks. Prefix caching is on by default (arg_utils.py L2964–2965). So under vLLM defaults a re-admitted request does *not* recompute everything. Chapter 4 says exactly this (pc.mdx L142–143). Chapter 3's runs have prefix caching off (src/sim/workload.ts L181, L203), but the chapter never says so.
- Fix: "With prefix caching off, as in this chapter's runs, it computes… vLLM V1 recomputes rather than swaps (v1_guide L185–186); with its default prefix caching, the request can reuse its own cached blocks (chapter 4)." Add a leaves-out line: "Prefix caching: off in every run here; vLLM turns it on by default (arg_utils.py L2964–2965)." Mirror the condition in the glossary entry.

**C3-3 (minor, m9 residual).** cb.mdx L79 (cb.txt L181): "each step, it schedules running requests first, then waiting ones (scheduler.py L563–684)".
- Source: L565–574 (no phases) and L629 "First, schedule the RUNNING requests" are in range. The waiting loop starts at L873–874 ("Next, schedule the WAITING requests", `if not preempted_reqs`), outside the range.
- Fix: cite "L563–684, L873–895". Also apply to SIM.md [S-schedule] if it means both halves.

**C3-4 (minor).** cb.mdx L114 (cb.txt L431): "A token budget caps the tokens one step may process (Agrawal et al. 2024 §4.1)". Same in glossary `token-budget` (gl.ts L430–435, §4.1).
- Source: §4.1 (agrawal2024.txt L780–814) introduces chunked prefills; the per-batch token budget is defined in §4.2 ("calculates the budget of maximum number of tokens that can be executed in a batch", L823–826; Alg. 3 lines 2, 14) and sized in §4.3.
- Fix: cite §4.2 (or §4.2–4.3).

**C3-5 (minor, M5 residual).** cb.mdx L133 and L230 (cb.txt L548, L790): budget 2,048 and max_num_seqs 256 "on GPUs under 70 GB (arg_utils.py L2886–2895)".
- Source: L2886–2895 is the `else:` body only. The condition is at L2866 (≥160 GiB) and L2876 (`>= 70 * GiB_bytes and "a100" not in device_name`), outside the cited range. The threshold is 70 GiB (~75.2 GB), and A100-80GB also lands in the else branch. Chapter 4 cites L2866–2895 and SOURCES.md says L2876–2895, so there are three different ranges.
- Fix: cite L2866–2895 in both places. Optionally say "under 70 GiB, or any A100".

**C3-6 (minor).** cb.mdx L28 (cb.txt L13): "In each step, every request it runs computes some prompt tokens or makes one output token (Yu et al. 2022 §3)". Same in glossary `engine-step` (gl.ts L328–333).
- Source: yu2022 §3 (yu2022.txt L536–541, L576–579): an iteration processes *all* input tokens of a request in its initiation phase, and every scheduled request returns one output token per iteration, including the initiation iteration. "Some prompt tokens" is chunked prefill (agrawal2023/2024), not Orca. "Or" reads as exclusive, but the last prefill chunk also produces a token.
- Fix: "computes its prompt (or, with chunking, part of it) or makes one output token (Yu §3; Agrawal 2024 §4.1)". Or mark the generalization as ours.

**C3-7 (minor).** Glossary `roofline` (gl.ts L362–367): "the longer of compute time … and memory time" (llmsize-math Throughput).
- Source: MATH.md Throughput (5d5d029, L322–346) gives separate decode (memory) and prefill (compute) formulas and no max(). The max form is agrawal2024 §3.1 (agrawal2024.txt L489–491, "T = max(Tmath,Tmem)") and SIM.md §5.
- Fix: cite agrawal2024 §3.1 (and SIM.md §5).

**C3-8 (minor).** cb.mdx L225 (cb.txt L784): "a roofline that assumes 0.45 compute use and 0.65 memory-bandwidth use (llmsize docs/MATH.md Throughput)".
- Source: MATH.md Throughput names MBU/MFU and links their sources (L345–346) but never states 0.45 or 0.65. The values come from llmsize data (`src/data/roofline-ref.json` `mfu_prefill` 0.45, `mbu_decode` 0.65, provenance 5d5d029). The `computed` badge is right; the section cite is weak.
- Fix: link the llmsize file and line that defines the constants, or the roofline-ref provenance.

**C3-9 (minor; overlaps the bench-ieb reviewer).** cb.mdx L197 (cb.txt L755–756): "4 short ones of 13 to 18 words, reused in turn (runner.py L433)".
- Source: bench-ieb runner.py L433 is `prompt_len=len(prompt.split())`. It supports "words" only. Reuse in turn is `cycle_prompt_pack` at L535.
- Fix: cite L433 and L535.

**C3-10 (minor).** cb.mdx L199 (cb.txt L756): "Each level's throughput includes the time its last requests took to finish."
- No source link.
- Fix: link the code that sets the per-level wall time (runner.py L488–492, or the log timestamps AUDIT.md used).

**C3-11 (minor, claim broader than test).** cb.mdx L161 (cb.txt L691): "And the budget matters only when prompts are long: on Figure 3.2's short prompts, every budget from 512 up gives the same results."
- Test `no-free-setting` L370–375 shows only that 512–8,192 give identical runs on batching-basics (max_num_seqs 8, prompts ≤256). With more requests at once, or budgets under 256, the budget binds on short prompts too.
- Fix: "Here, the budget matters only for the long prompts: …".

**C3-12 (minor, leaves-out incomplete).** cb.mdx L226 (cb.txt L786): "Real KV memory: Figure 3.4's pool is a toy (SIM.md §9.14)."
- SIM.md §7 L623–624: Figs 3.2–3.3 use 2,000 blocks, "a toy pool large enough that memory never binds". L632–635: Figs 3.5–3.7 use 3,861 blocks, llmsize's free KV "without engine overheads or the 0.92 holdback", which §9.14 says overstates vLLM's real pool.
- Fix: one line covering all three pools. Add the prefix-caching-off line from C3-2.

**C3-13 (minor, leaves-out framing).** cb.mdx L231 (cb.txt L791): "Any order but first come, first served, so a request that cannot start holds up the queue: head-of-line blocking (SIM.md §9.10)."
- Implies head-of-line blocking is our simplification. vLLM's default FCFS also `break`s at the head (scheduler.py L1116–1123, L1225–1232; SIM.md §8 "head-of-line blocking … same"). The glossary entry itself cites that vLLM code.
- Fix: "Any order but first come, first served. Under it, as in vLLM's default, a request that cannot start holds up the queue…".

## Findings: chapter 4

**C4-1 (major, wrong line reference).** Glossary `admission` (gl.ts L528–533), popover used at pc.mdx L63 (pc.txt L181): "The step at which the scheduler moves a waiting request into the running batch and gives it blocks (vLLM source code v1/core/sched/scheduler.py L563–684)."
- Source: L563–684 is `schedule()`'s header and the RUNNING-request loop (L629 "First, schedule the RUNNING requests"). Admission of waiting requests is L873–1260: L873 "Next, schedule the WAITING requests", L894 `max_num_active_reqs`, L1205–1232 `allocate_slots` and `break`, and L1254–1258 "Record at admission".
- Fix: cite `scheduler.py L873–1260` (or L873–895, L1205–1258).

**C4-2 (minor).** pc.mdx L146 (pc.txt L360): "its cascade attention, which can share those reads, is off unless enabled (config/model.py L284–290)". Same at pc.mdx L191 (pc.txt L464).
- Source: L284–290 supports "off unless enabled" (`disable_cascade_attn: bool = True`). It says nothing about what cascade attention does ("does not change the mathematical correctness"). The shared-prefix behavior lives in the backend (e.g. v1/attention/backends/flash_attn.py L871 `use_cascade = common_prefix_len > 0`).
- Fix: add that backend citation, or mark the description as ours.

**C4-3 (minor).** pc.mdx L192 (pc.txt L465): "vLLM's asynchronous scheduling, which shifts TTFT; ours plans each step after the last ends (SIM.md §9.3)".
- Source: SIM.md §9.3 says only that async plans one step ahead. "Shifts TTFT" is unsourced. Chapter 3's version cites async_scheduler.py; this one does not.
- Fix: drop "which shifts TTFT" or mark it as our reasoning. Add the async_scheduler.py SourceLink as chapter 3 does.

**C4-4 (minor, no source).** pc.mdx L171 (pc.txt L443): "A large service runs several replicas of a model."
- No citation.
- Fix: cite bench-kvtt README L113–115 ("N independent tp1 servers"), or fold it into the "Our reasoning" sentence.

**C4-5 (minor, paraphrase).** pc.mdx L28 (pc.txt L13): "Different requests often share common parts, such as a system prompt…" vs zheng2024 §3 (zheng2024.txt L203–204): "different program instances often share some common parts (e.g., system prompts)". Five of the first seven words match.
- Fix: reword, e.g. "Many requests open with the same tokens, such as a system prompt…".

**C4-6 (minor, DoD 3).** pc.mdx L49 (pc.txt L48), inside `<Claim id="one-token-changes-chain">`: "We checked our engine's keys for every token of a 64-token prompt at block sizes 4, 8, and 16."
- 64, 4, 8, and 16 are typed by hand with no `<Num>` or badge. They are duplicated as literals in the test (prefix-caching.test.ts L180–181), so prose and test can drift.
- Fix: export the constants from presets.ts, use them in the test, and render them with `<Num kind="simulated">`.

**C4-7 (minor).** Glossary `free-queue` (gl.ts L521–526): "Allocation takes blocks from its head; … (block_pool.py L777–808)".
- Source: L777–808 is `free_blocks` (where freed blocks go). Allocation from the head is `get_new_blocks` L669–703 (`popleft_n`, L684), also apc-doc L147.
- Fix: cite "block_pool.py L669–703, L777–808".

**C4-8 (minor, test gap).** `refcount-counts-sharers` (prefix-caching.test.ts L271) asserts `most >= 4`; the prose (pc.mdx L69, pc.txt L184) says "up to 8 at once here".
- The number is data-rendered, so the page is not wrong. Still, the test would not catch a regression to 5.
- Fix: assert `most` equals `F.hit.mostSharers`, or `maxNumSeqs`.

## Checks with no problem found (both chapters)

- Orca claims (yu2022 §3, yu2022.txt L441–466, L502–516): request-level scheduling, no mid-batch joins, no early leave, extra compute for finished requests, results at batch end, iteration-level scheduling, slot freed after the current iteration. All supported.
- Agrawal 2024: §1/§3.1 compute- vs memory-bound and Takeaway-2; §2.4 TTFT/TBT (glossary notes TBT); §3.2 generation stalls, including Orca-style hybrid batches; §3.3 pipeline bubbles; §4.3 lower utilization from small chunks, profiling, and dependence on SLO, parallelism, and hardware. All supported.
- vLLM: preemption victim `running[-1]`, prepended to waiting (scheduler.py L772, L804, L1558–1582); chunking off → `break` if the prompt exceeds the budget (L1116–1123); unset budget raised to `max(max_model_len, default)` only when unset (arg_utils.py L3079–3088); hash = parent + tokens + extra keys, full blocks only, sha256 (apc-doc L15–25); touch / refcount++ (L146); pop head + evict (L147, L204–208); first-miss stop (single_type_kv_cache_manager.py L797–802); hit stats on first admission with preempted counters apart (kv_cache_manager.py L253–262, metrics/stats.py L132–143); full-hit cap (L289–295); unkeyed to front, keyed to tail (block_pool.py L795–806); cascade off by default (model.py L284). All supported.
- RadixAttention (zheng2024 §3, zheng2024.txt L218–236, L377–394): radix tree, one-token pages, LRU leaf eviction, refcount, shared pool, longest-prefix-first scheduling. Supported; the contrast with vLLM is marked "Our comparison" (SOURCES note 4).
- bench-kvtt replica balancer: replica_lb.py L56–75 (round-robin L62–69, least-outstanding L70–71); README L113–115 "N independent tp1 servers". The inference is marked.
- Every "What this leaves out" line maps to a SIM.md §9 entry or a source. Ch3: §9.20, §9.16, §4.1, §9.19, agrawal §4.3, §9.2, llmsize, §9.14, §9.6, §9.17, §9.3, §8 defaults, §9.10, §9.1, §9.13. Ch4: §9.8, §9.5, §9.10, model.py, §9.3, §9.1, §9.13, §9.14, §9.2 (×2), §9.9, §9.12. None contradicts the engine, apart from the framing in C3-13.
- "Go deeper" links SOURCES ids only. kwon2023 §4.4 (shared prefix, copy-on-write, kwon2023.txt L878–887) and §4.5 (L902+) are supported.

## Audit-1 items, re-checked on the live text

| item | status | evidence |
|---|---|---|
| M5 | **fixed** (minor residual C3-5) | cb.txt L548 and L790, pc.txt L468: "256 on GPUs under 70 GB". arg_utils.py L2876–2885 gives 1024 at ≥70 GiB on non-A100; L2886–2895 gives 256 (and 2048 for the server) otherwise. Residual: ch3 cites L2886–2895, which omits the L2876 condition; the code uses GiB; A100-80GB also gets 256. |
| M6 | **fixed** | pc.mdx L117 / pc.txt L289 cites vllm-src block_pool.py L777–808 (verified L795–806: unhashed `prepend_n`, hashed `append_n`). vllm-apc-doc L198 is cited only by glossary `reference-count`, for "returns to the free queue only at 0", which L198 supports. Not regressed. |
| M7 | **fixed** | Test `longer-prefix-saves-more` (prefix-caching.test.ts L310–333) asserts a strictly rising mean first-admission hit per sharing request and a strictly rising TTFT gap (off − on) over 0/100/250/600/1000. Prose pc.mdx L92 / pc.txt L255 says the same. Passes. |
| M8 | **fixed** | pc.txt L358: "One exception: a preempted request can hit its own blocks…", cites scheduler.py L1540–1583 and block_pool.py L777–808 (L1558 free → L795–801 keeps the hash). Test `self-hit-after-preemption` passes. PRODUCT.md L70–71 and L80 carry the exception. Chapter 3's opposite wording is C3-2. |
| M9 / m16 | **fixed** | src/data/gpus.json a10g-24 bf16 70; llmsize 5d5d029 bf16 70. Recomputed: prefill 0.531 s, memory 38.8 ms, decode compute 0.5 ms, crossover 76 (cb.txt L17, L52, L691). |
| m9 | **fixed** (minor residual C3-3) | cb.txt L181 "schedules running requests first, then waiting ones"; no "decodes first" or phase claim remains. The cited L563–684 includes the no-phase note (L565–574) but not the waiting loop (L873). |
| m10 | **fixed** | cb.txt L431 and readout L441: "as vLLM does when no budget is set". arg_utils.py L3079–3088 raise it only when `orig_max_num_batched_tokens is None` and chunking is off. |
| m11 | **partly** (C3-1, major) | cb.txt L746–747 "from 1 to 64 concurrent requests" is present. The framing at cb.txt L742 and the callout opener at L746 are unqualified, and bench-ieb medians are non-monotone (vLLM 99.6→91.2 ms at 4→8; SGLang 69.9→68.8→64.0 ms at 1→4→8). |
| m12 | **fixed** | pc.txt L263 cites kv_cache_manager.py L289–295 (L295 `max_cache_hit_length = request.num_tokens - 1`; L289–294 note block-aligned recompute). Test `full-hit-cap` asserts 48 = 64 − 16. |
| m13 | **fixed** | No "never-keyed" anywhere in src/chapters/prefix-caching. Live text says "without a key" / "no key" (pc.txt L289, L226), which is equivalent to "unkeyed" and covers evicted-then-refilled blocks. |
| m14 | **fixed** | pc.txt L443: "Our reasoning: …" and "that last part is our inference". replica_lb.py L56–75 routes round-robin (L62–69) or least-outstanding (L70–71), with no prefix input. README L113–115: "runs N independent tp1 servers". |
| m17 | **fixed** (minor C3-12, C3-13) | Ch3: §9.2 (cb.txt L783), §9.6 (L787), §9.17 (L788), batching timeout §9.19 (L781). Ch4: §9.9 (pc.txt L471), §9.12 (L472); no "hit rate as in vLLM" line. |
| m18 | **fixed** | Ch3: `chunking-spreads-stalls` sits in a step ("Rare stalls hide from p99", cb.mdx L149; renumbered from the plan's step 5). Misconception id `bigger-batches-cost-latency` (cb.mdx L180; test L378–402). `no-free-setting` has assertions (test L317–376), shared by two Claims in its step. Ch4: `caching-lowers-ttft-and-prefill` in step 3 (pc.mdx L71, pc.txt L185; test L214–221). |
