import type { TgsProductoVendido, TgsSoldSort, TgsVenta } from "@nodo/shared";

export function flattenVentaItems(ventas: TgsVenta[]): TgsProductoVendido[] {
  const rows: TgsProductoVendido[] = [];
  for (const venta of ventas) {
    for (const item of venta.items ?? []) {
      rows.push({
        venta_id: venta.id,
        venta_numero: venta.numero,
        fecha_emision: venta.fecha_emision,
        local_id: venta.local_id,
        cliente_id: venta.cliente_id,
        cliente: venta.cliente,
        estado: venta.estado,
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

export function filterSoldProducts(rows: TgsProductoVendido[], q?: string): TgsProductoVendido[] {
  const needle = q?.trim().toLowerCase();
  if (!needle) return rows;
  return rows.filter((row) => {
    const blob = `${row.producto} ${row.cliente ?? ""} ${row.venta_numero}`.toLowerCase();
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
  estado: (row) => row.estado,
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
