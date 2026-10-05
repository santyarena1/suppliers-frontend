import { ForbiddenException } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { Prisma } from "@prisma/client";
import { resolveEntitlements, saleRuleKey } from "@nodo/shared";
import { TenantGuard } from "../tenants/tenant.guard";
import { REQUIRED_CAPABILITY_KEY } from "../tenants/entitlements";
import type { TenantContext } from "../tenants/tenant-context.service";
import { COST_HIDDEN_CODE, COST_SENSITIVE_KEY, hidesCost, sellerModeOn } from "./cost-visibility";
import type { TenantSaleRules } from "./sale-margin-rules.service";
import { applySalePricing, saleHistory } from "./sale-pricing";

const RULES: TenantSaleRules = {
  rules: new Map([[saleRuleKey.provider("ELIT"), 20]]),
  bases: new Map([["ELIT", "NET"]]),
  policies: new Map(),
};

/** Una vista como las de búsqueda: costo neto 100, IVA 21 en los datos crudos. */
function view(extra: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    provider: "ELIT",
    externalId: "A1",
    name: "Placa",
    category: "Placas",
    price: 100,
    finalPrice: 121,
    ivaPercent: 21,
    currency: "USD",
    raw: { precio: 100, iva: 21, costo: 100 },
    syncedAt: new Date("2026-10-05T00:00:00Z"),
    ...extra,
  };
}

/** Busca un importe en todo el JSON (como lo haría alguien mirando la red). */
function containsNumber(value: unknown, n: number): boolean {
  return JSON.stringify(value).includes(String(n));
}

describe("precio de venta en respuestas de catálogo", () => {
  it("quien ve costos recibe costo y venta con el margen y su origen", () => {
    const out = applySalePricing([view()], { rules: RULES, hideCost: false });
    expect(out[0]).toMatchObject({ price: 100, finalPrice: 121, raw: { iva: 21 } });
    expect(out[0].sale).toEqual({ price: 120, finalPrice: 145.2, marginPercent: 20, source: "provider", base: "NET" });
  });

  it("el vendedor recibe solo la venta: sin costo, sin datos crudos y sin el margen", () => {
    const out = applySalePricing([view()], { rules: RULES, hideCost: true });
    expect(out[0]).toMatchObject({ price: 120, finalPrice: 145.2, viewerMode: "seller" });
    expect(out[0].sale).toEqual({ price: 120, finalPrice: 145.2, marginPercent: null, source: null, base: null });
    expect(out[0]).not.toHaveProperty("raw");
    expect(containsNumber(out, 100)).toBe(false);
    expect(containsNumber(out, 121)).toBe(false);
  });

  it("recorre páginas y objetos anidados (catálogo paginado, destacados)", () => {
    const page = { total: 1, items: [view()], meta: { at: new Date("2026-10-05T00:00:00Z") } };
    const out = applySalePricing(page, { rules: RULES, hideCost: true });
    expect(out.items[0].price).toBe(120);
    expect(out.meta.at).toBeInstanceOf(Date);
  });

  it("las bajas de precio pasan a venta y conservan el porcentaje", () => {
    const out = applySalePricing([view({ previousPrice: 125, previousFinalPrice: 151.25, priceDropPercent: 20 })], {
      rules: RULES,
      hideCost: true,
    });
    expect(out[0]).toMatchObject({ previousPrice: 150, previousFinalPrice: 181.5, priceDropPercent: 20 });
  });

  it("una ficha sin precio no inventa venta", () => {
    const out = applySalePricing([view({ price: null, finalPrice: null })], { rules: RULES, hideCost: true });
    expect(out[0]).toMatchObject({ price: null, finalPrice: null, sale: null });
  });

  it("no toca valores que no son objetos planos (Decimal, Date)", () => {
    const decimal = new Prisma.Decimal("12.5");
    const out = applySalePricing({ amount: decimal }, { rules: RULES, hideCost: true });
    expect(out.amount).toBe(decimal);
  });

  it("el historial del vendedor pasa a venta con el margen de hoy", () => {
    const points = [{ price: 100, finalPrice: 121, currency: "USD", capturedAt: new Date() }];
    const out = saleHistory(points, { provider: "ELIT", externalId: "A1", category: "Placas", ivaPercent: 21, raw: {} }, RULES);
    expect(out[0]).toMatchObject({ price: 120, finalPrice: 145.2, currency: "USD" });
  });
});

function tenant(role: TenantContext["tenantRole"], plan: "BASE" | "PRO" | "CUSTOM", permissions: string[]): TenantContext {
  return {
    userId: "u1",
    tenantId: "t1",
    tenantName: "Comercio",
    tenantType: "RETAILER",
    tenantRole: role,
    membershipId: "m1",
    permissions: permissions as TenantContext["permissions"],
    commercialTenantId: "t1",
    entitlements: resolveEntitlements({ tenantType: "RETAILER", plan, subscription: null }),
  };
}

describe("quién ve costos", () => {
  it("con Pro, el que no tiene «Ver costos» solo ve venta", () => {
    expect(hidesCost(tenant("SELLER", "PRO", []))).toBe(true);
    expect(hidesCost(tenant("BUYER", "PRO", ["prices.viewCost"]))).toBe(false);
  });

  it("con Base no hay modo vendedor: todo como antes", () => {
    expect(sellerModeOn(tenant("SELLER", "BASE", []))).toBe(false);
    expect(hidesCost(tenant("SELLER", "BASE", []))).toBe(false);
  });

  it("distribuidores y marcas no tienen modo vendedor", () => {
    expect(sellerModeOn({ tenantType: "DISTRIBUTOR", entitlements: undefined })).toBe(false);
  });
});

describe("TenantGuard con rutas de costos", () => {
  function run(t: TenantContext, meta: { costSensitive?: boolean; capability?: string }) {
    const reflector = new Reflector();
    jest.spyOn(reflector, "getAllAndOverride").mockImplementation((key: unknown) => {
      if (key === COST_SENSITIVE_KEY) return meta.costSensitive;
      if (key === REQUIRED_CAPABILITY_KEY) return meta.capability;
      return undefined;
    });
    const guard = new TenantGuard({ fromSession: async () => t } as never, reflector);
    const request = { user: { userId: t.userId }, method: "GET" };
    const ctx = { switchToHttp: () => ({ getRequest: () => request }), getHandler: () => null, getClass: () => null };
    return guard.canActivate(ctx as never);
  }

  it("el vendedor no entra al carrito, pedidos ni cuenta corriente", async () => {
    const seller = tenant("SELLER", "PRO", ["orders.create", "providers.account"]);
    await expect(run(seller, { costSensitive: true })).rejects.toMatchObject({ response: { code: COST_HIDDEN_CODE } });
    await expect(run(seller, { capability: "providerAccountAccess" })).rejects.toBeInstanceOf(ForbiddenException);
    await expect(run(seller, { capability: "directCheckout" })).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("una ruta liberada con CostSensitive(false) o sin costos deja pasar", async () => {
    const seller = tenant("SELLER", "PRO", []);
    await expect(run(seller, { costSensitive: false })).resolves.toBe(true);
    await expect(run(seller, {})).resolves.toBe(true);
  });

  it("quien ve costos entra", async () => {
    await expect(run(tenant("BUYER", "PRO", ["prices.viewCost"]), { costSensitive: true })).resolves.toBe(true);
  });

  it("en Base el vendedor sigue como antes", async () => {
    await expect(run(tenant("SELLER", "BASE", []), { costSensitive: true })).resolves.toBe(true);
  });

});
