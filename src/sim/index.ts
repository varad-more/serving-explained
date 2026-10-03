/** The engine's public API (docs/SIM.md §2), and nothing else. */
export type * from "./types.ts";
export { blockKeys, hashEvents } from "./hash.ts";
export { generateWorkload, PRESETS } from "./workload.ts";
export { ConfigError, createSim, ENGINE_VERSION } from "./engine.ts";
export { metrics } from "./metrics.ts";
