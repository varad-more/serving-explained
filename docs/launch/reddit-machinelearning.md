# r/MachineLearning: draft

A full draft (decision 7: this subreddit stated no rule against generated
text when checked). Edit it into your own words; you post it.

## The rules this follows

Reddit blocked automated reads on 2026-10-16, so these come from Wayback
copies of old.reddit.com/r/MachineLearning dated 2026-07 and 2026-08, read on
2026-10-01. **Read them yourself before posting:**
https://www.reddit.com/r/MachineLearning/about/rules

- Project posts carry "[P]" in the title by convention. A written requirement
  was not verified.
- No promotion of paid products; this is free and open source.
- A strict spam policy, and a monthly "[D] Self-Promotion Thread". The mods
  may move a project post there, so a short version for it is below.
- Check whether the rules now say anything about generated text. If they do,
  write the post yourself, as for HN.

## Main post

Title:

[P] Interactive explainers of LLM serving (KV cache, paged attention, continuous batching, prefix caching) on a small simulated engine

Body:

> I built a set of interactive explainers for how LLM servers use GPU memory
> and schedule requests: https://varadmore.me/serving-explained/
>
> **What is modeled.** A deterministic TypeScript engine runs in the browser.
> Its scheduler and block manager are modeled on vLLM V1. They cover
> continuous batching with a token budget, chunked prefill, and preemption by
> recompute. They also cover paged KV blocks and block-hash prefix caching
> with LRU eviction. A contiguous allocator and a static batching policy give
> the baselines. Each step's time comes from a roofline model with per-GPU
> and per-model numbers from llmsize.
>
> **What is simplified.** One GPU, step times from a roofline rather than a
> measurement, synchronous scheduling, synthetic tokens, fixed output lengths,
> and dense attention only. The full list of 20 is in docs/SIM.md §9:
> https://github.com/varad-more/serving-explained/blob/main/docs/SIM.md#9-simplifications-what-this-leaves-out
>
> **How it stays honest.** Every claim cites a primary source, such as the
> vLLM paper (Kwon et al., SOSP 2023) or Orca (OSDI 2022). Others include
> Sarathi, Sarathi-Serve, SGLang (NeurIPS 2024), GQA (EMNLP 2023), and vLLM's
> docs and source at a pinned commit. Every number is badged `simulated`,
> `computed`, or `measured`. Each claim the text makes about the simulation
> is tagged and has a test against its preset.
>
> **The chapters.** The KV cache, paged attention, continuous batching, and
> prefix caching, then a sandbox that runs two configurations side by side.
> Sandbox links reproduce a run exactly; this one is the chatbot preset with
> static vs. continuous batching:
> https://varadmore.me/serving-explained/sandbox/?v=1&a.sc=static&b.p=chatbot&h=127aeadc&hb=0d8d398f
>
> Code (Apache-2.0) and sources: https://github.com/varad-more/serving-explained
>
> Corrections are the most useful feedback. The issue form asks for the claim,
> where it appears, and a source.

## Short version, for the monthly self-promotion thread

> Interactive explainers of LLM serving (KV cache, paged attention,
> continuous batching, prefix caching) on a small engine modeled on vLLM V1.
> Every claim is cited, and every claim about the simulation has a test:
> https://varadmore.me/serving-explained/
> (code: https://github.com/varad-more/serving-explained). Corrections
> welcome.
