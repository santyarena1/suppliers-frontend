import { ForbiddenException } from "@nestjs/common";
import { TenantContextService } from "./tenant-context.service";
import { assertPermission } from "./tenant-roles";

function makeService(membership: Record<string, unknown> | null, roleOverrides: unknown[] = []) {
  const prisma = {
    tenantMembership: { findFirst: jest.fn().mockResolvedValue(membership) },
    tenantRolePermission: { findMany: jest.fn().mockResolvedValue(roleOverrides) },
  };
  return { service: new TenantContextService(prisma as never), prisma };
}

const buyer = {
  id: "m1",
  role: "BUYER",
  tenant: { id: "t1", name: "Local Uno", type: "RETAILER", mirrorsCommercialFromId: null },
  permissionOverrides: [] as unknown[],
};

describe("TenantContextService.forUser · permisos", () => {
  it("un comprador sin excepciones tiene los permisos por defecto de su rol", async () => {
    const { service } = makeService(buyer);
    const ctx = await service.forUser("u1");
    expect(ctx?.membershipId).toBe("m1");
    expect(ctx?.permissions).toContain("orders.create");
    expect(ctx?.permissions).not.toContain("orders.approve");
  });

  it("aplica la excepción del rol y la de la persona", async () => {
    const { service, prisma } = makeService(
      { ...buyer, permissionOverrides: [{ permission: "orders.create", allowed: false }] },
      [{ permission: "orders.approve", allowed: true }]
    );
    const ctx = await service.forUser("u1");
    expect(prisma.tenantRolePermission.findMany).toHaveBeenCalledWith({
      where: { tenantId: "t1", role: "BUYER" },
      select: { permission: true, allowed: true },
    });
    expect(ctx?.permissions).toContain("orders.approve");
    expect(ctx?.permissions).not.toContain("orders.create");
  });

  it("ignora claves que ya no existen en el catálogo", async () => {
    const { service } = makeService(buyer, [{ permission: "algo.viejo", allowed: true }]);
    const ctx = await service.forUser("u1");
    expect(ctx?.permissions).not.toContain("algo.viejo");
  });
});

describe("TenantContextService.fromSession", () => {
  it("sin membresía en la base no hay organización, aunque el token diga otra cosa", async () => {
    const prisma = { tenantMembership: { findFirst: jest.fn().mockResolvedValue(null) } };
    const session = { userId: "u1", tenantId: "t1", tenantName: "Local Uno", tenantType: "RETAILER", tenantRole: "ADMIN" } as never;
    const ctx = await new TenantContextService(prisma as never).fromSession(session);
    expect(ctx).toBeNull();
  });
});

describe("assertPermission", () => {
  const ctx = { tenantName: "Local Uno", permissions: ["orders.create"] } as never;

  it("deja pasar si tiene el permiso", () => {
    expect(() => assertPermission(ctx, "orders.create")).not.toThrow();
  });

  it("corta con un mensaje que dice qué falta", () => {
    expect(() => assertPermission(ctx, "orders.approve")).toThrow(ForbiddenException);
    expect(() => assertPermission(ctx, "orders.approve")).toThrow(/Aprobar pedidos de otros/);
  });
});
