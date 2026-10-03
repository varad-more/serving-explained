import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { glossary, type GlossaryEntry } from "../../chapters/glossary.ts";

interface Props {
  id: string;
  children: ReactNode;
  /** The glossary to read; the site's own by default. */
  entries?: readonly GlossaryEntry[];
  defaultOpen?: boolean;
}

/**
 * A defined term in prose. Its definition opens on hover, focus, or tap, stays
 * open while hovered, and closes on Escape or when focus leaves.
 */
export function GlossaryTerm({
  id,
  children,
  entries = glossary,
  defaultOpen = false,
}: Props) {
  const [open, setOpen] = useState(defaultOpen);
  const popId = useId();
  const popRef = useRef<HTMLSpanElement>(null);
  const entry = entries.find((e) => e.id === id);

  // Keep the definition inside the viewport on narrow screens.
  useLayoutEffect(() => {
    const el = popRef.current;
    if (!el) return;
    el.style.left = "0px";
    const over =
      el.getBoundingClientRect().right -
      (document.documentElement.clientWidth - 8);
    if (over > 0) el.style.left = `${String(-over)}px`;
  }, [open]);

  useEffect(() => {
    if (!entry) console.error(`GlossaryTerm: no glossary entry "${id}"`);
  }, [entry, id]);

  if (!entry) return <>{children}</>;
  return (
    <span
      className="term"
      onMouseEnter={() => {
        setOpen(true);
      }}
      onMouseLeave={() => {
        setOpen(false);
      }}
    >
      <button
        type="button"
        className="term__trigger"
        data-inline
        aria-expanded={open}
        aria-describedby={open ? popId : undefined}
        onFocus={() => {
          setOpen(true);
        }}
        onBlur={() => {
          setOpen(false);
        }}
        onClick={() => {
          setOpen(true);
        }}
        onKeyDown={(e) => {
          if (e.key === "Escape") setOpen(false);
        }}
      >
        {children}
      </button>
      {open && (
        <span
          ref={popRef}
          className="term__definition"
          role="tooltip"
          id={popId}
        >
          <strong>{entry.term}:</strong> {entry.definition}
        </span>
      )}
    </span>
  );
}
