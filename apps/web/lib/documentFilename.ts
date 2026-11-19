/**
 * Nombre prolijo para un comprobante descargado: DISTRIBUIDOR-TIPO-NÚMERO-FECHA.pdf
 * (por ejemplo «ELIT-FA-A-00022-00000005-2026-11-17.pdf»). La fecha va AAAA-MM-DD
 * para que en una carpeta queden ordenados.
 */

const PROVIDER_SHORT: Record<string, string> = {
  NEW_BYTES: "NEWBYTES",
  NEW_TREE: "NEWTREE",
  SOLUTION_BOX: "SOLUTIONBOX",
  GRUPO_NUCLEO: "NUCLEO",
};

/** FA, NC, ND, RE, NV o DOC según el tipo (acepta «FACTURA A», «Nota de crédito», «REMITO», «FACTURA»…). */
export function documentKindCode(kind: string | null | undefined): string {
  const k = (kind ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  if (/credito|^nc\b/.test(k)) return "NC";
  if (/debito|^nd\b/.test(k)) return "ND";
  if (/remito|dispatch/.test(k)) return "RE";
  if (/nota de venta|salenote|^nv\b/.test(k)) return "NV";
  if (/factura|^fa\b|^fv|invoice/.test(k)) return "FA";
  return "DOC";
}

/** «17/11/2026», «2026-11-17T…» o «2026-11-17» → «2026-11-17»; si no se entiende, nada. */
function isoDay(raw: string | null | undefined): string | null {
  const s = String(raw ?? "");
  let m = /(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = /(\d{1,2})[/-](\d{1,2})[/-](\d{4})/.exec(s);
  if (m) return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  return null;
}

function clean(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^A-Za-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toUpperCase();
}

export function documentFilename(
  provider: string,
  kind: string | null | undefined,
  number: string | number | null | undefined,
  date?: string | null
): string {
  const parts = [
    PROVIDER_SHORT[provider] ?? clean(provider.replace(/^LIST_/, "")),
    documentKindCode(kind),
    number != null && String(number).trim() ? clean(String(number)) : null,
    isoDay(date),
  ].filter(Boolean);
  return `${parts.join("-")}.pdf`;
}
