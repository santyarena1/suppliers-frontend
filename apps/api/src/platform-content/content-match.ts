/**
 * Cruce del contenido enriquecido de una fuente externa (AcuStock) con las fichas
 * de los distribuidores en NODO. Funciones puras: sin base de datos.
 *
 * Solo por los códigos de proveedor que trae cada producto: el contenido va a las
 * fichas que AcuStock agrupó en ese producto y a ninguna otra (NODO no arma
 * agrupaciones nuevas por EAN ni número de parte). Cada ficha sigue siendo del
 * distribuidor, con su precio y su stock; lo que se repite es el contenido.
 * Si dos productos reclaman la misma ficha, no se vincula (ambigua).
 */

export type MatchKind = "SUPPLIER_CODE";

export interface SourceProduct {
  id: string;
  supplierCodes: { supplier: string; code: string }[];
}

export interface CatalogRow {
  provider: string;
  externalId: string;
  sku: string | null;
  partNumber: string | null;
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
  /** Productos sin ningún código de proveedor: no se pueden vincular. */
  sourceWithoutCodes: number;
  links: number;
  byKind: Record<MatchKind, number>;
  byProvider: Record<string, number>;
  ambiguous: number;
  unknownSuppliers: Record<string, number>;
  unmatchedSample: string[];
}

const UNMATCHED_SAMPLE = 30;

/** Código de distribuidor: mayúsculas, sin espacios. */
export function normalizeCode(value: string | null | undefined): string | null {
  const v = (value ?? "").trim().toUpperCase().replace(/\s+/g, "");
  return v || null;
}

/** `${provider}|${code}` → fichas, con el campo que coincidió (0 id, 1 código, 2 número de parte). */
export function buildCodeIndex(rows: CatalogRow[]): Map<string, { row: CatalogRow; field: number }[]> {
  const byCode = new Map<string, { row: CatalogRow; field: number }[]>();
  for (const row of rows) {
    [row.externalId, row.sku, row.partNumber].forEach((value, field) => {
      const code = normalizeCode(value);
      if (!code) return;
      const key = `${row.provider}|${code}`;
      const list = byCode.get(key);
      if (list) list.push({ row, field });
      else byCode.set(key, [{ row, field }]);
    });
  }
  return byCode;
}

/** Si el código coincide con el id de una ficha, gana; si no, con el código; si no, con el número de parte. */
function rowsForCode(index: Map<string, { row: CatalogRow; field: number }[]>, provider: string, code: string): CatalogRow[] {
  const hits = index.get(`${provider}|${code}`) ?? [];
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
  const index = buildCodeIndex(catalog);
  const unknownSuppliers: Record<string, number> = {};
  /** `${provider}|${externalId}` → contenidos que la reclaman. */
  const claims = new Map<string, Set<string>>();
  const rowOf = new Map<string, CatalogRow>();

  for (const product of source) {
    for (const { supplier, code } of product.supplierCodes) {
      if (!knownProviders.has(supplier)) {
        unknownSuppliers[supplier] = (unknownSuppliers[supplier] ?? 0) + 1;
        continue;
      }
      const norm = normalizeCode(code);
      if (!norm) continue;
      for (const row of rowsForCode(index, supplier, norm)) {
        const key = `${row.provider}|${row.externalId}`;
        rowOf.set(key, row);
        const set = claims.get(key) ?? new Set<string>();
        set.add(product.id);
        claims.set(key, set);
      }
    }
  }

  const links: ContentLink[] = [];
  let ambiguous = 0;
  for (const [key, contents] of claims) {
    if (contents.size > 1) {
      ambiguous++;
      continue;
    }
    const row = rowOf.get(key)!;
    links.push({ contentId: [...contents][0], provider: row.provider, externalId: row.externalId, matchedBy: "SUPPLIER_CODE" });
  }

  const matched = new Set(links.map((l) => l.contentId));
  const byProvider: Record<string, number> = {};
  for (const l of links) byProvider[l.provider] = (byProvider[l.provider] ?? 0) + 1;
  const unmatched = source.filter((p) => !matched.has(p.id));
  return {
    links,
    stats: {
      sourceTotal: source.length,
      sourceMatched: matched.size,
      sourceUnmatched: unmatched.length,
      sourceWithoutCodes: source.filter((p) => p.supplierCodes.length === 0).length,
      links: links.length,
      byKind: { SUPPLIER_CODE: links.length },
      byProvider,
      ambiguous,
      unknownSuppliers,
      unmatchedSample: unmatched
        .filter((p) => p.supplierCodes.length > 0)
        .slice(0, UNMATCHED_SAMPLE)
        .map((p) => p.id),
    },
  };
}
