import { useState } from "react";
import { applyTheme, readTheme, THEME_CYCLE } from "../theme.ts";

const NAMES = { system: "System", light: "Light", dark: "Dark" } as const;

/** Cycles system → light → dark. */
export function ThemeToggle() {
  const [choice, setChoice] = useState(readTheme);
  const next =
    THEME_CYCLE[(THEME_CYCLE.indexOf(choice) + 1) % THEME_CYCLE.length] ??
    "system";
  return (
    <button
      type="button"
      className="icon-button theme-toggle"
      aria-label={`Theme: ${NAMES[choice]}. Switch to ${NAMES[next]}.`}
      onClick={() => {
        applyTheme(next);
        setChoice(next);
      }}
    >
      <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true">
        <circle
          cx="10"
          cy="10"
          r="8"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        />
        <path d="M10 2 A8 8 0 0 1 10 18 Z" fill="currentColor" />
      </svg>
      <span className="theme-toggle__text">{NAMES[choice]}</span>
    </button>
  );
}
