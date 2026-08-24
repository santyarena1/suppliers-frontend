import { FileImportService } from "./file-import.service";

describe("FileImportService IVA aliases", () => {
  const svc = new FileImportService();

  it("reconoce alícuota / tax_rate además de iva", () => {
    const { items } = svc.mapRows([
      { codigo: "1", nombre: "Mouse", precio: 10, "Alícuota IVA": 21 },
    ]);
    expect(items[0].ivaPercent).toBe(21);
    expect(items[0].price).toBe(10);
  });

  it("reconoce tax_rate", () => {
    const { items } = svc.mapRows([
      { sku: "2", producto: "Teclado", costo: 8, tax_rate: 10.5 },
    ]);
    expect(items[0].ivaPercent).toBe(10.5);
    expect(items[0].price).toBe(8);
  });
});
