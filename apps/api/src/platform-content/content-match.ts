/**
 * Cruce del contenido enriquecido de una fuente externa (AcuStock) con las fichas
 * de los distribuidores en NODO. Funciones puras: sin base de datos.
 *
 * Prioridad: código del distribuidor (contra id, código o número de parte de la
 * ficha) > EAN > número de parte. Una ficha queda vinculada a un solo contenido;
 * si dos contenidos la reclaman con la misma prioridad, no se vincula (ambigua).
 */

export type MatchKind = "SUPPLIER_CODE" | "EAN" | "PART_NUMBER";

export interface SourceProduct {
  id: string;
  brand: string | null;
  ean: string | null;
  partNumber: string | null;
  supplierCodes: { supplier: string; code: string }[];
}

export interface CatalogRow {
  provider: string;
  externalId: string;
  sku: string | null;
  partNumber: string | null;
  ean: string | null;
  brand: string | null;
}

export interface ContentLink {
  contentId: string;
  provider: string;
  externalId: string;
  matchedBy: MatchKind;
}

export interface MatchStats {
  sourceTotal: number;
  sourceMatched: number;
  sourceUnmatched: number;
  links: number;
  byKind: Record<MatchKind, number>;
  byProvider: Record<string, number>;
  ambiguous: number;
  unknownSuppliers: Record<string, number>;
  unmatchedSample: string[];
}

const RANK: Record<MatchKind, number> = { SUPPLIER_CODE: 3, EAN: 2, PART_NUMBER: 1 };
/** Números de parte más cortos que esto ("K380", "G502") chocan entre marcas. */
const MIN_PART_NUMBER = 6;
const UNMATCHED_SAMPLE = 30;

/** Código de distribuidor: mayúsculas, sin espacios. */
export function normalizeCode(value: string | null | undefined): string | null {
  const v = (value ?? "").trim().toUpperCase().replace(/\s+/g, "");
  return v || null;
}

/** EAN/UPC: solo dígitos y sin ceros a la izquierda (UPC-12 y EAN-13 del mismo producto coinciden). */
export function normalizeEan(value: string | null | undefined): string | null {
  const digits = (value ?? "").replace(/\D/g, "").replace(/^0+/, "");
  return digits.length >= 8 ? digits : null;
}

/** Número de parte: sin espacios ni guiones, en mayúsculas; los muy cortos no sirven para cruzar. */
export function normalizePartNumber(value: string | null | undefined): string | null {
  const v = (value ?? "").toUpperCase().replace(/[\s\-_.\/]+/g, "");
  return v.length >= MIN_PART_NUMBER ? v : null;
}

const normBrand = (b: string | null | undefined) => (b ?? "").trim().toLowerCase();

function brandsCompatible(a: string | null, b: string | null): boolean {
  const x = normBrand(a);
  const y = normBrand(b);
  return !x || !y || x === y || x.includes(y) || y.includes(x);
}

function push<K, V>(map: Map<K, V[]>, key: K, value: V) {
  const list = map.get(key);
  if (list) list.push(value);
  else map.set(key, [value]);
}

interface CatalogIndex {
  /** `${provider}|${code}` → filas, con el campo que coincidió (id primero). */
  byCode: Map<string, { row: CatalogRow; field: number }[]>;
  byEan: Map<string, CatalogRow[]>;
  byPart: Map<string, CatalogRow[]>;
}

export function buildCatalogIndex(rows: CatalogRow[]): CatalogIndex {
  const byCode = new Map<string, { row: CatalogRow; field: number }[]>();
  const byEan = new Map<string, CatalogRow[]>();
  const byPart = new Map<string, CatalogRow[]>();
  for (const row of rows) {
    [row.externalId, row.sku, row.partNumber].forEach((value, field) => {
      const code = normalizeCode(value);
      if (code) push(byCode, `${row.provider}|${code}`, { row, field });
    });
    const ean = normalizeEan(row.ean);
    if (ean) push(byEan, ean, row);
    const part = normalizePartNumber(row.partNumber);
    if (part) push(byPart, part, row);
  }
  return { byCode, byEan, byPart };
}

