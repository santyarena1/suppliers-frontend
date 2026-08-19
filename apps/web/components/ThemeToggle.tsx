"use client";

import { useTheme } from "@/lib/theme";
import { Sun, Moon } from "lucide-react";

export default function ThemeToggle() {
  const { theme, toggle } = useTheme();

  return (
    <button
      onClick={toggle}
      title={theme === "dark" ? "Cambiar a modo claro" : "Cambiar a modo oscuro"}
      aria-label={theme === "dark" ? "Cambiar a modo claro" : "Cambiar a modo oscuro"}
      className="fixed bottom-4 right-4 z-[60] w-10 h-10 rounded-full bg-surface-800 hover:bg-surface-700 border border-surface-700 text-surface-200 hover:text-white shadow-lg flex items-center justify-center transition-all"
    >
      {theme === "dark" ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
    </button>
  );
}
