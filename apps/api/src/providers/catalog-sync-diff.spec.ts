import { diffCatalogItem, snapshotFromIncoming } from "./catalog-sync-diff";

describe("diffCatalogItem", () => {
  const mouse = {
    externalId: "MX1",
    name: "Mouse Logitech",
    brand: "LOGITECH",
    category: "ACCESORIOS",
    subcategory: null,
    sku: "MX1",
    price: 12.5,
    finalPrice: 15.125,
    currency: "USD",
    ivaPercent: 21,
    stock: 4,
    stockStatus: "Disponible",
  };

  it("marca creado si no había oferta", () => {
    const diff = diffCatalogItem(mouse, null);
    expect(diff.action).toBe("created");
    expect(diff.changedFields).toEqual(
      expect.arrayContaining(["name", "brand", "category", "sku", "price", "stock"])
    );
    expect(diff.before).toBeNull();
    expect(diff.after.name).toBe("Mouse Logitech");
  });

  it("marca unchanged si no cambió nada relevante", () => {
    const diff = diffCatalogItem(mouse, {
      name: "Mouse Logitech",
      brand: "LOGITECH",
      category: "ACCESORIOS",
      subcategory: null,
      sku: "MX1",
      price: 12.5,
      finalPrice: 15.125,
      currency: "USD",
      ivaPercent: 21,
      stock: 4,
      stockStatus: "Disponible",
    });
    expect(diff.action).toBe("unchanged");
    expect(diff.changedFields).toEqual([]);
  });

  it("detecta cambio de precio y stock", () => {
    const diff = diffCatalogItem(
      { ...mouse, price: 13, stock: 0, stockStatus: "Sin stock" },
      {
        name: "Mouse Logitech",
        brand: "LOGITECH",
        category: "ACCESORIOS",
        sku: "MX1",
        price: 12.5,
        finalPrice: 15.125,
        currency: "USD",
        ivaPercent: 21,
        stock: 4,
        stockStatus: "Disponible",
      }
    );
    expect(diff.action).toBe("updated");
    expect(diff.changedFields).toEqual(["price", "stock", "stockStatus"]);
    expect(diff.before?.price).toBe(12.5);
    expect(diff.after.price).toBe(13);
  });

  it("detecta cambio de marca/categoría (nombres, no códigos)", () => {
    const diff = diffCatalogItem(
      { ...mouse, brand: "HP", category: "NOTEBOOKS" },
      {
        name: "Mouse Logitech",
        brand: "63",
        category: "001-0010",
        sku: "MX1",
        price: 12.5,
        finalPrice: 15.125,
        currency: "USD",
        ivaPercent: 21,
        stock: 4,
        stockStatus: "Disponible",
      }
    );
    expect(diff.action).toBe("updated");
    expect(diff.changedFields).toEqual(["brand", "category"]);
  });

  it("trata Decimal de Prisma y strings vacíos como el mismo número / null", () => {
    const diff = diffCatalogItem(mouse, {
      name: "Mouse Logitech",
      brand: "LOGITECH",
      category: "ACCESORIOS",
      subcategory: "",
      sku: "MX1",
      price: { toNumber: () => 12.5 },
      finalPrice: "15.125",
      currency: "USD",
      ivaPercent: { toNumber: () => 21 },
      stock: 4,
      stockStatus: "Disponible",
    });
    expect(diff.action).toBe("unchanged");
  });

  it("no cuenta un created por campos vacíos", () => {
    const diff = diffCatalogItem(
      { externalId: "X", name: "Algo", brand: "  ", price: null, stock: undefined },
      null
    );
    expect(diff.action).toBe("created");
    expect(diff.changedFields).toEqual(["name"]);
  });
});

describe("snapshotFromIncoming", () => {
  it("trimea texto y trunca stock", () => {
    const snap = snapshotFromIncoming({
      externalId: "1",
      name: "  Teclado  ",
      brand: " HP ",
      stock: 3.9,
    });
    expect(snap.name).toBe("Teclado");
    expect(snap.brand).toBe("HP");
    expect(snap.stock).toBe(3);
  });
});
