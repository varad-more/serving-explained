# SIM.md — the toy serving engine

Status: **draft, waiting for approval (Prompt 2, STOP 1).** Nothing here is
built yet. Once approved, the public API in §2 is frozen. Changing it later
means stopping to ask (CLAUDE.md).

The engine is a small, pure, deterministic model of a vLLM-style scheduler and
KV block manager. It is accurate enough to teach from, and every place it
differs from vLLM is listed in §9. Every number it produces is `simulated`.

Sources (ids from docs/SOURCES.md):
- kwon2023 §4.2–4.5, §7.2–7.3, read for this doc
- vllm-apc-doc, read in full for this doc
- vllm-src at commit `cfd54ca8`, with file and line references in §8
- yu2022 for iteration-level vs. request-level scheduling
- agrawal2023 and agrawal2024 for chunked prefill and the token budget
- llmsize-math for the roofline

## 1. Shape

```
src/sim/
  index.ts        public API (§2), nothing else
  types.ts        config, request, event, snapshot, and metrics types
  rng.ts          seeded PRNG and length distributions
  workload.ts     request generators and the four presets
  hash.ts         53-bit string/int hash used for block keys and log hashes
  freeQueue.ts    doubly linked free-block queue over Int32Arrays
  paged.ts        paged block manager and prefix cache
  contiguous.ts   contiguous-max allocator
  scheduler.ts    static and continuous policies, chunked prefill, preemption
  cost.ts         roofline step cost
  engine.ts       state, the step loop, and the event log
  metrics.ts      metrics derived from the event log
  invariants.ts   checks run after every step in tests and dev builds
scripts/sim.ts    CLI (§7)
```

Purity rules (CLAUDE.md), enforced in code:
- `src/sim/tsconfig.json` has `lib: ["ES2023"]` with no DOM, so `window` and
  `document` do not type-check.
- ESLint bans `Math.random`, `Date`, `performance`, the timer globals, and any
  `react` import under `src/sim/**`.
- All state is plain objects, arrays, typed arrays, and `Map`, so a snapshot can
  be posted to a Web Worker.

## 2. Public API

The API follows the prompt, with three adjustments, each marked **(adj)**.

```ts
export function createSim(config: SimConfig): Sim

export interface Sim {
  /** One engine iteration. Throws if the run is already done. */
  step(): StepInfo
  /** Step until `until(info)` is true, the run is done, or maxSteps is reached. */
  run(until?: (info: StepInfo) => boolean, maxSteps?: number): StepInfo
  /** Plain, structured-clone-safe copy of the current state. */
  snapshot(): SimSnapshot
  /** The append-only event log (a read-only view, not a copy). */
  events(): readonly SimEvent[]
}

export interface StepInfo { step: number; time: number; waiting: number; running: number; done: boolean }

/** (adj) Takes the event log, not the state. */
export function metrics(events: readonly SimEvent[], config: SimConfig): SimMetrics

export function generateWorkload(spec: WorkloadSpec, seed: number): RequestSpec[]
export const PRESETS: Record<PresetName, Preset>
export function hashEvents(events: readonly SimEvent[]): string
export class ConfigError extends Error {}
export class InvariantError extends Error { invariant: number; step: number }
```

Invariant checks are not exported. With `checkInvariants: true`, `step()` runs
them itself and throws `InvariantError` naming the invariant (§6). Tests import
`invariants.ts` directly. Some invariants need the step's events and the config,
not just a snapshot, so a public `checkInvariants(snapshot)` could not check
them all.

**(adj) 1. `metrics` takes the event log.** Every metric can be derived from
the log, and the widgets animate from the same log. If both read the log, a
number on screen cannot disagree with the animation. Engine state stays small,
with no per-token timestamps.

**(adj) 2. `run` passes `StepInfo` to `until`, not a snapshot.** A snapshot
copies all state, which is too slow to build on every step. `StepInfo` carries
the step index, the time, the queue sizes, and a `done` flag.

**(adj) 3. Two extra event types, `CacheInsert` and `Reject`.** The prefix-cache
widget has to show when a block gets a hash, which is a separate moment from a
later hit or eviction. A request that can never fit is logged with `Reject`
rather than dropped silently (§4.6).

### 2.1 Config

```ts
interface SimConfig {
  seed: number                     // also seeds synthetic output token ids
  requests: readonly RequestSpec[] // from generateWorkload or written by hand
  model: ModelCost                 // one entry of src/data/models.json
  gpu: GpuCost                     // one entry of src/data/gpus.json
  cost: CostConstants              // §5
  kv: {
    allocator: 'paged' | 'contiguous-max'
    numBlocks: number              // capacity is numBlocks × blockSize token slots
    blockSize: number              // tokens per block (vLLM default: 16)
    prefixCaching: boolean         // paged only
  }
  scheduler: {
    policy: 'static' | 'continuous'
    maxNumSeqs: number
    maxNumBatchedTokens: number    // per-step token budget
    chunkedPrefill: boolean
    maxModelLen: number            // contiguous-max reserves this per request
  }
  checkInvariants?: boolean        // true in tests and dev builds
}

interface ModelCost {              // mapped from one models.json entry
  id: string
  params: number; embeddingParams: number
  weightBytes: number              // bf16
  layers: number; attentionHeads: number; headDim: number
  kvBytesPerToken: number          // all layers, bf16
}
interface GpuCost { id: string; bf16Tflops: number; memBandwidthBytesPerSec: number }
interface CostConstants { mfu: Sourced; mbu: Sourced; overheadS: Sourced }   // §5
interface Sourced { value: number; source: string }   // a SOURCES.md id, or 'teaching default'

interface RequestSpec {
  id: number
  arrival: number                  // seconds
  prompt: readonly number[]        // synthetic token ids
  outputLen: number                // the "model" stops here; the scheduler never reads it
}
```

