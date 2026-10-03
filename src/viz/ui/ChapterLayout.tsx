import {
  Children,
  isValidElement,
  useEffect,
  useRef,
  useState,
  type ReactElement,
  type ReactNode,
} from "react";
import { useMediaQuery } from "../useMediaQuery.ts";
import { Step } from "./Step.tsx";

interface ChapterStepProps {
  /** Which entry of the chapter's `figures` this step shows. */
  figure: string;
  /** An anchor for links into the chapter. */
  id?: string;
  children: ReactNode;
}

/** One scroll step; ChapterLayout numbers it and pairs it with its figure. */
export function ChapterStep(props: ChapterStepProps) {
  return <>{props.children}</>;
}

interface Props {
  number: number;
  title: string;
  /** The learning objective, shown first (CHAPTER_DOD item 1). */
  objective: ReactNode;
  /** Figures by key; each gets the 1-based active step. */
  figures: Record<string, (step: number) => ReactNode>;
  /** ChapterStep elements, then any closing sections. */
  children: ReactNode;
}

const isStep = (node: ReactNode): node is ReactElement<ChapterStepProps> =>
  isValidElement(node) && node.type === ChapterStep;

/**
 * A chapter (DESIGN.md, "Chapter layout"). From 1024 px the figure is a wide
 * sticky board on the left showing the active step's figure, and the steps
 * are a column on the right. Narrower, each figure opens in full below the
 * step that first shows it. Under 560 px tall the board stops being sticky
 * and each step gets a "Show in figure" button.
 */
export function ChapterLayout({
  number,
  title,
  objective,
  figures,
  children,
}: Props) {
  const wide = useMediaQuery("(min-width: 1024px)");
  const [active, setActive] = useState(1);
  const stepsRef = useRef<HTMLDivElement>(null);
  const figureRef = useRef<HTMLDivElement>(null);
  const nodes = Children.toArray(children);
  const steps = nodes.filter(isStep);
  const rest = nodes.filter((n) => !isStep(n));
  const figureOf = (n: number) => steps[n - 1]?.props.figure ?? "";

  useEffect(() => {
    const root = stepsRef.current;
    if (!root || !wide) return;
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
  }, [steps.length, wide]);

  const render = (n: number) => figures[figureOf(n)]?.(n);

  return (
    <article className="chapter">
      {wide && (
        <div className="chapter__figure" ref={figureRef}>
          {render(active)}
        </div>
      )}
      <div className="chapter__steps" ref={stepsRef}>
        <p className="chapter__number num" aria-hidden="true">
          {String(number).padStart(2, "0")}
        </p>
        <h1>{title}</h1>
        <div className="chapter__objective">
          <p className="chapter__objective-label">
            What you will be able to do
          </p>
          {objective}
        </div>
        {steps.map((step, i) => {
          const n = i + 1;
          const showFigure = !wide && figureOf(n) !== figureOf(n - 1);
          return (
            <div key={n} id={step.props.id}>
              <Step
                n={n}
                active={wide && active === n}
                onShow={
                  wide
                    ? () => {
                        setActive(n);
                        figureRef.current?.scrollIntoView({ block: "start" });
                      }
                    : undefined
                }
              >
                {step.props.children}
              </Step>
              {showFigure && (
                <div className="chapter__inline-figure">{render(n)}</div>
              )}
            </div>
          );
        })}
        {rest}
      </div>
    </article>
  );
}
