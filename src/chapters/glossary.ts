export interface GlossaryEntry {
  /** The id a `GlossaryTerm` refers to. */
  id: string;
  term: string;
  definition: string;
  /** A docs/SOURCES.md id, and where in it, for the definition. */
  source?: { id: string; at?: string };
}

/** Each chapter adds the terms it defines. */
export const glossary: readonly GlossaryEntry[] = [
  // Chapter 1: the KV cache.
  {
    id: "token",
    term: "Token",
    definition:
      "A unit of text, such as a word, that a model reads or writes. A model generates tokens one at a time.",
    source: { id: "kwon2023", at: "§1" },
  },
  {
    id: "request",
    term: "Request",
    definition:
      "One call to a served model: it sends a prompt and gets generated tokens back.",
    source: { id: "kwon2023", at: "§2.2" },
  },
  {
    id: "prompt",
    term: "Prompt",
    definition: "The list of tokens a request starts with.",
    source: { id: "kwon2023", at: "§2.2" },
  },
  {
    id: "context-length",
    term: "Context length",
    definition:
      "How many tokens a request holds: its prompt plus the tokens generated so far. Each model has a maximum.",
    source: { id: "kwon2023", at: "§2.2" },
  },
  {
    id: "layer",
    term: "Layer",
    definition:
      "One of the blocks a model runs in sequence. Each layer has its own attention and its own keys and values.",
    source: { id: "kwon2023", at: "§2.1" },
  },
  {
    id: "attention",
    term: "Attention",
    definition:
      "The part of a layer where a token matches its query against every key so far, then averages the values by those matches.",
    source: { id: "kwon2023", at: "§2.1" },
  },
  {
    id: "query",
    term: "Query",
    definition:
      "A vector a layer computes for the token being processed. Attention compares it with every key.",
    source: { id: "kwon2023", at: "§2.1" },
  },
  {
    id: "key",
    term: "Key",
    definition:
      "A vector a layer computes for each token. Queries are compared against the keys to weigh tokens.",
    source: { id: "kwon2023", at: "§2.1" },
  },
  {
    id: "value",
    term: "Value",
    definition:
      "A vector a layer computes for each token. Attention returns a weighted average of the values.",
    source: { id: "kwon2023", at: "§2.1" },
  },
  {
    id: "kv-cache",
    term: "KV cache",
    definition:
      "GPU memory that holds the keys and values of tokens already processed, so later steps read them instead of rebuilding them.",
    source: { id: "kwon2023", at: "§2.2" },
  },
  {
    id: "prefill",
    term: "Prefill",
    definition:
      "The step or steps that process a request's prompt and store its keys and values. The vLLM paper calls it the prompt phase.",
    source: { id: "kwon2023", at: "§2.2, §4.3" },
  },
  {
    id: "decode",
    term: "Decode step",
    definition:
      "A step after prefill that processes a request's newest token and generates the next. The vLLM paper calls these the generation phase.",
    source: { id: "kwon2023", at: "§2.2, §4.3" },
  },
  {
    id: "attention-head",
    term: "Attention head",
    definition:
      "One of several attention computations that run side by side in a layer. Each has its own query, so it is also called a query head.",
    source: { id: "ainslie2023", at: "§2.2" },
  },
  {
    id: "kv-head",
    term: "KV head",
    definition:
      "A key and value that one or more query heads read. The cache stores every KV head's key and value, for each layer and token.",
    source: { id: "ainslie2023", at: "§2.2" },
  },
  {
    id: "head-dimension",
    term: "Head dimension",
    definition: "How many numbers one head's key or value vector holds.",
    source: { id: "llmsize-math", at: "KV per token" },
  },
  {
    id: "mha",
    term: "MHA (multi-head attention)",
    definition: "Attention in which every query head has its own KV head.",
    source: { id: "ainslie2023", at: "§2.2" },
  },
  {
    id: "gqa",
    term: "GQA (grouped-query attention)",
    definition:
      "Attention in which query heads are split into groups, and each group shares one KV head.",
    source: { id: "ainslie2023", at: "§2.2" },
  },
  {
    id: "bf16",
    term: "bf16",
    definition: "A 16-bit floating-point number format: 2 bytes per number.",
    source: { id: "llmsize-math", at: "KV dtype" },
  },
  {
    id: "fp8",
    term: "fp8",
    definition:
      "An 8-bit floating-point number format: 1 byte per number. vLLM can store the KV cache in it.",
    source: { id: "vllm-src", at: "utils/torch_utils.py L39–41" },
  },
  {
    id: "gib",
    term: "GiB, KiB",
    definition:
      "A gibibyte is 2³⁰ bytes, about 1.07 billion. A kibibyte (KiB) is 1,024 bytes.",
    source: { id: "llmsize-math", at: "Units" },
  },
  {
    id: "serving-engine",
    term: "Serving engine",
    definition:
      "Software that runs a model for many requests at once, such as vLLM or SGLang.",
    source: { id: "kwon2023", at: "§1" },
  },
  {
    id: "weights",
    term: "Weights",
    definition:
      "The model's learned parameters. They stay in GPU memory while serving, and every request shares them.",
    source: { id: "kwon2023", at: "§1, §2.3" },
  },
  {
    id: "usable-memory",
    term: "Usable memory",
    definition:
      "A GPU's memory minus what its driver keeps for itself. The size of that reserve is an assumption.",
    source: { id: "llmsize-math", at: "Usable VRAM" },
  },
  {
    id: "concurrency",
    term: "Concurrency",
    definition:
      "How many requests a GPU serves at the same time. Each one needs its own KV cache.",
    source: { id: "kwon2023", at: "§1" },
  },
  {
    id: "free-memory",
    term: "Free memory",
    definition:
      "In this chapter, usable memory minus the weights: what is left for the KV cache.",
  },
  {
    id: "max-concurrency",
    term: "Max concurrency",
    definition:
      "The most requests of a given context length whose KV cache fits in free memory at once.",
  },
];
