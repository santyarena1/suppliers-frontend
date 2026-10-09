import { brandKeyOf, gtin14, isValidGtin, modelTokens, nameSimilarity, pnKey } from "./keys";

describe("claves de agrupación", () => {
  it("acepta GTIN con dígito verificador correcto y lo lleva a 14 dígitos", () => {
    expect(isValidGtin("4711636014175")).toBe(true);
    expect(gtin14("4711636014175")).toBe("04711636014175");
    expect(gtin14("4711-6360-14175")).toBe("04711636014175");
  });

  it("un UPC-12 y su EAN-13 con cero adelante dan la misma clave", () => {
    expect(gtin14("199291014176")).toBe(gtin14("0199291014176"));
  });

  it("rechaza dígito verificador incorrecto, largos raros, ceros y códigos internos", () => {
    expect(gtin14("4711636014176")).toBeNull();
    expect(gtin14("12345")).toBeNull();
    expect(gtin14("0000000000000")).toBeNull();
    expect(gtin14("2000000000008")).toBeNull(); // prefijo 20-29: uso interno de tienda
    expect(gtin14(null)).toBeNull();
  });

  it("normaliza part numbers y descarta basura", () => {
    expect(pnKey(" 90yv0mp2-m0aa00 ")).toBe("90YV0MP2M0AA00");
    expect(pnKey("N/A")).toBeNull();
    expect(pnKey("0000")).toBeNull();
    expect(pnKey("AB")).toBeNull();
    expect(pnKey("Sin código")).toBeNull();
  });

  it("marca canónica: ignora guiones, espacios y genéricos", () => {
    expect(brandKeyOf("TP-LINK")).toBe(brandKeyOf("Tp Link"));
    expect(brandKeyOf("Genérico")).toBeNull();
  });

  it("extrae códigos de modelo sin confundir medidas", () => {
    const tokens = modelTokens("Placa de Video ASUS Dual RTX 5060 Ti 8GB OC DUAL-RTX5060TI-O8G 165Hz");
    expect(tokens).toContain("DUAL-RTX5060TI-O8G");
    expect(tokens).not.toContain("8GB");
    expect(tokens).not.toContain("165Hz");
    expect(modelTokens("Mouse Redragon Cobra M711 RGB")).toEqual(["M711"]);
  });

  it("parecido de nombres por tokens", () => {
    expect(nameSimilarity("Mouse Logitech G203", "MOUSE LOGITECH G203 LIGHTSYNC")).toBeGreaterThan(0.5);
    expect(nameSimilarity("Mouse Logitech G203", "Fuente 650W")).toBe(0);
  });
});
