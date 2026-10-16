/**
 * One sandbox run in a worker (tasks/todo.md, Prompt 7, "Architecture").
 * Inputs settle for 150 ms; a new run terminates the old worker, and Cancel
 * does the same. Batches are applied at most once per animation frame.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import type { SandboxConfig } from "./params.ts";
import type {
  Done,
  EventColumns,
  FromWorker,
  Series,
  ToWorker,
} from "./protocol.ts";

export type Status = "waiting" | "running" | "done" | "error" | "cancelled";

export type Frame = Extract<FromWorker, { type: "frame" }>;

export interface RunState {
  /** The config this state belongs to (JSON). */
  key: string;
  status: Status;
  progress: { simTime: number; finished: number; total: number } | null;
  /** Per-step rows so far. */
  series: Series;
  done: Done | null;
  error: { code: string; message: string } | null;
  /** When the run started, for the 300 ms progress threshold. */
  startedAt: number;
}

const DEBOUNCE_MS = 150;

const empty = (): Series => ({
  t: new Float64Array(0),
  duration: new Float64Array(0),
  running: new Uint32Array(0),
  waiting: new Uint32Array(0),
  allocated: new Float64Array(0),
  tokens: new Float64Array(0),
  cached: new Float64Array(0),
  unusable: new Float64Array(0),
});

/**
 * Per-step columns that grow by doubling, so each batch copies only its new
 * rows. `view()` returns subarrays: no copy.
 */
class Growing {
  private cols: Series = empty();
  private n = 0;

  append(more: readonly Series[]): Series {
    for (const m of more) {
      const add = m.t.length;
      if (this.n + add > this.cols.t.length) {
        const size = Math.max(1024, 2 * (this.n + add));
        const grown = {} as Record<string, Float64Array | Uint32Array>;
        for (const [k, col] of Object.entries(this.cols) as [
          keyof Series,
          Float64Array | Uint32Array,
        ][]) {
          const next = new (col.constructor as new (n: number) => typeof col)(
            size,
          );
          next.set(col.subarray(0, this.n));
          grown[k] = next;
        }
        this.cols = grown as unknown as Series;
      }
      for (const k of Object.keys(m) as (keyof Series)[])
        (this.cols[k] as Float64Array).set(m[k], this.n);
      this.n += add;
    }
    return this.view();
  }

  view(): Series {
    const out = {} as Record<string, Float64Array | Uint32Array>;
    for (const [k, col] of Object.entries(this.cols))
      out[k] = (col as Float64Array).subarray(0, this.n);
    return out as unknown as Series;
  }
}

const EMPTY = empty();

/** Starts the module worker; tests and the page share this one place. */
export function startWorker(): Worker {
  return new Worker(new URL("./sim.worker.ts", import.meta.url), {
    type: "module",
  });
}

export function useRun(config: SandboxConfig | null) {
  const [state, setState] = useState<RunState>({
    key: "",
    status: "waiting",
    progress: null,
    series: empty(),
    done: null,
    error: null,
    startedAt: 0,
  });
  const [frame, setFrame] = useState<Frame | null>(null);
  const [events, setEvents] = useState<{
    t0: number;
    t1: number;
    columns: EventColumns;
  } | null>(null);
  const worker = useRef<Worker | null>(null);
  const pending = useRef<Series[]>([]);
  const rows = useRef(new Growing());
  const raf = useRef(0);
  /** Frame requests: one in flight, and the latest wanted t. */
  const frameAsk = useRef<{ busy: boolean; want: number | null }>({
    busy: false,
    want: null,
  });
  const key = config ? JSON.stringify(config) : "";

  /** Ends the worker: no message from it is handled after this. */
  const halt = useCallback(() => {
    worker.current?.terminate();
    worker.current = null;
    cancelAnimationFrame(raf.current);
    pending.current = [];
    frameAsk.current = { busy: false, want: null };
  }, []);

  useEffect(() => {
    // A new config makes the old results stale at once: stop the old worker.
    // The state is keyed, so the old results stop showing too.
    halt();
    if (!config) return;
    const timer = setTimeout(() => {
      const w = startWorker();
      worker.current = w;
      setFrame(null);
      setEvents(null);
      rows.current = new Growing();
      setState({
        key,
        status: "running",
        progress: null,
        series: empty(),
        done: null,
        error: null,
        startedAt: performance.now(),
      });
      w.onmessage = (e: MessageEvent<FromWorker>) => {
        const m = e.data;
        if (worker.current !== w) return;
        switch (m.type) {
          case "progress":
            setState((s) => ({ ...s, progress: m }));
            break;
          case "batch":
            pending.current.push(m.series);
            cancelAnimationFrame(raf.current);
            raf.current = requestAnimationFrame(() => {
              const more = pending.current;
              pending.current = [];
              const series = rows.current.append(more);
              setState((s) => ({ ...s, series }));
            });
            break;
          case "done": {
            const more = pending.current;
            pending.current = [];
            const series = rows.current.append(more);
            setState((s) => ({ ...s, status: "done", series, done: m }));
            break;
          }
          case "error":
            setState((s) => ({ ...s, status: "error", error: m }));
            w.terminate();
            break;
          case "frame": {
            frameAsk.current.busy = false;
            setFrame(m);
            const want = frameAsk.current.want;
            if (want !== null && want !== m.t) {
              frameAsk.current = { busy: true, want: null };
              w.postMessage({ type: "frame", t: want } satisfies ToWorker);
            }
            break;
          }
          case "events":
            setEvents(m);
            break;
        }
      };
      w.postMessage({ type: "run", config } satisfies ToWorker);
    }, DEBOUNCE_MS);
    return () => {
      clearTimeout(timer);
    };
    // `key` stands for the config's contents.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, halt]);

  useEffect(
    () => () => {
      halt();
    },
    [halt],
  );

  const requestFrame = useCallback((t: number) => {
    const w = worker.current;
    if (!w) return;
    if (frameAsk.current.busy) {
      frameAsk.current.want = t;
      return;
    }
    frameAsk.current = { busy: true, want: null };
    w.postMessage({ type: "frame", t } satisfies ToWorker);
  }, []);

  const requestEvents = useCallback((t0: number, t1: number) => {
    worker.current?.postMessage({ type: "events", t0, t1 } satisfies ToWorker);
  }, []);

  const cancel = useCallback(() => {
    halt();
    setState((s) =>
      s.status === "running" ? { ...s, status: "cancelled" } : s,
    );
  }, [halt]);

  // Results show only for the current config: during the debounce, or with
  // no config at all, the run reads as waiting.
  if (state.key !== key || !config)
    return {
      key,
      status: "waiting" as Status,
      progress: null,
      series: EMPTY,
      done: null,
      error: null,
      startedAt: 0,
      frame: null,
      events: null,
      requestFrame,
      requestEvents,
      cancel,
    };
  return { ...state, frame, events, requestFrame, requestEvents, cancel };
}
