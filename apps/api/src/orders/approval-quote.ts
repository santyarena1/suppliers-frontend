/**
 * Cotización en vivo de un pedido retenido, en un formato común para todos los
 * proveedores: quien aprueba ve el precio de hoy antes de mandarlo.
 * Cada proveedor devuelve su propia forma de preview; acá se toma lo común.
 */

export interface ApprovalQuoteLine {
  code: string;
  name: string;
  qty: number;
  price: number | null;
  subtotal: number | null;
}

export interface ApprovalQuote {
  lines: ApprovalQuoteLine[];
  /** Neto (sin impuestos), comparable con lo que se vio al armar el pedido. */
  subtotal: number | null;
  total: number | null;
  currency: string;
  /** Productos que el proveedor no pudo cotizar (sin stock, dado de baja…). */
  problems: { code: string; message: string }[];
}

function rec(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function num(...values: unknown[]): number | null {
  for (const v of values) {
    const n = typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" ? Number(v) : NaN;
    if (Number.isFinite(n)) return n;
  }
  return null;
}

function str(...values: unknown[]): string {
  for (const v of values) {
    if (typeof v === "string" && v.trim()) return v.trim();
    if (typeof v === "number" && Number.isFinite(v)) return String(v);
  }
  return "";
}

export function normalizeApprovalQuote(preview: unknown): ApprovalQuote {
  const p = rec(preview);
  const items = Array.isArray(p.items) ? p.items : [];
  const lines = items.map((raw) => {
    const it = rec(raw);
    const qty = num(it.qty, it.quantity, it.cantidad) ?? 0;
    const price = num(it.price, it.unitPrice, it.priceUsd, it.precio, it.unitPriceUsd);
    return {
      code: str(it.code, it.externalId, it.productId, it.sku, it.codigo),
      name: str(it.name, it.description, it.title, it.descripcion),
      qty,
      price,
      subtotal: num(it.subtotal, it.lineTotal, it.total) ?? (price != null ? Math.round(price * qty * 100) / 100 : null),
    };
  });
  const errors = Array.isArray(p.itemErrors) ? p.itemErrors : [];
  return {
    lines,
    subtotal: num(p.subtotal, p.subtotalUsd, p.netTotal),
    total: num(p.total, p.totalUsd),
    currency: str(p.currency) || "USD",
    problems: errors.map((raw) => {
      const e = rec(raw);
      return { code: str(e.code), message: str(e.message) || "No se pudo cotizar" };
    }),
  };
}
