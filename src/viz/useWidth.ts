import { useLayoutEffect, useRef, useState } from "react";

/**
 * An element's width in CSS px, measured before paint and kept current. SVGs
 * use it as their viewBox width, so text stays at its CSS size at any width.
 */
export function useWidth<T extends Element>(initial: number) {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(initial);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => {
      setWidth(Math.round(el.getBoundingClientRect().width) || initial);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => {
      observer.disconnect();
    };
  }, [initial]);
  return [ref, width] as const;
}
