import type { TgsLinea, TgsProductoVendido, TgsSoldSort, TgsVenta } from "@nodo/shared";

const ENTREGA_KEYS = [
  "estado_entrega",
  "entrega",
  "entrega_estado",
  "estado_item",
  "estado_despacho",
  "estado_producto",
];

const ETIQUETA_KEYS = ["etiquetas", "tags", "labels", "etiqueta"];

const PROVEEDOR_KEYS = ["proveedor", "proveedor_nombre", "proveedor_label"];

export function pickFirst(record: Record<string, unknown>, keys: string[]): { key: string; value: unknown } | null {
  for (const key of keys) {
    if (!(key in record)) continue;
    const value = record[key];
    if (value == null || value === "") continue;
    return { key, value };
  }
  return null;
}

export function asLabel(value: unknown): string | null {
  if (value == null || value === "") return null;
  if (typeof value === "string" || typeof value === "number") {
    const text = String(value).trim();
    return text || null;
  }
  if (Array.isArray(value)) {
    const parts = value.map(asLabel).filter((part): part is string => Boolean(part));
    return parts.length ? parts.join(", ") : null;
  }
  if (typeof value === "object") {
    const row = value as Record<string, unknown>;
    return asLabel(row.nombre ?? row.name ?? row.label ?? row.titulo ?? row.display_name);
  }
  return null;
}

export function asLabels(value: unknown): string[] {
  if (value == null || value === "") return [];
  if (Array.isArray(value)) {
    return value.map(asLabel).filter((part): part is string => Boolean(part));
  }
  const one = asLabel(value);
  if (!one) return [];
  return one
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
}

export function asId(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() && Number.isFinite(Number(value))) return Number(value);
  return null;
}

export function lineExtras(item: TgsLinea) {
  const raw = item as Record<string, unknown>;
  const entrega = pickFirst(raw, ENTREGA_KEYS);
  const tags = pickFirst(raw, ETIQUETA_KEYS);
  const proveedor = pickFirst(raw, PROVEEDOR_KEYS);
  return {
    estado_entrega: asLabel(entrega?.value) ?? asLabel(item.estado_entrega) ?? asLabel(item.entrega),
    entrega_key: entrega?.key ?? (item.estado_entrega != null ? "estado_entrega" : item.entrega != null ? "entrega" : null),
    etiquetas: asLabels(tags?.value ?? item.etiquetas),
    proveedor: asLabel(proveedor?.value) ?? asLabel(item.proveedor) ?? asLabel(item.proveedor_nombre),
    proveedor_id: asId(raw.proveedor_id) ?? item.proveedor_id ?? null,
  };
}

export function flattenVentaItems(ventas: TgsVenta[]): TgsProductoVendido[] {
  const rows: TgsProductoVendido[] = [];
  for (const venta of ventas) {
    for (const item of venta.items ?? []) {
      const extra = lineExtras(item);
      rows.push({
        venta_id: venta.id,
        venta_numero: venta.numero,
        fecha_emision: venta.fecha_emision,
        local_id: venta.local_id,
        cliente_id: venta.cliente_id,
        cliente: venta.cliente,
        estado: venta.estado,
        estado_entrega: extra.estado_entrega,
        entrega_key: extra.entrega_key,
        etiquetas: extra.etiquetas,
        proveedor: extra.proveedor,
        proveedor_id: extra.proveedor_id,
        item_id: item.id,
        producto_id: item.producto_id,
        producto: item.descripcion,
        cantidad: item.cantidad,
        precio_unitario: item.precio_unitario,
        subtotal: item.subtotal,
      });
    }
  }
  return rows;
}

export function filterSoldProducts(rows: TgsProductoVendido[], q?: string, entrega?: string): TgsProductoVendido[] {
  const needle = q?.trim().toLowerCase();
  const want = entrega?.trim().toLowerCase();
  return rows.filter((row) => {
    if (want) {
      const hay = (row.estado_entrega ?? "").toLowerCase();
      if (!hay.includes(want)) return false;
    }
    if (!needle) return true;
    const blob = `${row.producto} ${row.cliente ?? ""} ${row.venta_numero} ${row.proveedor ?? ""} ${row.etiquetas.join(" ")}`.toLowerCase();
    return blob.includes(needle);
  });
}

function cmp(a: string | number | null | undefined, b: string | number | null | undefined): number {
  if (a == null && b == null) return 0;
  if (a == null) return 1;
  if (b == null) return -1;
  if (typeof a === "number" && typeof b === "number") return a - b;
  return String(a).localeCompare(String(b), "es", { numeric: true, sensitivity: "base" });
}

const SORT_VALUE: Record<TgsSoldSort, (row: TgsProductoVendido) => string | number | null> = {
  fecha: (row) => row.fecha_emision,
  venta: (row) => row.venta_numero,
  cliente: (row) => row.cliente,
  producto: (row) => row.producto,
  cantidad: (row) => row.cantidad,
  precio: (row) => row.precio_unitario,
  subtotal: (row) => row.subtotal,
  estado: (row) => row.estado_entrega ?? row.estado,
  entrega: (row) => row.estado_entrega,
};

export function sortSoldProducts(
  rows: TgsProductoVendido[],
  sort: TgsSoldSort = "fecha",
  dir: "asc" | "desc" = "desc"
): TgsProductoVendido[] {
  const factor = dir === "asc" ? 1 : -1;
  const value = SORT_VALUE[sort] ?? SORT_VALUE.fecha;
  return [...rows].sort((a, b) => {
    const primary = cmp(value(a), value(b));
    if (primary !== 0) return primary * factor;
    return (a.venta_id - b.venta_id || a.item_id - b.item_id) * factor;
  });
}

export function paginateSoldProducts(rows: TgsProductoVendido[], page: number, perPage: number) {
  const safePage = Math.max(1, page);
  const size = Math.min(100, Math.max(1, perPage));
  const total = rows.length;
  const totalPages = Math.max(1, Math.ceil(total / size));
  const current = Math.min(safePage, totalPages);
  const start = (current - 1) * size;
  return {
    items: rows.slice(start, start + size),
    meta: { page: current, per_page: size, total, total_pages: totalPages },
  };
}

export async function mapPool<T, R>(items: T[], concurrency: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const idx = next++;
      out[idx] = await fn(items[idx]);
    }
  }
  const n = Math.max(1, Math.min(concurrency, items.length || 1));
  await Promise.all(Array.from({ length: items.length ? n : 0 }, () => worker()));
  return out;
}
