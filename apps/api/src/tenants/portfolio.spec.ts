import {
  canEditClientTerms,
  clientIsInactive,
  clientLinkVisibleTo,
  CLIENT_INACTIVE_AFTER_MS,
  orderItemsMatchBrands,
  orderMatchesPmScope,
} from "./portfolio";

describe("clientLinkVisibleTo", () => {
  const link = { accountManagerId: "seller-1" };

  it("el vendedor solo ve las cuentas asignadas", () => {
    expect(clientLinkVisibleTo(link, { tenantRole: "SELLER", userId: "seller-1" })).toBe(true);
    expect(clientLinkVisibleTo(link, { tenantRole: "SELLER", userId: "otro" })).toBe(false);
    expect(clientLinkVisibleTo({ accountManagerId: null }, { tenantRole: "SELLER", userId: "seller-1" })).toBe(false);
  });

  it("dueño, administrador y visor ven toda la cartera", () => {
    expect(clientLinkVisibleTo(link, { tenantRole: "OWNER", userId: "x" })).toBe(true);
    expect(clientLinkVisibleTo(link, { tenantRole: "ADMIN", userId: "x" })).toBe(true);
    expect(clientLinkVisibleTo(link, { tenantRole: "VIEWER", userId: "x" })).toBe(true);
    expect(clientLinkVisibleTo(link, { tenantRole: "PRODUCT_MANAGER", userId: "x" })).toBe(true);
  });
});

describe("canEditClientTerms", () => {
  it("dueño, administrador y vendedor editan descuento y notas", () => {
    expect(canEditClientTerms("OWNER")).toBe(true);
    expect(canEditClientTerms("ADMIN")).toBe(true);
    expect(canEditClientTerms("SELLER")).toBe(true);
  });

  it("PM y visor no editan condiciones", () => {
    expect(canEditClientTerms("PRODUCT_MANAGER")).toBe(false);
    expect(canEditClientTerms("VIEWER")).toBe(false);
  });
});

describe("clientIsInactive", () => {
  const now = new Date("2026-08-27T12:00:00.000Z");

  it("un activo sin pedidos está inactivo", () => {
    expect(clientIsInactive("ACTIVE", null, now)).toBe(true);
  });

  it("un activo con pedido reciente no está inactivo", () => {
    expect(clientIsInactive("ACTIVE", new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000), now)).toBe(false);
  });

  it("un activo sin pedido en 30 días está inactivo", () => {
    expect(clientIsInactive("ACTIVE", new Date(now.getTime() - CLIENT_INACTIVE_AFTER_MS - 1000), now)).toBe(true);
  });

  it("un suspendido no se marca inactivo", () => {
    expect(clientIsInactive("SUSPENDED", null, now)).toBe(false);
  });
});

describe("alcance del Product Manager", () => {
  it("matchea la marca en el ítem del pedido", () => {
    expect(orderItemsMatchBrands([{ brand: "Logitech" }, { brand: "Asus" }], ["logitech"])).toBe(true);
    expect(orderItemsMatchBrands([{ brand: "Asus" }], ["Logitech"])).toBe(false);
    expect(orderItemsMatchBrands([{ displayBrand: "Logitech" }], ["LOGITECH"])).toBe(true);
  });

  it("matchea por SKU del catálogo cuando el ítem no trae marca", () => {
    const order = { tenantId: "c1", provider: "ELIT", items: [{ externalId: "A1", name: "Mouse" }] };
    expect(orderMatchesPmScope(order, ["Logitech"], new Set(["c1:ELIT:A1"]))).toBe(true);
    expect(orderMatchesPmScope(order, ["Logitech"], new Set(["c1:ELIT:OTRO"]))).toBe(false);
  });
});
