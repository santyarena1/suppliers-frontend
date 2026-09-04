import { DEFAULT_SANITY_THRESHOLDS, type ImportDiff, type SanityThresholds } from "./types";

export interface SanityInput {
  diff: ImportDiff;
  /** Filas normalizadas en esta carga. */
  rowsNow: number;
  /** Productos que había en la carga anterior del mismo nivel (0 si es la primera). */
  rowsBefore: number;
  /** Confianza en el perfil: EXACT (huella igual), PARTIAL (columnas clave iguales), PROPOSED (recién sugerido). */
  profileMatch: "EXACT" | "PARTIAL" | "PROPOSED" | "MANUAL";
}

/**
 * Decide si una carga se aplica sola o pide revisión. Devuelve los motivos en
 * lenguaje claro; lista vacía = aplicar. Una primera carga (sin anterior) solo
 * se revisa por perfil dudoso o filas inválidas: no hay contra qué comparar.
 */
export function evaluateSanity(input: SanityInput, thresholds: Partial<SanityThresholds> = {}): string[] {
  const t: SanityThresholds = { ...DEFAULT_SANITY_THRESHOLDS, ...thresholds };
  const reasons: string[] = [];
  const { counts, samples } = input.diff;

  if (input.profileMatch === "PROPOSED") {
    reasons.push("El perfil de lectura fue propuesto por IA y todavía no fue aprobado.");
  } else if (input.profileMatch === "PARTIAL") {
    reasons.push("La planilla no coincide exactamente con el formato conocido: hay columnas nuevas o faltantes.");
  }

  if (input.rowsNow === 0) {
    reasons.push("No se pudo leer ninguna fila de productos.");
    return reasons;
  }

  const invalidPercent = pct(counts.withoutPrice, input.rowsNow);
  if (invalidPercent > t.maxInvalidPricePercent) {
    reasons.push(`${counts.withoutPrice} de ${input.rowsNow} filas (${fmt(invalidPercent)} %) no tienen un precio válido.`);
  }

  if (input.rowsBefore > 0) {
    const missingPercent = pct(counts.missing, input.rowsBefore);
    if (missingPercent > t.maxMissingPercent) {
      reasons.push(`Desaparecen ${counts.missing} de ${input.rowsBefore} productos (${fmt(missingPercent)} %).`);
    }

    const existing = counts.priceChanged + counts.unchanged;
    const changedPercent = pct(counts.priceChanged, existing);
    if (existing > 0 && changedPercent > t.maxPriceChangedPercent) {
      reasons.push(`Cambió el precio de ${counts.priceChanged} de ${existing} productos (${fmt(changedPercent)} %).`);
    }

    if (input.rowsNow < input.rowsBefore * t.minRowsRatio) {
      reasons.push(`La lista trae ${input.rowsNow} filas y la anterior tenía ${input.rowsBefore}.`);
    }

    const uniform = uniformChangePercent(samples.priceChanged.map((c) => c.percent), t.uniformChangeMinCount);
    if (uniform !== null) {
      reasons.push(
        `Todos los cambios de precio son del ${fmt(uniform)} %: puede ser un cambio de moneda o de columna en vez de una actualización real.`
      );
    }
  }

  return reasons;
}

/** Si todos los cambios (con cantidad suficiente) tienen el mismo porcentaje, lo devuelve. */
export function uniformChangePercent(percents: (number | null)[], minCount: number): number | null {
  const values = percents.filter((p): p is number => p != null);
  if (values.length < minCount) return null;
  const first = values[0];
  const allSame = values.every((v) => Math.abs(v - first) < 0.5);
  return allSame ? first : null;
}

function pct(part: number, total: number): number {
  if (total <= 0) return 0;
  return (part / total) * 100;
}

function fmt(value: number): string {
  return (Math.round(value * 10) / 10).toString();
}
