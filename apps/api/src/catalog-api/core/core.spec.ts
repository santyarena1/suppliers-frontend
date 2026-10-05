import { readFileSync } from "fs";
import { join } from "path";
import { DEFAULT_API_CLIENT_CONFIG, type ApiClientConfig } from "@nodo/shared";
import { decodePageCursor, encodeCursor, InvalidCursorError, pageAfter } from "./cursor";
import { cleanGtin, groupKeyFor, offerIdFor, productIdFor, providerAliasId, validGtin } from "./ids";
import { costTaxLines, makeConverter, NO_PERCEPTIONS, priceOffer, roundSalePrice } from "./pricing";

const price = (patch: Partial<ApiClientConfig["price"]> = {}): ApiClientConfig["price"] => ({ ...DEFAULT_API_CLIENT_CONFIG.price, ...patch });
const usd = makeConverter("USD", 1500);

describe("ids", () => {
  it("son estables y no exponen el distribuidor", () => {
    const id = offerIdFor("ELIT", "12345");
    expect(id).toBe(offerIdFor("ELIT", "12345"));
    expect(id).toMatch(/^off_[0-9A-Za-z]{22}$/);
    expect(id).not.toContain("ELIT");
    expect(offerIdFor("AIR", "12345")).not.toBe(id);
  });

  it("el alias de un distribuidor cambia por comercio", () => {
    expect(providerAliasId("t1", "ELIT")).not.toBe(providerAliasId("t2", "ELIT"));
    expect(providerAliasId("t1", "ELIT")).toMatch(/^prv_/);
  });

  it("valida el dígito verificador del EAN", () => {
    expect(validGtin("4006381333931")).toBe(true);
    expect(validGtin("4006381333932")).toBe(false);
    expect(cleanGtin("400-6381-333931")).toBe("4006381333931");
    expect(cleanGtin("036000291452")).toBe("0036000291452");
    expect(cleanGtin("123")).toBeNull();
  });

  it("agrupa por EAN, después por marca + part number, y si no queda sola", () => {
    const a = groupKeyFor({ provider: "ELIT", externalId: "1", ean: "4006381333931", partNumber: "X", brand: "ASUS" });
    const b = groupKeyFor({ provider: "AIR", externalId: "9", ean: "4006381333931", partNumber: "Y", brand: "Asus" });
    expect(a).toBe(b);
    const c = groupKeyFor({ provider: "ELIT", externalId: "1", ean: null, partNumber: "DUAL-RTX4060-O8G", brand: "ASUS" });
    const d = groupKeyFor({ provider: "AIR", externalId: "2", ean: "999", partNumber: "dual rtx4060 o8g", brand: "Asus" });
    expect(c).toBe(d);
    const e = groupKeyFor({ provider: "ELIT", externalId: "1", ean: null, partNumber: "DUAL-RTX4060-O8G", brand: null });
    expect(e).toBe("offer:ELIT:1");
    expect(productIdFor(a)).toMatch(/^prd_/);
  });
});

