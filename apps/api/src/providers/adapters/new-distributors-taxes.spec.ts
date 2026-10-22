import { extractTaxLines } from "@nodo/shared";
import { mapMasnetRow } from "./masnet.adapter";
import { mapMicroglobalProduct } from "./microglobal.adapter";
import { mapPcArtsProduct } from "./pc-arts.adapter";
import type { NormalizedProduct } from "../types";

/** Lo que ven el carrito y la API de catálogo: las líneas fiscales que salen del producto guardado. */
function taxes(p: NormalizedProduct) {
  return extractTaxLines({ price: p.price ?? null, finalPrice: p.finalPrice ?? null, ivaPercent: p.ivaPercent ?? null, raw: p.raw }).map((l) => [
    l.kind,
    l.percent,
    l.unitAmount,
  ]);
}

describe("líneas fiscales de Masnet, Microglobal y PC Arts", () => {
  it("Masnet: solo IVA sobre el precio (los internos ya vienen adentro)", () => {
    const p = mapMasnetRow({ id: "1", codigo_alfa: "A", nombre: "Celular", precio: "100", impuesto_interno: "10.5", iva: "21" })!;
    expect(taxes(p)).toEqual([["iva", 21, 21]]);
  });

  it("Microglobal: IVA e internos por separado", () => {
    const p = mapMicroglobalProduct({ partNumber: "A", descripcion: "Celular", precio: "100", iva_pct: "10.5", ii_pct: "9.5" })!;
    expect(taxes(p)).toEqual([
      ["iva", 10.5, 10.5],
      ["internos", 9.5, 9.5],
    ]);
  });

  it("PC Arts: IVA e internos por separado", () => {
    const p = mapPcArtsProduct({ sku: "A", sku_desc: "Mouse", price: 20, tax_iva_rate: 21, tax_ii_rate: 10 })!;
    expect(taxes(p)).toEqual([
      ["iva", 21, 4.2],
      ["internos", 10, 2],
    ]);
  });

  it("sin internos no aparece una línea de internos", () => {
    const p = mapPcArtsProduct({ sku: "A", sku_desc: "Notebook", price: 450, tax_iva_rate: 10.5, tax_ii_rate: 0 })!;
    expect(taxes(p)).toEqual([["iva", 10.5, 47.25]]);
  });
});
