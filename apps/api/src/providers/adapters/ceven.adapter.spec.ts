import { mapCevenItem, stripHtml } from "./ceven.adapter";

const SAMPLE: Parameters<typeof mapCevenItem>[0] = {
  internalid: 108921,
  itemid: "94PHLJ05B",
  displayname: "LAVAVAJILLAS PHILCO 5 CUBIERTOS SOBRE MESADA BLANCO",
  storedisplayname2: "Lavavajillas Philco 5 Cubiertos Phlj05 Sobremesada Blanco",
  storedescription: "<p>Lavavajilla 5 Cubiertos Philco Blanco PHLJ05B</p>",
  custitem_marca: "PHILCO",
  onlinecustomerprice: 336540,
  quantityavailable: 31,
  isinstock: true,
  urlcomponent: "94PHLJ05B",
  itemimages_detail: {
    urls: [{ url: "https://www.ceven.com/SSP Applications/foto.jpg" }],
  },
};

describe("mapCevenItem", () => {
  it("mapea los campos vistos en /api/cacheable/items y no inventa stock status si hay stock", () => {
    const p = mapCevenItem(SAMPLE);
    expect(p.externalId).toBe("108921");
    expect(p.sku).toBe("94PHLJ05B");
    expect(p.name).toBe("Lavavajillas Philco 5 Cubiertos Phlj05 Sobremesada Blanco");
    expect(p.brand).toBe("PHILCO");
    expect(p.price).toBe(336540);
    expect(p.currency).toBe("ARS");
    expect(p.stock).toBe(31);
    expect(p.stockStatus).toBeUndefined();
    expect(p.productUrl).toBe("https://www.ceven.com/94PHLJ05B");
    expect(p.imageUrl).toMatch(/foto\.jpg$/);
    expect(p.description).toBe("Lavavajilla 5 Cubiertos Philco Blanco PHLJ05B");
    expect(p.ivaPercent).toBeUndefined();
  });

  it("copia taxrate de SuiteCommerce si vino, sin inventarlo", () => {
    const p = mapCevenItem({ ...SAMPLE, taxrate: 21 } as typeof SAMPLE & { taxrate: number });
    expect(p.ivaPercent).toBe(21);
  });

  it("deja precio undefined si no vino número", () => {
    const p = mapCevenItem({ internalid: 1, displayname: "X" });
    expect(p.price).toBeUndefined();
    expect(p.currency).toBeUndefined();
  });
});

describe("stripHtml", () => {
  it("saca tags de la descripción de SuiteCommerce", () => {
    expect(stripHtml("<p>Hola <b>mundo</b></p>")).toBe("Hola mundo");
  });
});
