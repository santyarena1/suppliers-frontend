// Integración contra un Postgres real con las migraciones aplicadas. Se salta si no hay
// INTEGRATION_DB (ej.: postgresql://postgres@127.0.0.1:55432/nodo_test2).
import { PrismaClient } from "@prisma/client";
import { ShippingEstimatesService } from "./shipping-estimates.service";

const url = process.env.INTEGRATION_DB;
const d = url ? describe : describe.skip;
const DAY = 86_400_000;
const TENANT = "ship-retailer";
const OTHER = "ship-otro";

d("ShippingEstimatesService contra Postgres", () => {
  const prisma = new PrismaClient({ datasources: { db: { url: url ?? "postgresql://skip@localhost/skip" } } });
  const service = new ShippingEstimatesService(prisma as never);

  beforeAll(async () => {
    for (const id of [TENANT, OTHER]) {
      await prisma.tenant.upsert({ where: { id }, create: { id, name: id, type: "RETAILER" }, update: {} });
      await prisma.providerOrder.deleteMany({ where: { tenantId: id } });
      await prisma.providerSyncConfig.deleteMany({ where: { tenantId: id } });
    }
    const user = await prisma.user.upsert({
      where: { username: "ship-user" },
      create: { username: "ship-user", email: "ship-user@example.test", passwordHash: "x" },
      update: {},
    });
    const now = Date.now();
    const order = (tenantId: string, over: Record<string, unknown>) =>
      prisma.providerOrder.create({
        data: {
          userId: user.id,
          tenantId,
          provider: "NEW_BYTES",
          status: "CREATED",
          paymentOption: "1",
          items: [],
          addressSnapshot: {},
          ...over,
        },
      });
    const moto = { deliveryOption: "7", deliveryLabel: "Moto (Capital Federal) (24 hs)" };
    await order(TENANT, { ...moto, addressSnapshot: { quote: { label: "Moto (Capital Federal)", total: 9000 } }, createdAt: new Date(now - 20 * DAY) });
    await order(TENANT, { ...moto, addressSnapshot: { quote: { label: "Moto (Capital Federal)", total: 10000 } }, createdAt: new Date(now - 2 * DAY) });
    await order(TENANT, { deliveryOption: "pickup", addressSnapshot: { pickup: true }, createdAt: new Date(now - DAY) });
    // Viejo: fuera de la ventana, no cuenta.
    await order(TENANT, { deliveryOption: "pickup", addressSnapshot: { pickup: true }, createdAt: new Date(now - 400 * DAY) });
    await order(TENANT, { ...moto, status: "FAILED", addressSnapshot: { quote: { label: "Moto (Capital Federal)", total: 1 } } });
    // Otro comercio: no se mezcla.
    await order(OTHER, { deliveryOption: "pickup", addressSnapshot: { pickup: true } });
    await prisma.providerSyncConfig.create({
      data: { tenantId: TENANT, provider: "AIR", shippingMethods: [{ label: "Comisionista", amount: 8000, currency: "ARS" }] },
    });
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("aprende la forma habitual y su último costo, solo del comercio pedido", async () => {
    const views = await service.forTenant(TENANT);
    const nb = views.find((v) => v.provider === "NEW_BYTES");
    expect(nb?.learned.orders).toBe(3);
    expect(nb?.estimate).toMatchObject({ label: "Moto (Capital Federal)", amount: 10000, currency: "ARS", source: "history", orders: 2 });
    const air = views.find((v) => v.provider === "AIR");
    expect(air?.estimate).toMatchObject({ label: "Comisionista", amount: 8000, source: "manual" });
  });

  it("la habitual marcada a mano manda", async () => {
    await prisma.providerSyncConfig.upsert({
      where: { tenantId_provider: { tenantId: TENANT, provider: "NEW_BYTES" } },
      create: { tenantId: TENANT, provider: "NEW_BYTES", shippingMethods: [{ label: "Retiro", amount: 0, currency: "ARS", habitual: true }] },
      update: {},
    });
    const nb = (await service.forTenant(TENANT)).find((v) => v.provider === "NEW_BYTES");
    expect(nb?.estimate).toMatchObject({ label: "Retiro", pickup: true, amount: 0 });
  });

  it("otro comercio solo ve lo suyo", async () => {
    const views = await service.forTenant(OTHER);
    expect(views).toHaveLength(1);
    expect(views[0].estimate).toMatchObject({ pickup: true });
  });
});
