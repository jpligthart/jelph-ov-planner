import { useEffect, useState } from "react";

export type ThemeChoice = "auto" | "light" | "dark";

export const THEME_LABELS: Record<ThemeChoice, string> = {
  light: "Licht",
  dark: "Donker",
  auto: "Automatisch",
};

const THEME_KEY = "jelph.theme.v1";
const THEME_EVENT = "jelph:theme";
const DARK_QUERY = "(prefers-color-scheme: dark)";

/** Browser bar colour per theme, matching --bg. */
const THEME_COLORS = { light: "#f5f7fb", dark: "#0b1020" };

export function loadTheme(): ThemeChoice {
  try {
    const saved = localStorage.getItem(THEME_KEY);
    return saved === "light" || saved === "dark" ? saved : "auto";
  } catch {
    return "auto";
  }
}

/**
 * Apply a theme to <html> (the CSS reads data-theme) and remember it.
 * "auto" removes the attribute, so the device setting decides again.
 */
export function applyTheme(choice: ThemeChoice, save = true) {
  const root = document.documentElement;
  if (choice === "auto") delete root.dataset.theme;
  else root.dataset.theme = choice;

  // The two theme-color metas are tied to the device setting; a chosen
  // theme overrides both.
  for (const meta of document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')) {
    const own = meta.media.includes("dark") ? "dark" : "light";
    meta.content = THEME_COLORS[choice === "auto" ? own : choice];
  }

  if (save) {
    try {
      if (choice === "auto") localStorage.removeItem(THEME_KEY);
      else localStorage.setItem(THEME_KEY, choice);
    } catch {
      // Storage disabled; the choice lasts for this visit.
    }
  }
  window.dispatchEvent(new Event(THEME_EVENT));
}

function isDark(): boolean {
  const chosen = document.documentElement.dataset.theme;
  if (chosen === "dark") return true;
  if (chosen === "light") return false;
  return window.matchMedia(DARK_QUERY).matches;
}

/** Whether the page shows dark now; follows the menu and the device. */
export function useIsDark(): boolean {
  const [dark, setDark] = useState(isDark);
  useEffect(() => {
    const update = () => setDark(isDark());
    const media = window.matchMedia(DARK_QUERY);
    window.addEventListener(THEME_EVENT, update);
    media.addEventListener("change", update);
    return () => {
      window.removeEventListener(THEME_EVENT, update);
      media.removeEventListener("change", update);
    };
  }, []);
  return dark;
}
