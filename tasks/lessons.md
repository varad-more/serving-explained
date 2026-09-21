# Lessons

Mistakes, corrections, and surprises. Newest first.

## 2026-10-01

- **Check that a prompt's inputs exist.** Prompt 1 said to read DESIGN.md and
  tasks/, but the setup session had stopped at an approval gate before writing
  them. Rule: at session start, list every file the prompt names and report any
  that are missing before doing anything else.
- **llmsize is `varad-more/llm-calculator`** (package `@llmsize/core`). No repo is
  named `llmsize`.
- **The Pages URL follows the repo name.** The author's user site has the custom
  domain `varadmore.me`, so this repo publishes at
  `varadmore.me/Serving-Explainer/` unless the repo is renamed.
- **Node 24 imports llmsize's TypeScript source directly** (type stripping), so
  gen-data does not need to build `packages/core`. Verified on llmsize 51b9746.
- **Source traps:** vllm-pa-doc is a legacy doc; automatic prefix caching must
  cite vllm-apc-doc, not kwon2023; chunked prefill was introduced in
  agrawal2023, not agrawal2024. Benchmark READMEs contradict their own result
  files, so `measured` badges cite result files only.
- **Design docs drift from code.** vllm-apc-doc's free-queue order no longer
  matches `BlockPool.free_blocks`. When a doc and code at a pinned commit
  disagree, cite the code for current behavior and record the gap.
- **Turning off chunked prefill in vLLM V1 does not restore prefill-first
  scheduling.** It only stops prompts from being split; decodes still share the
  step. Do not describe the "off" setting as the old V0 behavior.
- **Eight hues cannot pass all-pairs CVD separation.** Only neighboring slots
  pass. Glyphs and patterns carry request identity; color is the third cue.
