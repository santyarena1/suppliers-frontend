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
  if (typeof document === "undefined") return;
  const palette = BRAND_PRESETS[preset] ?? BRAND_PRESETS.violet;
  const root = document.documentElement;
  for (const [step, rgb] of Object.entries(palette)) {
    root.style.setProperty(`--brand-${step}`, rgb);
  }
  root.dataset.brandPreset = preset;
}

export const BRAND_PRESET_STORAGE_KEY = "nodo_brand_preset";

export function isBrandPreset(value: unknown): value is BrandPreset {
  return typeof value === "string" && value in BRAND_PRESETS;
}

export function readCachedBrandPreset(): BrandPreset | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(BRAND_PRESET_STORAGE_KEY);
    return isBrandPreset(raw) ? raw : null;
  } catch {
    return null;
  }
}

export function writeCachedBrandPreset(preset: BrandPreset) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(BRAND_PRESET_STORAGE_KEY, preset);
  } catch {
    /* ignore quota / private mode */
  }
}

/**
 * Script bloqueante (antes del paint) para aplicar marca + tema desde localStorage
 * y evitar el flash de violet/soft por defecto.
 */
export function brandThemeBootScript(): string {
  const palettes = JSON.stringify(BRAND_PRESETS);
  return `(function(){try{
    var palettes=${palettes};
    var preset=localStorage.getItem(${JSON.stringify(BRAND_PRESET_STORAGE_KEY)});
    if(preset&&palettes[preset]){
      var p=palettes[preset],r=document.documentElement;
      for(var k in p){if(Object.prototype.hasOwnProperty.call(p,k))r.style.setProperty('--brand-'+k,p[k]);}
      r.dataset.brandPreset=preset;
    }
    var theme=localStorage.getItem('pref_theme');
    if(theme==='light'||theme==='dark'||theme==='soft'){
      document.documentElement.setAttribute('data-theme',theme);
    }
  }catch(e){}})();`;
}

export const BANNER_SLOTS = [
  { value: "hero_main", label: "Hero principal (grande)" },
  { value: "hero_side", label: "Hero lateral" },
  { value: "tile_1", label: "Tile 1" },
  { value: "tile_2", label: "Tile 2" },
  { value: "tile_3", label: "Tile 3" },
  { value: "tile_4", label: "Tile 4" },
  { value: "strip", label: "Banda ancha" },
  // Segundo módulo de publicidad (debajo del bento principal)
  { value: "mid_wide", label: "Módulo 2 · ancho" },
  { value: "mid_tall", label: "Módulo 2 · columna" },
  { value: "mid_a", label: "Módulo 2 · tile A" },
  { value: "mid_b", label: "Módulo 2 · tile B" },
  { value: "mid_c", label: "Módulo 2 · tile C" },
  { value: "mid_strip", label: "Módulo 2 · banda" },
] as const;

export type BannerSlot = (typeof BANNER_SLOTS)[number]["value"];

/**
 * Clases legacy de grid (admin fallback / listas).
 * El layout vivo usa `BANNER_SLOT_BENTO`.
 */
export const BANNER_SLOT_GRID_CLASS: Record<BannerSlot, string> = {
  hero_main: "md:col-span-6 md:row-span-2 min-h-[200px] md:min-h-[280px]",
  hero_side: "md:col-span-3 min-h-[140px]",
  tile_1: "md:col-span-3 min-h-[120px]",
  tile_2: "md:col-span-3 min-h-[120px]",
  tile_3: "md:col-span-3 md:row-span-2 min-h-[120px]",
  tile_4: "md:col-span-3 md:row-span-3 min-h-[140px]",
  strip: "md:col-span-12 min-h-[96px]",
  mid_wide: "md:col-span-6 md:row-span-2 min-h-[160px]",
  mid_tall: "md:col-span-3 md:row-span-2 min-h-[160px]",
  mid_a: "md:col-span-3 min-h-[120px]",
  mid_b: "md:col-span-3 min-h-[120px]",
  mid_c: "md:col-span-6 min-h-[120px]",
  mid_strip: "md:col-span-12 min-h-[88px]",
};

/**
 * Bento principal: tamaños distintos, gaps uniformes, sin solapes.
 *
 * Desktop (12 columnas × 4 filas):
 * ┌──────────────┬────────┬────┐
 * │  hero_main   │ hero_s │ t4 │
 * │              ├────────┤    │
 * │              │ tile_3 │    │
 * ├──────┬───────┤        │    │
 * │ t1   │  t2   │        │    │
 * ├──────┴───────┴────────┴────┤
 * │           strip            │
 * └────────────────────────────┘
 */
