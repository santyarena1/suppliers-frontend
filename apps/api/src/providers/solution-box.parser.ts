import type { NormalizedProduct } from "./types";
import { asNumber, asRecord, asString, unwrapList } from "./json-value";
import { SOLUTION_BOX_IMAGE_BASE, SOLUTION_BOX_SITE } from "./solution-box-web-client";

/** Rubro del árbol de /api/articulos/categorias (los hijos cuelgan en `Hijos`). */
export interface SolutionBoxCategory {
  code: string;
  name: string;
  parentName: string | null;
}

/** Aplana el árbol de categorías: cada nodo (padre e hijo) es un listado consultable. */
export function flattenCategories(body: unknown): SolutionBoxCategory[] {
  const out: SolutionBoxCategory[] = [];
  const seen = new Set<string>();
  const walk = (nodes: unknown[], parentName: string | null) => {
    for (const node of nodes) {
      const rec = asRecord(node);
      if (!rec) continue;
      const code = asString(rec.Codigo)?.trim();
      const name = asString(rec.Descripcion)?.trim() ?? "";
      if (!code || seen.has(code)) continue;
      seen.add(code);
      out.push({ code, name, parentName });
      walk(unwrapList(rec.Hijos), name || parentName);
    }
  };
  walk(unwrapList(body), null);
  return out;
}

/** "u$s" → USD, "$" → ARS. La moneda también llega como "DOLARES"/"PESOS". */
export function currencyFromSign(sign: unknown, moneda?: unknown): string | undefined {
  const s = asString(sign)?.trim().toLowerCase();
  const m = asString(moneda)?.trim().toUpperCase();
  if (s === "u$s" || m === "DOLARES") return "USD";
  if (s === "$" || m === "PESOS") return "ARS";
  return undefined;
}

/** "7.6 Kg" → { value: 7.6, unit: "Kg" } */
export function parseMeasure(raw: unknown): { value: number; unit?: string } | undefined {
  const text = asString(raw)?.trim();
  if (!text) return undefined;
  const m = text.match(/^(-?[\d.,]+)\s*([A-Za-z]+)?$/);
  if (!m) return undefined;
  const value = Number(m[1].replace(",", "."));
  if (!Number.isFinite(value)) return undefined;
  return { value, unit: m[2] };
}

function firstImage(raw: unknown): string | undefined {
  const list = asString(raw)?.split(",").map((s) => s.trim()).filter(Boolean) ?? [];
  return list[0] ? `${SOLUTION_BOX_IMAGE_BASE}${encodeURIComponent(list[0])}` : undefined;
}

/**
 * Artículo de /api/articulos/info/categoria/:code. `Precio` es neto (la tienda
 * muestra "no incluye IVA") y solo viene cuando hay stock; la alícuota no se
 * informa por producto, sale del checkout.
 */
export function mapSolutionBoxArticle(raw: unknown, category: SolutionBoxCategory | null): NormalizedProduct | null {
  const rec = asRecord(raw);
  if (!rec) return null;
  const alias = asString(rec.Alias)?.trim();
  const name = asString(rec.Nombre)?.trim();
  if (!alias || !name) return null;
  const price = asNumber(rec.Precio);
  const stock = asNumber(rec.Stock);
  const weight = parseMeasure(rec.Peso);
  const height = parseMeasure(rec.Alto);
  const width = parseMeasure(rec.Ancho);
  const length = parseMeasure(rec.Profundo);
  const warranty = asNumber(rec.Garantia_meses);
  return {
    externalId: alias,
    sku: alias,
    partNumber: asString(rec.Parte_fabricante)?.trim() || undefined,
    name,
    brand: asString(rec.Marca)?.trim() || undefined,
    category: category?.parentName ?? category?.name ?? undefined,
    subcategory: category?.parentName ? category.name : undefined,
    price: price != null && price > 0 ? price : undefined,
    currency: price != null && price > 0 ? currencyFromSign(rec.Moneda_Signo, rec.Moneda) : undefined,
    stock: stock != null ? Math.max(0, Math.trunc(stock)) : undefined,
    imageUrl: firstImage(rec.Imagenes),
    productUrl: `${SOLUTION_BOX_SITE}/detalle?sku=${encodeURIComponent(alias)}`,
    warranty: warranty != null && warranty > 0 ? `${warranty} meses` : undefined,
    weight: weight?.value,
    weightUnit: weight?.unit,
    height: height?.value,
    width: width?.value,
    length: length?.value,
    dimensionsUnit: height?.unit ?? width?.unit ?? length?.unit,
    raw,
  };
}

/** Descripción de /api/articulos/detalle?sku= (`descripcionArray` son renglones). */
export function mapSolutionBoxDetail(body: unknown): Partial<NormalizedProduct> {
  const rec = asRecord(body);
  const art = asRecord(rec?.articulo) ?? rec;
  if (!art) return {};
  const lines = unwrapList(art.descripcionArray)
    .map((l) => (typeof l === "string" ? l.trim() : ""))
    .filter(Boolean);
  const patch: Partial<NormalizedProduct> = {};
  if (lines.length) {
    patch.longDescription = lines.join("\n");
    patch.description = lines.slice(0, 3).join(" ").slice(0, 500);
  }
  const images = asString(art.Imagenes)?.split(",").map((s) => s.trim()).filter(Boolean) ?? [];
  if (images[0]) patch.imageUrl = `${SOLUTION_BOX_IMAGE_BASE}${encodeURIComponent(images[0])}`;
  return patch;
}

