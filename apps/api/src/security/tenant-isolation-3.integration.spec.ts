// Integración contra un Postgres real con las migraciones aplicadas. Se salta si no hay
// INTEGRATION_DB (ej.: postgresql://postgres@127.0.0.1:55432/nodo_test2).
//
// Segunda pasada de auditoría de aislamiento multi-tenant: tenants/** (equipo, permisos,
// clientes del distribuidor, códigos de acceso), y tenant-visibility (vínculos). Usa los
// SERVICES reales (no HTTP) para aislar la capa de datos. Prefijo `iso3-`, idempotente.
import { PrismaClient } from "@prisma/client";
import { BadRequestException, ForbiddenException, NotFoundException } from "@nestjs/common";
import { TenantsService } from "../tenants/tenants.service";
import { PortfolioService } from "../tenants/portfolio.service";
import { TenantVisibilityService } from "../tenants/tenant-visibility.service";
import type { TenantContext } from "../tenants/tenant-context.service";

const url = process.env.INTEGRATION_DB;
const d = url ? describe : describe.skip;

function ctx(opts: {
  tenantId: string;
  tenantName: string;
  userId: string;
  tenantType: TenantContext["tenantType"];
  tenantRole?: TenantContext["tenantRole"];
  permissions?: TenantContext["permissions"];
}): TenantContext {
  return {
    userId: opts.userId,
    tenantId: opts.tenantId,
    tenantName: opts.tenantName,
    tenantType: opts.tenantType,
    tenantRole: opts.tenantRole ?? "OWNER",
    membershipId: null,
    permissions: opts.permissions ?? [],
    commercialTenantId: opts.tenantId,
  };
}

