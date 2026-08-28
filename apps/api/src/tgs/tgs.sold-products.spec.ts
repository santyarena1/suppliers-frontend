import { flattenVentaItems, filterSoldProducts, paginateSoldProducts, sortSoldProducts } from "./tgs.sold-products";
import type { TgsVenta } from "@nodo/shared";

const venta = (over: Partial<TgsVenta> = {}): TgsVenta => ({
  id: 2391,
  numero: "V-2026-001060",
  fecha_emision: "2026-08-28 13:47:00",
  estado: "pagada",
  tipo_documento: "venta",
  tipo_factura: "B",
  total: 58000,
  total_pagado: 58000,
  local_id: 1,
  cliente_id: 3379,
  cliente: "FRANCO DARIO LOMBISANO",
  cae: null,
  items: [
    {
      id: 3128,
      producto_id: 22805,
      descripcion: "AURICULAR JBL QUANTUM 50C WHITE / BLANCO CON CABLE",
      cantidad: 1,
      precio_unitario: 58000,
      subtotal: 58000,
    },
  ],
  ...over,
});

describe("flattenVentaItems", () => {
  it("arma una fila por ítem, no por comprobante", () => {
    const two = venta({
      id: 1,
      numero: "V-1",
      items: [
        { id: 10, producto_id: 1, descripcion: "A", cantidad: 2, precio_unitario: 10, subtotal: 20 },
        { id: 11, producto_id: 2, descripcion: "B", cantidad: 1, precio_unitario: 5, subtotal: 5 },
      ],
    });
    expect(flattenVentaItems([two, venta({ items: [] })])).toHaveLength(2);
    expect(flattenVentaItems([two])[1]).toMatchObject({ venta_numero: "V-1", producto: "B", cantidad: 1 });
  });
});

describe("filter/sort/paginate", () => {
  const rows = flattenVentaItems([
    venta(),
    venta({
      id: 2000,
      numero: "V-2026-000010",
      fecha_emision: "2026-08-01 10:00:00",
      cliente: "Ana",
      items: [{ id: 1, producto_id: 9, descripcion: "PLAYSTATION 5 SLIM", cantidad: 1, precio_unitario: 100, subtotal: 100 }],
    }),
  ]);

  it("filtra por producto o cliente", () => {
    expect(filterSoldProducts(rows, "jbl")).toHaveLength(1);
    expect(filterSoldProducts(rows, "ana")).toHaveLength(1);
  });

  it("ordena por fecha descendente por defecto vía sort", () => {
    const sorted = sortSoldProducts(rows, "fecha", "desc");
    expect(sorted[0].venta_numero).toBe("V-2026-001060");
  });

  it("pagina sobre las líneas", () => {
    const page = paginateSoldProducts(rows, 2, 1);
    expect(page.items).toHaveLength(1);
    expect(page.meta).toEqual({ page: 2, per_page: 1, total: 2, total_pages: 2 });
  });
});
