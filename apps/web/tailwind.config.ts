import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: ["class", '[data-theme="dark"]'],
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Azul-violeta, sampleado directo del archivo del isotipo real de
        // NODO (#4033fc fuerte / #b0aafa claro — ver NodoLogo.tsx).
        brand: {
          50: "#eeecff",
          100: "#e1deff",
          200: "#c8c2ff",
          300: "#a79efe",
          400: "#8676fd",
          500: "#5f4dfc",
          600: "#4033fc",
          700: "#3423e0",
          800: "#2b1cb8",
          900: "#241b8f",
          950: "#150f52",
        },
        surface: {
          DEFAULT: "rgb(var(--s-base) / <alpha-value>)",
          50:  "rgb(var(--s-50)  / <alpha-value>)",
          100: "rgb(var(--s-100) / <alpha-value>)",
          200: "rgb(var(--s-200) / <alpha-value>)",
          300: "rgb(var(--s-300) / <alpha-value>)",
          400: "rgb(var(--s-400) / <alpha-value>)",
          500: "rgb(var(--s-500) / <alpha-value>)",
          600: "rgb(var(--s-600) / <alpha-value>)",
          700: "rgb(var(--s-700) / <alpha-value>)",
          800: "rgb(var(--s-800) / <alpha-value>)",
          900: "rgb(var(--s-900) / <alpha-value>)",
          950: "rgb(var(--s-950) / <alpha-value>)",
        },
        foreground: "rgb(var(--fg) / <alpha-value>)",
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "-apple-system", "sans-serif"],
        mono: ["JetBrains Mono", "Fira Code", "monospace"],
      },
    },
  },
  plugins: [],
};

export default config;
