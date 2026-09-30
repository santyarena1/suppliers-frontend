import { extractSearchTokens, normalizeSearchText, passesRelevanceGate, scoreRetailMatch } from "./retail-search.util";
import { isConfidentOwnStoreMatch, pickOwnStoreMatch, type OwnStoreMatchRow } from "./own-store.match";

const store = { name: "Gorila Games", externalId: 5, priceDivisor: 1 };

function row(partial: Partial<OwnStoreMatchRow> & Pick<OwnStoreMatchRow, "id" | "name" | "price">): OwnStoreMatchRow {
  return {
    searchText: normalizeSearchText(partial.name),
    productUrl: "https://tienda.example/p",
    imageUrl: null,
    syncedAt: new Date("2026-09-30T12:00:00.000Z"),
    currency: "ARS",
    ...partial,
  };
}

describe("tienda propia · coincidencia", () => {
  it("un título casi igual es confiable y gana sobre uno más barato pero distinto", () => {
    const match = pickOwnStoreMatch(
      [
        row({ id: "barato", name: "Ryzen 5 5600", price: 100000 }),
        row({ id: "mismo", name: "Procesador AMD Ryzen 5 7600 AM5", price: 189990 }),
        row({ id: "x", name: "Procesador AMD Ryzen 5 7600X", price: 210000 }),
      ],
      "Procesador AMD Ryzen 5 7600",
      store
    );
    expect(match?.productId).toBe("mismo");
    expect(match?.confident).toBe(true);
    expect(match?.price).toBe(189990);
  });

  it("7600 no matchea 7600X", () => {
    const tokens = extractSearchTokens("Ryzen 5 7600", 8);
    const text = normalizeSearchText("Ryzen 5 7600X");
    const scored = scoreRetailMatch(text, tokens);
    expect(passesRelevanceGate(scored, tokens)).toBe(false);
    expect(isConfidentOwnStoreMatch(scored)).toBe(false);
    expect(
      pickOwnStoreMatch([row({ id: "x", name: "Ryzen 5 7600X", price: 210000 })], "Ryzen 5 7600", store)
    ).toBeNull();
  });

  it("un título flojo no se muestra como coincidencia confiable en la card", () => {
    const match = pickOwnStoreMatch(
      [row({ id: "gen", name: "Mouse generico oficina", price: 15000 })],
      "Mouse Logitech G203 negro",
      store
    );
    expect(match?.confident ?? false).toBe(false);
  });
});
