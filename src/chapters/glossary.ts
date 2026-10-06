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
  // Chapter 2: paged attention.
  {
    id: "slot",
    term: "Slot",
    definition: "Room in the KV pool for one token's keys and values.",
    source: { id: "kwon2023", at: "§3.1, Fig. 3" },
  },
  {
    id: "pagedattention",
    term: "PagedAttention",
    definition:
      "The vLLM paper's design: a block manager hands out fixed-size KV blocks, and an attention kernel reads them wherever they sit.",
    source: { id: "kwon2023", at: "§4.1–4.2" },
  },
  {
    id: "block",
    term: "Block (KV block)",
    definition:
      "A fixed-size piece of KV memory that holds the keys and values of a set number of tokens.",
    source: { id: "kwon2023", at: "§4.1" },
  },
  {
    id: "block-size",
    term: "Block size",
    definition: "How many tokens one block holds. vLLM's default is 16.",
    source: { id: "kwon2023", at: "§7.2" },
  },
  {
    id: "logical-block",
    term: "Logical block",
    definition:
      "A request's own numbering of its blocks: 0, 1, 2, in token order. Each maps to one physical block.",
    source: { id: "kwon2023", at: "§4.2" },
  },
  {
    id: "physical-block",
    term: "Physical block",
    definition:
      "An actual block in GPU memory. A request's physical blocks can sit anywhere in the pool.",
    source: { id: "kwon2023", at: "§4.2" },
  },
  {
    id: "block-table",
    term: "Block table",
    definition:
      "A request's map from logical blocks to physical blocks, with how many slots each one has filled.",
    source: { id: "kwon2023", at: "§4.2" },
  },
  {
    id: "page",
    term: "Page",
    definition:
      "In an operating system, a fixed-size piece of memory. Programs see contiguous pages that can sit anywhere physically.",
    source: { id: "kwon2023", at: "§4.2" },
  },
  {
    id: "contiguous-allocation",
    term: "Contiguous allocation",
    definition:
      "Keeping each request's KV cache in one unbroken range of memory, as earlier serving systems did.",
    source: { id: "kwon2023", at: "§3.1" },
  },
  {
    id: "reservation",
    term: "Reservation",
    definition:
      "Memory set aside for a request before its tokens exist, here for its maximum possible length.",
    source: { id: "kwon2023", at: "§3.1" },
  },
  {
    id: "max-model-len",
    term: "max_model_len",
    definition:
      "The longest sequence, prompt plus output, a server will accept.",
    source: { id: "vllm-src", at: "config/model.py L217–219" },
  },
  {
    id: "internal-fragmentation",
    term: "Internal fragmentation",
    definition:
      "Reserved slots a request never fills, because its sequence ends before its reservation does.",
    source: { id: "kwon2023", at: "§3.1" },
  },
  {
    id: "external-fragmentation",
    term: "External fragmentation",
    definition:
      "Free memory split into pieces too small to use. In the paper's baselines it came from the memory allocator.",
    source: { id: "kwon2023", at: "§3.1" },
  },
  {
    id: "gap",
    term: "Gap",
    definition:
      "In this chapter's contiguous grid, free space too small for a region. With equal regions, it is the leftover at the end.",
  },
  {
    id: "reference-count",
    term: "Reference count",
    definition:
      "How many block tables point at one physical block. The block returns to the free queue only at 0.",
    source: { id: "vllm-apc-doc", at: "L198" },
  },
  {
    id: "preemption",
    term: "Preemption",
    definition:
      "When memory runs out, the engine frees a running request's blocks. vLLM V1 computes its tokens again later.",
    source: { id: "vllm-src", at: "v1/core/sched/scheduler.py L1540–1562" },
  },
  {
    id: "kernel",
    term: "Kernel",
    definition:
      "A program that runs on the GPU, such as the one that computes attention.",
    source: { id: "kwon2023", at: "§5, §7.1" },
  },
  {
    id: "throughput",
    term: "Throughput",
    definition:
      "How much work a server finishes per second, in requests or tokens.",
    source: { id: "kwon2023", at: "§6" },
  },
  {
    id: "prefix-caching",
    term: "Prefix caching",
    definition:
      "Keeping the KV blocks of a prompt's opening tokens, so a later request with the same opening reuses them.",
    source: { id: "vllm-apc-doc" },
  },
];
