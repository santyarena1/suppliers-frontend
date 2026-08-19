/**
 * Centralized per-provider color tokens.
 *
 * Tailwind's "-400" shades read great on the dark surfaces this app was
 * originally built for, but the same shades are low-contrast pastel on a
 * light background. Each entry pairs a light-mode-legible shade with the
 * original dark-mode one via Tailwind's `dark:` variant, which this project
 * maps to `[data-theme="dark"]` (see tailwind.config.ts `darkMode`).
 *
 * Class names are written out in full (no template interpolation) so
 * Tailwind's static content scanner can find and generate them.
 */

/** Text-only color, theme-aware. */
export const PROVIDER_TEXT_COLOR: Record<string, string> = {
  NEW_BYTES: "text-sky-700 dark:text-sky-400",
  ELIT: "text-purple-700 dark:text-purple-400",
  GRUPO_NUCLEO: "text-emerald-700 dark:text-emerald-400",
  AIR: "text-cyan-700 dark:text-cyan-400",
  NEW_TREE: "text-teal-700 dark:text-teal-400",
  INVID: "text-orange-700 dark:text-orange-400",
  GC: "text-red-700 dark:text-red-400",
  POLYTECH: "text-pink-700 dark:text-pink-400",
  ASHIR: "text-indigo-700 dark:text-indigo-400",
  HDC: "text-yellow-700 dark:text-yellow-400",
  SOLUTION_BOX: "text-lime-700 dark:text-lime-400",
  DISTECNA: "text-violet-700 dark:text-violet-400",
  CEVEN: "text-rose-700 dark:text-rose-400",
  DIAPSTORE: "text-blue-700 dark:text-blue-400",
};

/** Text + soft background + border, for badges/chips, theme-aware. */
export const PROVIDER_CHIP_COLOR: Record<string, string> = {
  NEW_BYTES: "text-sky-700 dark:text-sky-400 bg-sky-500/10 dark:bg-sky-400/10 border-sky-500/30 dark:border-sky-400/30",
  ELIT: "text-purple-700 dark:text-purple-400 bg-purple-500/10 dark:bg-purple-400/10 border-purple-500/30 dark:border-purple-400/30",
  GRUPO_NUCLEO: "text-emerald-700 dark:text-emerald-400 bg-emerald-500/10 dark:bg-emerald-400/10 border-emerald-500/30 dark:border-emerald-400/30",
  AIR: "text-cyan-700 dark:text-cyan-400 bg-cyan-500/10 dark:bg-cyan-400/10 border-cyan-500/30 dark:border-cyan-400/30",
  NEW_TREE: "text-teal-700 dark:text-teal-400 bg-teal-500/10 dark:bg-teal-400/10 border-teal-500/30 dark:border-teal-400/30",
  INVID: "text-orange-700 dark:text-orange-400 bg-orange-500/10 dark:bg-orange-400/10 border-orange-500/30 dark:border-orange-400/30",
  GC: "text-red-700 dark:text-red-400 bg-red-500/10 dark:bg-red-400/10 border-red-500/30 dark:border-red-400/30",
  POLYTECH: "text-pink-700 dark:text-pink-400 bg-pink-500/10 dark:bg-pink-400/10 border-pink-500/30 dark:border-pink-400/30",
  ASHIR: "text-indigo-700 dark:text-indigo-400 bg-indigo-500/10 dark:bg-indigo-400/10 border-indigo-500/30 dark:border-indigo-400/30",
  HDC: "text-yellow-700 dark:text-yellow-400 bg-yellow-500/10 dark:bg-yellow-400/10 border-yellow-500/30 dark:border-yellow-400/30",
  SOLUTION_BOX: "text-lime-700 dark:text-lime-400 bg-lime-500/10 dark:bg-lime-400/10 border-lime-500/30 dark:border-lime-400/30",
  DISTECNA: "text-violet-700 dark:text-violet-400 bg-violet-500/10 dark:bg-violet-400/10 border-violet-500/30 dark:border-violet-400/30",
  CEVEN: "text-rose-700 dark:text-rose-400 bg-rose-500/10 dark:bg-rose-400/10 border-rose-500/30 dark:border-rose-400/30",
  DIAPSTORE: "text-blue-700 dark:text-blue-400 bg-blue-500/10 dark:bg-blue-400/10 border-blue-500/30 dark:border-blue-400/30",
};
