import {
  groupBrandsByDisplay,
  heuristicCategoryClusters,
  identityIndexKey,
  indexCatalogAliases,
  indexCatalogIdentities,
  matchingRawBrands,
  matchesDisplayBrand,
  normalizeBrandKey,
  normalizeCatalogLabel,
  normalizeEan,
  normalizePartNumber,
  looksLikeAirCatalogCode,
  looksLikeProviderCode,
  parentWouldCycle,
  resolveCatalogDisplay,
  suggestAliasMerges,
  suggestIdentityMerges,
  suggestProviderCodeLabels,
  suggestRowMerges,
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
    overrides: {},
    hiddenCategoryLabels: new Set<string>(),
    hiddenBrandLabels: new Set<string>(),
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

  it("detecta ids viejos de Air y no marcas reales", () => {
    expect(looksLikeAirCatalogCode("63")).toBe(true);
    expect(looksLikeAirCatalogCode("001-0010")).toBe(true);
    expect(looksLikeAirCatalogCode("002-1263")).toBe(true);
    expect(looksLikeAirCatalogCode("HP")).toBe(false);
    expect(looksLikeAirCatalogCode("LOGITECH")).toBe(false);
    expect(looksLikeAirCatalogCode("TP-LINK")).toBe(false);
    expect(looksLikeAirCatalogCode("ACCESORIOS")).toBe(false);
    expect(looksLikeProviderCode("001-0010")).toBe(true);
    expect(looksLikeProviderCode("12")).toBe(true);
  });

  it("normaliza EAN y part number", () => {
    expect(normalizeEan("0789-1234-567890")).toBe("7891234567890");
    expect(normalizePartNumber("  g502 hero ")).toBe("G502HERO");
  });

  it("heurística de clusters", () => {
    const clusters = heuristicCategoryClusters(["Memorias RAM", "Memorias Ram", "Periféricos"]);
    expect(clusters.some((c) => c.members.includes("Memorias RAM"))).toBe(true);
  });

  it("normaliza marcas ignorando guiones y espacios", () => {
    expect(normalizeBrandKey("TP-LINK")).toBe(normalizeBrandKey("TP LINK"));
    expect(normalizeBrandKey("TP-LINK")).toBe(normalizeBrandKey("tplink"));
    expect(normalizeBrandKey("ASUS")).toBe(normalizeBrandKey("Asus"));
  });

  it("sugiere fusionar la misma marca en todos los distribuidores", () => {
    const suggestions = suggestRowMerges(
      [
        { provider: "ELIT", rawKey: "ASUS", count: 100 },
        { provider: "INVID", rawKey: "Asus", count: 40 },
        { provider: "NEW_BYTES", rawKey: "ASUS", count: 80 },
        { provider: "AIR", rawKey: "TP-LINK", count: 10 },
        { provider: "ELIT", rawKey: "TP LINK", count: 12 },
        { provider: "INVID", rawKey: "SoloUna", count: 3 },
      ],
      "BRAND"
    );
    const asus = suggestions.find((s) => normalizeBrandKey(s.label) === "asus");
    expect(asus).toBeTruthy();
    expect(asus!.members).toHaveLength(3);
    expect(asus!.reason).toContain("distribuidores");

    const tplink = suggestions.find((s) => normalizeBrandKey(s.label) === "tplink");
    expect(tplink).toBeTruthy();
    expect(tplink!.members).toHaveLength(2);
    expect(suggestions.some((s) => s.members.length === 1 && s.members[0].rawKey === "SoloUna")).toBe(
      false
    );
  });

  it("prioriza override por producto", () => {
    const withOverride = {
      ...ctx,
      overrides: {
        "ELIT:sku1": {
          provider: "ELIT",
          externalId: "sku1",
          displayBrand: "Corsair",
          displayCategory: "Teclados",
          displaySubcategory: null,
        },
      },
    };
    const out = resolveCatalogDisplay(
      {
        provider: "ELIT",
        externalId: "sku1",
        brand: "Otra",
        category: "Periféricos",
        subcategory: null,
        ean: null,
        partNumber: null,
      },
      withOverride
    );
    expect(out.displayBrand).toBe("Corsair");
    expect(out.displayCategory).toBe("Teclados");
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

// Mirrors apps/web/lib/unify-names.ts — al unificar se elige uno de los nombres marcados.
function selectableUnifyNames(rows: { rawKey: string; termLabel?: string | null; count: number }[]) {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of [...rows.map((r) => r.termLabel), ...rows.map((r) => r.rawKey)]) {
    const v = (raw ?? "").trim();
    if (!v || seen.has(v)) continue;
    seen.add(v);
    out.push(v);
  }
  return out;
}

function defaultUnifyName(rows: { rawKey: string; termLabel?: string | null; count: number }[]) {
  if (rows.length === 0) return "";
  const score = (label: string) =>
    rows.filter((r) => r.termLabel === label || r.rawKey === label).reduce((s, r) => s + r.count, 0);
  const names = selectableUnifyNames(rows);
  return names.slice().sort((a, b) => score(b) - score(a) || a.localeCompare(b, "es"))[0] ?? rows[0].rawKey;
}

describe("nombre que queda al unificar", () => {
  it("elige uno de los seleccionados (el de más productos), no un nombre nuevo", () => {
    const rows = [
      { rawKey: "notebooks", count: 2 },
      { rawKey: "Notebooks", count: 10 },
      { rawKey: "NOTEBOOK", count: 3 },
    ];
    expect(defaultUnifyName(rows)).toBe("Notebooks");
    expect(selectableUnifyNames(rows)).toEqual(["notebooks", "Notebooks", "NOTEBOOK"]);
  });

  it("si ya hay grupo, ese nombre queda porque junta los productos", () => {
    const rows = [
      { rawKey: "nb", termLabel: "Notebooks", count: 8 },
      { rawKey: "notebooks", termLabel: "Notebooks", count: 5 },
    ];
    expect(defaultUnifyName(rows)).toBe("Notebooks");
    expect(selectableUnifyNames(rows)[0]).toBe("Notebooks");
  });
});

describe("parentWouldCycle", () => {
  const tree = { a: null, b: "a", c: "b" };

  it("deja adoptar una categoría suelta", () => {
    expect(parentWouldCycle("c", "a", { a: null, b: "a", c: null })).toBe(false);
  });

  it("bloquea poner un padre debajo de su hija", () => {
    expect(parentWouldCycle("a", "c", tree)).toBe(true);
  });

  it("bloquea ser padre de sí mismo", () => {
    expect(parentWouldCycle("a", "a", tree)).toBe(true);
  });
});

describe("brand catalog helpers", () => {
  const ctx = {
    aliases: indexCatalogAliases([
      { kind: "BRAND", provider: null, rawKey: "LOGITECH INC.", groupId: "g2", label: "Logitech" },
      { kind: "BRAND", provider: "AIR", rawKey: "Logi", groupId: "g2", label: "Logitech" },
    ]),
    identities: {},
    overrides: {},
    hiddenCategoryLabels: new Set<string>(),
    hiddenBrandLabels: new Set<string>(),
  };

  it("matchingRawBrands incluye alias del display", () => {
    const raws = matchingRawBrands("Logitech", ctx);
    expect(raws).toEqual(expect.arrayContaining(["Logitech", "LOGITECH INC.", "Logi"]));
  });

  it("groupBrandsByDisplay fusiona alias", () => {
    const grouped = groupBrandsByDisplay(
      [
        { rawBrand: "LOGITECH INC.", count: 3 },
        { rawBrand: "Logi", count: 2 },
        { rawBrand: "ASUS", count: 1 },
      ],
      ctx
    );
    const logitech = grouped.find((g) => g.brand === "Logitech");
    expect(logitech?.count).toBe(5);
  });

  it("matchesDisplayBrand respeta clave normalizada", () => {
    expect(
      matchesDisplayBrand(
        {
          provider: "AIR",
          brand: "LOGITECH INC.",
          category: null,
          subcategory: null,
          ean: null,
          partNumber: null,
        },
        "logitech",
        ctx
      )
    ).toBe(true);
  });
});
