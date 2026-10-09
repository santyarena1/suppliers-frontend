import { AttributeDef, CategorySchema } from "./schemas";

export type AttributeScalar = string | number | boolean;

/** De dónde sale cada dato propuesto. */
export type EnrichmentSource = "icecat" | "manufacturer" | "distributor" | "ai";

export interface AttributeValue {
  value: AttributeScalar;
  unit?: string;
  source: EnrichmentSource;
  confidence: number;
  /** URL o fragmento de texto que respalda el valor. */
  evidence?: string;
}

/** Una especificación cruda tal como la trae una fuente ("Longitud" = "229 mm"). */
export interface RawSpec {
  name: string;
  value: string;
}

export function normalizeSpecName(raw: string): string {
  return raw
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function compact(raw: string): string {
  return normalizeSpecName(raw).replace(/[^a-z0-9%+"]/g, "");
}

const TRUE_WORDS = new Set(["si", "sí", "yes", "y", "true", "1", "incluido", "included"]);
const FALSE_WORDS = new Set(["no", "n", "false", "0", "no compatible", "not supported", "no incluido"]);

/** Multiplicador para pasar de la unidad que trae el texto a la canónica. */
const UNIT_FACTORS: Record<string, Record<string, number>> = {
  GB: { tb: 1000, gb: 1, mb: 0.001 },
  MHz: { ghz: 1000, mhz: 1 },
  GHz: { mhz: 0.001, ghz: 1 },
  g: { kg: 1000, g: 1 },
  mm: { cm: 10, mm: 1 },
  meses: { anos: 12, ano: 12, years: 12, year: 12, meses: 1, mes: 1, months: 1, month: 1 },
  TB: { tb: 1, pb: 1000 },
};

function parseNumber(def: AttributeDef, raw: string): number | null {
  const text = normalizeSpecName(raw);
  const m = text.match(/(-?\d+(?:[.,]\d+)?)\s*([a-z%"]*)/);
  if (!m) return null;
  let n = Number(m[1].replace(",", "."));
  if (!Number.isFinite(n)) return null;
  const factors = def.unit ? UNIT_FACTORS[def.unit] : undefined;
  if (factors) {
    const unitWord = m[2] || (text.match(/\b(tb|gb|mb|ghz|mhz|kg|g|cm|mm|anos?|years?|meses?|months?)\b/)?.[1] ?? "");
    const factor = factors[unitWord];
    if (factor) n = n * factor;
  }
  return Math.round(n * 1000) / 1000;
}

function parseEnum(def: AttributeDef, raw: string): string | null {
  const values = def.values ?? [];
  const target = compact(raw);
  const exact = values.find((v) => compact(v) === target);
  if (exact) return exact;
  // El más largo contenido en el texto ("80 PLUS Gold certified" → "80 PLUS Gold").
  const contained = values.filter((v) => target.includes(compact(v))).sort((a, b) => b.length - a.length);
  return contained[0] ?? null;
}

function parseBool(raw: string): boolean | null {
  const t = normalizeSpecName(raw);
  if (TRUE_WORDS.has(t)) return true;
  if (FALSE_WORDS.has(t)) return false;
  return null;
}

/** Valor crudo → valor validado contra el tipo del atributo, o null si no encaja. */
export function parseAttributeValue(def: AttributeDef, raw: AttributeScalar | null | undefined): AttributeScalar | null {
  if (raw === null || raw === undefined) return null;
  if (def.type === "bool") {
    if (typeof raw === "boolean") return raw;
    return parseBool(String(raw));
  }
  if (def.type === "number") {
    if (typeof raw === "number") return Number.isFinite(raw) ? raw : null;
    return parseNumber(def, String(raw));
  }
  const text = String(raw).trim();
  if (!text || text.length > 200) return null;
  if (def.type === "enum") return parseEnum(def, text);
  return text;
}

/**
 * Lleva especificaciones crudas al esquema por nombre (alias). Devuelve solo
 * lo que se pudo validar; la primera spec que matchea gana.
 */
export function mapSpecsToSchema(
  schema: CategorySchema,
  specs: RawSpec[],
  source: EnrichmentSource,
  confidence: number,
  evidence?: string
): Record<string, AttributeValue> {
  const byAlias = new Map<string, AttributeDef>();
  for (const def of schema.attributes) {
    for (const alias of def.aliases ?? []) {
      const k = normalizeSpecName(alias);
      if (!byAlias.has(k)) byAlias.set(k, def);
    }
  }
  const out: Record<string, AttributeValue> = {};
  for (const spec of specs) {
    const def = byAlias.get(normalizeSpecName(spec.name));
    if (!def || out[def.key]) continue;
    const value = parseAttributeValue(def, spec.value);
    if (value === null) continue;
    out[def.key] = {
      value,
      ...(def.unit && def.type === "number" ? { unit: def.unit } : {}),
      source,
      confidence,
      evidence: evidence ? `${evidence} · ${spec.name}: ${spec.value}` : `${spec.name}: ${spec.value}`,
    };
  }
  return out;
}

/**
 * Combina atributos de varias fuentes: por cada clave gana el de mayor
 * confianza. Si dos fuentes confiables discrepan, se baja la confianza del
 * ganador y se deja constancia en la evidencia.
 */
export function mergeAttributes(...sets: Record<string, AttributeValue>[]): Record<string, AttributeValue> {
  const out: Record<string, AttributeValue> = {};
  for (const set of sets) {
    for (const [key, cand] of Object.entries(set)) {
      const cur = out[key];
      if (!cur) {
        out[key] = cand;
        continue;
      }
      const [win, lose] = cand.confidence > cur.confidence ? [cand, cur] : [cur, cand];
      const disagree = String(win.value).toLowerCase() !== String(lose.value).toLowerCase() && lose.confidence >= 0.6;
      out[key] = disagree
        ? {
            ...win,
            confidence: Math.round(win.confidence * 0.8 * 100) / 100,
            evidence: `${win.evidence ?? ""} (${lose.source} dice ${String(lose.value)})`.trim(),
          }
        : win;
    }
  }
  return out;
}
