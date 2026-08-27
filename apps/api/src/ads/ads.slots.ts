/**
 * Espacios que el superadmin puede poner a la venta.
 * El precio y el cupo se editan después; acá solo está el catálogo inicial.
 */
export const DEFAULT_AD_SLOTS: Array<{
  key: string;
  name: string;
  description: string;
  placement: string;
  monthlyPriceUsd: number;
  maxConcurrent: number;
}> = [
  {
    key: "discovery",
    name: "Descubrimiento en Proveedores",
    description: "El comercio te ve aunque todavía no esté vinculado. Sin catálogo, solo presencia.",
    placement: "discovery",
    monthlyPriceUsd: 80,
    maxConcurrent: 20,
  },
  {
    key: "search_sponsored",
    name: "Patrocinado en búsqueda",
    description: "Una fila destacada arriba de los resultados.",
    placement: "search",
    monthlyPriceUsd: 120,
    maxConcurrent: 3,
  },
  {
    key: "hero_main",
    name: "Hero principal del buscador",
    description: "El bloque grande del bento en Búsqueda.",
    placement: "search",
    monthlyPriceUsd: 250,
    maxConcurrent: 1,
  },
  {
    key: "hero_side",
    name: "Hero lateral",
    description: "Al lado del hero principal.",
    placement: "search",
    monthlyPriceUsd: 90,
    maxConcurrent: 1,
  },
  {
    key: "tile_1",
    name: "Tile 1",
    description: "Cuadrado inferior izquierdo del bento.",
    placement: "search",
    monthlyPriceUsd: 45,
    maxConcurrent: 1,
  },
  {
    key: "tile_2",
    name: "Tile 2",
    description: "Cuadrado al lado del tile 1.",
    placement: "search",
    monthlyPriceUsd: 45,
    maxConcurrent: 1,
  },
  {
    key: "tile_3",
    name: "Tile 3",
    description: "Bloque vertical al centro-derecha.",
    placement: "search",
    monthlyPriceUsd: 70,
    maxConcurrent: 1,
  },
  {
    key: "tile_4",
    name: "Tile 4",
    description: "Columna alta a la derecha.",
    placement: "search",
    monthlyPriceUsd: 90,
    maxConcurrent: 1,
  },
  {
    key: "strip",
    name: "Banda ancha",
    description: "Franja inferior del buscador.",
    placement: "search",
    monthlyPriceUsd: 60,
    maxConcurrent: 1,
  },
];
