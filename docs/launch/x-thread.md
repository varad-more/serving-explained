# X thread: draft

Seven posts. X allows 280 characters per post and counts every URL as 23
([docs.x.com, "Counting characters"](https://docs.x.com/fundamentals/counting-characters),
read 2026-10-16). `tests/launch.test.ts` checks each post against that count.
Copy each text block as it is, and attach the GIF named under its post.
The site link is in the first post, where every reader sees it.

## Post 1

```text
How does an LLM server fit many requests on one GPU? I built interactive explainers that run a small simulated engine in your browser. https://varadmore.me/serving-explained/
```

## Post 2

Media: `media/kv-cache.gif`

```text
The KV cache stores keys and values for every token in every layer. On a 24 GB A10G, Llama-3.1-8B's weights take 15 GiB. The rest holds at most 7 requests of 8K tokens, 15 of 4K, or 1 of 32K (computed with llmsize).
```

## Post 3

Media: `media/paged-attention.gif`

```text
Paged attention gives a request fixed-size KV blocks as it grows, not one region sized for its maximum length. On the same requests in the sim, 3.3% of the pool is wasted over the first 20 s, against 77.6% with one region each.
```

## Post 4

Media: `media/continuous-batching.gif`

```text
Continuous batching lets requests join and leave the batch at every step. In the sim's chatbot preset, mean time to first token is 27 s with static batching and 0.2 s with continuous. Static is a teaching baseline, not a vLLM mode.
```

## Post 5

Media: `media/prefix-caching.gif`

```text
Prefix caching lets requests that share a system prompt reuse its cached KV blocks. Only full blocks match, and eviction lowers the hit rate once the shared prefixes outgrow the cache.
```

## Post 6

```text
Why trust it: every claim cites a paper, official docs, or source code at a pinned commit. Every number is badged simulated, computed, or measured. Each claim about the sim is tagged and tested against its preset.
```

## Post 7

```text
The sandbox runs two configurations side by side, and its links reproduce a run exactly. Code (Apache-2.0) and every source: https://github.com/varad-more/serving-explained
```
