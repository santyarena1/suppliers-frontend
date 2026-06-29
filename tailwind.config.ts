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
        brand: {
          50: "#eef5ff",
          100: "#d9e8ff",
          200: "#bcd5fe",
          300: "#8fb9fd",
          400: "#5c94fa",
          500: "#3570f4",
          600: "#2050e8",
          700: "#1a3ed5",
          800: "#1c34ab",
          900: "#1c3187",
          950: "#161f52",
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
