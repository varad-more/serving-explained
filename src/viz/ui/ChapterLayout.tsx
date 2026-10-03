import { useEffect, useRef, useState, type ReactNode } from "react";
import { Step } from "./Step.tsx";

interface Props {
  number: number;
  title: string;
  /** The figure for the active step (1-based). */
  figure: (active: number) => ReactNode;
  steps: readonly ReactNode[];
}

/**
 * A chapter (DESIGN.md, "Chapter layout"). From 1024 px the figure is a wide
 * sticky board on the left and the steps a column on the right. Narrower, the
 * figure is a sticky strip at the top with the steps scrolling under it. On
 * viewports under 560 px tall the figure stops being sticky and each step gets
 * a "Show in figure" button. The step crossing the middle of the viewport is
 * active.
 */
export function ChapterLayout({ number, title, figure, steps }: Props) {
  const [active, setActive] = useState(1);
  const stepsRef = useRef<HTMLDivElement>(null);
  const figureRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = stepsRef.current;
    if (!root) return;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          const n = Number((entry.target as HTMLElement).dataset.step);
          if (n > 0) setActive(n);
        }
      },
      { rootMargin: "-45% 0px -45% 0px" },
    );
    root.querySelectorAll(".step").forEach((el) => {
      observer.observe(el);
    });
    return () => {
      observer.disconnect();
    };
  }, [steps.length]);

  return (
    <article className="chapter">
      <div className="chapter__figure" ref={figureRef} aria-live="polite">
        {figure(active)}
      </div>
      <div className="chapter__steps" ref={stepsRef}>
        <p className="chapter__number num" aria-hidden="true">
          {String(number).padStart(2, "0")}
        </p>
        <h1>{title}</h1>
        {steps.map((content, i) => (
          <Step
            key={i}
            n={i + 1}
            active={active === i + 1}
            onShow={() => {
              setActive(i + 1);
              figureRef.current?.scrollIntoView({ block: "start" });
            }}
          >
            {content}
          </Step>
        ))}
      </div>
    </article>
  );
}
