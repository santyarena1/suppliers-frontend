import {
  heuristicCategoryClusters,
  identityIndexKey,
  indexCatalogAliases,
  indexCatalogIdentities,
  normalizeCatalogLabel,
  normalizeEan,
  normalizePartNumber,
  resolveCatalogDisplay,
  suggestAliasMerges,
  suggestIdentityMerges,
  suggestProviderCodeLabels,
  type RawValueStat,
} from "./catalog-enrichment";

describe("catalog-enrichment", () => {
  const ctx = {
    aliases: indexCatalogAliases([
      { kind: "CATEGORY", provider: "AIR", rawKey: "12", groupId: "g1", label: "Periféricos" },
      { kind: "BRAND", provider: null, rawKey: "LOGITECH INC.", groupId: "g2", label: "Logitech" },
    ]),
    identities: indexCatalogIdentities([
      {
        matchKind: "EAN",
        matchKey: "7891234567890",
        displayBrand: "Logitech",
        displayCategory: "Periféricos",
        displaySubcategory: null,
      },
    ]),
  };

  it("resuelve código Air y alias de marca", () => {
    const out = resolveCatalogDisplay(
      {
        provider: "AIR",
        brand: "LOGITECH INC.",
        category: "12",
        subcategory: "5",
        ean: null,
        partNumber: null,
      },
      ctx
    );
    expect(out.displayCategory).toBe("Periféricos");
    expect(out.displayBrand).toBe("Logitech");
  });

  it("prioriza identidad por EAN", () => {
    const out = resolveCatalogDisplay(
      {
        provider: "ELIT",
        brand: "Otra",
        category: "X",
        subcategory: null,
        ean: "07891234567890",
        partNumber: null,
      },
      ctx
    );
    expect(out.displayBrand).toBe("Logitech");
    expect(out.displayCategory).toBe("Periféricos");
  });

  it("sugiere merge de categorías similares", () => {
    const stats: RawValueStat[] = [
      { kind: "CATEGORY", provider: null, rawKey: "Memorias RAM", count: 10, sampleNames: [], looksLikeCode: false },
      { kind: "CATEGORY", provider: null, rawKey: "Memorias Ram", count: 8, sampleNames: [], looksLikeCode: false },
    ];
    const suggestions = suggestAliasMerges(stats);
    expect(suggestions.length).toBe(1);
    expect(suggestions[0].rawKeys).toEqual(expect.arrayContaining(["Memorias RAM", "Memorias Ram"]));
  });

  it("normaliza EAN y part number", () => {
    expect(normalizeEan("0789-1234-567890")).toBe("7891234567890");
    expect(normalizePartNumber("  g502 hero ")).toBe("G502HERO");
  });

  it("heurística de clusters", () => {
    const clusters = heuristicCategoryClusters(["Memorias RAM", "Memorias Ram", "Periféricos"]);
    expect(clusters.some((c) => c.members.includes("Memorias RAM"))).toBe(true);
  });
});

describe("identity suggestions", () => {
  it("detecta mismo EAN cross-proveedor", () => {
    const suggestions = suggestIdentityMerges([
      { provider: "ELIT", ean: "7891234567890", partNumber: null, brand: "Logitech", category: "Perif", subcategory: null },
      { provider: "INVID", ean: "7891234567890", partNumber: null, brand: "LOGITECH", category: "Periféricos", subcategory: null },
    ]);
    expect(suggestions.length).toBe(1);
    expect(suggestions[0].matchKind).toBe("EAN");
    expect(suggestions[0].productCount).toBe(2);
  });
});

describe("normalizeCatalogLabel", () => {
  it("ignora tildes y mayúsculas", () => {
    expect(normalizeCatalogLabel("Periféricos")).toBe(normalizeCatalogLabel("perifericos"));
  });
});

describe("identityIndexKey", () => {
  it("forma clave estable", () => {
    expect(identityIndexKey("EAN", "123")).toBe("EAN:123");
  });
});
