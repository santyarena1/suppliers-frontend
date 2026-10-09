import { looksLikeDistributorSku, manufacturerCodeCandidates, brandKeyOf, gtin14, isValidGtin, modelTokens, nameSimilarity, pnKey } from "./keys";

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

describe("códigos del fabricante vs. códigos internos del distribuidor", () => {
  it("reconoce los códigos internos de un distribuidor", () => {
    for (const code of ["39445-APF73554", "216959-ABT74541", "M20-PF56082", "54227-CX62615"]) {
      expect(looksLikeDistributorSku(code)).toBe(true);
    }
    for (const code of ["DUAL-RTX5060TI-O8G", "SA400S37/480G", "YD3400C5M4MFH", "82YU012PAR"]) {
      expect(looksLikeDistributorSku(code)).toBe(false);
    }
  });

  it("descarta el código interno y toma el del fabricante del nombre", () => {
    const codes = manufacturerCodeCandidates(["39445-APF73554"], ["Procesador AMD Ryzen 5 3400G YD3400C5M4MFH"]);
    expect(codes).toContain("YD3400C5M4MFH");
    expect(codes).not.toContain("39445-APF73554");
  });

  it("prefiere el part number real y agrega candidatos del nombre sin repetir", () => {
    const codes = manufacturerCodeCandidates(["DUAL-RTX5060TI-O8G"], ["ASUS DUAL RTX5060TI O8G DUAL-RTX5060TI-O8G"]);
    expect(codes[0]).toBe("DUAL-RTX5060TI-O8G");
    expect(codes.filter((c) => c.toUpperCase() === "DUAL-RTX5060TI-O8G")).toHaveLength(1);
  });
});
