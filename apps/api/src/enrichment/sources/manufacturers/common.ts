import { LookupQuery } from "../types";

/** Mayúsculas y solo letras/números: "dual-rtx5060ti-o8g" = "DUAL-RTX5060TI-O8G". */
export function compactCode(raw: string | null | undefined): string {
  return (raw ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
}

/** Último segmento no vacío de la ruta de una URL. */
export function lastPathSegment(url: string): string {
  try {
    const parts = new URL(url, "https://x.invalid").pathname.split("/").filter(Boolean);
    return decodeURIComponent(parts[parts.length - 1] ?? "");
  } catch {
    return "";
  }
}

/** Qué buscar en la web del fabricante: part number y códigos de modelo, sin repetir. */
export function searchTerms(q: LookupQuery, max = 3): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const term of [q.partNumber, ...q.hints]) {
    const c = compactCode(term);
    if (!term || c.length < 4 || seen.has(c)) continue;
    seen.add(c);
    out.push(term.trim());
    if (out.length >= max) break;
  }
  return out;
}

/** Los códigos con los que un candidato cuenta como el mismo producto. */
export function acceptedCodes(q: LookupQuery): Set<string> {
  const codes = new Set<string>();
  if (q.pnKey) codes.add(q.pnKey);
  for (const h of q.hints) {
    const c = compactCode(h);
    if (c.length >= 4) codes.add(c);
  }
  return codes;
}

export function https(url: string): string {
  return url.startsWith("//") ? `https:${url}` : url;
}
