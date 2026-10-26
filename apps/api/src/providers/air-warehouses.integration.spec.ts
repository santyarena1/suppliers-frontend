// Integración contra un Postgres real con las migraciones aplicadas. Se salta si no hay
// INTEGRATION_DB (ej.: postgresql://postgres@127.0.0.1:55432/nodo_test2).
import { PrismaClient } from "@prisma/client";
import { ProvidersService } from "./providers.service";

const url = process.env.INTEGRATION_DB;
const d = url ? describe : describe.skip;
const TENANT = "air-dep-int-tenant";
const CODE_A = "air-dep-int-53359";
const CODE_B = "air-dep-int-214305";

d("Depósitos de Air contra Postgres", () => {
  const prisma = new PrismaClient({ datasources: { db: { url: url ?? "postgresql://skip@localhost/skip" } } });
  const registry = { get: () => ({}) };
  const visibility = { assertLinked: async () => undefined };
  const service = new ProvidersService(prisma as never, {} as never, registry as never, visibility as never, {} as never, {} as never);

  async function cleanup() {
    await prisma.tenantProductOffer.deleteMany({ where: { tenantId: TENANT } });
    await prisma.providerSyncConfig.deleteMany({ where: { tenantId: TENANT } });
    await prisma.providerSyncCache.deleteMany({ where: { provider: "AIR", externalId: { in: [CODE_A, CODE_B] } } });
    await prisma.tenant.deleteMany({ where: { id: TENANT } });
  }

  beforeAll(async () => {
    await cleanup();
    await prisma.tenant.create({ data: { id: TENANT, name: "Depósitos Air Integración", type: "RETAILER", plan: "PRO" } });
    // Desglose real del portal (2026-10-26): físico menos reservado por depósito.
    await prisma.providerSyncCache.createMany({
      data: [
        { provider: "AIR", externalId: CODE_A, name: "Monitor A", raw: { ROS: "-3", MZA: "18", CBA: "0", LUG: "150" } },
        { provider: "AIR", externalId: CODE_B, name: "Monitor B", raw: { ROS: "0", MZA: "0", CBA: "0", LUG: "3" } },
      ],
    });
    await prisma.tenantProductOffer.createMany({
      data: [
        { tenantId: TENANT, provider: "AIR", externalId: CODE_A, stock: 165 },
        { tenantId: TENANT, provider: "AIR", externalId: CODE_B, stock: 3 },
      ],
    });
  });

  afterAll(async () => {
    await cleanup();
    await prisma.$disconnect();
  });

  async function stocks() {
    const rows = await prisma.tenantProductOffer.findMany({ where: { tenantId: TENANT }, orderBy: { externalId: "asc" } });
    return Object.fromEntries(rows.map((r) => [r.externalId, r.stock]));
  }

  it("elegir Córdoba deja el stock de Córdoba ya mismo", async () => {
    const saved = await service.updateConfig(TENANT, "AIR", { stockWarehouses: ["CBA"] });
    expect(saved.stockWarehouses).toEqual(["CBA"]);
    expect(await stocks()).toEqual({ [CODE_A]: 0, [CODE_B]: 0 });
  });

  it("Lugano y Mendoza suman los dos", async () => {
    await service.updateConfig(TENANT, "AIR", { stockWarehouses: ["LUG", "MZA"] });
    expect(await stocks()).toEqual({ [CODE_A]: 168, [CODE_B]: 3 });
  });

  it("sin elegir vuelve a todos, sin que el negativo de Rosario reste", async () => {
    await service.updateConfig(TENANT, "AIR", { stockWarehouses: [] });
    expect(await stocks()).toEqual({ [CODE_A]: 168, [CODE_B]: 3 });
  });

  it("cambiar otra cosa de la configuración no toca el stock", async () => {
    await prisma.tenantProductOffer.updateMany({ where: { tenantId: TENANT, externalId: CODE_B }, data: { stock: 7 } });
    await service.updateConfig(TENANT, "AIR", { minStockThreshold: 0 });
    expect((await stocks())[CODE_B]).toBe(7);
  });
});
