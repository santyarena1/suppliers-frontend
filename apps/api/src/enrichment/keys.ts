/**
 * Claves para agrupar fichas en productos maestros. Más estrictas que las del
 * catálogo (`normalizeEan`/`normalizePartNumber`): acá un falso positivo une
 * dos artículos distintos, así que solo vale un GTIN con dígito verificador
 * correcto y un part number con pinta de código.
 */

const GTIN_LENGTHS = new Set([8, 12, 13, 14]);

/** Dígito verificador GS1 (mod 10, pesos 3/1 desde la derecha). */
export function isValidGtin(digits: string): boolean {
  if (!/^\d+$/.test(digits) || !GTIN_LENGTHS.has(digits.length)) return false;
  if (/^0+$/.test(digits)) return false;
  const body = digits.slice(0, -1);
  let sum = 0;
  for (let i = 0; i < body.length; i++) {
    const n = Number(body[body.length - 1 - i]);
    sum += i % 2 === 0 ? n * 3 : n;
  }
  return (10 - (sum % 10)) % 10 === Number(digits[digits.length - 1]);
}

/**
 * GTIN normalizado a 14 dígitos, o null si no es válido. Un EAN-13 y su UPC-12
 * equivalente dan la misma clave.
 */
export function gtin14(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const digits = String(raw).replace(/\D/g, "");
  if (!isValidGtin(digits)) return null;
  const padded = digits.padStart(14, "0");
  // Prefijos 02/04/20-29 son internos (pesables, uso en tienda): no identifican al artículo.
  if (/^0(2|4)/.test(padded.slice(1)) || /^2\d/.test(padded.slice(1))) return null;
  return padded;
}

/** Valores que los distribuidores ponen como part number pero no lo son. */
const JUNK_PART_NUMBERS = new Set(["NA", "NAN", "NULL", "NONE", "SINPN", "SN", "SINCODIGO", "GENERICO", "GENERIC", "OEM", "000", "0000"]);

/**
 * Part number normalizado: mayúsculas, sin espacios ni signos. Null si es muy
 * corto, basura conocida o solo ceros/dígitos repetidos.
 */
export function pnKey(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const key = String(raw)
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
  if (key.length < 4 || key.length > 40) return null;
  if (JUNK_PART_NUMBERS.has(key)) return null;
  if (/^(.)\1+$/.test(key)) return null;
  return key;
}

/**
 * Código interno de un distribuidor, no del fabricante: "39445-APF73554",
 * "216959-ABT74541", "M20-PF56082". Prefijo corto, guion y 2–4 letras seguidas
 * de 4+ dígitos. Con eso Icecat y los fabricantes responden "no existe".
 */
export function looksLikeDistributorSku(raw: string | null | undefined): boolean {
  if (!raw) return false;
  return /^[A-Z0-9]{1,8}-[A-Z]{2,4}\d{4,}$/i.test(String(raw).trim());
}

/**
 * Códigos del fabricante candidatos para buscar en fuentes externas, en orden:
 * part numbers de las fichas que no son códigos internos, y después códigos de
 * modelo que aparecen en el nombre. Sin repetir (por clave normalizada).
 */
export function manufacturerCodeCandidates(partNumbers: (string | null | undefined)[], names: (string | null | undefined)[], max = 3): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const push = (code: string | null | undefined) => {
    if (!code || looksLikeDistributorSku(code)) return;
    const key = pnKey(code);
    if (!key || seen.has(key)) return;
    seen.add(key);
    out.push(code.trim());
  };
  partNumbers.forEach(push);
  for (const name of names) modelTokens(name).forEach(push);
  return out.slice(0, max);
}

/** Igual que `normalizeBrandKey` del catálogo, sin depender de él. */
export function brandKeyOf(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const key = String(raw)
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
  if (!key || key === "generico" || key === "generic" || key === "sinmarca" || key === "na") return null;
  return key;
}

/** Tokens de un nombre de producto para comparar parecido. */
export function nameTokens(name: string): Set<string> {
  return new Set(
    name
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((t) => t.length >= 2)
  );
}

/** Jaccard entre tokens de dos nombres (0–1). */
export function nameSimilarity(a: string, b: string): number {
  const ta = nameTokens(a);
  const tb = nameTokens(b);
  if (ta.size === 0 || tb.size === 0) return 0;
  let inter = 0;
  for (const t of ta) if (tb.has(t)) inter++;
  return inter / (ta.size + tb.size - inter);
}

/** El part number aparece (normalizado) dentro del texto. */
export function textMentionsPn(text: string | null | undefined, pn: string): boolean {
  if (!text) return false;
  const hay = String(text).toUpperCase().replace(/[^A-Z0-9]/g, "");
  return pn.length >= 4 && hay.includes(pn);
}

const UNIT_TOKEN = /^\d+(?:[.,]\d+)?(GB|TB|MB|HZ|KHZ|MHZ|GHZ|W|MM|CM|MS|V|MAH|DPI|RPM|K|P|IN|PULG|X)$/;

/**
 * Códigos de modelo dentro de un nombre ("DUAL-RTX5060TI-O8G", "M711",
 * "Archer C6" no: tiene espacio). Tokens con letras y números, sin ser una
 * medida (8GB, 165Hz). Se devuelven tal cual aparecen, más largos primero.
 */
export function modelTokens(name: string | null | undefined): string[] {
  if (!name) return [];
  const out = new Set<string>();
  for (const raw of name.split(/[\s,;()/[\]|]+/)) {
    const token = raw.replace(/^[^A-Za-z0-9]+|[^A-Za-z0-9]+$/g, "");
    const compacted = token.toUpperCase().replace(/[^A-Z0-9]/g, "");
    if (compacted.length < 4 || compacted.length > 30) continue;
    if (!/[A-Z]/.test(compacted) || !/\d/.test(compacted)) continue;
    if (UNIT_TOKEN.test(compacted)) continue;
    out.add(token);
  }
  return [...out].sort((a, b) => b.length - a.length);
}
