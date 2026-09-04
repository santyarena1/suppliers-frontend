import type { NormalizedProduct } from "../providers/types";
import type { DiffItem, ImportDiff, PreviousOffer, PriceChange } from "./types";

const SAMPLE_LIMIT = 300;

/**
 * Compara la lista nueva contra lo que había (las ofertas del mismo nivel de la
 * carga anterior): nuevos, precio cambiado, sin cambio, desaparecidos.
 * Las muestras se acotan para que el JSON de la carga no crezca sin control.
 */
export function computeDiff(previous: PreviousOffer[], items: NormalizedProduct[]): ImportDiff {
  const previousById = new Map(previous.map((p) => [p.externalId, p]));
  const seen = new Set<string>();

  const created: DiffItem[] = [];
  const priceChanged: PriceChange[] = [];
  let createdCount = 0;
  let changedCount = 0;
  let unchanged = 0;
  let withoutPrice = 0;

  for (const item of items) {
    seen.add(item.externalId);
    const price = comparablePrice(item.price, item.finalPrice);
    if (price == null) withoutPrice++;

    const before = previousById.get(item.externalId);
    if (!before) {
      createdCount++;
      if (created.length < SAMPLE_LIMIT) created.push({ externalId: item.externalId, name: item.name, price });
      continue;
    }
    const beforePrice = comparablePrice(before.price, before.finalPrice);
    if (!sameNumber(beforePrice, price)) {
      changedCount++;
      if (priceChanged.length < SAMPLE_LIMIT) {
        priceChanged.push({
          externalId: item.externalId,
          name: item.name,
          before: beforePrice,
          after: price,
          percent: percentChange(beforePrice, price),
        });
      }
    } else {
      unchanged++;
    }
  }

  const missing: DiffItem[] = [];
  const missingIds: string[] = [];
  for (const before of previous) {
    if (seen.has(before.externalId)) continue;
    missingIds.push(before.externalId);
    if (missing.length < SAMPLE_LIMIT) {
      missing.push({
        externalId: before.externalId,
        name: before.name,
        price: comparablePrice(before.price, before.finalPrice),
      });
    }
  }

  return {
    counts: {
      created: createdCount,
      priceChanged: changedCount,
      unchanged,
      missing: missingIds.length,
      withoutPrice,
    },
    samples: { created, priceChanged, missing },
    missingIds,
  };
}

/** El precio que se compara: el neto si existe, si no el final. */
function comparablePrice(price: unknown, finalPrice: unknown): number | null {
  const p = toNumber(price);
  if (p != null) return p;
  return toNumber(finalPrice);
}

function toNumber(value: unknown): number | null {
  if (value == null) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function sameNumber(a: number | null, b: number | null): boolean {
  if (a == null || b == null) return a == null && b == null;
  return Math.abs(a - b) < 0.00005;
}

export function percentChange(before: number | null, after: number | null): number | null {
  if (before == null || after == null || before === 0) return null;
  return Math.round(((after - before) / before) * 10000) / 100;
}
