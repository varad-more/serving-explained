import type { ReactNode } from "react";

interface Props {
  n: number;
  active?: boolean;
  children: ReactNode;
  /** Short viewports: a button that shows this step in the figure. */
  onShow?: () => void;
}

/** One scroll step. The active step's number sits on the signal-yellow bar. */
export function Step({ n, active = false, children, onShow }: Props) {
  return (
    <section className="step" data-step={n} data-active={active}>
      <p className="step__number num">{n}</p>
      <div className="step__body">
        {children}
        {onShow && (
          <button type="button" className="button step__show" onClick={onShow}>
            Show in figure
          </button>
        )}
      </div>
    </section>
  );
}
