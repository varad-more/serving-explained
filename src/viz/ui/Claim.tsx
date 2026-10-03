import type { ReactNode } from "react";

/**
 * A prose claim about simulated or computed behavior (CHAPTER_DOD item 4).
 * Each id has one test in tests/chapters/<slug>.test.ts; a meta-test matches
 * the ids in the chapter to the tests.
 */
export function Claim({ id, children }: { id: string; children: ReactNode }) {
  return (
    <span className="claim" data-claim={id}>
      {children}
    </span>
  );
}