export const BANNER_SLOT_BENTO: Record<BannerSlot, string> = {
  hero_main:
    "col-span-2 row-span-1 min-h-[180px] md:col-span-6 md:row-span-2 md:min-h-0 md:col-start-1 md:row-start-1",
  hero_side:
    "col-span-1 min-h-[140px] md:col-span-3 md:row-span-1 md:min-h-0 md:col-start-7 md:row-start-1",
  tile_4:
    "col-span-1 min-h-[140px] md:col-span-3 md:row-span-3 md:min-h-0 md:col-start-10 md:row-start-1",
  tile_1:
    "col-span-1 min-h-[120px] md:col-span-3 md:row-span-1 md:min-h-0 md:col-start-1 md:row-start-3",
  tile_2:
    "col-span-1 min-h-[120px] md:col-span-3 md:row-span-1 md:min-h-0 md:col-start-4 md:row-start-3",
  tile_3:
    "col-span-2 min-h-[140px] md:col-span-3 md:row-span-2 md:min-h-0 md:col-start-7 md:row-start-2",
  strip:
    "col-span-2 min-h-[88px] md:col-span-12 md:row-span-1 md:min-h-0 md:col-start-1 md:row-start-4",

  mid_wide:
    "col-span-2 min-h-[160px] md:col-span-6 md:row-span-2 md:min-h-0 md:col-start-1 md:row-start-1",
  mid_a:
    "col-span-1 min-h-[120px] md:col-span-3 md:row-span-1 md:min-h-0 md:col-start-7 md:row-start-1",
  mid_tall:
    "col-span-1 min-h-[160px] md:col-span-3 md:row-span-2 md:min-h-0 md:col-start-10 md:row-start-1",
  mid_b:
    "col-span-1 min-h-[120px] md:col-span-3 md:row-span-1 md:min-h-0 md:col-start-7 md:row-start-2",
  mid_c:
    "col-span-2 min-h-[120px] md:col-span-6 md:row-span-1 md:min-h-0 md:col-start-1 md:row-start-3",
  mid_strip:
    "col-span-2 min-h-[80px] md:col-span-12 md:row-span-1 md:min-h-0 md:col-start-1 md:row-start-4",
};

/** Contenedor del bento principal. */
export const BANNER_BENTO_CONTAINER =
  "grid grid-cols-2 gap-3 md:grid-cols-12 md:grid-rows-[repeat(3,minmax(118px,1fr))_minmax(96px,auto)] md:gap-4";

/** Segundo módulo de publicidad (debajo del principal). */
export const BANNER_BENTO_SECONDARY_CONTAINER =
  "grid grid-cols-2 gap-3 md:grid-cols-12 md:grid-rows-[repeat(2,minmax(110px,1fr))_minmax(100px,auto)_minmax(84px,auto)] md:gap-4";

/** Medidas recomendadas (px) para que el recorte se vea nítido. */
export const BANNER_SLOT_RECOMMENDED: Record<
  BannerSlot,
  { width: number; height: number; hint: string }
> = {
  hero_main: {
    width: 1200,
    height: 640,
    hint: "Bloque grande superior izquierdo (2 filas × 6 columnas).",
  },
  hero_side: {
    width: 720,
    height: 320,
    hint: "Bloque chico arriba, a la derecha del hero.",
  },
  tile_1: {
    width: 560,
    height: 420,
    hint: "Cuadrado inferior izquierdo.",
  },
  tile_2: {
    width: 560,
    height: 420,
    hint: "Cuadrado al lado de tile 1.",
  },
  tile_3: {
    width: 640,
    height: 720,
    hint: "Vertical medio: debajo del hero lateral (2 filas).",
  },
  tile_4: {
    width: 480,
    height: 960,
    hint: "Columna alta a la derecha (toda la altura del bento).",
  },
  strip: {
    width: 1920,
    height: 280,
    hint: "Banda ancha debajo del bento principal.",
  },
  mid_wide: {
    width: 1200,
    height: 560,
    hint: "Módulo 2 · bloque ancho izquierdo (2 filas).",
  },
  mid_tall: {
    width: 480,
    height: 640,
    hint: "Módulo 2 · columna alta derecha.",
  },
  mid_a: {
    width: 560,
    height: 320,
    hint: "Módulo 2 · tile superior centro.",
  },
  mid_b: {
    width: 560,
    height: 320,
    hint: "Módulo 2 · tile inferior centro.",
  },
  mid_c: {
    width: 1200,
    height: 320,
    hint: "Módulo 2 · banda media bajo el bloque ancho.",
  },
  mid_strip: {
    width: 1920,
    height: 240,
    hint: "Módulo 2 · franja full width inferior.",
  },
};

export const BANNER_SLOT_ORDER_PRIMARY: BannerSlot[] = [
  "hero_main", "hero_side", "tile_4", "tile_1", "tile_2", "tile_3", "strip",
];

export const BANNER_SLOT_ORDER_SECONDARY: BannerSlot[] = [
  "mid_wide", "mid_a", "mid_tall", "mid_b", "mid_c", "mid_strip",
];

/** Orden completo (admin / demos). */
export const BANNER_SLOT_ORDER: BannerSlot[] = [
  ...BANNER_SLOT_ORDER_PRIMARY,
  ...BANNER_SLOT_ORDER_SECONDARY,
];
