import type { NormalizedField } from "./types";

/**
 * Nombres con los que suele venir cada campo en una planilla, en español e
 * inglés. Es la base del mapeo heurístico (sin IA) y una pista para el modelo.
 * Se comparan normalizados: minúsculas, sin acentos ni signos.
 */
export const HEADER_ALIASES: Record<NormalizedField, string[]> = {
  externalId: ["externalid", "codigo", "cod", "codart", "codiart", "codproducto", "codigoproducto", "id", "item", "articulo"],
  sku: ["sku", "codigointerno", "codinterno", "ref", "referencia"],
  partNumber: ["partnumber", "part_number", "pn", "parte", "nroparte", "codigoalfa", "modelo", "model", "mpn"],
  ean: ["ean", "upc", "codigobarras", "codigodebarras", "barcode", "gtin"],
  name: ["nombre", "name", "descripcion", "description", "producto", "product", "articulo", "detalle", "title", "titulo", "denominacion"],
  brand: ["marca", "brand", "fabricante", "manufacturer"],
  category: ["categoria", "rubro", "category", "familia", "linea", "tipo"],
  subcategory: ["subcategoria", "grupo", "subcategory", "subrubro", "subfamilia"],
  description: ["descripcionlarga", "descripciondetallada", "detalles", "caracteristicas", "observaciones"],
  longDescription: ["longdescription", "descripcioncompleta", "ficha", "especificaciones"],
  price: [
    "precio",
    "price",
    "preciousd",
    "preciodolar",
    "preciou$s",
    "costo",
    "cost",
    "precioneto",
    "neto",
    "preciosiniva",
    "siniva",
    "preciounitario",
    "unitario",
    "pvp",
    "preciolista",
    "lista",
    "precioars",
    "preciopesos",
    "pesos",
    "usd",
    "ars",
  ],
  finalPrice: ["preciofinal", "final", "finalprice", "precioconiva", "coniva", "preciopublico", "publico", "ivaincluido"],
  currency: ["moneda", "currency", "divisa"],
  ivaPercent: ["iva", "ivapercent", "alicuotaiva", "alicuota", "taxrate", "porcentajeiva", "impuesto"],
  stock: ["stock", "cantidad", "disponible", "existencia", "qty", "quantity", "unidades", "disponibles"],
  stockStatus: ["estadostock", "stockstatus", "estado", "disponibilidad", "availability"],
  imageUrl: ["imagen", "imageurl", "foto", "urlimagen", "image", "picture"],
  productUrl: ["url", "link", "producturl", "enlace", "web"],
  locationAir: ["sucursal", "deposito", "ubicacion", "location", "origen"],
  warranty: ["garantia", "warranty"],
  weight: ["peso", "weight"],
  weightUnit: ["unidadpeso", "weightunit"],
  height: ["alto", "altura", "height"],
  width: ["ancho", "width"],
  length: ["largo", "profundidad", "length", "depth"],
  dimensionsUnit: ["unidaddimensiones", "dimensionsunit"],
  volume: ["volumen", "volume", "m3"],
  tags: ["tags", "etiquetas", "atributos", "keywords"],
};

/** Orden de prioridad al desempatar: qué campo gana si un alias aparece en varios. */
const FIELD_PRIORITY: NormalizedField[] = [
  "externalId",
  "name",
  "price",
  "finalPrice",
  "brand",
  "category",
  "subcategory",
  "stock",
  "currency",
  "ivaPercent",
  "ean",
  "partNumber",
  "sku",
  "description",
  "longDescription",
  "stockStatus",
  "imageUrl",
  "productUrl",
  "warranty",
  "weight",
  "weightUnit",
  "height",
  "width",
  "length",
  "dimensionsUnit",
  "volume",
  "tags",
  "locationAir",
];

export function normalizeHeader(header: string): string {
  return header
    .toString()
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9$]/g, "");
}

/** Cuántos encabezados coinciden con algún alias conocido. Sirve para puntuar filas candidatas a encabezado. */
export function countAliasHits(headers: string[]): number {
  let hits = 0;
  for (const header of headers) {
    const norm = normalizeHeader(header);
    if (!norm) continue;
    if (FIELD_PRIORITY.some((field) => HEADER_ALIASES[field].includes(norm))) hits++;
  }
  return hits;
}

/**
 * Mapeo heurístico columna → campo. Cada campo se asigna una sola vez (a la
 * primera columna que lo matchea) y cada columna a un solo campo, respetando la
 * prioridad. Lo que no matchea queda en `null`: se ignora, nunca se inventa.
 */
export function guessColumnMap(headers: string[]): Record<string, NormalizedField | null> {
  const map: Record<string, NormalizedField | null> = {};
  const takenFields = new Set<NormalizedField>();
  for (const header of headers) map[header] = null;

  for (const field of FIELD_PRIORITY) {
    for (const header of headers) {
      if (map[header] !== null) continue;
      const norm = normalizeHeader(header);
      if (norm && HEADER_ALIASES[field].includes(norm) && !takenFields.has(field)) {
        map[header] = field;
        takenFields.add(field);
        break;
      }
    }
  }

  // Sin código explícito, el SKU o el part number hacen de código.
  if (!takenFields.has("externalId")) {
    for (const fallback of ["sku", "partNumber", "ean"] as const) {
      const header = headers.find((h) => map[h] === fallback);
      if (header) {
        map[header] = "externalId";
        break;
      }
    }
  }
  return map;
}
