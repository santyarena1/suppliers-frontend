import { RawSpec } from "../attributes";

export interface SourceImage {
  url: string;
  width?: number;
  height?: number;
}

/** Lo que una fuente externa sabe de un producto, ya normalizado. */
export interface SourceResult {
  /** icecat | asus | lenovo | tplink | hyperx | redragon ... */
  source: string;
  kind: "icecat" | "manufacturer";
  url: string | null;
  title: string | null;
  brand: string | null;
  partNumber: string | null;
  /** Código de modelo comercial, si la fuente lo da aparte (Icecat: ProductName). */
  modelCode?: string | null;
  gtins: string[];
  images: SourceImage[];
  description: string | null;
  longDescription: string | null;
  specs: RawSpec[];
  category: string | null;
  /** El resultado coincide con el producto buscado (part number o EAN verificado). */
  verified: boolean;
  /** Por qué se dio (o no) por verificado. */
  matchNote: string;
}

/** Respuesta HTTP ya leída (lo que se guarda en la caché de fuentes). */
export interface FetchedBody {
  status: number;
  /** JSON parseado o texto (HTML), según `json`. */
  body: unknown;
  url: string;
}

/** Acceso a la red que reciben los conectores: cacheado y con límite por fuente. */
export type SourceFetcher = (
  source: string,
  url: string,
  opts?: { json?: boolean; headers?: Record<string, string>; ttlDays?: number }
) => Promise<FetchedBody>;

/** Producto a buscar en las fuentes. */
export interface LookupQuery {
  brandKey: string | null;
  brand: string | null;
  /** Part number tal como lo cargó el distribuidor (el más común del maestro). */
  partNumber: string | null;
  /** Clave normalizada del part number (`pnKey`). */
  pnKey: string | null;
  gtin: string | null;
  name: string;
  /** Códigos de modelo candidatos (del nombre del distribuidor y de Icecat). */
  hints: string[];
}

export interface ManufacturerConnector {
  /** Clave de fuente (y de caché): asus, lenovo, tplink... */
  source: string;
  /** Marcas (brandKey) que atiende. */
  brandKeys: readonly string[];
  lookup(q: LookupQuery, fetcher: SourceFetcher): Promise<SourceResult | null>;
}

export function emptyResult(source: string, kind: SourceResult["kind"]): SourceResult {
  return {
    source,
    kind,
    url: null,
    title: null,
    brand: null,
    partNumber: null,
    gtins: [],
    images: [],
    description: null,
    longDescription: null,
    specs: [],
    category: null,
    verified: false,
    matchNote: "",
  };
}
