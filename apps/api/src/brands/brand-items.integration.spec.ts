// Integración contra un Postgres real con las migraciones aplicadas. Se salta si no hay
// INTEGRATION_DB (ej.: postgresql://postgres@127.0.0.1:55432/nodo_test).
import { PrismaClient } from "@prisma/client";
import { resolvePermissions } from "@nodo/shared";
import { BrandItemsService } from "./brand-items.service";

const url = process.env.INTEGRATION_DB;
const d = url ? describe : describe.skip;

d("BrandItemsService contra Postgres", () => {
  // El cliente no conecta hasta la primera consulta: sin INTEGRATION_DB la suite se salta.
  const prisma = new PrismaClient({ datasources: { db: { url: url ?? "postgresql://skip@localhost/skip" } } });
  const visibility = { listFor: jest.fn(async () => [{ provider: "ELIT", linked: true }]) };
  const service = new BrandItemsService(prisma as never, visibility as never);
  const brand = {
    userId: "u", tenantId: "brand-int", tenantName: "Logitech", tenantType: "BRAND" as const, tenantRole: "OWNER" as const,
    membershipId: "m", permissions: resolvePermissions({ type: "BRAND", role: "OWNER" }), commercialTenantId: "brand-int",
  };

  beforeAll(async () => {
    // Idempotente: arranca sin productos ni configuración de corridas anteriores.
    await prisma.brandItem.deleteMany({ where: { tenantId: "brand-int" } });
    await prisma.brandStockSettings.deleteMany({ where: { tenantId: "brand-int" } });
    await prisma.tenant.upsert({ where: { id: "brand-int" }, create: { id: "brand-int", name: "Logitech", type: "BRAND" }, update: {} });
    await prisma.tenant.upsert({ where: { id: "shop-int" }, create: { id: "shop-int", name: "Local", type: "RETAILER" }, update: {} });
    for (const [provider, externalId, ean, stock] of [["ELIT", "e1", "097855000001", 40], ["AIR", "a1", "97855000001", 3], ["INVID", "i1", null, 0]] as const) {
      await prisma.providerSyncCache.upsert({
        where: { provider_externalId: { provider, externalId } },
        create: { provider, externalId, name: `Mouse G203 ${provider}`, brand: "Logitech", ean: ean ?? undefined, raw: {} },
        update: {},
      });
      await prisma.tenantProductOffer.upsert({
        where: { tenantId_provider_externalId: { tenantId: "shop-int", provider, externalId } },
        create: { tenantId: "shop-int", provider, externalId, stock, price: 10, syncedAt: new Date() },
        update: { stock, syncedAt: new Date() },
      });
    }
    await prisma.brandLanding.upsert({
      where: { tenantId: "brand-int" },
      create: { tenantId: "brand-int", publicKey: "pk-int", published: true },
      update: { published: true },
    });
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("sugiere, crea y calcula el semáforo automático", async () => {
    const { items: suggested } = await service.suggestions(brand);
    const mouse = suggested.find((s) => s.skus.length === 2)!;
    expect(mouse.skus.map((s) => s.provider).sort()).toEqual(["AIR", "ELIT"]);
    const view = await service.createItems(brand, [
      mouse,
      ...suggested.filter((s) => s !== mouse),
    ].map((s) => ({ name: s.name, ean: s.ean, partNumber: s.partNumber, imageUrl: s.imageUrl, skus: s.skus })));
    const created = view.items.find((i) => i.distributors.length === 2)!;
    const byProvider = Object.fromEntries(created.distributors.map((x) => [x.provider, x.status]));
    expect(byProvider).toEqual({ ELIT: "HIGH", AIR: "LOW" });
    expect(created.distributors[0].stock).toBeUndefined();
  });

  it("la marca que elige ver exacto ve unidades; el público no", async () => {
    await service.updateSettings(brand, { brandSeesExact: true });
    const view = await service.brandView(brand);
    expect(view.items.flatMap((i) => i.distributors).some((x) => typeof x.stock === "number")).toBe(true);
    const pub = await service.publicView("pk-int");
    expect(pub.items.flatMap((i) => i.distributors).every((x) => !("stock" in x))).toBe(true);
    expect(pub.items.length).toBeGreaterThan(0);
  });

  it("manual y estados de producto", async () => {
    await service.updateSettings(brand, { mode: "MANUAL" });
    let view = await service.brandView(brand);
    const item = view.items.find((i) => i.distributors.length === 2)!;
    await service.updateLink(brand, item.distributors[0].linkId!, "MEDIUM");
    view = await service.updateItem(brand, item.id, { state: "INCOMING", referencePrice: 29.9 });
    const after = view.items.find((i) => i.id === item.id)!;
    expect(after.distributors.every((x) => x.status === "INCOMING")).toBe(true);
    expect(after.referencePrice).toBe(29.9);
    await expect(service.updateSettings(brand, { lowBelow: 10, highFrom: 5 })).rejects.toThrow(/rangos/);
  });
});
