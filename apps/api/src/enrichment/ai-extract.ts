import { AttributeScalar, AttributeValue, normalizeSpecName, parseAttributeValue } from "./attributes";
import { CategorySchema } from "./schemas";

/** Lo mínimo que se necesita del cliente de IA (CatalogAiService lo cumple; en tests, un mock). */
export interface JsonAi {
  chatJson<T>(userPrompt: string, systemPrompt?: string): Promise<T>;
}

/** Precio de gpt-4o-mini (USD por millón de tokens), para estimar costo. */
export const AI_PRICE_PER_MTOK = { input: 0.15, output: 0.6 };
/** ~4 caracteres por token en español/inglés técnico. */
const CHARS_PER_TOKEN = 4;

export function estimateCostUsd(promptChars: number, outputChars: number): number {
  const input = (promptChars / CHARS_PER_TOKEN / 1_000_000) * AI_PRICE_PER_MTOK.input;
  const output = (outputChars / CHARS_PER_TOKEN / 1_000_000) * AI_PRICE_PER_MTOK.output;
  return input + output;
}

/** Confianza de un atributo extraído por IA cuya evidencia aparece literal en el texto. */
export const AI_EVIDENCED_CONFIDENCE = 0.7;
/** Sin evidencia literal: queda propuesto pero marcado como dudoso. */
export const AI_UNEVIDENCED_CONFIDENCE = 0.3;
/** Para redactar descripciones solo se usan atributos con al menos esta confianza. */
export const VERIFIED_ATTRIBUTE_CONFIDENCE = 0.7;

const EXTRACT_SYSTEM =
  "Sos un extractor de especificaciones de productos de informática. Respondés solo JSON válido. " +
  "Nunca inventás datos: si un atributo no está en el texto, no lo incluís.";

export function buildExtractionPrompt(schema: CategorySchema, productName: string, texts: { origin: string; text: string }[]): string {
  const attrs = schema.attributes.map((a) => ({
    key: a.key,
    label: a.label,
    type: a.type,
    ...(a.unit ? { unit: a.unit } : {}),
    ...(a.values ? { values: a.values } : {}),
  }));
  return `Producto: ${productName}
Extraé atributos SOLO de los textos de abajo, según este esquema:
${JSON.stringify(attrs)}
Respondé { "attributes": { "<key>": { "value": <valor>, "evidence": "<fragmento literal del texto que lo dice>" } } }.
Reglas:
- "evidence" tiene que ser una cita textual corta copiada de los textos (no la reformules).
- Números en la unidad del esquema (sin la unidad). "enum": uno de "values" exacto. "bool": true/false.
- Si un dato no aparece, no lo pongas. No completes con conocimiento propio.
Textos:
${texts.map((t, i) => `[${i + 1}] (${t.origin}) ${t.text}`).join("\n")}`;
}

function normalizeEvidence(s: string): string {
  return normalizeSpecName(s).replace(/[^a-z0-9]+/g, " ").trim();
}

/** Los dígitos del valor aparecen en la evidencia (para números). */
function numberInEvidence(value: number, evidence: string): boolean {
  const digits = String(value).replace(".", "[.,]?");
  return new RegExp(`(^|\\D)${digits}(\\D|$)`).test(evidence) || evidence.replace(/\D/g, "").includes(String(Math.round(value)));
}

/**
 * Valida la respuesta de la IA contra el esquema y contra el texto fuente:
 * tipos y valores permitidos, y que la evidencia esté literalmente en el
 * texto. Lo que no tiene evidencia queda con confianza baja.
 */
export function validateExtraction(schema: CategorySchema, response: unknown, sourceText: string): Record<string, AttributeValue> {
  const attrs = (response as { attributes?: Record<string, { value?: AttributeScalar; evidence?: string }> } | null)?.attributes;
  if (!attrs || typeof attrs !== "object") return {};
  const haystack = normalizeEvidence(sourceText);
  const out: Record<string, AttributeValue> = {};
  for (const def of schema.attributes) {
    const item = attrs[def.key];
    if (!item || item.value === undefined || item.value === null) continue;
    const value = parseAttributeValue(def, item.value);
    if (value === null) continue;
    const evidence = typeof item.evidence === "string" ? item.evidence.slice(0, 300) : "";
    const normalized = normalizeEvidence(evidence);
    let grounded = normalized.length >= 2 && haystack.includes(normalized);
    if (grounded && typeof value === "number") {
      // "1 TB" respalda 1000 GB: se acepta si la evidencia, leída con el mismo atributo, da el mismo número.
      grounded = numberInEvidence(value, evidence) || parseAttributeValue(def, evidence) === value;
    }
    out[def.key] = {
      value,
      ...(def.unit && def.type === "number" ? { unit: def.unit } : {}),
      source: "ai",
      confidence: grounded ? AI_EVIDENCED_CONFIDENCE : AI_UNEVIDENCED_CONFIDENCE,
      evidence: grounded ? evidence : `sin evidencia literal${evidence ? `: "${evidence}"` : ""}`,
    };
  }
  return out;
}

const DESCRIPTION_SYSTEM =
  "Redactás descripciones de productos de informática para un catálogo mayorista en Argentina (español rioplatense neutro, sin voseo publicitario). " +
  "Usás SOLO los datos que te pasan. Respondés solo JSON válido.";

export function buildDescriptionPrompt(productName: string, brand: string | null, attrs: { label: string; value: string }[]): string {
  return `Producto: ${productName}${brand ? ` (marca ${brand})` : ""}
Datos verificados:
${attrs.map((a) => `- ${a.label}: ${a.value}`).join("\n")}
Respondé { "description": "<una oración de hasta 160 caracteres>", "longDescription": "<2 a 4 oraciones>" }.
Reglas: no agregues ningún dato, número, compatibilidad ni característica que no esté en la lista. Sin precios, stock, superlativos ni promesas.`;
}

/**
 * Una descripción redactada solo puede mencionar números que estén en el
 * nombre o en los atributos verificados; si no, se descarta.
 */
export function descriptionIsGrounded(text: string, productName: string, attrValues: string[]): { ok: boolean; reason?: string } {
  if (!text || text.trim().length < 20) return { ok: false, reason: "texto vacío o muy corto" };
  const allowed = `${productName} ${attrValues.join(" ")}`.replace(/,/g, ".");
  const allowedNumbers = new Set((allowed.match(/\d+(?:\.\d+)?/g) ?? []).map((n) => String(Number(n))));
  for (const n of text.replace(/,/g, ".").match(/\d+(?:\.\d+)?/g) ?? []) {
    if (!allowedNumbers.has(String(Number(n)))) return { ok: false, reason: `menciona ${n}, que no está en los datos verificados` };
  }
  return { ok: true };
}

export function formatAttributeForPrompt(label: string, v: AttributeValue): { label: string; value: string } {
  const value = typeof v.value === "boolean" ? (v.value ? "sí" : "no") : String(v.value);
  return { label, value: v.unit ? `${value} ${v.unit}` : value };
}

export { DESCRIPTION_SYSTEM, EXTRACT_SYSTEM };
