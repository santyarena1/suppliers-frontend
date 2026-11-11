import * as XLSX from "xlsx";
import { readGrid } from "./grid-reader";
import { knownFormatIn } from "./known-formats";
import { normalizeRows } from "./row-normalizer";
import { analyzeStructure } from "./structure-analyzer";

/** Planilla con la forma de la «Lista Gremio» de Aula (columnas y filas reales, recortadas). */
function aulaWorkbook(): Buffer {
  const header = ["Marca", "EAN", "Descripcion", "Familia de productos", "IVA %", "PRECIO USD SIN IVA", "STOCK Actual", "TU PEDIDO", "SUBTOTAL", "PVM $ final ML", "Link Specs", "Codigo de Catalogo", "", "TOTAL PEDIDO", 0];
  const rows: unknown[][] = [
    header,
    ["AULA"],
    ["AULA", 6948391202846, "F75 Wired Black Ingles SW Blue", "Teclado Gasket", 0.105, 27.09, "EN STOCK", "", 0, 68999, "LINK", "MLA79514998"],
    ["AULA", 6948391203218, "F75 Wired Black Ingles SW Red", "Teclado Gasket", 0.105, 27.09, "INGRESANDO", "", 0, 68999, "LINK", "MLA57380272"],
    ["PROXIMAMENTE", "32.10.85.118", "F75 Wireless White Green SW Caramel", "Teclado Gasket", 0.105, 44.11, "SIN STOCK", "", 0, 108519, "", ""],
    ["AULA", 6978080502162, "F75 Wireless Degrade Black Español", "Teclado Gasket", 0.105, 48.4, "ÚLTIMAS UNIDADES", "", 0, 119069, "LINK", "MLA61495303"],
    ["ATK", 6976742076792, "ATK N9 PRO Blanco", "Auriculares", 0.21, 31.5, "EN STOCK", "", 0, 90000, "LINK", ""],
  ];
  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws["K3"].l = { Target: "https://aulagaming.com.ar/products/teclado-aula-f75-wired?_pos=2&_ss=r" };
  ws["K4"].l = { Target: "https://aulagaming.com.ar/products/teclado-aula-f75-wired?_pos=2&_ss=r" };
  ws["K6"].l = { Target: "https://aulagaming.com.ar/products/teclado-aula-f75" };
  ws["K7"].l = { Target: "https://atkgaming.com.ar/products/n9-pro" };
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Lista");
  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
}

describe("Lista gremio de Aula", () => {
  const analysis = analyzeStructure(readGrid(aulaWorkbook(), "Lista_Gremio.xlsx"));
  const known = knownFormatIn(analysis, analysis.chosen!);

  it("se reconoce como formato conocido", () => {
    expect(known?.format.key).toBe("aula-gremio");
    expect(known?.spec.currency).toBe("USD");
    expect(known?.spec.columnMap["PVM $ final ML"]).toBeNull();
    expect(known?.spec.columnMap["Codigo de Catalogo"]).toBeNull();
  });

  it("lee cada fila bien: código, EAN, precio sin IVA, IVA por fila, stock y link", () => {
    const { items, issues } = normalizeRows(known!.sheet, known!.spec);
    expect(issues).toEqual([]);
    expect(items).toHaveLength(5);

    const [blue, red, proximamente, ultimas, atk] = items;
    expect(blue).toMatchObject({
      externalId: "6948391202846",
      ean: "6948391202846",
      name: "F75 Wired Black Ingles SW Blue",
      brand: "AULA",
      category: "Teclado Gasket",
      price: 27.09,
      ivaPercent: 10.5,
      currency: "USD",
      productUrl: "https://aulagaming.com.ar/products/teclado-aula-f75-wired?_pos=2&_ss=r",
    });
    expect(blue.finalPrice).toBeCloseTo(29.934, 3);
    expect(blue.stock).toBeUndefined();

    // Ingresando = hoy no hay.
    expect(red).toMatchObject({ stock: 0, stockStatus: "INGRESANDO" });

    // "PROXIMAMENTE" en la marca no es una marca; el código interno no es un EAN.
    expect(proximamente.brand).toBeUndefined();
    expect(proximamente.ean).toBeUndefined();
    expect(proximamente).toMatchObject({ externalId: "32.10.85.118", stock: 0 });

    expect(ultimas.stock).toBeUndefined();
    expect(ultimas.stockStatus).toBe("ÚLTIMAS UNIDADES");

    expect(atk).toMatchObject({ brand: "ATK", ivaPercent: 21, productUrl: "https://atkgaming.com.ar/products/n9-pro" });
  });
});
