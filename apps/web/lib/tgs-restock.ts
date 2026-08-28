import { isModelSkuToken, providerNameMatchRatio, tokenizeProductName } from "@/lib/retailMatch";
import type { ProductDTO } from "@/lib/api";
import type { TgsProductoVendido } from "@/lib/tgs-api";

const COLOR = new Set([
  "white", "black", "red", "blue", "green", "grey", "gray", "silver", "gold", "pink", "yellow",
  "blanco", "negro", "rojo", "azul", "verde", "gris", "plata", "dorado", "rosa", "amarillo",
]);

const FILLER = new Set([
  "cable", "usb", "inalambrico", "wireless", "bluetooth", "original", "nuevo", "new",
  "edition", "edicion", "version", "pack", "combo", "kit",
]);

const DONE_RE = /entregad|enviad|despach|listo|shipped|delivered|ready/i;
const PENDING_RE = /pendiente|pending|a entregar|por entregar/i;

export function saleLineKey(row: Pick<TgsProductoVendido, "venta_id" | "item_id">) {
  return `${row.venta_id}:${row.item_id}`;
}

export function isPendingEntrega(row: Pick<TgsProductoVendido, "estado_entrega" | "etiquetas">): boolean {
  const estado = (row.estado_entrega ?? "").trim();
  if (estado) {
    if (DONE_RE.test(estado)) return false;
    if (PENDING_RE.test(estado)) return true;
  }
  return (row.etiquetas ?? []).some((tag) => PENDING_RE.test(tag) && !DONE_RE.test(tag));
}

export function hasEntregaDato(row: Pick<TgsProductoVendido, "estado_entrega" | "etiquetas">): boolean {
  if ((row.estado_entrega ?? "").trim()) return true;
  return (row.etiquetas ?? []).some((tag) => PENDING_RE.test(tag) || DONE_RE.test(tag));
}

/**
 * Armá 1–3 búsquedas cada vez más cortas. Los nombres de AcuStock no coinciden
 * exacto con los de los distros: se tiran color y adornos, se prioriza modelo.
 */
export function genericSearchQueries(soldName: string): string[] {
  const tokens = tokenizeProductName(soldName).filter((t) => !COLOR.has(t) && !FILLER.has(t));
  if (tokens.length === 0) return soldName.trim() ? [soldName.trim()] : [];
  const models = tokens.filter(isModelSkuToken);
  const primary = tokens.slice(0, 5).join(" ");
  const tight = tokens.filter((t) => !isLooseType(t)).slice(0, 4).join(" ");
  const out: string[] = [];
  for (const q of [primary, tight, models.slice(0, 2).join(" ")]) {
    const n = q.trim();
    if (n && !out.includes(n)) out.push(n);
  }
  return out;
}

function isLooseType(token: string) {
  return /^(auricular|auriculares|mouse|teclado|notebook|memoria|placa|fuente|gabinete|monitor|disco|ssd|hdd|cooler)$/i.test(
    token
  );
}

export function scoreRestockMatch(soldName: string, productName: string): number {
  return providerNameMatchRatio(soldName, productName);
}

export function rankRestockHits(soldName: string, products: ProductDTO[], take = 8) {
  const seen = new Set<string>();
  const scored = [];
  for (const product of products) {
    const key = `${product.provider}:${product.externalId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const score = scoreRestockMatch(soldName, product.name);
    if (score < 0.22) continue;
    const stock = typeof product.stock === "number" ? product.stock : null;
    scored.push({ product, score, inStock: stock == null ? true : stock > 0 });
  }
  scored.sort((a, b) => {
    if (a.inStock !== b.inStock) return a.inStock ? -1 : 1;
    if (b.score !== a.score) return b.score - a.score;
    return String(a.product.name).localeCompare(String(b.product.name), "es");
  });
  return scored.slice(0, take);
}

export interface RestockDraftLine {
  saleKey: string;
  ventaNumero: string;
  soldName: string;
  soldQty: number;
  product: ProductDTO;
  qty: number;
}

const DRAFT_KEY = "tgs_restock_draft_v1";
const DONE_KEY = "tgs_restock_done_v1";

export function loadRestockDraft(): RestockDraftLine[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveRestockDraft(lines: RestockDraftLine[]) {
  localStorage.setItem(DRAFT_KEY, JSON.stringify(lines));
}

export function loadRestockDone(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = localStorage.getItem(DONE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return new Set(Array.isArray(parsed) ? parsed.map(String) : []);
  } catch {
    return new Set();
  }
}

export function saveRestockDone(keys: Set<string>) {
  localStorage.setItem(DONE_KEY, JSON.stringify([...keys]));
}
