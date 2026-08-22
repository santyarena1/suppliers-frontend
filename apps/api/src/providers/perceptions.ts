import { asNumber, asRecord, asString, unwrapList } from "./json-value";

export type PerceptionLine = { label: string; amount: number };

function foldAccents(s: string) {
  return s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

export function isIibbDescription(desc?: string | null): boolean {
  const d = foldAccents(desc ?? "");
  return /i\.?i\.?b\.?b|ingresos\s*brutos/.test(d);
}

/** IIBB si el proveedor lo nombra; si no dice de qué es, "Percepciones". */
export function perceptionDisplayLabel(desc?: string | null): string {
  const orig = (desc ?? "").trim();
  if (!orig) return "Percepciones";
  if (isIibbDescription(orig)) return orig;
  return "Percepciones";
}

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

function lineFromRow(row: unknown): PerceptionLine | null {
  if (typeof row === "number" && Number.isFinite(row) && Math.abs(row) >= 0.0005) {
    return { label: "Percepciones", amount: row };
  }
  const rec = asRecord(row);
  if (!rec) return null;
  const amount =
    asNumber(rec.amount) ??
    asNumber(rec.total) ??
    asNumber(rec.value) ??
    asNumber(rec.perception) ??
    asNumber(rec.importe);
  if (amount == null || !Number.isFinite(amount) || Math.abs(amount) < 0.0005) return null;
  const name =
    asString(rec.name) ||
    asString(rec.description) ||
    asString(rec.label) ||
    asString(rec.desc) ||
    asString(rec.type) ||
    asString(rec.perceptionType);
  return { label: perceptionDisplayLabel(name), amount };
}

/**
 * Normaliza percepciones de Elit (`total.perceptions`) y similares.
 * No inventa montos: solo lee total / lista / campos numéricos que ya vengan.
 */
export function mapProviderPerceptions(raw: unknown): { total: number; lines: PerceptionLine[] } {
  if (raw == null) return { total: 0, lines: [] };
  if (typeof raw === "number") {
    if (!Number.isFinite(raw) || Math.abs(raw) < 0.0005) return { total: 0, lines: [] };
    return { total: round2(raw), lines: [{ label: "Percepciones", amount: round2(raw) }] };
  }
  if (typeof raw === "string") {
    const n = Number(raw.replace(",", "."));
    return mapProviderPerceptions(Number.isFinite(n) ? n : null);
  }

  const fromList = (list: unknown[]): PerceptionLine[] =>
    list.map(lineFromRow).filter((l): l is PerceptionLine => l != null);

  if (Array.isArray(raw)) {
    const lines = fromList(raw);
    return { total: round2(lines.reduce((s, l) => s + l.amount, 0)), lines };
  }

  const rec = asRecord(raw);
  if (!rec) return { total: 0, lines: [] };

  const nested =
    rec.details ?? rec.items ?? rec.list ?? rec.perceptions ?? rec.taxes ?? rec.breakdown;
  const nestedList = Array.isArray(nested) ? nested : unwrapList(nested);
  let lines = fromList(nestedList);

  if (lines.length === 0) {
    for (const [key, value] of Object.entries(rec)) {
      if (key === "total" || key === "amount") continue;
      const n = asNumber(value);
      if (n != null && Math.abs(n) >= 0.0005) {
        lines.push({ label: perceptionDisplayLabel(key), amount: n });
      }
    }
  }

  const totalField = asNumber(rec.total) ?? asNumber(rec.amount);
  if (lines.length === 0 && totalField != null && Math.abs(totalField) >= 0.0005) {
    lines = [{ label: "Percepciones", amount: totalField }];
  }

  const summed = round2(lines.reduce((s, l) => s + l.amount, 0));
  const total = totalField != null && totalField > summed ? round2(totalField) : summed;
  if (total > summed && lines.length === 0) {
    lines = [{ label: "Percepciones", amount: total }];
  }
  return { total, lines };
}

export function perceptionGroupLabel(lines: PerceptionLine[]): string {
  if (lines.length === 1) return lines[0].label;
  if (lines.length > 1 && lines.every((l) => isIibbDescription(l.label))) return "IIBB";
  return "Percepciones";
}