describe("precios", () => {
  it("el % manual de IIBB manda; 0 anula la percepción", () => {
    const withManual = costTaxLines({ price: 100, finalPrice: null, ivaPercent: 21, raw: {} }, { ...NO_PERCEPTIONS, manualIibbPercent: 3 });
    expect(withManual.find((l) => l.kind === "iibb")).toMatchObject({ percent: 3, unitAmount: 3 });
    const zero = costTaxLines({ price: 100, finalPrice: null, ivaPercent: 21, raw: { percepcion: 5 } }, { ...NO_PERCEPTIONS, manualIibbPercent: 0 });
    expect(zero.find((l) => l.kind === "iibb")).toBeUndefined();
  });

  it("la percepción aprendida del portal entra como estimada", () => {
    const lines = costTaxLines({ price: 200, finalPrice: null, ivaPercent: 10.5, raw: {} }, { ...NO_PERCEPTIONS, learnedIibbPercent: 2 });
    expect(lines.find((l) => l.kind === "iibb")).toMatchObject({ percent: 2, unitAmount: 4, estimated: true });
  });

  it("costo con impuestos; venta con margen y sin percepciones", () => {
    const lines = costTaxLines({ price: 100, finalPrice: null, ivaPercent: 21, raw: {} }, { ...NO_PERCEPTIONS, manualIibbPercent: 3 });
    const p = priceOffer({ currency: "USD", costNet: 100, costTaxes: lines, providerMarginPercent: 20, marginBase: "NET", source: "SYNC" }, price(), usd)!;
    expect(p.cost).toEqual({
      net: 100,
      taxes: [
        { type: "iva", label: "IVA", percent: 21, amount: 21 },
        { type: "perception", label: "IIBB", percent: 3, amount: 3 },
      ],
      gross: 124,
    });
    expect(p.sale).toEqual({ net: 120, taxes: [{ type: "iva", label: "IVA", percent: 21, amount: 25.2 }], gross: 145.2, markupPercent: 20 });
    expect(p.listSource).toBe("api");
  });

  it("margen del comercio con base FINAL (modo vendedor): el costo final con percepciones por el margen", () => {
    const lines = costTaxLines({ price: 100, finalPrice: null, ivaPercent: 21, raw: {} }, { ...NO_PERCEPTIONS, manualIibbPercent: 3 });
    const p = priceOffer({ currency: "USD", costNet: 100, costTaxes: lines, providerMarginPercent: 20, marginBase: "FINAL", source: "SYNC" }, price(), usd)!;
    // Costo final 124 × 1,2 = 148,8; neto sin IVA = 122,98. Igual que la web (computeSalePrice).
    expect(p.sale).toMatchObject({ net: 122.98, gross: 148.8, markupPercent: 20 });
  });

  it("con margen fijo de la key la base es siempre el neto", () => {
    const p = priceOffer({ currency: "USD", costNet: 100, costTaxes: [], providerMarginPercent: 20, marginBase: "FINAL", source: "SYNC" }, price({ markup: { mode: "fixed", percent: 10 } }), usd)!;
    expect(p.sale).toMatchObject({ net: 110, gross: 110, markupPercent: 10 });
  });

  it("margen fijo de la key en vez del de NODO", () => {
    const p = priceOffer({ currency: "USD", costNet: 100, costTaxes: [], providerMarginPercent: 20, marginBase: "NET", source: "OWN_LIST" }, price({ markup: { mode: "fixed", percent: 50 } }), usd)!;
    expect(p.sale).toMatchObject({ net: 150, gross: 150, markupPercent: 50 });
    expect(p.listSource).toBe("list");
  });

  it("respeta qué se expone", () => {
    const p = priceOffer({ currency: "USD", costNet: 100, costTaxes: [], providerMarginPercent: 0, marginBase: "NET", source: "SYNC" }, price({ includeCost: false, includeTaxes: false }), usd)!;
    expect(p.cost).toBeUndefined();
    expect(p.sale?.taxes).toBeUndefined();
  });

  it("convierte de dólares a pesos y de pesos a dólares", () => {
    const ars = makeConverter("ARS", 1000);
    const p = priceOffer({ currency: "USD", costNet: 10, costTaxes: [], providerMarginPercent: 0, marginBase: "NET", source: "SYNC" }, price({ currency: "ARS" }), ars)!;
    expect(p.cost?.net).toBe(10_000);
    expect(p.currency).toBe("ARS");
    const back = priceOffer({ currency: "ARS", costNet: 1500, costTaxes: [], providerMarginPercent: 0, marginBase: "NET", source: "SYNC" }, price(), makeConverter("USD", 1500))!;
    expect(back.cost?.net).toBe(1);
  });

  it("sin cotización no inventa un precio", () => {
    expect(priceOffer({ currency: "USD", costNet: 10, costTaxes: [], providerMarginPercent: 0, marginBase: "NET", source: "SYNC" }, price({ currency: "ARS" }), makeConverter("ARS", null))).toBeNull();
  });

  it("redondeos del precio de venta", () => {
    expect(roundSalePrice(123.456, "none")).toBe(123.46);
    expect(roundSalePrice(123.01, "1")).toBe(124);
    expect(roundSalePrice(123.01, "10")).toBe(130);
    expect(roundSalePrice(1234.2, "99")).toBe(1234.99);
    expect(roundSalePrice(1234.995, "99")).toBe(1235.99);
  });
});

describe("tax-lines de @nodo/shared", () => {
  it("es la misma lógica que apps/web/lib/tax.ts (la web no depende de shared)", () => {
    const web = readFileSync(join(__dirname, "../../../../web/lib/tax.ts"), "utf8").replace(/\r\n/g, "\n");
    const shared = readFileSync(join(__dirname, "../../../../../packages/shared/src/tax-lines.ts"), "utf8").replace(/\r\n/g, "\n");
    const body = (s: string) => s.slice(s.indexOf("export type TaxKind"));
    expect(body(shared)).toBe(body(web));
  });
});

describe("cursor", () => {
  const items = ["a", "b", "c", "d", "e"].map((id, i) => ({ id, value: i }));
  const key = (x: { id: string; value: number }) => ({ value: x.value, id: x.id });

  it("pagina sin repetir ni saltear", () => {
    const p1 = pageAfter(items, key, false, null, 2);
    expect(p1.items.map((x) => x.id)).toEqual(["a", "b"]);
    const p2 = pageAfter(items, key, false, { sort: "s", filter: "f", value: 1, id: "b" }, 2);
    expect(p2.items.map((x) => x.id)).toEqual(["c", "d"]);
    expect(p2.hasMore).toBe(true);
  });

  it("sigue bien aunque el catálogo cambie entre páginas", () => {
    const changed = [{ id: "a0", value: 0.5 }, ...items];
    const p2 = pageAfter(changed, key, false, { sort: "s", filter: "f", value: 1, id: "b" }, 2);
    expect(p2.items.map((x) => x.id)).toEqual(["c", "d"]);
  });

  it("un cursor de otro orden o de otros filtros no sirve", () => {
    const raw = encodeCursor({ sort: "name", filter: "abc", value: "x", id: "1" });
    expect(decodePageCursor(raw, "name", "abc").id).toBe("1");
    expect(() => decodePageCursor(raw, "price", "abc")).toThrow(InvalidCursorError);
    expect(() => decodePageCursor(raw, "name", "zzz")).toThrow(InvalidCursorError);
    expect(() => decodePageCursor("basura", "name", "abc")).toThrow(InvalidCursorError);
  });
});
