"use client";

import { createContext, useContext, useEffect, useState, useCallback } from "react";

export type Theme = "dark" | "light" | "soft";

export const THEME_OPTIONS: { value: Theme; label: string; description: string }[] = [
  {
    value: "soft",
    label: "Suave",
    description: "Fondo oscuro moderado con tarjetas blancas — el equilibrio recomendado.",
  },
  {
    value: "dark",
    label: "Oscuro",
    description: "Interfaz oscura clásica, ideal para uso prolongado de noche.",
  },
  {
    value: "light",
    label: "Claro",
    description: "Fondo claro tipo tienda, máxima luminosidad.",
  },
];

interface ThemeContextValue {
  theme: Theme;
  setTheme: (t: Theme) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

const STORAGE_KEY = "pref_theme";

function normalizeTheme(raw: string | null): Theme {
  if (raw === "light" || raw === "dark" || raw === "soft") return raw;
  return "soft";
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<Theme>("soft");

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    const initial = normalizeTheme(stored);
    setThemeState(initial);
    document.documentElement.setAttribute("data-theme", initial);
  }, []);

  const setTheme = useCallback((t: Theme) => {
    setThemeState(t);
    localStorage.setItem(STORAGE_KEY, t);
    document.documentElement.setAttribute("data-theme", t);
  }, []);

  return (
    <ThemeContext.Provider value={{ theme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used inside ThemeProvider");
  return ctx;
}
