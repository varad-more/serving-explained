import { useSyncExternalStore } from "react";

const DARK = "(prefers-color-scheme: dark)";

/**
 * A key that changes whenever the page's theme does: the reader's choice
 * (html[data-theme]) or the system setting. Canvases repaint on it, since
 * they cannot read CSS custom properties live.
 */
export function useThemeKey(): string {
  return useSyncExternalStore(
    (onChange) => {
      const mq = window.matchMedia(DARK);
      mq.addEventListener("change", onChange);
      const observer = new MutationObserver(onChange);
      observer.observe(document.documentElement, {
        attributes: true,
        attributeFilter: ["data-theme"],
      });
      return () => {
        mq.removeEventListener("change", onChange);
        observer.disconnect();
      };
    },
    () =>
      `${document.documentElement.dataset.theme ?? "system"}:${String(window.matchMedia(DARK).matches)}`,
    () => "server",
  );
}
