# Show HN: fact sheet

This is not a draft. HN asks for text written by hand, so you write the title
and the first comment. This sheet holds the rules, the facts with their links,
and a suggested structure. If you want a check, ask an LLM for factual errors
only, never wording: dang's tips below rule out LLM edits.

## The rules (read 2026-10-16)

- [HN guidelines](https://news.ycombinator.com/newsguidelines.html):
  - "Please don't put generated text in HN posts. Write your text
    yourself—HN is for sharing between humans."
  - "Please don't do things to make titles stand out, like using uppercase or
    exclamation points, or saying how great an article is."
  - "If the title includes the name of the site, please take it out".
  - "If the title contains a gratuitous number or number + adjective… crop it".
  - "Don't solicit upvotes, comments, or submissions."
- [Show HN rules](https://news.ycombinator.com/showhn.html):
  - "Show HN is for something you've made that other people can play with."
  - "Off topic: blog posts, sign-up pages, newsletters, lists, and other
    reading material." An explainer can look like reading material, so lead
    with what people can do: drive the engine, change settings, compare runs.
  - "The project should be non-trivial. Don't post quickly-generated
    one-offs; anybody can do that now." Also: "Explain how and why. The
    project must be something you've worked on personally and which you're
    around to discuss." See "How it was built" below.
  - Try it "ideally without barriers such as signups or emails". The site has
    none.
  - The title begins with "Show HN".
  - "Please don't ask friends to upvote or comment."
- [dang's Show HN tips](https://news.ycombinator.com/item?id=22336638),
  edited 2026-03-28: "Write your text by hand. Don't use an LLM to generate
  any of it (not even a tiny bit, including to edit or spruce it up)." Also:
  "Drop any language that sounds like marketing or sales."
- The 80-character title limit is not in the guidelines. A moderator states
  it: "HN's 80 char limit for titles"
  ([item 48210728](https://news.ycombinator.com/item?id=48210728),
  2026-05-20).

## Your title

Write it on the line below. `tests/launch.test.ts` checks that it starts with
"Show HN: " and is at most 80 characters in all.

Title:

Constraints:
- Starts with "Show HN: ", and is at most 80 characters including that prefix.
- No uppercase for emphasis, no exclamation points, and no praise.
- No gratuitous number, such as "in 2 weeks" or "4 chapters".
- Not the site's name alone; say what it does.
- The link goes to the live site, not the repo: https://varadmore.me/serving-explained/

## Facts for the first comment

### Who made it

- Varad More. Merged contributions to
  [vllm-project/vllm-metal](https://github.com/vllm-project/vllm-metal):
  - [#550](https://github.com/vllm-project/vllm-metal/pull/550), a GPT-OSS
    change, wires attention sinks through the paged attention kernel (merged
    2026-07-28).
  - [#549](https://github.com/vllm-project/vllm-metal/pull/549) fixes a
    tokenizer patch ordering issue (merged 2026-07-25).
- Two benchmark repos:
  - [inference-engine-benchmark-system](https://github.com/varad-more/inference-engine-benchmark-system):
    vLLM vs. SGLang on an NVIDIA A10G.
  - [kv-transfer-tax](https://github.com/varad-more/kv-transfer-tax):
    disaggregated prefill and decode with vLLM and NIXL on 4× A10G.
- State these as facts, without adjectives (PRODUCT.md).

### How it was built

- With an AI coding assistant. Every one of the repo's commits says so, with
  a "Co-Authored-By: Claude" line.
- From the site shell (`v0.3-shell`, 2026-10-02) to the audited site
  (`v0.9-audited`, 2026-10-16).
- What you checked by hand, and why you built it, are yours to state. dang
  asks: "Explain how and why."

### Who it is for, and the goal

- For developers who call LLM APIs or run local models, and have never read
  vLLM's source (PRODUCT.md, "Audience").
- The goal, not a measured result: after each chapter, a reader can explain
  one mechanism in two sentences. They can also predict how one setting
  changes the result before they run it.

### How the sim works

- A deterministic TypeScript engine runs in the browser. It is modeled on
  vLLM V1's scheduler and block manager.
  [docs/SIM.md §8](https://github.com/varad-more/serving-explained/blob/main/docs/SIM.md#8-where-this-matches-vllm-and-where-it-differs)
  lists where it matches vLLM and where it differs.
- Each step's time comes from a roofline model with llmsize's GPU and model
  numbers ([MATH.md](https://github.com/varad-more/llm-calculator/blob/5d5d0298c03dc8f466ccf469bb17840c7ea8ecdf/docs/MATH.md)).
- The animated widgets replay the engine's event log. Every number carries a
  badge: `simulated`, `computed`, or `measured`.
- Each claim the text makes about the simulation is tagged and has a test
  against its preset
  ([tests/chapters/](https://github.com/varad-more/serving-explained/tree/main/tests/chapters)).
  Claims from papers and docs are cited, not tested.
- Every claim cites a source in
  [docs/SOURCES.md](https://github.com/varad-more/serving-explained/blob/main/docs/SOURCES.md).

### What it leaves out

The top items from
[SIM.md §9](https://github.com/varad-more/serving-explained/blob/main/docs/SIM.md#9-simplifications-what-this-leaves-out),
which lists all 20:
- One GPU: no tensor, pipeline, or data parallelism.
- Step times come from a roofline, not a measurement.
- Scheduling is synchronous; vLLM's async scheduling plans one step ahead.
- Tokens are synthetic integers, and each request's output length is fixed.
- Dense full-attention models only: no MoE, MLA, or sliding window.
- No speculative decoding, LoRA, structured output, or KV offload.

### Numbers you can quote

Each is on the live site with its badge. Quote the badge with the number.

- Llama-3.1-8B on an A10G: the weights take 14.96 GiB of 22.50 GiB usable. At
  8,192 tokens each, at most 7 requests fit; with an fp8 KV cache, 15
  (`computed`,
  [chapter 1, Figure 1.5](https://varadmore.me/serving-explained/kv-cache/)).
  These are upper bounds: vLLM keeps 8% of GPU memory back by default
  (`gpu_memory_utilization` 0.92) and needs room for activations.
- The same requests on the same toy GPU, over the first 20 s: paged
  allocation wastes 3.3% of the KV pool on average. One contiguous region per
  request, sized for its maximum length, wastes 77.6% (`simulated`,
  [chapter 2](https://varadmore.me/serving-explained/paged-attention/)).
- The chatbot preset, static vs. continuous batching: mean time to first
  token 27.02 s against 200 ms (`simulated`,
  [this sandbox link](https://varadmore.me/serving-explained/sandbox/?v=1&a.sc=static&b.p=chatbot&h=127aeadc&hb=0d8d398f)).
  Static batching is a teaching baseline, not a vLLM mode
  ([SIM.md §8](https://github.com/varad-more/serving-explained/blob/main/docs/SIM.md#8-where-this-matches-vllm-and-where-it-differs)).
- vLLM serving Llama-3.1-8B-Instruct on one A10G, from 1 to 64 requests at
  once (`measured`, [the result file](https://github.com/varad-more/inference-engine-benchmark-system/blob/1c964318addd2c742b53b0f0cf4a2cad791cace9/results_concurrency64/llama-3-1-8b-instruct/throughput_ramp_extended_vllm_1776486559.json),
  [chapter 3](https://varadmore.me/serving-explained/continuous-batching/)):
  - output throughput rose from 30.2 to 1,279.5 tokens per second
  - median time to first token rose from 41.2 to 162.8 ms
  - image `vllm/vllm-openai:v0.18.0-cu130`, one run, 150 requests per level,
    4 short prompts reused in turn
  - this is not static vs. continuous batching: vLLM schedules every step,
    as the chapter says

## Suggested structure

1. The title: what it lets people do, in plain words.
2. The first comment, within minutes of posting:
   - one line on what it is and who it is for
   - how to start: a chapter, or the sandbox with a share link
   - how the engine works, in two or three lines
   - what it leaves out, with the SIM.md link
   - who you are, as facts with links
   - what feedback you want: errors in claims or numbers, with the issue form
     link
3. Then answer comments for about 3 hours (docs/launch/checklist.md).

## Before you post

- Read the three rule pages again on the day you post.
- Check that the issue form works:
  https://github.com/varad-more/serving-explained/issues/new?template=technical-error.yml
