/**
 * Preview cards from the real site (tasks/todo.md, Prompt 9 decision 4): each
 * route's title, one line, and its main widget, at 1200 × 630, plus the
 * repo's 1280 × 640 social preview. Registered only with VITE_OG=1
 * (`pnpm build:og`); scripts/gen-og.ts sets each widget's playhead and
 * screenshots the cards. The production dist has no chunk for it.
 */
import type { ReactNode } from "react";
import { figures as cb } from "../chapters/continuous-batching/figures.tsx";
import { glossary } from "../chapters/glossary.ts";
import { figures as kv } from "../chapters/kv-cache/figures.tsx";
import { figures as pa } from "../chapters/paged-attention/figures.tsx";
import { figures as pc } from "../chapters/prefix-caching/figures.tsx";
import { routes, type Route } from "../routes.ts";
import "./og.css";

const base = import.meta.env.BASE_URL;

/** The A/B link the sandbox card frames: the chatbot, static vs. continuous. */
export const SANDBOX_AB = "sandbox/?v=1&a.sc=static&b.p=chatbot";

/** Each route's main widget. The landing card shows the hero's widget. */
const WIDGETS: Record<string, () => ReactNode> = {
  "": () => pa.compare(),
  "kv-cache": () => kv.budget(),
  "paged-attention": () => pa.compare(),
  "continuous-batching": () => cb.compare(),
  "prefix-caching": () => pc.compare(),
  sandbox: () => (
    <iframe
      className="og__frame"
      src={`${base}${SANDBOX_AB}`}
      title="The sandbox, comparing two runs"
    />
  ),
  glossary: () => (
    <ul className="og__terms">
      {glossary.slice(0, 12).map((g) => (
        <li key={g.id}>{g.term}</li>
      ))}
    </ul>
  ),
};

function Card({
  route,
  index,
  id,
  className,
}: {
  route: Route;
  index: number;
  id: string;
  className: string;
}) {
  const number = index >= 1 && index <= 4 ? `0${String(index)}` : "";
  return (
    <section className={`og ${className}`} data-card={id} aria-label={id}>
      <div className="og__text">
        <p className="og__brand">
          <span>serving-explained</span>
          <span className="og__number num">{number}</span>
        </p>
        <h2 className="og__title">{route.title}</h2>
        <p className="og__line">{route.description}</p>
        <p className="og__url">varadmore.me/serving-explained</p>
      </div>
      <div className="og__widget">{WIDGETS[route.slug]?.()}</div>
    </section>
  );
}

export default function OgCards() {
  const landing = routes[0];
  return (
    <div className="og-cards">
      <h1>Preview cards</h1>
      {routes.map((r, i) => (
        <Card
          key={r.slug}
          route={r}
          index={i}
          id={r.slug || "index"}
          className="og--card"
        />
      ))}
      <Card
        route={landing}
        index={0}
        id="social-preview"
        className="og--social"
      />
    </div>
  );
}
