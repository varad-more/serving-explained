# Sources

Every technical claim on the site cites an id from this table. Code and docs are
pinned to a commit. Verified on 2026-10-01 against publisher pages, Crossref,
arXiv, and GitHub.

`scripts/gen-sources.ts` turns this table into `src/data/sources.json` for
`<SourceLink id="…">`. Edit this file, not the JSON.

| id | title | authors | venue or publisher | year | url | cited for | status |
|---|---|---|---|---|---|---|---|
| kwon2023 | Efficient Memory Management for Large Language Model Serving with PagedAttention | Woosuk Kwon, Zhuohan Li, Siyuan Zhuang, et al. | SOSP '23, ACM, pp. 611–626 | 2023 | https://doi.org/10.1145/3600006.3613165 | KV cache size per token (§3); reservation and fragmentation waste in prior systems (§3.1, Fig. 2–3); blocks, block tables, waste limited to the last block (§4.2–4.3); preemption by recompute or swap (§4.5); kernel overhead (§7.1); block size ablation, default 16 (§7.2); PagedAttention called "an attention algorithm" (§1); token states use 20.4–38.2% of KV memory in the Orca baselines vs. 96.3% in vLLM (§1, Fig. 2); Orca Max, Pow2, and Oracle baselines (§6.1); 2.2× and 4.3× more concurrent requests than Orca Oracle and Max (§6.2, Fig. 13a); 2–4× throughput at similar latency (abstract, §9); paging can hurt compute-bound workloads (§8). arXiv: https://arxiv.org/abs/2309.06180 | verified |
| yu2022 | Orca: A Distributed Serving System for Transformer-Based Generative Models | Gyeong-In Yu, Joo Seong Jeong, Geon-Woo Kim, Soojeong Kim, Byung-Gon Chun | USENIX OSDI '22, pp. 521–538 | 2022 | https://www.usenix.org/conference/osdi22/presentation/yu | Problem with request-level batching; iteration-level scheduling; selective batching (§3); per-request max-token reservation (§4.2, Alg. 1) | verified |
| zheng2024 | SGLang: Efficient Execution of Structured Language Model Programs | Lianmin Zheng, Liangsheng Yin, Zhiqiang Xie, et al. | NeurIPS 2024 (Advances in Neural Information Processing Systems 37), pp. 62557–62583 | 2024 | https://proceedings.neurips.cc/paper_files/paper/2024/hash/724be4472168f31ba1c9ac630f15dec8-Abstract-Conference.html | RadixAttention: radix tree over token sequences, LRU leaf eviction, ref-counted nodes, cache-aware scheduling (§3) — the alternative to block hashing. arXiv: https://arxiv.org/abs/2312.07104 | verified |
| agrawal2023 | SARATHI: Efficient LLM Inference by Piggybacking Decodes with Chunked Prefills | Amey Agrawal, Ashish Panwar, Jayashree Mohan, et al. | arXiv preprint | 2023 | https://arxiv.org/abs/2308.16369 | Where chunked prefill was first proposed | verified (preprint) |
| agrawal2024 | Taming Throughput-Latency Tradeoff in LLM Inference with Sarathi-Serve | Amey Agrawal, Nitin Kedia, Ashish Panwar, et al. | USENIX OSDI '24, pp. 117–134 | 2024 | https://www.usenix.org/conference/osdi24/presentation/agrawal | Prefill stalls decode (generation stalls) in prefill-first schedulers (§3.2); chunked prefill plus stall-free batching under a per-step token budget (§4.1–4.2, Alg. 3). arXiv: https://arxiv.org/abs/2403.02310 | verified |
| ainslie2023 | GQA: Training Generalized Multi-Query Transformer Models from Multi-Head Checkpoints | Joshua Ainslie, James Lee-Thorp, Michiel de Jong, Yury Zemlyanskiy, Federico Lebrón, Sumit Sanghai | EMNLP 2023 (main), ACL, pp. 4895–4901 | 2023 | https://aclanthology.org/2023.emnlp-main.298/ | Grouped-query attention: query heads split into groups that each share one key head and one value head; GQA-1 is MQA and GQA-H is MHA (§2.2); fewer KV heads shrink the KV cache and the data loaded per decode step (§1, §2.2). DOI: 10.18653/v1/2023.emnlp-main.298. arXiv: https://arxiv.org/abs/2305.13245 | verified |
| vllm-apc-doc | Automatic Prefix Caching (design doc) | vLLM project | vLLM docs | 2026 | https://github.com/vllm-project/vllm/blob/cfd54ca8819de923dcf555807298eaca34dd342d/docs/design/prefix_caching.md | V1 prefix cache: block hash = (parent hash, block tokens, extra keys); only full blocks cached; free queue with LRU eviction, finished blocks freed in reverse order; ref counts. Rendered: https://docs.vllm.ai/en/latest/design/prefix_caching/ | verified |
| vllm-pa-doc | Paged Attention (design doc) | vLLM project | vLLM docs | 2026 | https://github.com/vllm-project/vllm/blob/cfd54ca8819de923dcf555807298eaca34dd342d/docs/design/paged_attention.md | History only: how the original paged attention kernel read keys and values from blocks. The doc says it no longer describes current code. Rendered: https://docs.vllm.ai/en/latest/design/paged_attention/ | verified, legacy |
| vllm-src | vLLM source code | vLLM project | GitHub vllm-project/vllm | 2026 | https://github.com/vllm-project/vllm/tree/cfd54ca8819de923dcf555807298eaca34dd342d | Current V1 scheduler and KV cache manager behavior. docs/SIM.md lists the exact files and lines. | verified |
| llmsize-math | The math (llmsize docs/MATH.md) | Varad More | GitHub varad-more/llm-calculator | 2026 | https://github.com/varad-more/llm-calculator/blob/51b97463fb9bd91b7688325280c2d9da1d1561a9/docs/MATH.md | Every `computed` number: KV bytes per token, weight bytes, usable VRAM, roofline throughput, and the MBU/MFU assumptions | verified |
| bench-ieb | inference-engine-benchmark-system | Varad More | GitHub varad-more/inference-engine-benchmark-system | 2026 | https://github.com/varad-more/inference-engine-benchmark-system/tree/1c964318addd2c742b53b0f0cf4a2cad791cace9 | `measured` numbers for vLLM vs. SGLang on 1x A10G: TTFT, TPOT, throughput ramps, long context, decode length sweeps. Cite the exact result file, never the README. | verified, see notes |
| bench-kvtt | kv-transfer-tax | Varad More | GitHub varad-more/kv-transfer-tax | 2026 | https://github.com/varad-more/kv-transfer-tax/tree/56b5ab5df85d5881d9dad76eb6f2d44bf833a40c | `measured` numbers for disaggregated vs. colocated serving of Llama-3.1-8B on 4x A10G (vLLM 0.24.0, NIXL 1.3.1), including a `max-num-batched-tokens` sweep. Cite the exact result file. Also cited for code: `proxy/replica_lb.py` L56–75 routes by least-outstanding or round-robin only, with no prefix awareness (chapter 4 teaser). | verified, see notes |

