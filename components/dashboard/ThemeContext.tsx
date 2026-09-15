"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

const STORAGE_KEY = "bs_dash_theme";
const BG_URL_KEY_LIGHT = "bs_dash_bg_url_light";
const BG_URL_KEY_DARK = "bs_dash_bg_url_dark";

export type Theme = "light" | "dark";

type ThemeContextValue = {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  /** A custom uploaded background image (data URL), or null to use the
   *  shipped default asset for that theme. */
  lightBgUrl: string | null;
  setLightBgUrl: (url: string | null) => void;
  darkBgUrl: string | null;
  setDarkBgUrl: (url: string | null) => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>("light");
  const [lightBgUrl, setLightBgUrlState] = useState<string | null>(null);
  const [darkBgUrl, setDarkBgUrlState] = useState<string | null>(null);

  useEffect(() => {
    // localStorage only exists client-side — synced post-mount, same
    // pattern as LanguageContext.
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (saved === "light" || saved === "dark") {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- client-only initial sync, not a redundant resync
      setThemeState(saved);
    }
    setLightBgUrlState(window.localStorage.getItem(BG_URL_KEY_LIGHT));
    setDarkBgUrlState(window.localStorage.getItem(BG_URL_KEY_DARK));
  }, []);

  function setTheme(next: Theme) {
    setThemeState(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // ignore
    }
  }

  function setLightBgUrl(next: string | null) {
    setLightBgUrlState(next);
    try {
      if (next) window.localStorage.setItem(BG_URL_KEY_LIGHT, next);
      else window.localStorage.removeItem(BG_URL_KEY_LIGHT);
    } catch {
      // ignore — e.g. quota exceeded for a large image
    }
  }

  function setDarkBgUrl(next: string | null) {
    setDarkBgUrlState(next);
    try {
      if (next) window.localStorage.setItem(BG_URL_KEY_DARK, next);
      else window.localStorage.removeItem(BG_URL_KEY_DARK);
    } catch {
      // ignore — e.g. quota exceeded for a large image
    }
  }

  return (
    <ThemeContext.Provider value={{ theme, setTheme, lightBgUrl, setLightBgUrl, darkBgUrl, setDarkBgUrl }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within ThemeProvider");
  return ctx;
}