export interface SolutionBoxProformaTotals {
  subtotal: number;
  shipping: number;
  vat: number;
  internalTax: number;
  /** Percepción de IIBB. */
  iibb: number;
  vatPerception: number;
  financialSurcharge: number;
  discount: number;
  total: number;
}

function totals(value: unknown): SolutionBoxProformaTotals | null {
  const rec = asRecord(value);
  if (!rec) return null;
  const n = (k: string) => asNumber(rec[k]) ?? 0;
  return {
    subtotal: n("SubTotal"),
    shipping: n("Envio"),
    vat: n("Iva_Grav") + n("Iva_BC"),
    internalTax: n("Impu"),
    iibb: n("Pib"),
    vatPerception: n("Per_iva"),
    financialSurcharge: n("Rec_Financ") + n("Recargo_SNC"),
    discount: n("Descuento"),
    total: n("Total"),
  };
}

export interface SolutionBoxProforma {
  number: number | null;
  extension: string | null;
  items: { code: string; qty: number; price: number; currency: string | undefined }[];
  totalsUsd: SolutionBoxProformaTotals | null;
  totalsArs: SolutionBoxProformaTotals | null;
  exchange: number | null;
  paymentCondition: { code: string; label: string } | null;
  deliveryType: { code: string; label: string } | null;
  raw: unknown;
}

/** Respuesta de POST /api/pedidos/proforma. Se guarda entera: es lo que después se confirma. */
export function mapSolutionBoxProforma(body: unknown): SolutionBoxProforma {
  const rec = asRecord(body) ?? {};
  const cl = (v: unknown) => {
    const r = asRecord(v);
    return r ? { code: asString(r.Codigo) ?? "", label: asString(r.Descripcion) ?? "" } : null;
  };
  return {
    number: asNumber(rec.Numero) ?? null,
    extension: asString(rec.Extension) ?? null,
    items: unwrapList(rec.items).map((row) => {
      const r = asRecord(row) ?? {};
      return {
        code: asString(r.Alias) ?? "",
        qty: asNumber(r.Cantidad) ?? 0,
        price: asNumber(r.Precio) ?? 0,
        currency: currencyFromSign(r.Moneda, r.Moneda),
      };
    }),
    totalsUsd: totals(rec.Subtotal_Dolares),
    totalsArs: totals(rec.Subtotal_Pesos),
    exchange: asNumber(rec.Cotiz_Dolar) ?? null,
    paymentCondition: cl(rec.cond_pago),
    deliveryType: cl(rec.tipo_entrega),
    raw: body,
  };
}

export interface SolutionBoxOrder {
  number: string;
  extension: string;
  date: string;
  seller: string;
  paymentCondition: string;
  amount: number | null;
  currency: string | null;
  exchange: number | null;
  invoice: string | null;
  status: string;
  items: {
    code: string;
    /** Descripción, cuando el portal la manda. El listado solo trae el alias. */
    name: string | null;
    qty: number;
    price: number | null;
    currency: string | null;
  }[];
}

/** Fila de /api/pedidos/ordenes/cliente/:id ({ pedidos: [...] }) o de /orden/:nro/:ext. */
export function mapSolutionBoxOrder(raw: unknown): SolutionBoxOrder | null {
  const rec = asRecord(raw);
  if (!rec) return null;
  const number = asString(rec.Pedido_Nro) ?? (asNumber(rec.Pedido_Nro) != null ? String(rec.Pedido_Nro) : "");
  if (!number) return null;
  const amountRaw = asString(rec.Importe) ?? (asNumber(rec.Importe) != null ? String(rec.Importe) : "");
  const amount = amountRaw ? Number(amountRaw.replace(/,/g, "")) : NaN;
  return {
    number,
    extension: asString(rec.Pedido_Ext) ?? "01",
    date: (asString(rec.Fecha) ?? "").slice(0, 10),
    seller: asString(rec.Vendedor) ?? "",
    paymentCondition: asString(rec.Condicion_Pago) ?? "",
    amount: Number.isFinite(amount) ? amount : null,
    currency: currencyFromSign(undefined, rec.Moneda) ?? null,
    exchange: (() => {
      const v = Number(asString(rec.Cotizacion_Dolar) ?? "");
      return Number.isFinite(v) && v > 0 ? v : null;
    })(),
    invoice: asString(rec.Factura)?.trim() || null,
    status: asString(rec.Estado) ?? "",
    items: unwrapList(rec.Items).map((row) => {
      const r = asRecord(row) ?? {};
      // El alias identifica el producto; la descripción aparece con distinto
      // nombre según el endpoint y a veces no viene.
      const descripcion =
        asString(r.Descripcion) ??
        asString(r.Detalle) ??
        asString(r.Producto) ??
        asString(r.Articulo) ??
        asString(r.Nombre) ??
        null;
      return {
        code: asString(r.Alias) ?? "",
        name: descripcion,
        qty: asNumber(r.Cantidad) ?? 0,
        price: asNumber(r.Precio) ?? null,
        currency: currencyFromSign(undefined, r.Moneda) ?? null,
      };
    }),
  };
}

export function mapSolutionBoxOrders(body: unknown): SolutionBoxOrder[] {
  const rec = asRecord(body);
  const rows = rec && Array.isArray(rec.pedidos) ? rec.pedidos : unwrapList(body);
  return rows.map(mapSolutionBoxOrder).filter((o): o is SolutionBoxOrder => o != null);
}
