// Integración contra un Postgres real con las migraciones aplicadas. Se salta si no hay
// INTEGRATION_DB (ej.: postgresql://postgres@127.0.0.1:55432/nodo_test2).
//
// Administración → Visibilidad de un distribuidor: Visible (todos), Algunas orgs (solo
// las elegidas) u Oculto (ningún comercio; el superadmin sí).
import { PrismaClient } from "@prisma/client";
import { NewsVisibilityService } from "../news/news-visibility.service";
import { TenantsService } from "./tenants.service";
import { TenantVisibilityService } from "./tenant-visibility.service";

const url = process.env.INTEGRATION_DB;
const d = url ? describe : describe.skip;

const P = "pvis-int";
const SHOP_A = `${P}-shop-a`;
const SHOP_B = `${P}-shop-b`;
const PRUEBAS = `${P}-pruebas`;
const ADMIN_ORG = `${P}-admin-org`;
const DIST_HIDDEN = `${P}-dist-oculto`;
const DIST_SOME = `${P}-dist-algunas`;
const KEY_HIDDEN = "PVIS_INT_OCULTO";
const KEY_SOME = "PVIS_INT_ALGUNAS";
const ADMIN = `${P}-admin`;
const SHOP_A_USER = `${P}-user-a`;
const PRUEBAS_USER = `${P}-user-pruebas`;

