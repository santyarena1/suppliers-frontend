import type { PrismaService } from "../prisma/prisma.service";
import type { NormalizedProduct } from "../providers/types";
import type { RowIssue } from "./types";

export interface CatalogMatchResult {
  items: NormalizedProduct[];
  issues: RowIssue[];
  /** Filas que cayeron en una ficha ya existente del proveedor. */
  matched: number;
  /** Filas que no coinciden con ninguna ficha conocida (se crean nuevas). */
  unmatched: number;
  /** Cuántas fichas tenía el proveedor antes de esta carga. 0 = catálogo nuevo. */
  knownCatalogSize: number;
}

const LOOKUP_CHUNK = 500;

/**
 * Hace que una lista caiga en las fichas que el proveedor ya tiene, en vez de
 * crear un catálogo paralelo: si el código de la planilla no existe pero el SKU,
 * el EAN o el part number sí, la fila adopta el código conocido. Vale sobre todo
 * para proveedores con API a los que un comercio les carga su propio Excel.
 *
 * Lo que no matchea se deja tal cual (se crea) y se cuenta: muchas filas sin
 * match en un catálogo grande es señal de columna de código mal mapeada.
 */
export async function matchAgainstCatalog(
  prisma: Pick<PrismaService, "providerSyncCache">,
  provider: string,
  items: NormalizedProduct[]
): Promise<CatalogMatchResult> {
  const knownCatalogSize = await prisma.providerSyncCache.count({ where: { provider } });
  if (knownCatalogSize === 0 || items.length === 0) {
    return { items, issues: [], matched: 0, unmatched: knownCatalogSize === 0 ? 0 : items.length, knownCatalogSize };
  }

  const byExternalId = new Set<string>();
  const bySku = new Map<string, string>();
  const byEan = new Map<string, string>();
  const byPartNumber = new Map<string, string>();

  const ids = uniq(items.map((i) => i.externalId));
  const skus = uniq(items.map((i) => i.sku));
  const eans = uniq(items.map((i) => i.ean));
  const pns = uniq(items.map((i) => i.partNumber));

  for (const chunk of chunks([...ids, ...skus, ...eans, ...pns], LOOKUP_CHUNK)) {
    const rows = await prisma.providerSyncCache.findMany({
      where: {
        provider,
        OR: [{ externalId: { in: chunk } }, { sku: { in: chunk } }, { ean: { in: chunk } }, { partNumber: { in: chunk } }],
      },
      select: { externalId: true, sku: true, ean: true, partNumber: true },
    });
    for (const row of rows) {
      byExternalId.add(row.externalId);
      if (row.sku) bySku.set(norm(row.sku), row.externalId);
      if (row.ean) byEan.set(norm(row.ean), row.externalId);
      if (row.partNumber) byPartNumber.set(norm(row.partNumber), row.externalId);
    }
  }

  const issues: RowIssue[] = [];
  const seen = new Set<string>();
  let matched = 0;
  let unmatched = 0;
  const out: NormalizedProduct[] = [];

  for (const item of items) {
    let externalId = item.externalId;
    if (!byExternalId.has(externalId)) {
      const alt =
        (item.sku && bySku.get(norm(item.sku))) ||
        (item.ean && byEan.get(norm(item.ean))) ||
        (item.partNumber && byPartNumber.get(norm(item.partNumber))) ||
        null;
      if (alt) externalId = alt;
    }
    if (byExternalId.has(externalId)) matched++;
    else unmatched++;

    if (seen.has(externalId)) {
      issues.push({ row: 0, message: `El código ${item.externalId} cae en la misma ficha (${externalId}) que otra fila; se conserva la primera` });
      continue;
    }
    seen.add(externalId);
    out.push(externalId === item.externalId ? item : { ...item, externalId });
  }

  return { items: out, issues, matched, unmatched, knownCatalogSize };
}

function norm(value: string): string {
  return value.trim().toLowerCase();
}

function uniq(values: (string | undefined)[]): string[] {
  return [...new Set(values.filter((v): v is string => typeof v === "string" && v.trim() !== ""))];
}

function* chunks<T>(arr: T[], size: number): Generator<T[]> {
  for (let i = 0; i < arr.length; i += size) yield arr.slice(i, i + size);
}
