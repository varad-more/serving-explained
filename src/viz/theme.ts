/**
 * The theme choice: system, light, or dark. It lives in localStorage, never a
 * cookie, and never leaves the browser. index.html applies it before paint.
 */
export type ThemeChoice = "system" | "light" | "dark";

const KEY = "theme";
export const THEME_CYCLE: readonly ThemeChoice[] = ["system", "light", "dark"];

export function readTheme(): ThemeChoice {
  try {
    const t = localStorage.getItem(KEY);
    return t === "light" || t === "dark" ? t : "system";
  } catch {
    return "system";
  }
}

export function applyTheme(choice: ThemeChoice): void {
  const root = document.documentElement;
  if (choice === "system") delete root.dataset.theme;
  else root.dataset.theme = choice;
  try {
    if (choice === "system") localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, choice);
  } catch {
    // Storage can be blocked; the choice still holds for this page.
  }
}