The model and GPU arrive as plain numbers, so `src/sim` never imports
`src/data`. Callers (the CLI and widgets) pass in entries from the generated
JSON. Both allocators get the same capacity, `numBlocks × blockSize` slots, so
switching allocators compares like with like.

`createSim` validates the config and throws `ConfigError` with a reason when:
- `prefixCaching` is on with `contiguous-max`
- a request has `prompt.length + outputLen > maxModelLen`
- `maxModelLen > numBlocks × blockSize`, so a request could never fit
- `chunkedPrefill` is off and `maxNumBatchedTokens < maxModelLen`, so a long
  prompt could never be scheduled. vLLM enforces the same rule (§8).
- ids are not unique, or arrivals are not finite and ≥ 0

### 2.2 Events

Every event has `type`, `step` (engine iteration index), and `t` (sim seconds).
Requests are numeric ids and blocks are physical block ids.

| type | fields | emitted when |
|---|---|---|
| `Arrive` | `req` | a request's arrival time has passed; `t` is the arrival time |
| `Admit` | `req`, `cachedTokens` | a waiting request joins the running set |
| `CacheHit` | `req`, `blocks`, `tokens` | admission found cached full blocks (paged and prefix caching only) |
| `Allocate` | `req`, `blocks` or `region: {start, len}` | new blocks or a region are taken |
| `Evict` | `block`, `hash` | allocation pops a cached block, which drops its hash |
| `CacheInsert` | `req`, `block`, `hash` | a block becomes full and is added to the cache |
| `PrefillChunk` | `req`, `start`, `tokens` | prompt (or recompute) positions `[start, start+tokens)` were computed |
| `DecodeToken` | `req`, `index` | output token `index` was sampled |
| `Preempt` | `req`, `blocks`, `lostTokens` | a running request lost its KV and went back to the front of the queue |
| `Free` | `req`, `blocks` or `region` | blocks are released (ref count drops) |
| `Finish` | `req` | the request is complete and returned |
| `Reject` | `req`, `reason` | the request can never be served |
| `StepEnd` | `duration`, `computeS`, `memoryS`, `overheadS`, `bound`, `tokens`, `batch`, `waiting`, `running`, `kv: {capacity, allocated, cached, tokens, unusable}` | the iteration ended |

`StepEnd.kv` is in token slots, so it means the same thing for both allocators:
- `allocated`: slots in used blocks (paged) or reserved regions (contiguous)
- `cached`: slots in cached, evictable blocks (paged only)
- `tokens`: slots that hold KV, so `allocated − tokens` is the waste
- `unusable`: free slots in gaps too small for a region (contiguous only)

