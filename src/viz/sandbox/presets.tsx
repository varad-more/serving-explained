/**
 * Each preset's one-line description, written from what the engine shows on
 * the preset's own settings (tasks/todo.md, Prompt 7, decision 7). Each is a
 * <Claim> with a test in tests/chapters/sandbox.test.ts. They state
 * directions and tested thresholds, so the page need not run every preset.
 */
import type { PresetName } from "../../sim/index.ts";
import { Claim } from "../ui/Claim.tsx";
import { ProvenanceBadge } from "../ui/ProvenanceBadge.tsx";

export const DESCRIPTIONS: Record<PresetName, string> = {
  chatbot:
    "Chat traffic on Llama-3.1-8B and an A10G, every request starting with one 128-token system prompt. Prefix caching lowers mean TTFT, and static batching makes it more than ten times worse.",
  rag: "Long prompts, each with a 60% chance of starting with one of 8 shared 1,024-token documents. Prefix caching cuts mean TTFT by more than half.",
  "batch-summarize":
    "64 long documents arrive at once, so most wait in the queue at the start, and some are preempted when memory runs short.",
  "agent-loop":
    "Agent calls, each with a 90% chance of starting with one of 4 shared 2,048-token prefixes. With prefix caching on, at least nine in ten prompt tokens hit the cache. Mean TTFT drops from over a minute to under a second.",
  "paged-vs-contiguous":
    "Short requests on a toy pool of 1,280 tokens. Paged allocation runs more requests at once than contiguous-max, which reserves the maximum for each.",
  "batching-basics":
    "Requests with a wide spread of output lengths. Static batching makes mean TTFT more than a hundred times worse than continuous batching.",
  "long-prompt-stall":
    "Mostly short prompts, with a long one now and then. Turning chunked prefill off makes p99 ITL more than three times higher.",
  "shared-system-prompt":
    "Most requests share one 600-token system prompt. Prefix caching cuts mean TTFT more than eightfold and prefill work more than fivefold.",
  "cache-pressure":
    "Twelve 256-token prefixes compete for a 2,048-token pool. Blocks are evicted, and the hit rate is less than half of what one shared prefix gets on the same pool.",
};

export const claimId = (name: PresetName) => `preset-${name}`;

export function PresetDescription({ name }: { name: PresetName }) {
  return (
    <p className="sb-preset">
      <Claim id={claimId(name)}>{DESCRIPTIONS[name]}</Claim>{" "}
      <ProvenanceBadge kind="simulated" />
    </p>
  );
}