## Notes

1. **vllm-pa-doc is legacy.** It calls itself a historical document based on
   the paper. The kernel file it names no longer exists at the pinned commit.
   Cite it only for history. Cite vllm-src for current behavior.
2. **Prefix caching: cite vllm-apc-doc, not kwon2023.** kwon2023 §4.4 describes
   manually reserved shared prefixes with copy-on-write. Automatic, hash-based
   caching is described in vllm-apc-doc.
3. **Kernel overhead (kwon2023 §7.1)** is measured against FasterTransformer's
   kernel, not a generic contiguous kernel. The paper names three causes:
   block-table access, extra branches, and variable sequence lengths.
4. **RadixAttention vs. block hashing.** zheng2024 does not discuss vLLM's
   block-hash design, and it compares against vLLM v0.2.5, before automatic
   prefix caching. Any contrast between the two is our synthesis from
   zheng2024 §3 and vllm-apc-doc. Say so where we draw it.
5. **Chunked prefill came from agrawal2023**, not agrawal2024. Cite agrawal2024
   for stall-free batching and the token budget.
6. **llmsize vs. vLLM on shared prefixes.** MATH.md "KV token count" stores a
   shared prefix once, as ⌈p/B⌉·B tokens. vLLM shares only full blocks, so a
   partial last prefix block is stored once per sequence. The gap is at most one
   block per sequence. Open question for the author (see tasks/todo.md).
7. **bench-ieb.** Its README names two vLLM versions (v0.18.0-cu130 in a table,
   "0.6.x" in prose). The result JSONs do not record GPU or engine version.
   `prefix_sharing_benefit` prompts are 56–59 tokens and have no cache-off run,
   so they cannot back a measured prefix-caching speedup.
   - **Exception:** the `results_concurrency64/` runs are traceable through the
     committed log `logs/phase2_resume_20260418T042547.log`. It records the GPU
     (A10G, `:7`), the image tags (`:15–16`), the model (`:36`), and the result
     filenames (`:57`, `:98`).
   - The main `results/` matrix has no such log.
8. **bench-kvtt.** The README headline (~7.4 GB/s) disagrees with RESULTS.md
   §6b, which calls that number the wrong one to quote (~0.28 GB/s end to end).
   Use RESULTS.md's "Where each number comes from" table and the result files.
9. **vllm-apc-doc vs. vllm-src on free order.** The doc says every freed block
   goes to the tail of the free queue, in reverse order. The code at `cfd54ca8`
   (`BlockPool.free_blocks`, block_pool.py L777–808) sends unhashed blocks to
   the front and hashed blocks to the tail. docs/SIM.md follows the code. The
   author's sign-off is pending (SIM.md Q8).
10. **llmsize vs. vllm-src on memory utilization.** llmsize's planner defaults
    `memoryUtilization` to 0.9 for vLLM (`packages/core/src/plan.ts` at 51b9746).
    vLLM's default `gpu_memory_utilization` is 0.92 (`vllm/config/cache.py` L101
    at `cfd54ca8`). The KV cache chapter does not use either value, but its
    callout links to llmsize's planner.
11. **kwon2023 numbers come from the PDF.** The arXiv HTML drops figures such as
    "2.2×" and "1.7×–2.7×" from §6.2. Read them from the PDF text. Fig. 2's
    values (20.4, 26.8, 38.2, and 96.3% token states) come from the PDF's figure
    labels. Cite only the token-state shares, not the per-category split, which
    was not checked against the rendered figure.
