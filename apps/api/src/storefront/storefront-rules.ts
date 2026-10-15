import { PRODUCT_CONDITIONS } from "@nodo/shared";

/**
 * Reglas de Vender en NODO que no tocan la base (docs/PLAN_VENDER_EN_NODO.md).
 * Viven aparte para testearlas sin Prisma.
 */

export const STOREFRONT_DEFAULT_STOCK_DAYS = 3;
/** Cada cuántos días puede pedir la tienda que le recuerden el stock. 0 = nunca. */
export const STOCK_DAY_OPTIONS = [0, 1, 2, 3, 7, 15, 30] as const;
export const STALE_ACTIONS = ["KEEP", "HIDE"] as const;
export type StaleAction = (typeof STALE_ACTIONS)[number];

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
/** Después de vencido se sigue recordando, pero no para siempre. */
const REMIND_AFTER_EXPIRY_MS = 30 * DAY_MS;

export type StorefrontStatusValue = "ACTIVE" | "PAUSED" | "SUSPENDED" | "CLOSED";

export interface StorefrontFreshnessInput {
  status: StorefrontStatusValue;
  stockConfirmedAt: Date | null;
  stockValidDays: number;
  /** Sin dato = KEEP: vencer el stock no esconde la tienda. */
  staleAction?: string | null;
}

/** Se avisa al dueño cuando falta menos que esto para que venza el stock. */
export function warnWindowMs(validDays: number): number {
  return validDays >= 2 ? DAY_MS : 6 * HOUR_MS;
}

/** Hasta cuándo vale el stock confirmado. `null` = no vence (0 días) o nunca se confirmó. */
export function stockExpiresAt(sf: Pick<StorefrontFreshnessInput, "stockConfirmedAt" | "stockValidDays">): Date | null {
  if (!sf.stockConfirmedAt || !(sf.stockValidDays > 0)) return null;
  return new Date(sf.stockConfirmedAt.getTime() + sf.stockValidDays * DAY_MS);
}

/** El stock sigue vigente. Con 0 días no vence nunca; sin confirmar nunca, no está vigente. */
export function isStockFresh(sf: Pick<StorefrontFreshnessInput, "stockConfirmedAt" | "stockValidDays">, now: Date): boolean {
  if (!(sf.stockValidDays > 0)) return true;
  const until = stockExpiresAt(sf);
  return until != null && until.getTime() > now.getTime();
}

export type StockState = "NO_EXPIRY" | "UNCONFIRMED" | "FRESH" | "DUE_SOON" | "EXPIRED";

/** En qué está el stock, para mostrárselo al dueño y al comprador. */
export function stockState(sf: Pick<StorefrontFreshnessInput, "stockConfirmedAt" | "stockValidDays">, now: Date): StockState {
  if (!(sf.stockValidDays > 0)) return "NO_EXPIRY";
  const until = stockExpiresAt(sf);
  if (!until) return "UNCONFIRMED";
  const left = until.getTime() - now.getTime();
  if (left <= 0) return "EXPIRED";
  return left <= warnWindowMs(sf.stockValidDays) ? "DUE_SOON" : "FRESH";
}

/** Por qué una tienda no se ve en el buscador, o `null` si se ve. */
export type StorefrontHiddenReason =
  | "PAUSED"
  | "SUSPENDED"
  | "CLOSED"
  | "STOCK_EXPIRED"
  | "NO_STOCK_CONFIRMED"
  | "OWNER_INACTIVE";

export function storefrontHiddenReason(
  sf: StorefrontFreshnessInput & { ownerActive: boolean },
  now: Date
): StorefrontHiddenReason | null {
  if (!sf.ownerActive) return "OWNER_INACTIVE";
  if (sf.status === "SUSPENDED") return "SUSPENDED";
  if (sf.status === "CLOSED") return "CLOSED";
  if (sf.status === "PAUSED") return "PAUSED";
  // Solo si el dueño eligió que se oculte: si no, sigue visible y el comprador ve el aviso.
  if (sf.staleAction === "HIDE" && sf.stockValidDays > 0) {
    if (!sf.stockConfirmedAt) return "NO_STOCK_CONFIRMED";
    if (!isStockFresh(sf, now)) return "STOCK_EXPIRED";
  }
  return null;
}

/**
 * Hay que recordarle al dueño el stock: entró en la ventana previa al
 * vencimiento y no se le avisó desde la última confirmación. Ya vencido, se
 * repite cada tantos días como la vigencia, durante un mes.
 */
export function shouldWarnStale(
  sf: StorefrontFreshnessInput & { staleWarnedAt: Date | null },
  now: Date
): boolean {
  if (sf.status !== "ACTIVE") return false;
  const until = stockExpiresAt(sf);
  if (!until || !sf.stockConfirmedAt) return false;
  if (until.getTime() - now.getTime() > warnWindowMs(sf.stockValidDays)) return false;
  if (!sf.staleWarnedAt || sf.staleWarnedAt < sf.stockConfirmedAt) return true;
  if (now.getTime() < until.getTime()) return false;
  if (now.getTime() - until.getTime() > REMIND_AFTER_EXPIRY_MS) return false;
  const every = Math.max(1, sf.stockValidDays) * DAY_MS;
  return now.getTime() - sf.staleWarnedAt.getTime() >= every;
}

