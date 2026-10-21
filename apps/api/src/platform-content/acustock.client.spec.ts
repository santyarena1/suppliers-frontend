import { parseAcuStockProduct } from "./acustock.client";

describe("parseAcuStockProduct", () => {
  it("descarta productos sin id o sin nombre", () => {
    expect(parseAcuStockProduct({ id: "1", name: "" })).toBeNull();
    expect(parseAcuStockProduct({ name: "Mouse" })).toBeNull();
    expect(parseAcuStockProduct(null)).toBeNull();
  });

  it("ordena las fotos por posición, quita repetidas y las que no son http", () => {
    const p = parseAcuStockProduct({
      id: "1",
      name: "Mouse",
      images: [
        { url: "https://a.com/2.jpg", position: 2 },
        { url: "https://a.com/1.jpg", position: 1, alt: "Frente" },
        { url: "https://a.com/1.jpg", position: 3 },
        { url: "javascript:alert(1)", position: 4 },
      ],
    });

    expect(p?.images).toEqual([
      { url: "https://a.com/1.jpg", alt: "Frente" },
      { url: "https://a.com/2.jpg", alt: null },
    ]);
  });

  it("normaliza los códigos de proveedor y descarta especificaciones vacías", () => {
    const p = parseAcuStockProduct({
      id: 7,
      name: "Placa",
      supplierCodes: [{ supplier: "new_bytes", code: " 104844 " }, { supplier: "ELIT", code: "" }],
      specs: [{ group: "Memoria", name: "Capacidad", value: "8 GB" }, { name: "Color", value: "" }],
      warrantyMonths: 36,
      updatedAt: "2026-10-15T14:22:10Z",
    });

    expect(p?.id).toBe("7");
    expect(p?.supplierCodes).toEqual([{ supplier: "NEW_BYTES", code: "104844" }]);
    expect(p?.specs).toEqual([{ group: "Memoria", name: "Capacidad", value: "8 GB" }]);
    expect(p?.warrantyMonths).toBe(36);
    expect(p?.updatedAt?.toISOString()).toBe("2026-10-15T14:22:10.000Z");
  });
});