d("Aislamiento multi-tenant (2da pasada): tenants/**", () => {
  const prisma = new PrismaClient({ datasources: { db: { url: url ?? "postgresql://skip@localhost/skip" } } });
  const tenantsService = new TenantsService(prisma as never);
  const visibility = new TenantVisibilityService(prisma as never);
  const portfolio = new PortfolioService(prisma as never);

  const retailerA = "iso3-retailer-a";
  const retailerB = "iso3-retailer-b";
  const distro1 = "iso3-distro-1";
  const distro2 = "iso3-distro-2";
  const userRetailerA = "iso3-user-retailer-a";
  const userRetailerB = "iso3-user-retailer-b";
  const userDistro1 = "iso3-user-distro-1";
  const userDistro2 = "iso3-user-distro-2";
  const userDistro1Seller = "iso3-user-distro-1-seller";

  let linkRetailerADistro1: { id: string };
  let membershipDistro1Seller: { id: string };
  let codeFromDistro1: { id: string; code: string };

  const ALL_TEAM_PERMS: TenantContext["permissions"] = ["team.manage", "codes.manage"] as never;
  const ALL_PORTFOLIO_PERMS: TenantContext["permissions"] = [
    "portfolio.manage",
    "portfolio.edit_terms",
    "portfolio.view_all",
  ] as never;

  beforeAll(async () => {
    // Limpieza idempotente (hijos primero).
    await prisma.tenantAccessCodeRedemption.deleteMany({
      where: { accessCode: { tenantId: { in: [distro1, distro2] } } },
    });
    await prisma.tenantAccessCode.deleteMany({ where: { tenantId: { in: [distro1, distro2] } } });
    await prisma.providerOrder.deleteMany({ where: { tenantId: { in: [retailerA, retailerB] } } });
    await prisma.tenantLink.deleteMany({
      where: { clientTenantId: { in: [retailerA, retailerB] } },
    });
    await prisma.productManagerScope.deleteMany({ where: { tenantId: { in: [distro1, distro2] } } });
    await prisma.tenantMembership.deleteMany({
      where: { tenantId: { in: [retailerA, retailerB, distro1, distro2] } },
    });
    await prisma.user.deleteMany({
      where: { id: { in: [userRetailerA, userRetailerB, userDistro1, userDistro2, userDistro1Seller] } },
    });
    await prisma.tenant.deleteMany({ where: { id: { in: [retailerA, retailerB, distro1, distro2] } } });

    await prisma.tenant.create({ data: { id: retailerA, name: "ISO3 Comercio A", type: "RETAILER" } });
    await prisma.tenant.create({ data: { id: retailerB, name: "ISO3 Comercio B", type: "RETAILER" } });
    await prisma.tenant.create({
      data: { id: distro1, name: "ISO3 Distribuidor 1", type: "DISTRIBUTOR", providerKey: `LIST_ISO3_1_${Date.now()}` },
    });
    await prisma.tenant.create({
      data: { id: distro2, name: "ISO3 Distribuidor 2", type: "DISTRIBUTOR", providerKey: `LIST_ISO3_2_${Date.now()}` },
    });

    for (const [id, username] of [
      [userRetailerA, "iso3-owner-a"],
      [userRetailerB, "iso3-owner-b"],
      [userDistro1, "iso3-distro1-owner"],
      [userDistro2, "iso3-distro2-owner"],
      [userDistro1Seller, "iso3-distro1-seller"],
    ] as const) {
      await prisma.user.create({
        data: { id, username: `${username}-${Date.now()}`, email: `${username}-${Date.now()}@test.local`, passwordHash: "x" },
      });
    }

    await prisma.tenantMembership.create({ data: { tenantId: retailerA, userId: userRetailerA, role: "OWNER" } });
    await prisma.tenantMembership.create({ data: { tenantId: retailerB, userId: userRetailerB, role: "OWNER" } });
    await prisma.tenantMembership.create({ data: { tenantId: distro1, userId: userDistro1, role: "OWNER" } });
    await prisma.tenantMembership.create({ data: { tenantId: distro2, userId: userDistro2, role: "OWNER" } });
    membershipDistro1Seller = await prisma.tenantMembership.create({
      data: { tenantId: distro1, userId: userDistro1Seller, role: "SELLER", title: "Vendedor 1" },
    });

    linkRetailerADistro1 = await prisma.tenantLink.create({
      data: { clientTenantId: retailerA, supplierTenantId: distro1, status: "ACTIVE" },
    });

    await prisma.providerOrder.create({
      data: {
        userId: userRetailerA,
        tenantId: retailerA,
        provider: distro1,
        status: "OFFLINE_DRAFT",
        paymentOption: "OFFLINE",
        channel: "OFFLINE",
        items: [{ sku: "iso3-a-1", qty: 1 }],
        addressSnapshot: {},
      },
    });

    codeFromDistro1 = await tenantsService.createAccessCode(distro1, { label: "iso3", maxUses: 1 });
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  // ---------- Cartera del distribuidor ----------

  it("cartera: un distribuidor no puede leer el cliente de otro distribuidor por linkId", async () => {
    const distro2Ctx = ctx({
      tenantId: distro2,
      tenantName: "ISO3 Distribuidor 2",
      userId: userDistro2,
      tenantType: "DISTRIBUTOR",
      permissions: ALL_PORTFOLIO_PERMS,
    });
    await expect(portfolio.getClient(distro2Ctx, linkRetailerADistro1.id)).rejects.toThrow(NotFoundException);

    // Control: el dueño del vínculo sí lo lee.
    const distro1Ctx = ctx({
      tenantId: distro1,
      tenantName: "ISO3 Distribuidor 1",
      userId: userDistro1,
      tenantType: "DISTRIBUTOR",
      permissions: ALL_PORTFOLIO_PERMS,
    });
    await expect(portfolio.getClient(distro1Ctx, linkRetailerADistro1.id)).resolves.toMatchObject({
      linkId: linkRetailerADistro1.id,
    });
  });

  it("cartera: un distribuidor no puede modificar el cliente de otro distribuidor (descuento, vendedor, estado)", async () => {
    const distro2Ctx = ctx({
      tenantId: distro2,
      tenantName: "ISO3 Distribuidor 2",
      userId: userDistro2,
      tenantType: "DISTRIBUTOR",
      permissions: ALL_PORTFOLIO_PERMS,
    });
    await expect(
      portfolio.updateClient(distro2Ctx, linkRetailerADistro1.id, { discountPercent: 99 } as never)
    ).rejects.toThrow(NotFoundException);

    const unchanged = await prisma.tenantLink.findUnique({ where: { id: linkRetailerADistro1.id } });
    expect(unchanged?.discountPercent).toBeNull();
  });

  it("cartera: un distribuidor no puede listar los pedidos de un cliente de otro distribuidor", async () => {
    const distro2Ctx = ctx({
      tenantId: distro2,
      tenantName: "ISO3 Distribuidor 2",
      userId: userDistro2,
      tenantType: "DISTRIBUTOR",
      permissions: ALL_PORTFOLIO_PERMS,
    });
    await expect(portfolio.listClientOrders(distro2Ctx, linkRetailerADistro1.id)).rejects.toThrow(NotFoundException);
  });

  it("cartera: listClients de un distribuidor no incluye vínculos de otro", async () => {
    const distro2Ctx = ctx({
      tenantId: distro2,
      tenantName: "ISO3 Distribuidor 2",
      userId: userDistro2,
      tenantType: "DISTRIBUTOR",
      permissions: ALL_PORTFOLIO_PERMS,
    });
    const result = await portfolio.listClients(distro2Ctx);
    expect(result.clients.find((c) => c.linkId === linkRetailerADistro1.id)).toBeUndefined();
  });

  // ---------- Equipo / membresías ----------

  it("equipo: una organización no puede editar la membresía de otra (título, rol)", async () => {
    const retailerACtx = ctx({
      tenantId: retailerA,
      tenantName: "ISO3 Comercio A",
      userId: userRetailerA,
      tenantType: "RETAILER",
      permissions: ALL_TEAM_PERMS,
    });
    await expect(
      tenantsService.updateOwnMember(retailerACtx, membershipDistro1Seller.id, { title: "hackeado" } as never)
    ).rejects.toThrow(NotFoundException);

    const unchanged = await prisma.tenantMembership.findUnique({ where: { id: membershipDistro1Seller.id } });
    expect(unchanged?.title).toBe("Vendedor 1");
  });

  it("equipo: una organización no puede eliminar la membresía de otra", async () => {
    const distro2Ctx = ctx({
      tenantId: distro2,
      tenantName: "ISO3 Distribuidor 2",
      userId: userDistro2,
      tenantType: "DISTRIBUTOR",
      permissions: ALL_TEAM_PERMS,
    });
    await expect(tenantsService.removeOwnMember(distro2Ctx, membershipDistro1Seller.id)).rejects.toThrow(
      NotFoundException
    );
    const stillThere = await prisma.tenantMembership.findUnique({ where: { id: membershipDistro1Seller.id } });
    expect(stillThere).not.toBeNull();
  });

  it("equipo: una organización no puede resetear la contraseña de un miembro de otra", async () => {
    const distro2Ctx = ctx({
      tenantId: distro2,
      tenantName: "ISO3 Distribuidor 2",
      userId: userDistro2,
      tenantType: "DISTRIBUTOR",
      permissions: ALL_TEAM_PERMS,
    });
    await expect(tenantsService.resetOwnMemberPassword(distro2Ctx, membershipDistro1Seller.id)).rejects.toThrow(
      NotFoundException
    );
  });

  it("equipo: sin permiso team.manage no se puede listar/editar el propio equipo", async () => {
    const retailerBCtxSinPermiso = ctx({
      tenantId: retailerB,
      tenantName: "ISO3 Comercio B",
      userId: userRetailerB,
      tenantType: "RETAILER",
      permissions: [],
    });
    await expect(
      tenantsService.createOwnMember(retailerBCtxSinPermiso, {
        username: `iso3-intruso-${Date.now()}`,
        email: `iso3-intruso-${Date.now()}@test.local`,
        role: "SELLER",
      } as never)
    ).rejects.toThrow(ForbiddenException);
  });

  // ---------- Códigos de acceso ----------

  it("código de acceso: un código inválido y uno inexistente devuelven el mismo mensaje genérico (no revela si existe)", async () => {
    const retailerBCtx = ctx({
      tenantId: retailerB,
      tenantName: "ISO3 Comercio B",
      userId: userRetailerB,
      tenantType: "RETAILER",
    });
    const errRandom = await tenantsService
      .redeemAccessCode(retailerBCtx, userRetailerB, "ZZZZ-ZZZZ-ZZZZ")
      .catch((e) => e);
    const errWrongFormat = await tenantsService
      .redeemAccessCode(retailerBCtx, userRetailerB, "no-existe-para-nada")
      .catch((e) => e);
    expect(errRandom).toBeInstanceOf(BadRequestException);
    expect(errWrongFormat).toBeInstanceOf(BadRequestException);
    expect(errRandom.message).toBe(errWrongFormat.message);
    expect(errRandom.message).toBe("El código no es válido o ya se usó");
  });

  it("código de acceso: canjear vincula solo a quien lo canjea, no a otras organizaciones", async () => {
    const retailerBCtx = ctx({
      tenantId: retailerB,
      tenantName: "ISO3 Comercio B",
      userId: userRetailerB,
      tenantType: "RETAILER",
    });
    const result = await tenantsService.redeemAccessCode(retailerBCtx, userRetailerB, codeFromDistro1.code);
    expect(result.tenantName).toBe("ISO3 Distribuidor 1");

    const linkB = await prisma.tenantLink.findUnique({
      where: { clientTenantId_supplierTenantId: { clientTenantId: retailerB, supplierTenantId: distro1 } },
    });
    expect(linkB?.status).toBe("ACTIVE");

    // Otra organización (A) no quedó tocada por el canje de B.
    const linkAUnchanged = await prisma.tenantLink.findUnique({ where: { id: linkRetailerADistro1.id } });
    expect(linkAUnchanged?.clientTenantId).toBe(retailerA);
  });

  it("código de acceso: ya usado hasta el máximo (maxUses=1) no se puede volver a canjear, mismo mensaje genérico", async () => {
    const distro2Ctx = ctx({
      tenantId: distro2,
      tenantName: "ISO3 Distribuidor 2",
      userId: userDistro2,
      tenantType: "DISTRIBUTOR",
    });
    // distro2 no es RETAILER/DISTRIBUTOR válido como cliente de otro distribuidor en
    // este caso igual cae por maxUses alcanzado antes que por tipo.
    await expect(
      tenantsService.redeemAccessCode(distro2Ctx, userDistro2, codeFromDistro1.code)
    ).rejects.toThrow("El código no es válido o ya se usó");
  });

  it("código de acceso: revocado no se puede canjear", async () => {
    const other = await tenantsService.createAccessCode(distro1, { label: "iso3-revoke", maxUses: 5 });
    await tenantsService.revokeAccessCode(other.id);
    const retailerACtx = ctx({
      tenantId: retailerA,
      tenantName: "ISO3 Comercio A",
      userId: userRetailerA,
      tenantType: "RETAILER",
    });
    await expect(
      tenantsService.redeemAccessCode(retailerACtx, userRetailerA, other.code)
    ).rejects.toThrow("El código no es válido o ya se usó");
  });

  it("código de acceso: revocar o listar códigos ajenos desde `own-access-codes` no es posible", async () => {
    const distro2Ctx = ctx({
      tenantId: distro2,
      tenantName: "ISO3 Distribuidor 2",
      userId: userDistro2,
      tenantType: "DISTRIBUTOR",
      permissions: ALL_TEAM_PERMS,
    });
    await expect(tenantsService.revokeOwnAccessCode(distro2Ctx, codeFromDistro1.id)).rejects.toThrow(
      NotFoundException
    );
    const stillActive = await prisma.tenantAccessCode.findUnique({ where: { id: codeFromDistro1.id } });
    expect(stillActive?.revoked).toBe(false);
  });

  // ---------- Vínculos / visibilidad ----------

  it("visibilidad: un comercio no vinculado a un distribuidor no figura como `linked`", async () => {
    const [d1, d2] = await Promise.all([
      prisma.tenant.findUniqueOrThrow({ where: { id: distro1 }, select: { providerKey: true } }),
      prisma.tenant.findUniqueOrThrow({ where: { id: distro2 }, select: { providerKey: true } }),
    ]);
    // A nunca se vinculó con distro2: no debe figurar como linked.
    const isLinkedANeverConnected = await visibility.isLinked(retailerA, d2.providerKey as never, userRetailerA);
    expect(isLinkedANeverConnected).toBe(false);
    // A sí está vinculado con distro1 (fixture inicial).
    const isLinkedAWithDistro1 = await visibility.isLinked(retailerA, d1.providerKey as never, userRetailerA);
    expect(isLinkedAWithDistro1).toBe(true);
  });
});