Within one step, events come in this order:
1. arrivals
2. scheduling decisions, in the order they happen: `Preempt` (followed by a
   `Free` of the victim's blocks), `Admit`, `CacheHit`, `Evict`, `Allocate`,
   `CacheInsert`
3. results: `PrefillChunk`, `DecodeToken`
4. `Finish` and `Free`
5. `StepEnd`

Scheduling events carry the step's start time; results and later events carry
its end time. Every reference-count drop is a `Free`, so a widget can track
block ownership from `Allocate`, `CacheHit`, and `Free` alone.

`CacheInsert` is a scheduling event. vLLM hashes a block as soon as it is
scheduled to become full, so a request later in the same batch can hit it
(§8).

### 2.3 Snapshot

`snapshot()` builds a fresh, explicitly shaped object. It is not the internal
state, so internal structures can change without breaking widgets.

```ts
interface SimSnapshot {
  step: number; time: number; done: boolean
  waiting: number[]; running: number[]; finished: number[]   // request ids, in queue order
  requests: RequestView[]   // id, state, computedTokens, generated, blockTable | region, preemptions
  kv: PagedView | ContiguousView
  counters: { preemptions: number; evictions: number; hitTokens: number; queryTokens: number }
}
interface PagedView {
  kind: 'paged'; numBlocks: number; blockSize: number
  refCount: number[]; filled: number[]; hash: (number | null)[]
  freeQueue: number[]        // head (next to evict) first
}
interface ContiguousView {
  kind: 'contiguous'; capacity: number
  regions: { req: number; start: number; len: number; used: number }[]
}
```

### 2.4 Metrics

Everything comes from the event log. Per-step series come from `StepEnd`.

```ts
interface SimMetrics {
  provenance: 'simulated'
  requests: RequestMetrics[]       // id order
  summary: {
    makespan: number               // last Finish − first Arrive, seconds
    outputTokensPerS: number       // DecodeToken count / makespan
    requestsPerS: number
    ttft: Dist; itl: Dist; e2e: Dist
    prefixHitRate: number | null   // hitTokens / queryTokens, first admissions only; null with caching off
    preemptions: number
    evictions: number
  }
  series: {                        // one entry per step
    t: number[]
    kvUtilization: number[]        // kv.tokens / kv.capacity
    waste: number[]                // kv.allocated − kv.tokens: partial last blocks (paged) or reserved-unused (contiguous)
    unusable: number[]             // kv.unusable: gaps between regions (contiguous)
    waiting: number[]; running: number[]
  }
}
interface RequestMetrics {
  id: number; arrival: number
  ttft: number                     // DecodeToken index 0 time − arrival
  itl: number[]                    // gaps between consecutive DecodeToken times
  e2e: number                      // Finish time − arrival
  preemptions: number; cachedTokens: number
}
interface Dist { mean: number; p50: number; p90: number; p99: number }   // nearest-rank
```

Under static batching, `Finish` comes at the end of the batch, so `e2e`
includes the wait for the batch's slowest request. That is the cost the
chapter shows.

## 3. Data structures

**Requests.** Each request has these fields:
- `state`: `waiting | running | done-in-batch | finished | rejected`
- `computedTokens`: tokens whose KV is stored
- `generated`: output tokens sampled
- `admitOrder`: a counter, used to pick the preemption victim
- `blockTable` (paged) or `region` (contiguous)

The token sequence is `prompt ++ outputs`. Output token `j` of request `r` is
`hash(seed, r, j) mod vocab`, so it needs no PRNG state.

**Why `computedTokens = prompt + generated − 1` while decoding.** The prefill
step computes the prompt's KV and samples output 0. Output 0's own KV is
computed in the next step, when it is fed back as input. So the newest sampled
token never has KV yet. This matches vLLM (§8), and the toy engine teaches it on
purpose: a request with a 6-token prompt and 3 outputs ends holding 8 tokens of
KV, not 9.

**Paged block pool**, all arrays of length `numBlocks`:

| field | type | meaning |
|---|---|---|
| `refCount` | Int32Array | block tables pointing at this block |
| `filled` | Int16Array | tokens stored, 0..blockSize |
| `hash` | Float64Array | block key, NaN if none |
| `parentHash` | Float64Array | parent block's key, NaN for the first block |
| `tokens` | Int32Array (numBlocks × blockSize) | token ids, used to verify cache hits |
| `prev`, `next` | Int32Array | free-queue links, −1 for none |

- **Free queue:** a doubly linked list. Allocation pops the head. Removing a
  block from the middle (a "touch") is O(1).
- **Block states:** `used` when refCount > 0. `cached` when refCount is 0 and it
  has a hash, so it can be evicted. `free` when refCount is 0 and it has no hash.
  Both cached and free blocks sit in the one free queue, as in vLLM.
- **Where freed blocks go:** blocks that reach refCount 0 are handled in
  reverse table order.
  - Blocks without a hash are put back at the **front** of the queue, so they
    are reused first.
  - Hashed blocks are added at the **tail**, so cached blocks are evicted in
    LRU order.
  - This follows vllm-src `BlockPool.free_blocks`. The design doc describes an
    older version (§8, Q8).
- **Cache:** `Map<hash, blockId[]>`. The block table is append-only, as in V1, so
  two blocks can hold the same content. A lookup takes the first id.

**Block key.** `key = h53(parentKey, tokens[0..B))`, with `parentKey = NaN` for
a prompt's first block. This follows vllm-apc-doc: parent hash plus the
block's tokens.
- vLLM also mixes in extra keys (LoRA id, multimodal hashes, cache salt). We
  have none.
- vLLM's default hash is sha256. Ours is a 53-bit non-cryptographic hash.
- Every hit is checked against the stored `tokens` and `parentHash`, so a
  collision costs a missed hit, never a wrong one.

**Contiguous-max.** A sorted array of `{req, start, len = maxModelLen}` regions
in a `[0, capacity)` address space. Placement is first-fit.
- With equal-size regions, the only gap that can never be used is
  `capacity mod maxModelLen` at the end. Every other gap fits a region exactly.
- Reported waste: `reserved − used`, the reserved slots never filled, plus
  `tailGap`.
- See open question Q4 about showing external fragmentation.

## 4. The step loop

`step()` runs one engine iteration:

```
1. intake     move every request with arrival ≤ clock to waiting (Arrive).
              If nothing is running or waiting, jump the clock to the next
              arrival and intake again. A step never runs empty.
2. schedule   policy-specific (4.1–4.2) → for each scheduled request, q tokens,
              with blocks allocated. With prefix caching, every block that
              will be full once this step's tokens are written gets its key
              and is inserted now (CacheInsert), as vLLM does inside
              allocate_slots.
3. cost       duration = cost(batch) (§5).
4. advance    clock += duration.
5. apply      for each scheduled request:
                computedTokens += q; fill block slots; PrefillChunk if it was
                prompt or recompute work.
                If computedTokens now equals len(prompt ++ outputs), sample the
                next output token (DecodeToken). Prompt completion and every
                decode both end this way.
6. finish     a request whose generated == outputLen is done.
              continuous: Finish, then Free.
              static: it stops computing (state done-in-batch); Finish and
              Free wait for the batch to end (4.1).
7. StepEnd    with the cost breakdown and kv counts.
8. invariants if config.checkInvariants, run §6 and throw on the first violation.
```

### 4.1 Static (request-level) policy

This is the Orca paper's baseline (yu2022 §3), not a vLLM mode.

- **Batch formation.** When no batch is open, admit waiting requests in FCFS
  order until `maxNumSeqs` is reached or memory runs out. This happens only in
  that one step.
- **Inside a batch.** Running requests are scheduled with the same token budget
  and chunking rules as continuous.
- **Finished requests.** A request that reaches its length stops computing, but
  its slot stays taken. Its `Finish` and `Free` are emitted when the last request
  in the batch finishes. That models request-level batching returning the batch
  as a unit.
- **Preemption.** If paged memory runs out mid-batch, the victim leaves the
  batch, waits at the front of the queue, and joins the *next* batch. The rule
  "never admits mid-batch" still holds.

### 4.2 Continuous (iteration-level) policy

Each step starts with `budget = maxNumBatchedTokens`:

**Running requests, in admission order.**
- A decode needs `q = 1`. A request mid-prefill or mid-recompute needs
  `q = min(remaining, budget)` with chunking on. With chunking off, it needs all
  of `remaining`.
- Allocate blocks to cover `computedTokens + q` (paged: `ceil(n/B)` total) or
  check the region.
- If allocation fails, preempt the **last** running request (most recently
  admitted): free its blocks in reverse order, set `computedTokens = 0`, and put
  it at the front of `waiting` (`Preempt`). Then retry.
- If the request being scheduled is itself the last one, preempt it and stop
  scheduling running requests.

**Waiting requests, FCFS (front first).** Skip this phase entirely if anything
was preempted this step. Stop at the first request that cannot be scheduled.
That is head-of-line blocking; we never skip ahead.
- Stop if `running == maxNumSeqs` or `budget == 0`.
- Prefix lookup (paged with caching): find the longest chain of cached full
  blocks for `prompt ++ outputs`. A preempted request recomputes its outputs
  too, and can hit its own old blocks, which kept their hashes.
- **Full-hit rule:** the hit is capped at `len − 1` tokens, rounded down to a
  block boundary, so at least one token is computed and produces logits.
- `remaining = len − cachedTokens`. With chunking on, `q = min(remaining, budget)`.
  With chunking off, stop if `remaining > budget`.
- **Whole-sequence fit:** stop unless the blocks for the *whole* sequence fit.
  Count new blocks, plus hit blocks currently at refCount 0, because touching
  them uses free capacity. Compare that with the free queue length. Only this
  step's chunk is allocated. This is vLLM's default `scheduler_reserve_full_isl`.
- Touch the hit blocks: each gets `refCount++` and leaves the free queue if it
  was at 0. Then allocate the chunk's new blocks by popping the queue head.
  Popping a cached block evicts it (`Evict`).
- Emit `Admit`, then `CacheHit`, `Allocate`, and `CacheInsert`. Update
  `budget -= q`.
- Prefix stats count in tokens, on first admission only: `queryTokens += len`
  and `hitTokens += cachedTokens`. Re-admissions after preemption go into
  separate `preempted*` counters, as in vLLM.

### 4.3 Allocation

- **Paged.** A step allocates only enough blocks to hold the tokens computed
  this step. There is no lookahead or watermark reserve (§9).
- **Freeing.** Blocks are released in reverse table order, and each block's
  refCount drops. A block that reaches 0 goes to the front of the queue if it
  has no hash, or to the tail if it has one (§3). A request's last block is the
  least likely to be shared, so it is evicted before its first.
- **Contiguous-max.** Admission reserves `maxModelLen` slots first-fit. A
  running request can never run out, so it is never preempted. A waiting request
  with no gap waits.

### 4.4 Preemption

Recompute only. The victim keeps its sampled outputs. On re-admission, it
prefills `prompt ++ outputs` from scratch, or from a cache hit, and samples its
next token. `lostTokens` is the KV discarded. Every preemption increments
`counters.preemptions` and that request's own count.

### 4.5 Time

- The clock starts at 0 and only moves forward.
- A request arriving mid-step joins at the next step's intake. Its `Arrive`
  event keeps its true arrival time.
- TTFT is the end of the step that samples output 0, minus arrival. That
  includes queueing and prefill.

### 4.6 Reject

The config checks in 2.1 make an unservable request impossible. `Reject` exists
for safety. If any request is ever rejected, a test fails.

## 5. Cost model (roofline per step)

For each scheduled request `i`, `q_i` is the tokens computed this step and
`c_i` is the tokens already in KV, including cache hits.

The model supplies `P` (params), `P_emb` (embedding params), `B_w` (weight
bytes, bf16), `L`, `n_h`, `d_h`, and `b_tok` (KV bytes per token, all layers).
The GPU supplies `TF` (bf16 dense TFLOPS) and `BW` (bytes/s).

```
T          = Σ q_i                                            tokens this step
F_dense    = 2 · P · T                                        multiply-accumulate (llmsize-math, Prefill FLOPs)
F_attn     = Σ_i 4 · L · n_h · d_h · (q_i·c_i + q_i(q_i+1)/2)  QKᵀ and PV for each new token over its causal context
t_compute  = (F_dense + F_attn) / (TF · 1e12 · MFU)
B_stream   = B_w · (1 − P_emb / P)                            the embedding table is gathered, not streamed (llmsize-math, Throughput)
B_kv       = b_tok · Σ_i (c_i + q_i)                          read each request's whole context
t_memory   = (B_stream + B_kv) / (BW · MBU)
t_step     = max(t_compute, t_memory) + t_overhead
```

**How `F_attn` matches llmsize.** For a full prefill (`c = 0`, `q = s`) it
equals `2·s²·n_h·d_h` per layer plus a linear term. That is llmsize's
`causalAttentionFlops`, so the two agree on prefill.

**Dense models only.** `P` is also the active parameter count. That is true for
every model in `models.json`, by construction.

**Constants** live in one object, with sources. A test checks that MFU and MBU
equal the values in `src/data` that gen-data copied from llmsize, so they cannot
drift.

| constant | value | source |
|---|---|---|
| `MFU` | 0.45 | llmsize-math, `mfu_prefill` (llmsize cites PaLM, arXiv 2204.02311) |
| `MBU` | 0.65 | llmsize-math, `mbu_decode` (llmsize cites Databricks, 0.55–0.72 measured) |
| `t_overhead` | 0 s | teaching default, no source. Widgets can raise it. See Q5. |

**Cross-check with llmsize.** In steady decode (`q_i = 1`, `c_i ≈ ℓ`), this
reduces to llmsize's decode roofline,
`t = (B_stream + b_tok·S·ℓ)/(BW·MBU)`, whenever memory is the bound. The test
compares tokens per second within 15% (§10). The two use the same formula, so
the test catches unit and wiring bugs, not modeling error. That is its purpose.

Not modeled: KV writes, sampling, the paged-kernel slowdown (kwon2023 §7.1
measured 20–26% on attention), batch-size-dependent kernel efficiency,
CUDA-graph padding, and CPU scheduling time.

## 6. Invariants

These are checked after every step when `checkInvariants` is on, and always in
property tests. A violation throws `InvariantError` with its number. Items
marked **(adj)** restate the prompt's version so it holds exactly.

1. **Paged: block accounting.** `used + cached + free = numBlocks`. The free
   queue holds exactly the cached and free blocks, each once.
2. **Paged: reference counts.** Each block's `refCount` equals the number of
   block tables, across running and done-in-batch requests, that contain it.
3. **Paged: block capacity.** `0 ≤ filled[b] ≤ blockSize` for every block. Every
   block in a table except the last is full.
4. **(adj) KV tokens.** For every running request, KV tokens (the sum of
   `filled` over its table, or `used` for its region) equal `computedTokens`.
   And `computedTokens ≤ len(prompt ++ outputs)`. When it is decoding, not
   mid-prefill or mid-recompute, `computedTokens = prompt + generated − 1`.
   - The prompt's version, "computed prompt tokens plus generated tokens," is
     off by one (§3).
   - It is also wrong right after a preemption, when the outputs are not yet
     recomputed.
5. **Static never admits mid-batch.** `Admit` appears only in a step that began
   with no open batch.
6. **Determinism.** The same config and seed give an identical `hashEvents`.
   This is checked in a test, not every step.
7. **Contiguous.** Regions do not overlap, sit inside `[0, capacity)`, and have
   `used ≤ len`.
8. **Queue discipline.** `waiting` is FCFS by `(arrival, id)`, except that
   preempted requests sit at the front in the order they were preempted.
9. **Limits.** No step schedules more than `maxNumBatchedTokens` tokens or more
   than `maxNumSeqs` requests.

## 7. Workloads, presets, CLI

**PRNG.** `sfc32`, seeded through `splitmix32`. Arrivals, lengths, prefix
choice, and tokens each get their own stream, derived from
`(seed, streamName)`. Changing the output-length distribution therefore leaves
arrival times unchanged.

```ts
interface WorkloadSpec {
  count: number
  arrival: { kind: 'poisson'; ratePerS: number } | { kind: 'burst' }   // burst = all at t=0
  promptLen: LengthDist          // the body, after any shared prefix
  outputLen: LengthDist
  sharedPrefix?: { groups: number; length: number; fraction: number }  // k, L, p
  maxModelLen: number            // the body is clipped first, then the output
  vocabSize?: number             // default 32000
}
type PresetName = 'chatbot' | 'rag' | 'batch-summarize' | 'agent-loop'
interface Preset { workload: WorkloadSpec; description: string }   // engine defaults are shared, below
type LengthDist =
  | { kind: 'fixed'; value: number }
  | { kind: 'uniform'; min: number; max: number }
  | { kind: 'lognormal'; median: number; sigma: number; min: number; max: number }
```

- **Poisson** inter-arrival is `−ln(1−u)/rate`. **Lognormal** samples
  `median·exp(sigma·z)` with z from Box–Muller, rounded and clamped.
- **Shared prefixes.** `k` prefixes of `L` tokens are drawn once. Each request
  joins a group with probability `p`, choosing the group uniformly. Its prompt is
  that prefix plus its own body.

**Presets.** These are invented shapes chosen to exercise one mechanism each.
They are not measurements of real traffic, and the UI says so.
- All presets use the same engine defaults: Llama-3.1-8B-Instruct on a10g-24,
  the hardware of the author's benchmarks.
- `blockSize` is 16 and `maxModelLen` is 4096.
- `numBlocks` is 2000, a teaching value (see Q6).
- The scheduler settings use the `vllm serve` defaults for a GPU under 70 GB
  (§8): `maxNumSeqs` 256 and `maxNumBatchedTokens` 2048, with prefix caching
  and chunked prefill both on.

| preset | count | arrival | body | output | shared prefix (k × L, p) | shows |
|---|---|---|---|---|---|---|
| `chatbot` | 200 | Poisson 2/s | lognormal median 200, σ 0.8, 16–2048 | lognormal median 250, σ 0.7, 16–1024 | 1 × 128, p 1.0 (one system prompt) | continuous batching, steady decode |
| `rag` | 100 | Poisson 0.5/s | uniform 1500–2500 | lognormal median 120, σ 0.5, 16–512 | 8 × 1024, p 0.6 (repeated documents) | long prefill, chunking, prefix hits |
| `batch-summarize` | 64 | burst | uniform 800–2000 | fixed 200 | 1 × 64, p 1.0 (one instruction) | static vs. continuous on a full queue, memory pressure |
| `agent-loop` | 150 | Poisson 4/s | uniform 32–256 | lognormal median 60, σ 0.6, 8–256 | 4 × 2048, p 0.9 (tool and context prefix) | prefix caching, eviction |

**CLI.** `pnpm sim --preset chatbot --scheduler continuous --allocator paged`.
- Other flags: `--prefix-cache on|off` and `--chunked-prefill on|off` (both
  default on, as in vLLM), `--blocks`, `--block-size`, `--max-num-seqs`,
  `--max-batched-tokens`, `--model`, `--gpu`, `--seed`, `--events N` (default
  30), and `--json`.
- It prints a `SIMULATED` header, the config, a metrics table, and the first N
  events, one per line.
- It reads models and GPUs from `src/data`, so the sim stays free of data
  imports.

## 8. Where this matches vLLM, and where it differs

vLLM V1 source, pinned to `cfd54ca8`. The links are at the bottom of this
section. Each "vLLM" cell was checked against that code. kwon2023 and
vllm-apc-doc were also read for this doc.

| behavior | vLLM | toy engine | why we differ |
|---|---|---|---|
| step structure | no prefill or decode phase; running first, then waiting, one shared token budget ([S-schedule]) | same | — |
| block size default | 16 (kwon2023 §7.2; [cache-cfg]) | 16 | — |
| waste per request | within the last block (kwon2023 §4.3) | same, reported as partial-block waste | — |
| blocks per step | just enough for the tokens computed this step ([KM-alloc], [ST-num]) | same | — |
| admission fit | the whole sequence must fit, though only the chunk is allocated (`scheduler_reserve_full_isl`, default true) ([KM-alloc]) | same | — |
| watermark | default 0.0 ([sched-cfg]) | none | equal to the default |
| null block | block 0 is reserved ([BP-init]) | not reserved | keeps block ids simple for readers |
| block key | hash(parent or NONE_HASH, block tokens, extra keys); full blocks only ([KU-hash]; vllm-apc-doc) | hash(parent, block tokens); full blocks only | no LoRA, multimodal input, or salt |
| hash function | sha256 of a pickle by default ([cache-cfg]; vllm-apc-doc Note 2) | 53-bit, verified on hit | the sim runs in a browser; verification makes it exact |
| when blocks are cached | at schedule time, inside `allocate_slots`, so same-batch hits work ([KM-cache]) | same | — |
| duplicate full blocks | kept; block tables are append-only (vllm-apc-doc) | same | — |
| freed block placement | reverse table order; unhashed blocks to the front, hashed blocks to the tail ([BP-free], [ST-free]) | same | vllm-apc-doc says all go to the tail. The code wins; see Q8. |
| eviction | pop from the head; a cached block loses its hash ([BP-get]) | same | — |
| full-prompt hit | capped at `num_tokens − 1`, rounded down to a block ([KM-computed], [ST-hit]) | same | — |
| prefix stats | tokens: queries += num_tokens, hits += matched, on admission; preempted re-admissions counted apart ([KM-stats]) | same | — |
| preemption victim | FCFS: `running[-1]`, the last admitted; stop if it is the current request ([S-preempt]) | same | — |
| preemption mode | recompute only; swap was removed in V1 ([v1-guide]) | recompute | — |
| after preemption | blocks freed (they keep their hashes), computed = 0, front of waiting ([S-preempt-fn]) | same | — |
| waiting phase after a preemption | skipped (`if not preempted_reqs`) ([S-waiting]) | skipped | — |
| head-of-line blocking | `break` when the head cannot be scheduled ([S-hol]) | same | vLLM skips ahead only for grammar, LoRA, and connector cases, which we do not model |
| max_num_seqs | checked in the waiting loop only ([S-waiting]) | same | — |
| chunked prefill | a toggle, default on; `long_prefill_token_threshold` default 0 ([sched-cfg]) | toggle, default on | — |
| chunking off | whole prompt in one step, still batched with decodes; the budget is raised to max_model_len ([arg-defaults]) | whole prompt in one step; config error if the budget is under maxModelLen | an explicit error is clearer than a silent raise |
| defaults under 70 GB | `vllm serve`: max_num_batched_tokens 2048, max_num_seqs 256 ([arg-defaults]) | same in presets | — |
| gpu_memory_utilization | 0.92 ([cache-cfg]) | n/a, capacity is given in blocks | Q6 |
| async scheduling | on by default; plans one step ahead ([async]) | synchronous | one step of lookahead would make every event log harder to read |
| static batching | not a vLLM mode; only `fcfs` and `priority` exist ([sched-cfg]) | teaching baseline from yu2022 §3 | — |
| contiguous-max | not vLLM; pre-paged systems reserved the max length (kwon2023 §3.1, §6.1 "Max"; yu2022 §4.2) | first-fit, equal regions | — |

The "chunking off" row corrects a common assumption. Turning off chunked
prefill in V1 does *not* bring back the old prefill-first scheduler; it only
stops prompts from being split. The stall it causes still shows up in the sim:
a step with a whole long prompt takes longer, and every decode batched with it
waits that long for its next token (agrawal2024 §3.2).

[S-schedule]: https://github.com/vllm-project/vllm/blob/cfd54ca8819de923dcf555807298eaca34dd342d/vllm/v1/core/sched/scheduler.py#L563-L684
[S-preempt]: https://github.com/vllm-project/vllm/blob/cfd54ca8819de923dcf555807298eaca34dd342d/vllm/v1/core/sched/scheduler.py#L746-L818
[S-preempt-fn]: https://github.com/vllm-project/vllm/blob/cfd54ca8819de923dcf555807298eaca34dd342d/vllm/v1/core/sched/scheduler.py#L1540-L1583
[S-waiting]: https://github.com/vllm-project/vllm/blob/cfd54ca8819de923dcf555807298eaca34dd342d/vllm/v1/core/sched/scheduler.py#L873-L895
[S-hol]: https://github.com/vllm-project/vllm/blob/cfd54ca8819de923dcf555807298eaca34dd342d/vllm/v1/core/sched/scheduler.py#L1114-L1232
[KM-alloc]: https://github.com/vllm-project/vllm/blob/cfd54ca8819de923dcf555807298eaca34dd342d/vllm/v1/core/kv_cache_manager.py#L500-L541
[KM-cache]: https://github.com/vllm-project/vllm/blob/cfd54ca8819de923dcf555807298eaca34dd342d/vllm/v1/core/kv_cache_manager.py#L603-L612
[KM-computed]: https://github.com/vllm-project/vllm/blob/cfd54ca8819de923dcf555807298eaca34dd342d/vllm/v1/core/kv_cache_manager.py#L264-L321
[KM-stats]: https://github.com/vllm-project/vllm/blob/cfd54ca8819de923dcf555807298eaca34dd342d/vllm/v1/core/kv_cache_manager.py#L253-L262
[ST-num]: https://github.com/vllm-project/vllm/blob/cfd54ca8819de923dcf555807298eaca34dd342d/vllm/v1/core/single_type_kv_cache_manager.py#L178-L268
[ST-free]: https://github.com/vllm-project/vllm/blob/cfd54ca8819de923dcf555807298eaca34dd342d/vllm/v1/core/single_type_kv_cache_manager.py#L581-L589
[ST-hit]: https://github.com/vllm-project/vllm/blob/cfd54ca8819de923dcf555807298eaca34dd342d/vllm/v1/core/single_type_kv_cache_manager.py#L747-L843
[BP-init]: https://github.com/vllm-project/vllm/blob/cfd54ca8819de923dcf555807298eaca34dd342d/vllm/v1/core/block_pool.py#L184-L188
[BP-get]: https://github.com/vllm-project/vllm/blob/cfd54ca8819de923dcf555807298eaca34dd342d/vllm/v1/core/block_pool.py#L669-L753
[BP-free]: https://github.com/vllm-project/vllm/blob/cfd54ca8819de923dcf555807298eaca34dd342d/vllm/v1/core/block_pool.py#L777-L808
[KU-hash]: https://github.com/vllm-project/vllm/blob/cfd54ca8819de923dcf555807298eaca34dd342d/vllm/v1/core/kv_cache_utils.py#L685-L715
[cache-cfg]: https://github.com/vllm-project/vllm/blob/cfd54ca8819de923dcf555807298eaca34dd342d/vllm/config/cache.py#L71-L157
[sched-cfg]: https://github.com/vllm-project/vllm/blob/cfd54ca8819de923dcf555807298eaca34dd342d/vllm/config/scheduler.py#L42-L202
[arg-defaults]: https://github.com/vllm-project/vllm/blob/cfd54ca8819de923dcf555807298eaca34dd342d/vllm/engine/arg_utils.py#L2837-L3113
[async]: https://github.com/vllm-project/vllm/blob/cfd54ca8819de923dcf555807298eaca34dd342d/vllm/v1/core/sched/async_scheduler.py#L14-L78
[v1-guide]: https://github.com/vllm-project/vllm/blob/cfd54ca8819de923dcf555807298eaca34dd342d/docs/usage/v1_guide.md#L160-L186

## 9. Simplifications ("What this leaves out")

Each line becomes a chapter's "What this leaves out" entry where it applies.

1. One GPU. No tensor, pipeline, or data parallelism.
2. Step time comes from a roofline, not a measurement. No CPU scheduling time,
   CUDA-graph padding, or kernel launch costs. The default overhead is 0.
3. Scheduling is synchronous: each step is planned after the last one ends.
   vLLM's async scheduling is on by default and plans one step ahead.
4. The paged attention kernel's own slowdown is not charged (kwon2023 §7.1).
5. Tokens are synthetic integers. There is no tokenizer and no real text.
6. Output length is fixed per request and known only to the "model." Real
   requests stop at EOS or `max_tokens`.
7. No sampling parameters, parallel sampling, beam search, or copy-on-write
   (kwon2023 §4.4).
8. Prefix cache keys have no extra keys (LoRA, multimodal, cache salt) and use a
   53-bit hash with verification instead of sha256.
9. Preemption is recompute only, as in vLLM V1. The CPU swap tier from
   kwon2023 §4.5 is not modeled.
10. Scheduling is FCFS only. No priority scheduling, and no per-request
    `max_tokens` limit beyond `maxModelLen`.
11. No lookahead slots or speculative decoding. The watermark is 0, which is
    vLLM's default.
12. Block 0 is not reserved as a null block, so all `numBlocks` are usable.
13. No structured output, LoRA, multimodal encoders, KV offload, or
    disaggregated prefill, and none of the queue-skipping those features cause.
14. KV capacity is given in blocks. It is not derived from GPU memory (Q6).
15. Contiguous-max reserves equal regions, so it shows reservation waste but
    almost no external fragmentation (Q4).
16. Static batching: finished requests stop computing. Orca's baseline also
    spends compute on them (yu2022 §3).
17. KV writes, sampling cost, and activation memory are ignored.
18. Dense full-attention models only. No MoE, MLA, or sliding window.

## 10. Test plan

All tests run under vitest. Property tests use fast-check.

**Unit tests, per module.**
- `rng`: same seed gives the same stream; streams are independent; lognormal
  medians fall within a tolerance over 10k samples.
- `workload`: the count is right; lengths stay within bounds and
  `maxModelLen`; Poisson mean inter-arrival is near `1/rate`; group members
  share identical leading `L` tokens and non-members do not.
- `hash`: stable values (golden numbers); chaining depends on the parent.
- `freeQueue`: push, pop, and remove from the middle; order after each.
- `paged`: allocate, free in reverse order, touch, evict on pop, verify on hit,
  insert duplicates, and the full-hit cap.
- `contiguous`: first-fit, reuse of a freed region, the tail gap, and waste
  numbers.
- `scheduler`: budget and `maxNumSeqs` caps, chunk sizes, head-of-line stop,
  victim choice, no waiting phase after a preemption, and the static batch
  boundary.
- `cost`: each formula against hand-computed numbers, including
  memory-bound vs. compute-bound.
- `metrics`: TTFT, ITL, E2E, throughput, hit rate, and waste on a handwritten
  log.

**Property tests (fast-check).**
- Inputs: random small configs (block size 1–8, 4–64 blocks, both allocators,
  both policies, caching and chunking on and off) and random workloads (1–40
  requests).
- Assert: every invariant after every step; every request finishes; total
  `DecodeToken` events equal `Σ outputLen`; no `Reject`.
- Determinism: run twice and compare `hashEvents`.

**Golden scenarios.** Each test writes out the full expected event list and
explains it in a comment. All use a toy model with zero params and zero bytes,
plus `t_overhead = 1 s`, so step `n` ends at `t = n + 1`. B means block size.

1. **G1: one request, paged.** Prompt 6, output 3, B 4, 12 blocks.
   - Allocates 2 blocks and never a third: it ends holding 8 tokens of KV,
     because the last token never gets KV.
   - Frees in order `[1, 0]`. With caching off, both go to the front, so the
     queue becomes `1, 0, 2, 3, …`.
2. **G2: static vs. continuous.** Three requests at t=0, prompt 4, outputs 2, 6,
   and 2, `maxNumSeqs` 2.
   - Static: r2 is admitted in step 6, and TTFT(r2) is 7 s.
   - Continuous: r2 is admitted in step 2, and TTFT(r2) is 3 s.
   - Static runs 8 steps; continuous runs 6.
3. **G3: preemption by recompute.** B 4, 4 blocks, two requests, prompt 4 and
   output 10 each.
   - Step 5: r0 needs a third block, so r1 (blocks `[1, 3]`) is preempted with
     8 tokens lost. Its blocks go to the front, and r0 takes block 3.
   - r1's whole sequence (9 tokens, 3 blocks) must fit before it is re-admitted.
     It waits until r0 finishes in step 9.
   - It then recomputes 9 tokens (prompt plus 5 outputs) in step 10 and
     finishes in step 14.
   - Exactly one `Preempt`.
4. **G4: prefix hit and LRU eviction.** B 4, 6 blocks, caching on.
   - r0 (prompt 8, output 1) inserts blocks 0 and 1 at schedule time. Both are
     hashed, so on finish they go to the tail: `2, 3, 4, 5, 1, 0`.
   - r1 (the same 8 tokens plus 2) hits blocks 0 and 1 (8 tokens). It allocates
     block 2, which is partial and not cached. On finish, block 2 goes to the
     front and 1 and 0 go to the tail: `2, 3, 4, 5, 1, 0`.
   - r2 (20 unrelated tokens) pops 2, 3, 4, 5, then 1, which evicts block 1.
   - r3 (r0's 8-token prompt again) hits block 0 only. The full-hit cap is
     `8 − 1 = 7`, rounded down to one block, and block 1 is gone anyway. It
     recomputes tokens 4–7 into a block it pops, evicting one of r2's.
   - The free-queue order is checked after every step.
5. **G5: chunked prefill alongside a decode.** Budget 4, chunking on.
   - r0 decodes while r1's 10-token prompt runs in chunks of 3, 3, 3, and 1.
   - `PrefillChunk` starts are 0, 3, 6, and 9.
6. **G6: contiguous-max vs. paged at equal capacity.** 20 slots, `maxModelLen` 8,
   three requests with prompt 3 and output 2.
   - Contiguous admits 2. Reserved-unused is 10 and the tail gap is 4. r2 waits
     until step 2.
   - Paged with B 4 and 5 blocks admits all 3, with 3 slots of partial-block
     waste.
7. **G7: hit inside one batch.** B 4. Two identical 9-token prompts arrive at
   t=0.
   - r0 is admitted and allocates 3 blocks. Blocks 0 and 1 are inserted at
     schedule time.
   - r1, admitted in the same step, hits them (8 tokens), allocates 1 block,
     and computes 1 token.
   - Prefix stats: 18 query tokens and 8 hit tokens.

**Cross-check with llmsize.**
- For each config, run S identical requests at t=0 with a prompt of `ℓ − 32` and
  an output of 64. Measure decode-only steps. Compare tokens per second with the
  reference in `src/data/roofline-ref.json`, written by gen-data from llmsize's
  `estimateThroughput`.
- Tolerance is 15%. If they cannot agree, I stop and explain.

| model | GPU | S | ℓ |
|---|---|---|---|
| Llama-3.1-8B-Instruct | a10g-24 | 8 | 1024 |
| Llama-3.2-3B-Instruct | l4-24 | 16 | 512 |
| Qwen3-8B | h100-sxm-80 | 32 | 2048 |

**Performance.** 1,000 `chatbot` requests on 2,000 blocks, paged, continuous,
with caching on and invariants off, must run in under 1 s in Node. The test
takes the best of 3 runs. A second run with invariants on reports its time but
does not gate.

## 11. Open questions

1. **Q1: invariant 4.** OK to restate it as in §6? The prompt's version fails by
   one token, and fails again after a preemption.
2. **Q2: `metrics(events, config)`** instead of `metrics(state)`?
3. **Q3: two extra events**, `CacheInsert` and `Reject`?
4. **Q4: external fragmentation.** With equal `maxModelLen` regions,
   contiguous-max shows reservation waste but almost no gaps. Should we add
   `reserve: 'max-model-len' | 'request-max'`, where the second reserves
   `prompt + outputLen` (Orca's per-request reservation, yu2022 §4.2)? That
   would show real gaps. It is a small scope increase.
5. **Q5: step overhead.** It is 0 by default. We could calibrate it from bench-ieb
   `single_request_latency` (measured TPOT minus the roofline) on Llama-3.1-8B
   and A10G. That makes it a derived, measured constant with a file link.
6. **Q6: default `numBlocks`.** 2000 is a teaching value. Alternatively,
   gen-data could compute the real vLLM KV pool for Llama-3.1-8B on A10G with
   llmsize's planner and use that.
7. **Q7: order of work.** Building the sim needs Prompt 1 steps 1 (vitest) and
   4 (gen-data, for `roofline-ref.json`). Proposed order: Prompt 1 steps 1–4,
   then the sim, then Prompt 1 steps 5–9.
8. **Q8: two sources disagree on free order.** vllm-apc-doc says freed blocks
   all go to the tail of the free queue, in reverse order. The code at
   `cfd54ca8` (`BlockPool.free_blocks`) sends unhashed blocks to the front, for
   LIFO reuse, and hashed blocks to the tail. I follow the code, since it is
   what vLLM does today, and I note the doc's version in SOURCES.md. OK?
