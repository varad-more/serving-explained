# LinkedIn: draft

One post. LinkedIn allows 3,000 characters
([LinkedIn help a528176](https://www.linkedin.com/help/linkedin/answer/a528176),
read 2026-10-16). The "see more" cutoff is not documented; guides say about
140 characters on mobile. So the first two lines carry the post and the link.
`tests/launch.test.ts` checks the length.

Copy the text block as it is. Attach `media/hero-paged.gif`, or the hero you
pick.

## Post

```text
I built interactive explainers of how LLM servers fit many requests on a GPU.
Try them in your browser: https://varadmore.me/serving-explained/

A small simulated engine runs each one. Four chapters, each one mechanism:
- The KV cache, which grows with context and requests while the weights stay fixed, and so caps how many requests fit
- Paged attention, which cuts reserved-but-empty memory to at most one partly filled block per request
- Continuous batching, and how scheduling trades time to first token, inter-token latency, and throughput
- Prefix caching, and when a shared system prompt is reused

Then a sandbox puts them together and compares two configurations side by side.

Every claim cites a paper, official docs, or vLLM's source at a pinned commit. Every number is badged simulated, computed, or measured. Each claim about the simulation is tagged and has a test against its preset.

It builds on vLLM's design and the PagedAttention, Orca, Sarathi, and SGLang papers, with sizing math from llmsize.

Corrections are the most useful feedback: https://github.com/varad-more/serving-explained
```
