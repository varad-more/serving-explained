import { useEffect, type ReactNode } from "react";
import data from "../../data/sources.json";

interface Props {
  id: string;
  /** A section, figure, or line ("§4.2", "L198"). */
  at?: string;
  children?: ReactNode;
}

/** "Kwon et al. 2023" for papers; the title for docs and code. */
function cite(s: (typeof data.sources)[number]): string {
  const [first] = s.authors.split(",");
  if (!s.authors.includes(",") || !first) return s.title;
  return `${first.trim().split(" ").at(-1) ?? first} et al. ${String(s.year)}`;
}

/** A citation to an id in docs/SOURCES.md (CLAUDE.md truth rules). */
export function SourceLink({ id, at, children }: Props) {
  const source = data.sources.find((s) => s.id === id);
  useEffect(() => {
    if (!source)
      console.error(`SourceLink: no source "${id}" in docs/SOURCES.md`);
  }, [source, id]);
  if (!source)
    return (
      <span className="source source--missing">[missing source: {id}]</span>
    );
  return (
    <a className="source" href={source.url} title={source.title} data-inline>
      {children ?? cite(source)}
      {at && ` ${at}`}
    </a>
  );
}