d("Visibilidad de la plataforma contra Postgres", () => {
  const prisma = new PrismaClient({ datasources: { db: { url: url ?? "postgresql://skip@localhost/skip" } } });
  const visibility = new TenantVisibilityService(prisma as never);
  const tenants = new TenantsService(prisma as never, visibility);
  const news = new NewsVisibilityService(prisma as never, visibility);
  const shopA = { tenantId: SHOP_A, commercialTenantId: SHOP_A, userId: SHOP_A_USER, tenantType: "RETAILER", tenantRole: "OWNER" } as never;

  async function cleanup() {
    await prisma.providerDisplayConfig.deleteMany({ where: { provider: { in: [KEY_HIDDEN, KEY_SOME] } } });
    await prisma.providerSyncConfig.deleteMany({ where: { tenantId: { in: [SHOP_A, SHOP_B, PRUEBAS] } } });
    await prisma.tenantLink.deleteMany({ where: { clientTenantId: { in: [SHOP_A, SHOP_B, PRUEBAS, ADMIN_ORG] } } });
    await prisma.providerSyncCache.deleteMany({ where: { provider: { in: [KEY_HIDDEN, KEY_SOME] } } });
    await prisma.tenantMembership.deleteMany({ where: { userId: { in: [ADMIN, SHOP_A_USER, PRUEBAS_USER] } } });
    await prisma.user.deleteMany({ where: { id: { in: [ADMIN, SHOP_A_USER, PRUEBAS_USER] } } });
    await prisma.tenant.deleteMany({ where: { id: { in: [ADMIN_ORG] } } });
    await prisma.tenant.deleteMany({ where: { id: { in: [SHOP_A, SHOP_B, PRUEBAS, DIST_HIDDEN, DIST_SOME] } } });
  }

  beforeAll(async () => {
    await cleanup();
    await prisma.tenant.createMany({
      data: [
        { id: SHOP_A, name: "Local A visibilidad", type: "RETAILER", plan: "PRO" },
        { id: SHOP_B, name: "Local B visibilidad", type: "RETAILER", plan: "PRO" },
        { id: PRUEBAS, name: "Comercio de Pruebas visibilidad", type: "RETAILER", plan: "PRO" },
        { id: DIST_HIDDEN, name: "Distribuidor Oculto Vis", type: "DISTRIBUTOR", providerKey: KEY_HIDDEN },
        { id: DIST_SOME, name: "Distribuidor Algunas Vis", type: "DISTRIBUTOR", providerKey: KEY_SOME },
      ],
    });
    // Administración espeja a Comercio de Pruebas, como en producción.
    await prisma.tenant.create({ data: { id: ADMIN_ORG, name: "Administración visibilidad", type: "RETAILER", plan: "PRO", mirrorsCommercialFromId: PRUEBAS } });
    await prisma.user.createMany({
      data: [
        { id: ADMIN, username: `${P}-superadmin`, email: `${P}-admin@nodo.test`, role: "ROLE_ADMIN" },
        { id: SHOP_A_USER, username: `${P}-dueno-a`, email: `${P}-a@nodo.test` },
        { id: PRUEBAS_USER, username: `${P}-pruebas`, email: `${P}-p@nodo.test` },
      ],
    });
    await prisma.tenantMembership.createMany({
      data: [
        { tenantId: ADMIN_ORG, userId: ADMIN, role: "OWNER" },
        { tenantId: SHOP_A, userId: SHOP_A_USER, role: "OWNER" },
        { tenantId: PRUEBAS, userId: PRUEBAS_USER, role: "ADMIN" },
      ],
    });
    for (const client of [SHOP_A, SHOP_B, PRUEBAS]) {
      await prisma.tenantLink.createMany({
        data: [
          { clientTenantId: client, supplierTenantId: DIST_HIDDEN, status: "ACTIVE" },
          { clientTenantId: client, supplierTenantId: DIST_SOME, status: "ACTIVE" },
        ],
      });
    }
    await prisma.providerDisplayConfig.createMany({
      data: [
        { provider: KEY_HIDDEN, visible: false, allowedTenantIds: [] },
        { provider: KEY_SOME, visible: false, allowedTenantIds: [SHOP_A] },
      ],
    });
  });

  afterAll(async () => {
    await cleanup();
    await prisma.$disconnect();
  });

  const keys = async (tenantId: string, viewer?: string) =>
    (await visibility.listFor(tenantId, viewer)).map((v) => v.provider).filter((p) => p === KEY_HIDDEN || p === KEY_SOME).sort();

  it("Oculto: ningún comercio lo ve", async () => {
    expect(await keys(SHOP_A, SHOP_A_USER)).not.toContain(KEY_HIDDEN);
    expect(await keys(SHOP_B)).not.toContain(KEY_HIDDEN);
  });

  it("Algunas orgs: lo ve la elegida y no las demás", async () => {
    expect(await keys(SHOP_A, SHOP_A_USER)).toEqual([KEY_SOME]);
    expect(await keys(SHOP_B)).toEqual([]);
  });

  it("la gente real de Comercio de Pruebas no ve lo oculto por estar espejada desde Administración", async () => {
    expect(await keys(PRUEBAS, PRUEBAS_USER)).toEqual([]);
    expect(await keys(PRUEBAS)).toEqual([]);
  });

  it("el superadmin, mirando desde Administración, ve todo", async () => {
    expect(await keys(PRUEBAS, ADMIN)).toEqual([KEY_SOME, KEY_HIDDEN].sort());
    expect((await visibility.platformHiddenFor(PRUEBAS, ADMIN)).size).toBe(0);
  });

  it("el directorio no ofrece lo oculto ni deja conectarse por lista", async () => {
    const rows = await tenants.searchSuppliers(shopA, "Vis");
    const names = rows.map((r) => r.providerKey);
    expect(names).toContain(KEY_SOME);
    expect(names).not.toContain(KEY_HIDDEN);
    await expect(tenants.connectByList(shopA, DIST_HIDDEN)).rejects.toThrow(/no encontrado/i);
  });

  it("las noticias de un distribuidor oculto no le llegan", async () => {
    const authors = await news.authorIdsFor(shopA);
    expect(authors).toContain(DIST_SOME);
    expect(authors).not.toContain(DIST_HIDDEN);
  });

  it("pasarlo a Visible lo muestra a todos", async () => {
    await prisma.providerDisplayConfig.update({ where: { provider: KEY_HIDDEN }, data: { visible: true } });
    expect(await keys(SHOP_B)).toEqual([KEY_HIDDEN]);
    await prisma.providerDisplayConfig.update({ where: { provider: KEY_HIDDEN }, data: { visible: false } });
  });
});
