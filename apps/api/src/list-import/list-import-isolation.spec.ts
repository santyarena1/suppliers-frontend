import { ForbiddenException } from "@nestjs/common";
import { resolvePermissions } from "@nodo/shared";
import { ListImportService, isInScope, ownerOf } from "./list-import.service";
import type { TenantContext } from "../tenants/tenant-context.service";

const SUPPLIER = { id: "sup-ashir", name: "Ashir", active: true };

function retailer(tenantId: string): TenantContext {
  const base = {
    userId: `u-${tenantId}`,
    tenantId,
    tenantName: tenantId,
    tenantType: "RETAILER" as const,
    tenantRole: "OWNER" as const,
    membershipId: "m",
    commercialTenantId: tenantId,
  };
  return { permissions: resolvePermissions({ type: base.tenantType, role: base.tenantRole }), ...base } as TenantContext;
}

function setup() {
  const prisma = {
    tenant: {
      findUnique: jest.fn().mockResolvedValue(SUPPLIER),
      update: jest.fn().mockResolvedValue({}),
    },
    importProfile: { findFirst: jest.fn().mockResolvedValue(null) },
    supplierListImport: {
      findFirst: jest.fn().mockResolvedValue(null),
      findUnique: jest.fn(),
      findMany: jest.fn().mockResolvedValue([]),
    },
    providerSyncConfig: {
      upsert: jest.fn().mockResolvedValue({}),
      findUnique: jest.fn().mockResolvedValue({ listUpdateDays: 7 }),
    },
    tenantProductOffer: { updateMany: jest.fn().mockResolvedValue({ count: 3 }) },
  };
  const providers = { applyListOffers: jest.fn().mockResolvedValue({}) };
  const registry = { get: jest.fn().mockReturnValue(undefined) };
  const visibility = { isLinked: jest.fn().mockResolvedValue(true) };
  const service = new ListImportService(prisma as never, providers as never, registry as never, visibility as never, {} as never, {} as never);
  return { service, prisma, providers };
}

const actorA = { userId: "u-A", isSuperadmin: false, tenant: retailer("A") };
const actorB = { userId: "u-B", isSuperadmin: false, tenant: retailer("B") };

describe("listas: cada organización con su perfil y sus planillas", () => {
  test("el perfil y la última planilla se buscan solo en la organización", async () => {
    const { service, prisma } = setup();
    await service.getProfile(actorB, "ASHIR");
    for (const call of prisma.importProfile.findFirst.mock.calls) {
      expect(call[0].where).toMatchObject({ provider: "ASHIR", tenantId: "B" });
    }
    expect(prisma.supplierListImport.findFirst.mock.calls[0][0].where).toMatchObject({
      provider: "ASHIR",
      level: "TENANT",
      tenantId: "B",
    });
  });

  test("sugerir perfil no lee la planilla de otro comercio", async () => {
    const { service, prisma } = setup();
    await expect(service.suggestProfile(actorB, "ASHIR")).rejects.toThrow(/Subí una planilla/);
    expect(prisma.supplierListImport.findFirst.mock.calls[0][0].where).toMatchObject({ level: "TENANT", tenantId: "B" });
  });

  test("guardar perfil sin planilla propia no toca el de otro", async () => {
    const { service, prisma } = setup();
    await expect(service.saveProfile(actorB, "ASHIR", { columnMap: {} } as never)).rejects.toThrow(/Subí una planilla/);
    expect(prisma.supplierListImport.findFirst.mock.calls[0][0].where).toMatchObject({ level: "TENANT", tenantId: "B" });
  });

  test("el historial solo trae las cargas del comercio", async () => {
    const { service, prisma } = setup();
    await service.list(actorB, "ASHIR");
    expect(prisma.supplierListImport.findMany.mock.calls[0][0].where).toEqual({ provider: "ASHIR", level: "TENANT", tenantId: "B" });
  });

  test("una carga de otro comercio no se puede ver, aplicar ni revertir", async () => {
    const { service, prisma } = setup();
    prisma.supplierListImport.findUnique.mockResolvedValue({ id: "i1", provider: "ASHIR", level: "TENANT", tenantId: "A", status: "APPLIED" });
    await expect(service.get("i1", actorB)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(service.revert("i1", actorB)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(service.discard("i1", actorB)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(service.applyImport("i1", actorB)).rejects.toBeInstanceOf(ForbiddenException);
  });

  test("dueño del perfil: el proveedor en su base, el comercio en su lista propia", () => {
    expect(ownerOf({ level: "BASE", tenantId: "admin-org", supplierTenantId: "sup" })).toBe("sup");
    expect(ownerOf({ level: "TENANT", tenantId: "A", supplierTenantId: "sup" })).toBe("A");
  });

  test("el distribuidor ve sus cargas de la base, nunca la lista propia de un comercio", () => {
    expect(isInScope({ level: "BASE", tenantId: "x" }, { level: "BASE", tenantId: "sup" })).toBe(true);
    expect(isInScope({ level: "TENANT", tenantId: "A" }, { level: "BASE", tenantId: "sup" })).toBe(false);
    expect(isInScope({ level: "TENANT", tenantId: "A" }, { level: "TENANT", tenantId: "A" })).toBe(true);
    expect(isInScope({ level: "TENANT", tenantId: "A" }, { level: "TENANT", tenantId: "B" })).toBe(false);
  });
});

describe("re-subir la lista propia", () => {
  test("lo que ya no viene deja de mostrarse y no se crea nada para otros comercios", async () => {
    const { service, prisma, providers } = setup();
    const record = { id: "i1", provider: "ASHIR", level: "TENANT", tenantId: "A" };
    const removed = await (service as unknown as { applyTenant: (r: unknown, items: unknown[]) => Promise<number> }).applyTenant(record, [
      { externalId: "x1", name: "Uno", price: 10 },
    ]);
    expect(providers.applyListOffers).toHaveBeenCalledWith(expect.objectContaining({ tenantId: "A", source: "OWN_LIST" }));
    expect(prisma.tenantProductOffer.updateMany).toHaveBeenCalledWith({
      where: { tenantId: "A", provider: "ASHIR", source: "OWN_LIST", active: true, syncedAt: { lt: expect.any(Date) } },
      data: { active: false },
    });
    expect(removed).toBe(3);
  });
});

describe("vigencia de la lista", () => {
  test("el comercio fija la suya sin tocar la del proveedor", async () => {
    const { service, prisma } = setup();
    const fresh = await service.setCadence(actorA, "ASHIR", 7);
    expect(prisma.tenant.update).not.toHaveBeenCalled();
    expect(prisma.providerSyncConfig.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { tenantId_provider: { tenantId: "A", provider: "ASHIR" } },
        update: { listUpdateDays: 7 },
      })
    );
    expect(fresh.listUpdateDays).toBe(7);
  });

  test("el proveedor fija la de su lista base", async () => {
    const { service, prisma } = setup();
    const supplierActor = {
      userId: "u",
      isSuperadmin: false,
      tenant: { ...retailer("sup-ashir"), tenantType: "DISTRIBUTOR" as const, tenantRole: "ADMIN" as const },
    };
    await service.setCadence(supplierActor, "LIST_ASHIR", 15);
    expect(prisma.tenant.update).toHaveBeenCalledWith({ where: { id: "sup-ashir" }, data: { listUpdateDays: 15 } });
  });
});
