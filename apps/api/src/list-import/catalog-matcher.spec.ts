import { matchAgainstCatalog } from "./catalog-matcher";
import { normalizeName, similarity } from "../admin/provider-merge.service";
import type { NormalizedProduct } from "../providers/types";

function item(externalId: string, extra: Partial<NormalizedProduct> = {}): NormalizedProduct {
  return { externalId, name: externalId, raw: {}, ...extra };
}

function prismaWith(rows: { externalId: string; sku?: string | null; ean?: string | null; partNumber?: string | null }[]) {
  return {
    providerSyncCache: {
      count: jest.fn().mockResolvedValue(rows.length),
      findMany: jest.fn().mockResolvedValue(rows.map((r) => ({ sku: null, ean: null, partNumber: null, ...r }))),
    },
  } as never;
}

describe("matchAgainstCatalog", () => {
  test("catálogo vacío: no toca nada", async () => {
    const res = await matchAgainstCatalog(prismaWith([]), "LIST_X", [item("A")]);
    expect(res.items.map((i) => i.externalId)).toEqual(["A"]);
    expect(res.knownCatalogSize).toBe(0);
  });

  test("adopta el código conocido cuando coincide el SKU o el EAN", async () => {
    const prisma = prismaWith([
      { externalId: "E-1", sku: "SKU1" },
      { externalId: "E-2", ean: "779000" },
      { externalId: "E-3" },
    ]);
    const res = await matchAgainstCatalog(prisma, "ELIT", [
      item("X1", { sku: "sku1" }),
      item("X2", { ean: "779000" }),
      item("E-3"),
      item("NUEVO"),
    ]);
    expect(res.items.map((i) => i.externalId)).toEqual(["E-1", "E-2", "E-3", "NUEVO"]);
    expect(res.matched).toBe(3);
    expect(res.unmatched).toBe(1);
  });

  test("dos filas que caen en la misma ficha: se conserva la primera con issue", async () => {
    const prisma = prismaWith([{ externalId: "E-1", sku: "SKU1" }]);
    const res = await matchAgainstCatalog(prisma, "ELIT", [item("E-1"), item("OTRO", { sku: "SKU1" })]);
    expect(res.items).toHaveLength(1);
    expect(res.issues[0].message).toContain("misma ficha");
  });
});

describe("similarity", () => {
  test("ignora acentos, sufijos societarios y puntuación", () => {
    expect(normalizeName("Elit S.A.")).toBe("elit");
    expect(similarity("ELIT", "Elit S.A.")).toBe(1);
    expect(similarity("Acústica Río", "Acustica Rio SRL")).toBeGreaterThan(0.8);
    expect(similarity("Elit", "New Bytes")).toBeLessThan(0.3);
  });
});
