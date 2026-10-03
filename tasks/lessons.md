# Lessons

Mistakes, corrections, and surprises. Newest first.

## 2026-10-02

- **Never name a zsh variable `path`.** It is tied to `PATH`, so `for path in
  …` emptied PATH and every command after it failed. Rule: use `route`, `p`,
  or `file` in shell loops.
- **Tab order tests must walk forward in DOM order.** Chromium and WebKit wrap
  Tab around the document; Firefox hands focus to the browser chrome. A test
  that tabbed backwards passed in two browsers by accident. Rule: visit
  controls in DOM order, and run keyboard tests in all three browsers.
- **WebKit on macOS ignores `min-height` on native selects.** They stay 23 px
  tall until `appearance: none`. Rule: measure target sizes in WebKit, not
  only Chromium.

- **A property test can pass without reaching the path it is for.** 300 random
  runs passed with zero preemptions: the generator spread arrivals too thin to
  fill memory. Rule: count the interesting events across a property test's
  runs and assert a floor, so a weak generator fails loudly.
- **When a test and the engine disagree, work out which is wrong by hand
  first.** Two scheduler tests and one cross-check threshold were wrong, not
  the engine (a 12-token prompt fills three blocks of 4, not two). Writing the
  golden event lists by hand before running found no engine bug.
- **Close stdin on every shell command.** A stray `cat > file` with no input
  hung for two minutes. Rule: append `< /dev/null` to commands that might read
  stdin, and never leave a redirect without a heredoc.
- **pnpm 12 has no `-s` flag.** Use `pnpm <script>` or `node scripts/x.ts`.

- **Check a stated fact about outside state before building on it.** The
  decisions said the repo "is renamed" and ffmpeg "is installed". `gh api`
  still showed `Serving-Explainer`, and `ffmpeg` was not on PATH. Rule: verify
  each "it is done" with a command, and report any gap before relying on it.
- **A type that lists a table's rows must grow with the table.** SIM.md's
  `PresetName` named 5 presets while §7's table had 9. Rule: when adding a row,
  grep for every union, list, or test that enumerates the rows.
- **A corrected constant moves every number derived from it.** Fixing the A10G
  TFLOPS (M9) changed chapter 3's crossover from 135 to 76 tokens and every
  prefill time. Rule: when a constant changes, grep for each number computed
  from it, and recompute.
- **Extend numbered checklists instead of renumbering them.** The DoD's item
  numbers are cited across tasks/todo.md. New checks went into existing items
  (7, 11, 17, 18), so no reference broke.

## 2026-10-01

- **Some communities ban LLM-written posts.** HN ("Write your text by hand…
  not even a tiny bit") and r/LocalLLaMA (rule 3) forbid the drafts a launch
  prompt asks for. Rule: check each venue's rules before drafting. Where text
  must be hand-written, give the author facts and constraints, not prose.

- **Check data against its own cited source.** llmsize's A10G bf16 figure (125
  TFLOPS) is the A10's. The AWS datasheet it links says 70 dense. Rule: for
  every hardware constant that sets on-screen numbers, open the `source_url`
  and compare, even in the author's own repos.
- **Audit what exists, and say what could not run.** Prompt 8 asked for a launch
  audit before any code existed. The useful pass was the claims, links,
  tokens, and data. Every runtime item is marked "not run" with the reason, and
  none is estimated.

- **Check that a linked repo does what the prompt implies.** Prompt 6 suggested
  linking kv-transfer-tax's "replica load-balancing work" for prefix-aware
  routing. Its balancer routes by load only (`proxy/replica_lb.py` L56–75).
  Rule: read the linked code before writing the sentence that links it.

- **Check the sign before calibrating with a leftover.** SIM.md Q5 planned to get
  a step overhead as measured TPOT minus the roofline. The roofline turned out
  slower than the measurement (38.5 vs. 33 ms), so the leftover was negative.
  Rule: compute the leftover before planning around it.
- **A benchmark's run log can carry what its result files do not.** bench-ieb's
  JSONs omit GPU and engine version, but `logs/phase2_resume_*.log` records both
  for the concurrency-64 runs. Look for logs before calling a number untraceable.

- **The arXiv HTML drops numbers.** kwon2023's HTML lost "2.2×" and "1.7×–2.7×"
  from §6.2, leaving "vLLM processes more requests". Rule: read quoted numbers
  from the PDF text (pypdf), and get figure values from the PDF's text labels.
- **Design rules constrain presets.** DESIGN.md's "at most 8 live requests" caps
  every widget preset at `max_num_seqs` 8. Check DESIGN.md before choosing
  preset sizes.

- **Prompts can carry technical slips too.** Prompt 3 said that without a cache
  each token "recomputes attention over every earlier token." With a cache it
  still attends to every earlier token; what the cache saves is rebuilding their
  keys and values. Rule: check a prompt's technical wording against the sources
  before it becomes prose.

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
