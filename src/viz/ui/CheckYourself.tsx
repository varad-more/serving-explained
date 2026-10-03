import type { ReactNode } from "react";

/** The end-of-chapter question: answer first, then reveal the working. */
export function CheckYourself({
  question,
  children,
  defaultOpen = false,
}: {
  question: ReactNode;
  children: ReactNode;
  defaultOpen?: boolean;
}) {
  return (
    <section className="check" aria-label="Check yourself">
      <p className="check__label">Check yourself</p>
      <p className="check__question">{question}</p>
      <details className="check__answer" open={defaultOpen}>
        <summary>Show the answer</summary>
        {children}
      </details>
    </section>
  );
}
