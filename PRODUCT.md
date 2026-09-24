# serving-explained — product

## Audience
Developers who call LLM APIs or run local models. They know what a transformer
is at a high level. They have never read vLLM's source.

We assume they know tokens, prompts, and that a GPU has limited memory.
We do not assume CUDA, operating-system paging, or scheduler design.

## Promise
After each chapter, a reader can explain one mechanism in two sentences.
They can also predict how one knob changes the outcome before they run the sim.

Every "knob to predict" below is a prose claim about the simulation. Each one
gets a preset and a test, per the truth rules in CLAUDE.md.

## First release
Four chapters plus a sandbox. Each chapter adds one mechanism to the same toy
engine, so the reader sees the engine change one step at a time.
Source ids resolve in docs/SOURCES.md.

### 1. KV cache
- **Learning objective:** say that the KV cache stores keys and values for every
  token in every layer, and that it grows linearly with tokens. Say that it, not
  compute, usually limits how many requests a GPU can serve at once. Estimate it
  for a model.
- **Knob to predict:** context length. Longer contexts mean fewer requests fit
  in the same memory.
- **Misconception corrected:** "Model weights are what fill GPU memory." Weights
  are fixed. The KV cache is what grows with context and concurrency.
- **Sources:** kwon2023, ainslie2023, llmsize-math.

### 2. Paged attention
- **Learning objective:** explain that the engine splits each request's KV cache
  into fixed-size blocks that can sit anywhere in memory, tracked by a block
  table. Memory is claimed one block at a time, so waste stays within the last
  block of each request.
- **Knob to predict:** block size. Bigger blocks leave more empty slots in each
  request's last block. Smaller blocks mean more table entries to track.
- **Misconception corrected:** "PagedAttention is a faster attention algorithm."
  It is a memory layout. More requests fit in a batch, which raises throughput.
  The attention kernel itself runs slower, partly from block-table lookups.
- **Sources:** kwon2023, vllm-pa-doc.

### 3. Continuous batching
- **Learning objective:** explain that the scheduler rebuilds the batch at every
  model step. Finished requests leave right away, and waiting requests join
  right away.
- **Knob to predict:** spread of output lengths. The wider the spread, the more
  slots static batching holds for finished requests, and the bigger the gap.
- **Misconception corrected:** "Batching means each request waits for the
  slowest one in its batch." That is request-level batching. Iteration-level
  scheduling removes the wait.
- **Sources:** yu2022, kwon2023. Prefill stalling decode is listed under "What
  this leaves out" and points to agrawal2024 for a later chapter.

### 4. Prefix caching
- **Learning objective:** explain that when requests share a prompt prefix, the
  engine reuses KV blocks it already computed and skips that part of prefill.
  Only an exact token match from the first token counts, in whole blocks.
- **Knob to predict:** shared prefix length. A longer shared system prompt means
  fewer prefill tokens per request and a shorter time to first token.
- **Misconception corrected:** "Prefix caching stores responses, so a repeated
  prompt returns instantly." It stores computed prompt state, not output.
  Every output token is still generated.
- **Sources:** vllm-apc-doc, zheng2024.

### Sandbox
- **Learning objective:** combine all four mechanisms on a workload preset, and
  predict which one matters most before pressing play.
- **Knobs:** all chapter knobs, plus workload presets.
- **Misconception corrected:** "Each optimization helps every workload." Each
  one targets a workload shape. Prefix caching saves nothing when prompts
  share no prefix.
- **Rule:** the sandbox makes no claims beyond its preset descriptions, and each
  of those is tested.

## Non-goals
- Not a benchmark. Simulated numbers show mechanisms, not real-world speed.
- Not a capacity planner. For "does this model fit on this GPU," link to
  [llmsize](https://varadmore.me/llm-calculator/).
- Not a production simulator. The engine models a few mechanisms on purpose,
  and each chapter lists what it leaves out.
- No real model inference in the browser: no weights, no GPU kernels.

## Author credibility
The site may point to these, with links, and claim nothing beyond what they show.

- Merged contributions to [vllm-project/vllm-metal](https://github.com/vllm-project/vllm-metal):
  [#550](https://github.com/vllm-project/vllm-metal/pull/550) wires attention
  sinks through the paged attention kernel;
  [#549](https://github.com/vllm-project/vllm-metal/pull/549) fixes a tokenizer
  patch ordering issue. Both merged July 2026.
- [varad-more/inference-engine-benchmark-system](https://github.com/varad-more/inference-engine-benchmark-system):
  vLLM vs. SGLang benchmarks on NVIDIA A10G. A source for `measured` badges.
- [varad-more/kv-transfer-tax](https://github.com/varad-more/kv-transfer-tax):
  disaggregated prefill/decode measurements with vLLM and NIXL on 4x A10G.
  A source for `measured` badges.
- llmsize ([varad-more/llm-calculator](https://github.com/varad-more/llm-calculator),
  `docs/MATH.md`): the sizing math behind every `computed` number.

Credibility lives on an About page and in badge links, not in chapter prose.
Use the repos' own facts without adjectives. Each `measured` number links to
the exact committed result file.
