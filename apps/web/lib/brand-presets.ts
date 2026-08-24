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
  { value: "hero_side", label: "Hero lateral" },
  { value: "tile_1", label: "Tile 1" },
  { value: "tile_2", label: "Tile 2" },
  { value: "tile_3", label: "Tile 3" },
  { value: "tile_4", label: "Tile 4" },
  { value: "strip", label: "Banda ancha" },
] as const;

export type BannerSlot = (typeof BANNER_SLOTS)[number]["value"];

/**
 * Clases legacy de grid (admin fallback / listas).
 * El collage orgánico usa `BANNER_SLOT_COLLAGE`.
 */
export const BANNER_SLOT_GRID_CLASS: Record<BannerSlot, string> = {
  hero_main: "md:col-span-2 md:row-span-2 min-h-[200px] md:min-h-[280px]",
  hero_side: "md:col-span-2 md:row-span-2 min-h-[200px] md:min-h-[280px]",
  tile_1: "min-h-[120px]",
  tile_2: "min-h-[120px]",
  tile_3: "min-h-[120px]",
  tile_4: "min-h-[120px]",
  strip: "md:col-span-4 min-h-[100px]",
};

/**
 * Collage en desktop: posiciones absolutas que se cruzan.
 * En mobile se apilan con el mismo orden visual pero sin overlap extremo.
 */
export const BANNER_SLOT_COLLAGE: Record<
  BannerSlot,
  { desktop: string; mobile: string }
> = {
  hero_main: {
    desktop:
      "md:absolute md:left-0 md:top-0 md:w-[62%] md:h-[62%] md:z-[20] md:-rotate-2 md:rounded-[1.75rem]",
    mobile: "relative w-full min-h-[180px] rounded-2xl -rotate-1 z-[20]",
  },
  hero_side: {
    desktop:
      "md:absolute md:right-[-1%] md:top-[6%] md:w-[46%] md:h-[54%] md:z-[28] md:rotate-[3deg] md:rounded-[1.5rem]",
    mobile: "relative w-[92%] ml-auto min-h-[150px] rounded-2xl rotate-2 -mt-6 z-[28]",
  },
  tile_1: {
    desktop:
      "md:absolute md:left-[4%] md:top-[52%] md:w-[30%] md:h-[32%] md:z-[34] md:rotate-[4deg] md:rounded-2xl",
    mobile: "relative w-[88%] min-h-[120px] rounded-2xl rotate-2 -mt-4 z-[34]",
  },
  tile_2: {
    desktop:
      "md:absolute md:left-[30%] md:top-[48%] md:w-[28%] md:h-[30%] md:z-[36] md:-rotate-[3deg] md:rounded-2xl",
    mobile: "relative w-[90%] ml-auto min-h-[120px] rounded-2xl -rotate-2 -mt-5 z-[36]",
  },
  tile_3: {
    desktop:
      "md:absolute md:right-[18%] md:top-[50%] md:w-[26%] md:h-[28%] md:z-[32] md:rotate-[2deg] md:rounded-2xl",
    mobile: "relative w-[86%] min-h-[110px] rounded-2xl rotate-1 -mt-4 z-[32]",
  },
  tile_4: {
    desktop:
      "md:absolute md:right-[2%] md:top-[56%] md:w-[24%] md:h-[26%] md:z-[38] md:-rotate-[4deg] md:rounded-2xl",
    mobile: "relative w-[84%] ml-auto min-h-[110px] rounded-2xl -rotate-1 -mt-4 z-[38]",
  },
  strip: {
    desktop:
      "md:absolute md:left-[6%] md:bottom-0 md:w-[88%] md:h-[18%] md:z-[42] md:rotate-[-1deg] md:rounded-2xl",
    mobile: "relative w-full min-h-[88px] rounded-2xl -rotate-1 -mt-3 z-[42]",
  },
};

/** Medidas recomendadas (px) para que el recorte se vea nítido en el collage. */
export const BANNER_SLOT_RECOMMENDED: Record<
  BannerSlot,
  { width: number; height: number; hint: string }
> = {
  hero_main: {
    width: 1400,
    height: 900,
    hint: "Pieza grande que se cruza con el hero lateral. Preferí horizontal amplio.",
  },
  hero_side: {
    width: 1000,
    height: 900,
    hint: "Se solapa arriba a la derecha del hero principal.",
  },
  tile_1: { width: 700, height: 520, hint: "Tile inferior izquierdo, levemente girado." },
  tile_2: { width: 680, height: 500, hint: "Tile central, se cruza con tile 1 y 3." },
  tile_3: { width: 640, height: 480, hint: "Tile medio-derecho." },
  tile_4: { width: 600, height: 460, hint: "Tile derecho, el más alto en el stack." },
  strip: {
    width: 1920,
    height: 320,
    hint: "Banda inferior que cruza por encima de los tiles.",
  },
};

export const BANNER_SLOT_ORDER: BannerSlot[] = [
  "hero_main", "hero_side", "tile_1", "tile_2", "tile_3", "tile_4", "strip",
];
