// Integración contra un Postgres real con las migraciones aplicadas. Se salta si no hay
// INTEGRATION_DB (ej.: postgresql://postgres@127.0.0.1:55432/nodo_test).
import { PrismaClient } from "@prisma/client";
import { resolvePermissions } from "@nodo/shared";
import { BrandPublicLinkService } from "./brand-public-link.service";

const url = process.env.INTEGRATION_DB;
const d = url ? describe : describe.skip;

function ctx(tenantId: string, type: "RETAILER" | "DISTRIBUTOR" | "BRAND") {
  return {
    userId: "u",
    tenantId,
    tenantName: tenantId,
    tenantType: type,
    tenantRole: "OWNER" as const,
    membershipId: "m",
    permissions: resolvePermissions({ type, role: "OWNER" }),
    commercialTenantId: tenantId,
  };
}

d("BrandPublicLinkService contra Postgres", () => {
  // El cliente no conecta hasta la primera consulta: sin INTEGRATION_DB la suite se salta.
  const prisma = new PrismaClient({ datasources: { db: { url: url ?? "postgresql://skip@localhost/skip" } } });
  const service = new BrandPublicLinkService(prisma as never);
  const shop = ctx("pl-shop", "RETAILER");
  const distro = ctx("pl-distro", "DISTRIBUTOR");
  const brand = ctx("pl-brand", "BRAND");

  beforeAll(async () => {
    for (const [id, type] of [["pl-shop", "RETAILER"], ["pl-distro", "DISTRIBUTOR"], ["pl-brand", "BRAND"]] as const) {
      await prisma.tenant.upsert({ where: { id }, create: { id, name: id, type }, update: {} });
    }
    await prisma.tenantLink.deleteMany({ where: { supplierTenantId: "pl-brand" } });
    await prisma.brandLanding.upsert({
      where: { tenantId: "pl-brand" },
      create: { tenantId: "pl-brand", publicKey: "pk-link", published: true },
      update: { published: true, allowPublicLink: true },
    });
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("un comercio se vincula desde el link y la segunda vez ya está", async () => {
    expect((await service.stateFor(shop, "pk-link")).state).toBe("CAN_LINK");
    const first = await service.link(shop, "pk-link");
    expect(first.created).toBe(true);
    const again = await service.link(shop, "pk-link");
    expect(again).toMatchObject({ linkId: first.linkId, created: false });
    expect(await service.stateFor(shop, "pk-link")).toMatchObject({ state: "LINKED", linkId: first.linkId });
  });

  it("un distribuidor también; la marca no", async () => {
    expect((await service.link(distro, "pk-link")).created).toBe(true);
    expect((await service.stateFor(brand, "pk-link")).state).toBe("CLOSED");
    await expect(service.link(brand, "pk-link")).rejects.toThrow(/propia marca/);
  });

  it("un vínculo revocado no se reabre desde el link", async () => {
    await prisma.tenantLink.updateMany({
      where: { clientTenantId: "pl-shop", supplierTenantId: "pl-brand" },
      data: { status: "REVOKED" },
    });
    expect((await service.stateFor(shop, "pk-link")).state).toBe("CLOSED");
    await expect(service.link(shop, "pk-link")).rejects.toThrow(/cerró el vínculo/);
  });

  it("si la marca lo deshabilita o despublica, no se vincula nadie nuevo", async () => {
    await prisma.tenantLink.deleteMany({ where: { supplierTenantId: "pl-brand" } });
    await prisma.brandLanding.update({ where: { tenantId: "pl-brand" }, data: { allowPublicLink: false } });
    await expect(service.link(shop, "pk-link")).rejects.toThrow(/no habilitó/);
    await prisma.brandLanding.update({ where: { tenantId: "pl-brand" }, data: { published: false } });
    await expect(service.stateFor(shop, "pk-link")).rejects.toThrow(/publicada/);
  });
});
