# r/LocalLLaMA: fact sheet

This is not a draft. The subreddit bans primarily LLM-generated copy, so you
write the post. This sheet holds the rules, the facts with their links, and a
suggested angle and structure.

## The rules

Reddit blocked automated reads on 2026-10-16, and the Wayback Machine was rate
limited, so none of these could be re-read today. They come from Wayback
copies of old.reddit.com/r/LocalLLaMA dated 2026-07 and 2026-08, read on
2026-10-01. **Read the rules yourself, logged in, before posting:**
https://www.reddit.com/r/LocalLLaMA/about/rules

- Posts must be about LLMs.
- Self-promotion stays under 10% of your activity on Reddit, and you disclose
  your affiliation: say it is your project.
- Rule 3: "Completely/primarily LLM generated copy, code is not allowed."
  - This covers your post text, so write it yourself.
  - It may also cover code. This repo was written with an AI coding
    assistant, and its commits say so ("Co-Authored-By: Claude"). Read the
    rule's current wording and decide; if you post, say so plainly.
- Flairs included Discussion, Tutorial | Guide, and Resources. Whether a flair
  is required was not verified.

## Suggested angle

Practical, from a question many readers have asked themselves: why does an
8B model fit only a few requests on a 24 GB card?

- Llama-3.1-8B on an A10G, a 24 GB datacenter card. ECC leaves 22.50 GiB
  usable, and the weights take 14.96 GiB (`computed` with llmsize,
  [chapter 1, Figure 1.5](https://varadmore.me/serving-explained/kv-cache/)).
- Consumer cards such as the 3090 and 4090 are not in the site's GPU list.
  They have no ECC, so they keep the full 24 GB (the A10G entry's note).
  Say so before readers ask.
- Each token of context needs 128 KiB of KV cache in bf16. At 8,192 tokens
  per request, at most 7 requests fit; at 4,096, 15; at 32,768, 1.
- An fp8 KV cache halves the KV per token to 64 KiB, so 15 fit at 8,192
  tokens.
- These are upper bounds. vLLM keeps 8% of GPU memory back by default
  (`gpu_memory_utilization` 0.92) and needs room for activations and CUDA
  graphs. The figure's own note says so.
- Then the fix vLLM uses: paged attention cuts the memory wasted by reserving
  space per request
  ([chapter 2](https://varadmore.me/serving-explained/paged-attention/)).

## Facts you can use

- What it is: interactive explainers of how LLM servers manage GPU memory and
  schedule requests, run on a small simulated engine in the browser.
  https://varadmore.me/serving-explained/
- No signup, no tracking, no cookies; the code is Apache-2.0:
  https://github.com/varad-more/serving-explained
- Four chapters (the KV cache, paged attention, continuous batching, prefix
  caching) and a sandbox that compares two configurations side by side.
- The engine is modeled on vLLM V1's scheduler and block manager.
  [SIM.md §8](https://github.com/varad-more/serving-explained/blob/main/docs/SIM.md#8-where-this-matches-vllm-and-where-it-differs)
  lists where it matches and where it differs.
- Every number carries a badge: `simulated`, `computed`, or `measured`.
  Simulated numbers show mechanisms, not real-world speed.
- What it leaves out: one GPU only, step times from a roofline, dense
  attention only, no speculative decoding
  ([SIM.md §9](https://github.com/varad-more/serving-explained/blob/main/docs/SIM.md#9-simplifications-what-this-leaves-out)).
- Measured numbers come from your benchmark repo,
  [inference-engine-benchmark-system](https://github.com/varad-more/inference-engine-benchmark-system).
  On one A10G, vLLM serving Llama-3.1-8B-Instruct went from 30.2 to 1,279.5
  output tokens per second, between 1 and 64 requests at once. Median time to
  first token rose from 41.2 to 162.8 ms.
  - One run, 150 requests per level, 4 short prompts reused in turn
  - [the result file](https://github.com/varad-more/inference-engine-benchmark-system/blob/1c964318addd2c742b53b0f0cf4a2cad791cace9/results_concurrency64/llama-3-1-8b-instruct/throughput_ramp_extended_vllm_1776486559.json),
    and [chapter 3](https://varadmore.me/serving-explained/continuous-batching/)
- Who you are: merged PRs to vllm-metal
  ([#549](https://github.com/vllm-project/vllm-metal/pull/549),
  [#550](https://github.com/vllm-project/vllm-metal/pull/550)) and the two
  benchmark repos. State them without adjectives.

## Suggested structure

1. A title that asks or answers the practical question.
2. The numbers for one model and one card, with the link to chapter 1.
3. What the site lets you try next: paged attention, then the sandbox.
4. The affiliation line: it is your project, and how it was built.
5. What it leaves out, and a request for corrections with the issue form:
   https://github.com/varad-more/serving-explained/issues/new?template=technical-error.yml
