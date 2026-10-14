import { TenantVisibilityService, type VisibleProvider } from "./tenant-visibility.service";

/** Cargar la cuenta de un distribuidor del directorio conecta, pero no levanta una suspensión. */
function setup(existing: { status: string } | null) {
  const prisma = {
    tenant: { findUnique: jest.fn().mockResolvedValue({ id: "sup-invid" }) },
    tenantLink: {
      findUnique: jest.fn().mockResolvedValue(existing),
      upsert: jest.fn().mockResolvedValue({}),
    },
  };
  const service = new TenantVisibilityService(prisma as never);
  jest.spyOn(service, "assertVisible").mockResolvedValue({ provider: "INVID", linked: false } as VisibleProvider);
  return { service, prisma };
}

describe("TenantVisibilityService.ensureLinked", () => {
  it("sin vínculo previo, conecta (directorio abierto)", async () => {
    const { service, prisma } = setup(null);
    const row = await service.ensureLinked("shop-1", "INVID");
    expect(row.linked).toBe(true);
    expect(prisma.tenantLink.upsert).toHaveBeenCalledWith(expect.objectContaining({ update: { status: "ACTIVE" } }));
  });

  it("un vínculo que el comercio había cortado se vuelve a activar", async () => {
    const { service, prisma } = setup({ status: "REVOKED" });
    await service.ensureLinked("shop-1", "INVID");
    expect(prisma.tenantLink.upsert).toHaveBeenCalled();
  });

  it("si el distribuidor lo suspendió, cargar la cuenta no lo reactiva", async () => {
    const { service, prisma } = setup({ status: "SUSPENDED" });
    await expect(service.ensureLinked("shop-1", "INVID")).rejects.toThrow(/suspendió/);
    expect(prisma.tenantLink.upsert).not.toHaveBeenCalled();
  });
});
