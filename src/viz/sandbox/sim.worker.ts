/**
 * The sandbox's module worker (tasks/todo.md, Prompt 7, decision 3). Each run
 * gets a fresh worker; the page cancels by terminating it.
 */
import type { ToWorker } from "./protocol.ts";
import { createRunner } from "./runner.ts";

const scope = self as unknown as {
  postMessage: (msg: unknown, transfer?: Transferable[]) => void;
  onmessage: ((e: MessageEvent<ToWorker>) => void) | null;
};

const handle = createRunner((msg, transfer = []) => {
  scope.postMessage(msg, transfer);
});

scope.onmessage = (e) => {
  void handle(e.data);
};
