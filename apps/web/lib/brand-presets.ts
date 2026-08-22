/** Presets de color de marca — el admin elige uno y se aplican como CSS variables. */
export type BrandPreset = "violet" | "gamer_red" | "ocean" | "emerald";

export interface BrandPalette {
  50: string;
  100: string;
  200: string;
  300: string;
  400: string;
  500: string;
  600: string;
  700: string;
  800: string;
  900: string;
  950: string;
}

/** RGB components (space-separated) for Tailwind `rgb(var(--brand-N) / α)`. */
export const BRAND_PRESETS: Record<BrandPreset, BrandPalette> = {
  violet: {
    50: "238 236 255",
    100: "225 222 255",
    200: "200 194 255",
    300: "167 158 254",
    400: "134 118 253",
    500: "95 77 252",
    600: "64 51 252",
    700: "52 35 224",
    800: "43 28 184",
    900: "36 27 143",
    950: "21 15 82",
  },
  gamer_red: {
    50: "255 241 241",
    100: "255 224 224",
    200: "255 196 196",
    300: "255 154 154",
    400: "248 104 104",
    500: "234 56 56",
    600: "220 38 38",
    700: "185 28 28",
    800: "153 27 27",
    900: "127 29 29",
    950: "69 10 10",
  },
  ocean: {
    50: "240 249 255",
    100: "224 242 254",
    200: "186 230 253",
    300: "125 211 252",
    400: "56 189 248",
    500: "14 165 233",
    600: "2 132 199",
    700: "3 105 161",
    800: "7 89 133",
    900: "12 74 110",
    950: "8 47 73",
  },
  emerald: {
    50: "236 253 245",
    100: "209 250 229",
    200: "167 243 208",
    300: "110 231 183",
    400: "52 211 153",
    500: "16 185 129",
    600: "5 150 105",
    700: "4 120 87",
    800: "6 95 70",
    900: "6 78 59",
    950: "2 44 34",
  },
};

export const BRAND_PRESET_LABELS: Record<BrandPreset, string> = {
  violet: "Violeta NODO (actual)",
  gamer_red: "Rojo gamer",
  ocean: "Azul océano",
  emerald: "Verde esmeralda",
};

export function applyBrandPreset(preset: BrandPreset) {
  const palette = BRAND_PRESETS[preset] ?? BRAND_PRESETS.violet;
  const root = document.documentElement;
  for (const [step, rgb] of Object.entries(palette)) {
    root.style.setProperty(`--brand-${step}`, rgb);
  }
  root.dataset.brandPreset = preset;
}

export const BANNER_SLOTS = [
  { value: "hero_main", label: "Hero principal (grande)" },
  { value: "hero_side", label: "Hero lateral (vertical)" },
  { value: "tile_1", label: "Tile 1" },
  { value: "tile_2", label: "Tile 2" },
  { value: "tile_3", label: "Tile 3" },
  { value: "tile_4", label: "Tile 4" },
  { value: "strip", label: "Banda ancha (full width)" },
] as const;

export type BannerSlot = (typeof BANNER_SLOTS)[number]["value"];

export const BANNER_SLOT_GRID_CLASS: Record<BannerSlot, string> = {
  hero_main: "md:col-span-2 md:row-span-2 min-h-[200px] md:min-h-[280px]",
  hero_side: "md:col-span-2 md:row-span-2 min-h-[200px] md:min-h-[280px]",
  tile_1: "min-h-[120px]",
  tile_2: "min-h-[120px]",
  tile_3: "min-h-[120px]",
  tile_4: "min-h-[120px]",
  strip: "md:col-span-4 min-h-[100px]",
};