/** Fichas que matchean un código de distribuidor: si coincide el id, gana; si no, el código; si no, el número de parte. */
function rowsForSupplierCode(index: CatalogIndex, provider: string, code: string): CatalogRow[] {
  const hits = index.byCode.get(`${provider}|${code}`) ?? [];
  if (!hits.length) return [];
  const best = Math.min(...hits.map((h) => h.field));
  return hits.filter((h) => h.field === best).map((h) => h.row);
}

/**
 * Cruza los productos de la fuente con el catálogo. `knownProviders` son las claves
 * de distribuidor válidas en NODO; las demás se cuentan en `unknownSuppliers`.
 */
export function matchContent(
  source: SourceProduct[],
  catalog: CatalogRow[],
  knownProviders: ReadonlySet<string>
): { links: ContentLink[]; stats: MatchStats } {
  const index = buildCatalogIndex(catalog);
  const unknownSuppliers: Record<string, number> = {};
  /** `${provider}|${externalId}` → reclamos de cada contenido con su mejor prioridad. */
  const claims = new Map<string, Map<string, MatchKind>>();
  const rowOf = new Map<string, CatalogRow>();

  const claim = (contentId: string, row: CatalogRow, kind: MatchKind) => {
    const key = `${row.provider}|${row.externalId}`;
    rowOf.set(key, row);
    const byContent = claims.get(key) ?? new Map<string, MatchKind>();
    const prev = byContent.get(contentId);
    if (!prev || RANK[kind] > RANK[prev]) byContent.set(contentId, kind);
    claims.set(key, byContent);
  };

  for (const product of source) {
    for (const { supplier, code } of product.supplierCodes) {
      if (!knownProviders.has(supplier)) {
        unknownSuppliers[supplier] = (unknownSuppliers[supplier] ?? 0) + 1;
        continue;
      }
      const norm = normalizeCode(code);
      if (!norm) continue;
      for (const row of rowsForSupplierCode(index, supplier, norm)) claim(product.id, row, "SUPPLIER_CODE");
    }
    const ean = normalizeEan(product.ean);
    if (ean) for (const row of index.byEan.get(ean) ?? []) claim(product.id, row, "EAN");
    const part = normalizePartNumber(product.partNumber);
    if (part) {
      for (const row of index.byPart.get(part) ?? []) {
        if (brandsCompatible(product.brand, row.brand)) claim(product.id, row, "PART_NUMBER");
      }
    }
  }

  const links: ContentLink[] = [];
  let ambiguous = 0;
  for (const [key, byContent] of claims) {
    const top = Math.max(...[...byContent.values()].map((k) => RANK[k]));
    const winners = [...byContent.entries()].filter(([, k]) => RANK[k] === top);
    if (winners.length > 1) {
      ambiguous++;
      continue;
    }
    const [contentId, matchedBy] = winners[0];
    const row = rowOf.get(key)!;
    links.push({ contentId, provider: row.provider, externalId: row.externalId, matchedBy });
  }

  return { links, stats: summarize(source, links, ambiguous, unknownSuppliers) };
}

function summarize(
  source: SourceProduct[],
  links: ContentLink[],
  ambiguous: number,
  unknownSuppliers: Record<string, number>
): MatchStats {
  const matched = new Set(links.map((l) => l.contentId));
  const byKind: Record<MatchKind, number> = { SUPPLIER_CODE: 0, EAN: 0, PART_NUMBER: 0 };
  const byProvider: Record<string, number> = {};
  for (const l of links) {
    byKind[l.matchedBy]++;
    byProvider[l.provider] = (byProvider[l.provider] ?? 0) + 1;
  }
  const unmatched = source.filter((p) => !matched.has(p.id));
  return {
    sourceTotal: source.length,
    sourceMatched: matched.size,
    sourceUnmatched: unmatched.length,
    links: links.length,
    byKind,
    byProvider,
    ambiguous,
    unknownSuppliers,
    unmatchedSample: unmatched.slice(0, UNMATCHED_SAMPLE).map((p) => p.id),
  };
}
