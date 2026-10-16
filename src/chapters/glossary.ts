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
      "The vLLM paper's attention algorithm: it reads keys and values from fixed-size blocks wherever they sit. vLLM's block manager hands the blocks out.",
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
    id: "kv-wasted",
    term: "KV wasted",
    definition:
      "In the sandbox, KV slots reserved but holding no token, plus gaps too small to use. It is shown as a share of the pool.",
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
      "When memory runs out, the engine frees a running request's blocks. vLLM V1 computes its tokens again later, reusing its leading blocks still in the prefix cache.",
    source: {
      id: "vllm-src",
      at: "v1/core/sched/scheduler.py L930–938, L1540–1583",
    },
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
  // Chapter 3: continuous batching.
  {
    id: "engine-step",
    term: "Step (iteration)",
    definition:
      "One pass of the model over the requests it is running. In a step, each one computes some prompt tokens or makes one output token.",
    source: { id: "yu2022", at: "§3" },
  },
  {
    id: "batch",
    term: "Batch",
    definition:
      "The requests a server runs together. Under static batching it stays fixed for many steps; under continuous batching it can change at every step.",
    source: { id: "yu2022", at: "§3" },
  },
  {
    id: "batch-slot",
    term: "Batch slot",
    definition:
      "Our name for one place in a batch. vLLM's max_num_seqs sets how many there are. A request holds one from admission until it leaves.",
  },
  {
    id: "compute-bound",
    term: "Compute-bound",
    definition:
      "A step whose time is set by arithmetic: the math takes longer than reading the memory it needs.",
    source: { id: "agrawal2024", at: "§3.1" },
  },
  {
    id: "memory-bound",
    term: "Memory-bound",
    definition:
      "A step whose time is set by reading memory, mostly the model's weights, while compute sits partly idle.",
    source: { id: "agrawal2024", at: "§3.1" },
  },
  {
    id: "roofline",
    term: "Roofline",
    definition:
      "A simple model of step time: the longer of compute time (operations over peak speed) and memory time (bytes over bandwidth).",
    source: { id: "llmsize-math", at: "Throughput" },
  },
  {
    id: "request-level-scheduling",
    term: "Request-level scheduling",
    definition:
      "Choosing work a whole batch at a time: the batch runs until every request in it is done.",
    source: { id: "yu2022", at: "§3" },
  },
  {
    id: "static-batching",
    term: "Static batching",
    definition:
      "A common name for batching with request-level scheduling. A finished request cannot leave early, and a new one waits for the next batch.",
    source: { id: "yu2022", at: "§3" },
  },
  {
    id: "iteration-level-scheduling",
    term: "Iteration-level scheduling",
    definition:
      "Choosing which requests run at every step, so requests can join and leave between steps.",
    source: { id: "yu2022", at: "§3" },
  },
  {
    id: "continuous-batching",
    term: "Continuous batching",
    definition:
      "A common name for batching with iteration-level scheduling: finished requests leave and waiting ones join at every step.",
    source: { id: "yu2022", at: "§3" },
  },
  {
    id: "bubble",
    term: "Bubble",
    definition:
      "Our name for a batch slot held, under static batching, by a request that has made all its tokens. It does no work until its batch ends.",
    source: { id: "yu2022", at: "§3" },
  },
  {
    id: "ttft",
    term: "Time to first token (TTFT)",
    definition:
      "From a request's arrival to its first output token, time in the queue included.",
    source: { id: "agrawal2024", at: "§2.4" },
  },
  {
    id: "itl",
    term: "Inter-token latency (ITL)",
    definition:
      "The gap between two output tokens of one request. Sarathi-Serve calls it time between tokens (TBT).",
    source: { id: "agrawal2024", at: "§2.4" },
  },
  {
    id: "percentile",
    term: "p50, p99",
    definition:
      "The values that 50% and 99% of measurements are at or below. p50 is the median; p99 shows the slowest 1%.",
  },
  {
    id: "max-num-seqs",
    term: "max_num_seqs",
    definition: "vLLM's setting for the most requests it runs at once.",
    source: { id: "vllm-src", at: "config/scheduler.py" },
  },
  {
    id: "token-budget",
    term: "Token budget (max_num_batched_tokens)",
    definition:
      "The most tokens one step may process, prompt tokens and output tokens together.",
    source: { id: "agrawal2024", at: "§4.1" },
  },
  {
    id: "chunked-prefill",
    term: "Chunked prefill",
    definition:
      "Splitting a long prompt's prefill over several steps, one chunk per step, so decodes keep running alongside.",
    source: { id: "agrawal2023" },
  },
  {
    id: "generation-stall",
    term: "Generation stall",
    definition:
      "A pause in a request's output while the step it waits on computes another request's long prefill.",
    source: { id: "agrawal2024", at: "§3.2" },
  },
  {
    id: "stall-step",
    term: "Stall step",
    definition:
      "In chapter 3, a step in which a long prompt does prefill work, so every running request's next token waits for it.",
  },
  {
    id: "head-of-line-blocking",
    term: "Head-of-line blocking",
    definition:
      "When the request at the front of the queue cannot start, the ones behind it wait too, even if they would fit.",
    source: { id: "vllm-src", at: "v1/core/sched/scheduler.py L1114–1232" },
  },
  // Chapter 4: prefix caching.
  {
    id: "prefix",
    term: "Prefix",
    definition:
      "A request's opening tokens. Two prompts share a prefix when they start the same way.",
    source: { id: "vllm-apc-doc" },
  },
  {
    id: "system-prompt",
    term: "System prompt",
    definition:
      "Instructions an application puts at the start of every request, so many requests share them as a prefix.",
    source: { id: "zheng2024", at: "§3" },
  },
  {
    id: "block-key",
    term: "Block key",
    definition:
      "Our name for vLLM's block hash: a full block's cache entry, hashed from its parent's key, its tokens, and any extra keys.",
    source: { id: "vllm-apc-doc", at: "L13–19" },
  },
  {
    id: "parent-key",
    term: "Parent key",
    definition:
      "The key of the block just before this one in the prompt. The first block has none.",
    source: { id: "vllm-apc-doc", at: "L13–19" },
  },
  {
    id: "cache-hit",
    term: "Cache hit",
    definition:
      "A prompt block whose key is already in the cache, so its keys and values are reused, not computed.",
    source: { id: "vllm-apc-doc", at: "L146–147" },
  },
  {
    id: "hit-rate",
    term: "Hit rate",
    definition:
      "Prompt tokens found in the cache divided by prompt tokens looked up, counted at each request's first admission.",
    source: { id: "vllm-src", at: "v1/core/kv_cache_manager.py L253–262" },
  },
  {
    id: "eviction",
    term: "Eviction",
    definition:
      "Reusing a cached block for new KV, which drops its key from the cache.",
    source: { id: "vllm-apc-doc", at: "L202–206" },
  },
  {
    id: "lru",
    term: "Least recently used (LRU)",
    definition:
      "An eviction order: the block no request has used for longest goes first.",
    source: { id: "vllm-apc-doc", at: "L202–206" },
  },
  {
    id: "free-queue",
    term: "Free queue",
    definition:
      "vLLM's list of blocks no request holds. Allocation takes blocks from its head; cached blocks wait in it until they are reused or evicted.",
    source: { id: "vllm-src", at: "v1/core/block_pool.py L777–808" },
  },
  {
    id: "admission",
    term: "Admission",
    definition:
      "The step at which the scheduler moves a waiting request into the running batch and gives it blocks.",
    source: { id: "vllm-src", at: "v1/core/sched/scheduler.py L873–1294" },
  },
  {
    id: "radix-tree",
    term: "Radix tree",
    definition:
      "A tree of token sequences where each path from the root spells a prefix, so shared prefixes share nodes.",
    source: { id: "zheng2024", at: "§3" },
  },
  {
    id: "replica",
    term: "Replica",
    definition:
      "One of several copies of a served model, each on its own GPUs, with a balancer spreading requests among them.",
    source: { id: "bench-kvtt" },
  },
];
