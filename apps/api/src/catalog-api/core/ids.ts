import { createHash, randomBytes } from "crypto";
import { normalizeEan, normalizePartNumber } from "../../catalog/catalog-enrichment";

/**
 * Ids públicos de la API de catálogo. Son estables (el mismo producto da el
 * mismo id siempre) y no exponen el distribuidor ni el código interno.
 */

const BASE62 = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";

export function base62(bytes: Buffer): string {
  let n = BigInt(`0x${bytes.toString("hex") || "0"}`);
  let out = "";
  while (n > 0n) {
    out = BASE62[Number(n % 62n)] + out;
    n /= 62n;
  }
  return out || "0";
}

function digest(text: string, length: number): string {
  return base62(createHash("sha256").update(text).digest()).padStart(length, "0").slice(0, length);
}

export function offerIdFor(provider: string, externalId: string): string {
  return `off_${digest(`${provider}:${externalId}`, 22)}`;
}

/** El alias de un distribuidor es por comercio: dos comercios no pueden cruzarlos. */
export function providerAliasId(tenantId: string, provider: string): string {
  return `prv_${digest(`${tenantId}:${provider}`, 16)}`;
}

export function slugId(prefix: "brd" | "cat", label: string): string {
  return `${prefix}_${digest(foldLabel(label), 12)}`;
}

export function foldLabel(label: string): string {
  return label.trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ");
}

/** Dígito verificador GTIN (EAN-8, UPC-12, EAN-13, GTIN-14). */
export function validGtin(digits: string): boolean {
  if (!/^\d+$/.test(digits) || ![8, 12, 13, 14].includes(digits.length)) return false;
  const body = digits.slice(0, -1);
  let sum = 0;
  for (let i = 0; i < body.length; i++) {
    const n = Number(body[body.length - 1 - i]);
    sum += i % 2 === 0 ? n * 3 : n;
  }
  return (10 - (sum % 10)) % 10 === Number(digits[digits.length - 1]);
}

/** EAN con dígito verificador válido, en 13 dígitos cuando se puede; si no, `null`. */
export function cleanGtin(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const digits = raw.replace(/\D/g, "");
  if (!validGtin(digits)) return null;
  return digits.length === 12 ? `0${digits}` : digits;
}

/**
 * Clave de agrupación: el mismo producto en varios distribuidores.
 * 1) EAN válido, 2) marca canónica + part number, 3) la oferta sola.
 */
export function groupKeyFor(input: {
  provider: string;
  externalId: string;
  ean: string | null;
  partNumber: string | null;
  brand: string | null;
}): string {
  const gtin = cleanGtin(input.ean);
  if (gtin) return `ean:${normalizeEan(gtin) ?? gtin}`;
  const pn = input.partNumber ? normalizePartNumber(input.partNumber.replace(/[-_./]/g, "")) : null;
  if (pn && input.brand?.trim()) return `pn:${foldLabel(input.brand)}:${pn}`;
  return `offer:${input.provider}:${input.externalId}`;
}

export function productIdFor(groupKey: string): string {
  return `prd_${digest(groupKey, 22)}`;
}

export function requestId(): string {
  return `req_${base62(randomBytes(12))}`;
}

export function eventId(): string {
  return `evt_${base62(randomBytes(16))}`;
}

