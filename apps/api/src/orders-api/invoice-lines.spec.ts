import { airInvoiceLines, elitInvoiceLines, nbInvoiceLines, parseAirPdfLines } from "./invoice-lines";

// Textos reales (factura de Air 0047-00289953 en esquema, 18/11/2026), sin datos del cliente.
const AIR_LISTED =
  "42369 PC ACTUALIZACION 1 0 972,099.09 972,099.09 SUC06 29130 SSD 240GB ADATA SU650SS BLISTER 1 0 64,988.61 64,988.61 SUC06 216776 WATERCOOLER ASUS LIQUID TUF GAMING LC III 360 ARGB 1 0 186,188.84 186,188.84 SUC06 216396 AURICULARES + MIC GENIUS HS-235U AI USB BLACK 1 0 20,797.54 20,797.54 SUC06 52907 MB ASUS AM4 ROG STRIX B550-F GAMING WIFI II DDR4 1 0 262,376.88 262,376.88 SUC06 214056 SSD M.2 NVME 1TB G4 KINGSTON NV3 2 0 229,272.38 458,544.76 SUC06";
const AIR_PDF =
  "Cant.   Código   Descripción   GI/GP   %IVA   I.Int   Precio   Subtotal\n1   42369   PC ACTUALIZACION   12/0   10,50   0,00   972.099,09   972.099,09\n1   216396   AURICULARES + MIC GENIUS HS-235U AI USB BLACK   12/12   21,00   0,00   20.797,54   20.797,54\nPERCEPCION: BUENOS AIRES Neto: 992896.63 Alicuota: 4.00% Importe: 39715.87\nSubtotal u$s   628,42   $   992.896,63";

describe("renglones reales de la factura", () => {
  it("Air: el PDF trae el kit y los sueltos; lo que solo está en el detalle va dentro del esquema con el IVA del kit", () => {
    expect(parseAirPdfLines(AIR_PDF).map((l) => [l.code, l.iva, l.subtotal])).toEqual([
      ["42369", 10.5, 972099.09],
      ["216396", 21, 20797.54],
    ]);
    const r = airInvoiceLines(AIR_LISTED, AIR_PDF);
    expect(r.esquema).toEqual({ codigo: "42369", descripcion: "PC ACTUALIZACION", total: 972099.09, iva_porcentaje: 10.5, impuestos_internos: 0, moneda: "ARS" });
    expect(r.renglones.map((l) => [l.codigo, l.cantidad, l.precio_unitario, l.iva_porcentaje, l.en_esquema])).toEqual([
      ["29130", 1, 64988.61, 10.5, true],
      ["216776", 1, 186188.84, 10.5, true],
      ["216396", 1, 20797.54, 21, false],
      ["52907", 1, 262376.88, 10.5, true],
      ["214056", 2, 229272.38, 10.5, true],
    ]);
    // Los de adentro suman el kit.
    const inside = r.renglones.filter((l) => l.en_esquema).reduce((s, l) => s + (l.total_linea ?? 0), 0);
    expect(Math.round(inside * 100) / 100).toBe(972099.09);
  });

  it("Air sin PDF legible: no se sabe qué va adentro del esquema (null), nada inventado", () => {
    const r = airInvoiceLines(AIR_LISTED, null);
    expect(r.esquema?.iva_porcentaje).toBeNull();
    expect(r.renglones.every((l) => l.en_esquema === null && l.iva_porcentaje === null)).toBe(true);
  });

  it("Elit: los hijos del kit van en el esquema con el IVA del kit", () => {
    const r = elitInvoiceLines([
      { code: "6057", name: "Impresora", quantity: 1, price: 121.74, net: 121.74, vatPercent: 10.5, internalTax: 0 },
      { code: "800420", name: "PC ELIT ATENEA", quantity: 1, price: 0, net: 229.8, vatPercent: 21, kit: true, children: [{ code: "19972", name: "Fuente 850W", quantity: 1, price: 82.19, net: 82.19, vatPercent: 21 }] },
    ]);
    expect(r.esquema).toMatchObject({ codigo: "800420", total: 229.8, iva_porcentaje: 21, moneda: "USD" });
    expect(r.renglones.map((l) => [l.codigo, l.iva_porcentaje, l.en_esquema, l.total_linea])).toEqual([
      ["6057", 10.5, false, 121.74],
      ["19972", 21, true, 82.19],
    ]);
  });

  it("New Bytes: kitId marca el esquema", () => {
    const r = nbInvoiceLines([{ id: 119024, producto: "CPU", cantidad: 1, iva: 10.5, precio: 100, subtotal: 100, kitId: 7 }, { id: 1, producto: "Mouse", cantidad: 2, iva: 21, precio: 5, subtotal: 10, kitId: null }], [{ id: 7, nombre: "PC Gamer", subtotal: 100 }], "USD");
    expect(r.esquema).toMatchObject({ codigo: "7", descripcion: "PC Gamer", total: 100 });
    expect(r.renglones.map((l) => [l.codigo, l.en_esquema, l.iva_porcentaje])).toEqual([["119024", true, 10.5], ["1", false, 21]]);
  });
});