/**
 * Nombre de la organización proveedora de la tienda. `Tenant.name` es único, así
 * que no puede llamarse igual que el comercio; en el buscador se muestra el
 * nombre público, esto queda para Administración.
 */
export function storefrontSupplierName(retailerName: string, attempt = 1): string {
  const base = `${retailerName.trim()} (local)`;
  return attempt <= 1 ? base : `${retailerName.trim()} (local ${attempt})`;
}

/** Nombre que ve el comprador: el elegido por la tienda o el del comercio. */
export function storefrontPublicName(sf: { displayName: string | null }, retailerName: string): string {
  return sf.displayName?.trim() || retailerName;
}

/** Clave para comparar nombres: sin mayúsculas, acentos ni signos. */
export function nameKey(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

/** Espacios de más fuera; `null` si queda vacío. */
export function cleanDisplayName(value: string | null | undefined): string | null {
  if (value == null) return null;
  const v = String(value).replace(/\s+/g, " ").trim();
  return v || null;
}

/** Problema con el nombre público, o `null` si sirve. `taken` = claves de nombres de otros. */
export function displayNameProblem(name: string, taken: Set<string>): string | null {
  if (name.length < 2) return "El nombre tiene que tener al menos 2 letras";
  if (name.length > 60) return "El nombre puede tener hasta 60 caracteres";
  const key = nameKey(name);
  if (key.length < 2) return "El nombre tiene que tener letras o números";
  if (key === "nodo" || key === "nodohub") return "Ese nombre es de NODO";
  if (taken.has(key)) return "Ese nombre ya lo usa otro comercio, distribuidor o marca de NODO";
  return null;
}

// ---------- Condiciones de venta ----------

export const PAYMENT_METHODS = ["CASH", "TRANSFER", "MERCADOPAGO", "CARD", "CHECK", "CRYPTO", "CURRENT_ACCOUNT"] as const;
export const DELIVERY_OPTIONS = ["PICKUP", "OWN_DELIVERY", "MOTO", "CARRIER"] as const;
export const INVOICE_TYPES = ["A", "B", "NONE"] as const;
/** Nuevo, caja abierta, reacondicionado, usado (también arma los márgenes por estado). */
export { PRODUCT_CONDITIONS };

/** Solo valores conocidos, sin repetir, en el orden de la lista. */
export function pickAllowed<T extends string>(values: unknown, allowed: readonly T[]): T[] {
  if (!Array.isArray(values)) return [];
  const set = new Set(values.filter((v): v is string => typeof v === "string"));
  return allowed.filter((a) => set.has(a));
}

// ---------- Fotos ----------

export const MAX_IMAGES_PER_ITEM = 8;
/** Lo que acepta el servidor. El navegador ya las achica a ~1200 px y < 300 KB. */
export const MAX_IMAGE_BYTES = 1_500_000;
/** Tope de fotos subidas por tienda (cada una pesa ~100–300 KB). */
export const MAX_IMAGES_PER_STORE = 3000;
export const STOREFRONT_ASSET_PURPOSE = "storefront";

const ASSET_REF = /^\/assets\/([0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})$/i;

/** Id de una foto subida a NODO (`/assets/<uuid>`), o `null` si no es una. */
export function assetIdOf(ref: string): string | null {
  const m = ASSET_REF.exec(ref.trim());
  return m ? m[1].toLowerCase() : null;
}

/**
 * Tipo real de la imagen por sus primeros bytes. No se confía en lo que dice el
 * navegador: un SVG o un HTML disfrazado de foto no entra.
 */
export function sniffImage(buf: Buffer): "image/jpeg" | "image/png" | "image/webp" | null {
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "image/jpeg";
  if (buf.length >= 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image/png";
  if (buf.length >= 12 && buf.subarray(0, 4).toString("latin1") === "RIFF" && buf.subarray(8, 12).toString("latin1") === "WEBP") {
    return "image/webp";
  }
  return null;
}

/**
 * Fotos de un producto: `/assets/<uuid>` (se valida aparte que sean de la tienda)
 * o links http(s) (los de una planilla). Sin repetir, hasta el máximo. Devuelve el problema si hay uno.
 */
export function normalizeImageRefs(values: unknown): { refs: string[]; assetIds: string[] } | { error: string } {
  if (!Array.isArray(values)) return { error: "Las fotos tienen que ser una lista" };
  const refs: string[] = [];
  const assetIds: string[] = [];
  for (const raw of values) {
    if (typeof raw !== "string") return { error: "Foto inválida" };
    const v = raw.trim();
    if (!v) continue;
    const id = assetIdOf(v);
    let ref: string;
    if (id) {
      ref = `/assets/${id}`;
      if (!assetIds.includes(id)) assetIds.push(id);
    } else {
      let url: URL;
      try {
        url = new URL(v);
      } catch {
        return { error: "Una de las fotos no es un link válido" };
      }
      if ((url.protocol !== "https:" && url.protocol !== "http:") || v.length > 1000) return { error: "Los links de fotos tienen que empezar con https://" };
      ref = url.toString();
    }
    if (!refs.includes(ref)) refs.push(ref);
  }
  if (refs.length > MAX_IMAGES_PER_ITEM) return { error: `Hasta ${MAX_IMAGES_PER_ITEM} fotos por producto` };
  return { refs, assetIds };
}

// ---------- Pedidos ----------

export interface StockLine {
  externalId: string;
  qty: number;
}

/**
 * Cuánto queda de cada producto después de confirmar un pedido. Un stock `null`
 * (la tienda no informa cantidad) no se toca; nunca baja de 0.
 */
export function stockAfterOrder(current: Map<string, number | null>, lines: StockLine[]): Map<string, number> {
  const wanted = new Map<string, number>();
  for (const line of lines) {
    if (!line.externalId || !(line.qty > 0)) continue;
    wanted.set(line.externalId, (wanted.get(line.externalId) ?? 0) + Math.round(line.qty));
  }
  const next = new Map<string, number>();
  for (const [id, qty] of wanted) {
    const stock = current.get(id);
    if (stock == null) continue;
    next.set(id, Math.max(0, stock - qty));
  }
  return next;
}

/** Líneas del pedido que piden más de lo publicado (solo donde la tienda informa cantidad). */
export function linesOverStock(
  current: Map<string, number | null>,
  lines: (StockLine & { name?: string })[]
): { externalId: string; name: string; asked: number; available: number }[] {
  const asked = new Map<string, { qty: number; name: string }>();
  for (const line of lines) {
    if (!line.externalId || !(line.qty > 0)) continue;
    const prev = asked.get(line.externalId);
    asked.set(line.externalId, { qty: (prev?.qty ?? 0) + Math.round(line.qty), name: prev?.name ?? line.name ?? line.externalId });
  }
  const over: { externalId: string; name: string; asked: number; available: number }[] = [];
  for (const [id, { qty, name }] of asked) {
    const stock = current.get(id);
    if (stock == null) continue;
    if (qty > stock) over.push({ externalId: id, name, asked: qty, available: Math.max(0, stock) });
  }
  return over;
}

/** Precio final con IVA a partir del neto, como lo hace el importador de listas. */
export function finalFromNet(net: number, ivaPercent: number): number {
  return Math.round(net * (1 + ivaPercent / 100) * 10000) / 10000;
}

// ---------- Columnas de la planilla que el importador no mapea ----------

const CONDITION_HEADER = /^\s*(estado|condici[oó]n|condition)\b/i;
const PHOTOS_HEADER = /^\s*(fotos?|im[aá]gen(es)?|photos?|images?|link de (la )?foto|url (de )?(la )?foto)\b/i;

/** "Nuevo", "usado", "caja abierta"… → código de estado, o `null` si no se entiende. */
export function conditionFromText(value: unknown): (typeof PRODUCT_CONDITIONS)[number] | null {
  if (typeof value !== "string") return null;
  const t = value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
  if (!t) return null;
  if (/caja abierta|open ?box|abierto/.test(t)) return "OPEN_BOX";
  if (/reacondicionad|refurb|reparad/.test(t)) return "REFURBISHED";
  if (/usad|used|segunda mano/.test(t)) return "USED";
  if (/nuev|new|sellad/.test(t)) return "NEW";
  return null;
}

/** Links de fotos de una celda (separados por coma, espacio, punto y coma, | o renglón). Solo http(s). */
export function imagesFromCell(value: unknown): string[] {
  if (typeof value !== "string") return [];
  const out: string[] = [];
  for (const part of value.split(/[\s,;|]+/)) {
    let v = part.trim();
    if (!v) continue;
    if (/^www\./i.test(v)) v = `https://${v}`;
    try {
      const url = new URL(v);
      if ((url.protocol === "https:" || url.protocol === "http:") && v.length <= 1000 && !out.includes(url.toString())) out.push(url.toString());
    } catch {
      /* no es un link */
    }
    if (out.length >= MAX_IMAGES_PER_ITEM) break;
  }
  return out;
}

/**
 * Lo que una fila de la planilla dice del estado y las fotos. `undefined` = la
 * planilla no trae esa columna o la celda está vacía (se respeta lo cargado en NODO).
 */
export function sheetExtras(raw: Record<string, unknown>): { condition?: string; images?: string[] } {
  const out: { condition?: string; images?: string[] } = {};
  for (const [header, cell] of Object.entries(raw)) {
    if (CONDITION_HEADER.test(header)) {
      const c = conditionFromText(cell);
      if (c) out.condition = c;
    } else if (PHOTOS_HEADER.test(header)) {
      const imgs = imagesFromCell(cell);
      if (imgs.length) out.images = [...(out.images ?? []), ...imgs.filter((i) => !out.images?.includes(i))].slice(0, MAX_IMAGES_PER_ITEM);
    }
  }
  return out;
}
