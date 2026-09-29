// Integración contra un Postgres real con las migraciones aplicadas. Se salta si no hay
// INTEGRATION_DB (ej.: postgresql://postgres@127.0.0.1:55432/nodo_test).
import { PrismaClient } from "@prisma/client";
import { resolvePermissions } from "@nodo/shared";
import { BrandItemsService } from "./brand-items.service";
import { BrandStatsService } from "./brand-stats.service";

const url = process.env.INTEGRATION_DB;
const d = url ? describe : describe.skip;

function ctx(tenantId: string, type: "RETAILER" | "BRAND", role: "OWNER" | "SELLER" = "OWNER") {
  return {
    userId: `u-${tenantId}`,
    tenantId,
    tenantName: tenantId,
    tenantType: type,
    tenantRole: role,
    membershipId: "m",
    permissions: resolvePermissions({ type, role }),
    commercialTenantId: tenantId,
  };
}

d("BrandStatsService contra Postgres", () => {
  // El cliente no conecta hasta la primera consulta: sin INTEGRATION_DB la suite se salta.
  const prisma = new PrismaClient({ datasources: { db: { url: url ?? "postgresql://skip@localhost/skip" } } });
  const items = new BrandItemsService(prisma as never, { listFor: async () => [] } as never);
  const service = new BrandStatsService(prisma as never, items);
  const brand = ctx("st-brand", "BRAND");
  const shop = ctx("st-shop", "RETAILER");
  let linkId = "";

  beforeAll(async () => {
    await prisma.tenant.upsert({ where: { id: "st-brand" }, create: { id: "st-brand", name: "StatsBrand", type: "BRAND" }, update: {} });
    await prisma.tenant.upsert({ where: { id: "st-shop" }, create: { id: "st-shop", name: "Local Stats", type: "RETAILER" }, update: {} });
    await prisma.user.upsert({
      where: { id: "u-st-shop" },
      create: { id: "u-st-shop", username: "u-st-shop", email: "u-st-shop@test.local", passwordHash: "x" },
      update: {},
    });
    await prisma.brandItem.deleteMany({ where: { tenantId: "st-brand" } });
    await prisma.providerOrder.deleteMany({ where: { tenantId: "st-shop" } });
    const link = await prisma.tenantLink.upsert({
      where: { clientTenantId_supplierTenantId: { clientTenantId: "st-shop", supplierTenantId: "st-brand" } },
      create: { clientTenantId: "st-shop", supplierTenantId: "st-brand", status: "ACTIVE" },
      update: { status: "ACTIVE" },
    });
    linkId = link.id;
    await prisma.brandItem.create({
      data: {
        tenantId: "st-brand",
        name: "Parlante X",
        links: { create: [{ provider: "ELIT", externalId: "st-e1" }, { provider: "AIR", externalId: "st-a1" }] },
      },
    });
    await prisma.providerSyncCache.upsert({
      where: { provider_externalId: { provider: "ELIT", externalId: "st-e2" } },
      create: { provider: "ELIT", externalId: "st-e2", name: "Cable StatsBrand", brand: "StatsBrand", raw: {} },
      update: { brand: "StatsBrand" },
    });
    const order = (provider: string, items: unknown[], status = "CREATED") =>
      prisma.providerOrder.create({
        data: {
          userId: "u-st-shop",
          tenantId: "st-shop",
          provider,
          status,
          paymentOption: "x",
          items: items as never,
          addressSnapshot: {},
        },
      });
    await order("ELIT", [
      { externalId: "st-e1", name: "Parlante X", qty: 2, unitPrice: 50 },
      { externalId: "st-e2", name: "Cable", qty: 3, unitPrice: 2 },
      { externalId: "otra-marca", name: "Otra", qty: 9, unitPrice: 100 },
    ]);
    await order("AIR", [{ externalId: "st-a1", name: "PARLANTE X NEGRO", qty: 1, unitPrice: 55 }]);
    await order("AIR", [{ externalId: "st-a1", name: "x", qty: 10, unitPrice: 55 }], "FAILED");
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("el comercio ve sus compras de la marca: cuánto, dónde y qué", async () => {
    const stats = await service.forClient(shop, linkId, 12);
    expect(stats.totals).toEqual({ spendUsd: 161, units: 6, orders: 2, accounts: 1 });
    expect(stats.topProducts[0]).toMatchObject({ label: "Parlante X", units: 3, spendUsd: 155 });
    expect(stats.byProvider.map((p) => p.key)).toEqual(["ELIT", "AIR"]);
    expect(stats.monthly).toHaveLength(12);
  });

  it("sin permiso de pedidos no ve montos", async () => {
    const seller = { ...ctx("st-shop", "RETAILER", "SELLER"), permissions: [] as never };
    await expect(service.forClient(seller, linkId, 12)).rejects.toThrow(/pedidos/);
  });

  it("la marca ve el ranking de sus cuentas y su presencia", async () => {
    const stats = await service.forBrand(brand, 3);
    expect(stats.linkedAccounts).toEqual({ retailers: 1, distributors: 0 });
    expect(stats.byAccount[0]).toMatchObject({ label: "Local Stats", spendUsd: 161 });
    expect(stats.presence.products).toBe(1);
    expect(stats.presence.distributors.map((p) => p.provider).sort()).toEqual(["AIR", "ELIT"]);
  });
});
