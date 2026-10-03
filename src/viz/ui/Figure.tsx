import type { ReactNode } from "react";

export function Figure({
  number,
  caption,
  children,
}: {
  number?: string;
  caption: ReactNode;
  children: ReactNode;
}) {
  return (
    <figure className="figure">
      <div className="figure__body">{children}</div>
      <figcaption className="figure__caption">
        {number && <span className="figure__number">Fig. {number}</span>}{" "}
        {caption}
      </figcaption>
    </figure>
  );
}
