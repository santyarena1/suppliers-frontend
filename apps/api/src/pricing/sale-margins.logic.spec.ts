import {
  computeSalePrice,
  defaultAllows,
  getPlanCapabilities,
  resolveSaleMargin,
  saleCategoryKey,
  saleRuleKey,
  type TaxLine,
} from "@nodo/shared";

const iva = (percent: number, unitAmount: number): TaxLine => ({ kind: "iva", label: "IVA", percent, unitAmount });

describe("resolución del margen (producto > categoría > distribuidor > comercio)", () => {
  const item = { provider: "ELIT", externalId: "A1", category: "Placas de Video" };
  const rules = new Map<string, number>([
    [saleRuleKey.store(), 10],
    [saleRuleKey.provider("ELIT"), 20],
    [saleRuleKey.category("ELIT", "placas de video"), 30],
    [saleRuleKey.product("ELIT", "A1"), 40],
  ]);

  it("gana el producto", () => {
    expect(resolveSaleMargin(rules, item)).toEqual({ percent: 40, source: "product" });
  });

  it("sin producto, la categoría (sin importar mayúsculas ni tildes)", () => {
    const r = new Map(rules);
    r.delete(saleRuleKey.product("ELIT", "A1"));
    expect(resolveSaleMargin(r, { ...item, category: "  PLACAS de vídeo " })).toEqual({ percent: 30, source: "category" });
  });

  it("después el distribuidor y después el comercio", () => {
    const onlyProvider = new Map([[saleRuleKey.provider("ELIT"), 20], [saleRuleKey.store(), 10]]);
    expect(resolveSaleMargin(onlyProvider, item)).toEqual({ percent: 20, source: "provider" });
    const onlyStore = new Map([[saleRuleKey.store(), 10]]);
    expect(resolveSaleMargin(onlyStore, item)).toEqual({ percent: 10, source: "store" });
  });

  it("sin reglas, venta = costo", () => {
    expect(resolveSaleMargin(new Map(), item)).toEqual({ percent: 0, source: "none" });
  });

  it("la regla de otro distribuidor no se aplica", () => {
    const other = new Map([[saleRuleKey.category("AIR", "placas de video"), 50]]);
    expect(resolveSaleMargin(other, item).source).toBe("none");
  });

  it("un margen 0 explícito es una regla (no hereda)", () => {
    const zero = new Map([[saleRuleKey.product("ELIT", "A1"), 0], [saleRuleKey.store(), 10]]);
    expect(resolveSaleMargin(zero, item)).toEqual({ percent: 0, source: "product" });
  });
});

describe("saleCategoryKey", () => {
  it("normaliza espacios, mayúsculas y tildes", () => {
    expect(saleCategoryKey("  Monitores   Gamer ")).toBe("monitores gamer");
    expect(saleCategoryKey("Periféricos")).toBe("perifericos");
    expect(saleCategoryKey("")).toBeNull();
    expect(saleCategoryKey(null)).toBeNull();
  });
});

describe("precio de venta", () => {
  it("FINAL: costo final (con IVA y percepciones) por el margen; el neto sale sin IVA", () => {
    // neto 100, IVA 21 → 21, percepción 3 % → 3: costo final 124. Margen 20 → 148,8.
    const taxes: TaxLine[] = [iva(21, 21), { kind: "iibb", label: "IIBB", percent: 3, unitAmount: 3 }];
    const sale = computeSalePrice({ net: 100, taxes, percent: 20, base: "FINAL" });
    expect(sale).toEqual({ price: 122.98, finalPrice: 148.8 });
  });

  it("NET: neto por el margen y el IVA encima; las percepciones no se trasladan", () => {
    const taxes: TaxLine[] = [iva(21, 21), { kind: "iibb", label: "IIBB", percent: 3, unitAmount: 3 }];
    expect(computeSalePrice({ net: 100, taxes, percent: 20, base: "NET" })).toEqual({ price: 120, finalPrice: 145.2 });
  });

  it("sin IVA informado, venta final = venta neta", () => {
    expect(computeSalePrice({ net: 100, taxes: [], percent: 25, base: "FINAL" })).toEqual({ price: 125, finalPrice: 125 });
    expect(computeSalePrice({ net: 100, taxes: [], percent: 25, base: "NET" })).toEqual({ price: 125, finalPrice: 125 });
  });

  it("impuestos internos como monto fijo escalan con el margen", () => {
    const taxes: TaxLine[] = [iva(10.5, 10.5), { kind: "internos", label: "Internos", percent: null, unitAmount: 8 }];
    const net = computeSalePrice({ net: 100, taxes, percent: 10, base: "NET" });
    expect(net).toEqual({ price: 110, finalPrice: 130.35 });
    const final = computeSalePrice({ net: 100, taxes, percent: 10, base: "FINAL" });
    // costo final 118,5 × 1,1 = 130,35; neto = (130,35 − 8,8) / 1,105 = 110.
    expect(final).toEqual({ price: 110, finalPrice: 130.35 });
  });

  it("redondea a 2 decimales", () => {
    expect(computeSalePrice({ net: 33.333, taxes: [], percent: 7, base: "NET" })).toEqual({ price: 35.67, finalPrice: 35.67 });
  });

  it("margen negativo baja el precio", () => {
    expect(computeSalePrice({ net: 100, taxes: [], percent: -10, base: "NET" })).toEqual({ price: 90, finalPrice: 90 });
  });

  it("sin costo no hay venta", () => {
    expect(computeSalePrice({ net: null, taxes: [], percent: 20, base: "FINAL" })).toBeNull();
    expect(computeSalePrice({ net: 0, taxes: [], percent: 20, base: "FINAL" })).toBeNull();
  });
});

describe("plan y permisos del modo vendedor", () => {
  it("solo Pro y Custom lo incluyen", () => {
    expect(getPlanCapabilities("BASE").sellerMode).toBe(false);
    expect(getPlanCapabilities("PRO").sellerMode).toBe(true);
    expect(getPlanCapabilities("CUSTOM").sellerMode).toBe(true);
  });

  it("el vendedor del comercio no ve costos ni edita márgenes por defecto", () => {
    expect(defaultAllows("RETAILER", "SELLER", "prices.viewCost")).toBe(false);
    expect(defaultAllows("RETAILER", "VIEWER", "prices.viewCost")).toBe(false);
    expect(defaultAllows("RETAILER", "BUYER", "prices.viewCost")).toBe(true);
    expect(defaultAllows("RETAILER", "ADMIN", "prices.viewCost")).toBe(true);
    expect(defaultAllows("RETAILER", "OWNER", "prices.viewCost")).toBe(true);
    expect(defaultAllows("RETAILER", "BUYER", "pricing.manage")).toBe(false);
    expect(defaultAllows("RETAILER", "ADMIN", "pricing.manage")).toBe(true);
  });
});
