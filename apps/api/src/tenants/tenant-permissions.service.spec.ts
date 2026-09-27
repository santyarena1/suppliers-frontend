import { BadRequestException, NotFoundException } from "@nestjs/common";
import { TenantPermissionsService } from "./tenant-permissions.service";

function makeService(opts: { roleRows?: unknown[]; members?: unknown[]; membership?: unknown } = {}) {
  const tx = {
    tenantRolePermission: { deleteMany: jest.fn(), upsert: jest.fn() },
    tenantMemberPermission: { deleteMany: jest.fn(), upsert: jest.fn() },
  };
  const prisma = {
    tenant: { findUnique: jest.fn().mockResolvedValue({ id: "t1", type: "RETAILER" }) },
    tenantRolePermission: { findMany: jest.fn().mockResolvedValue(opts.roleRows ?? []) },
    tenantMembership: {
      findMany: jest.fn().mockResolvedValue(opts.members ?? []),
      findUnique: jest.fn().mockResolvedValue(opts.membership ?? null),
    },
    $transaction: jest.fn().mockImplementation(async (fn: (t: typeof tx) => Promise<unknown>) => fn(tx)),
  };
  return { service: new TenantPermissionsService(prisma as never), prisma, tx };
}

describe("TenantPermissionsService.matrix", () => {
  it("devuelve permisos del tipo, valores por defecto, excepciones y efectivos por persona", async () => {
    const { service } = makeService({
      roleRows: [{ role: "BUYER", permission: "orders.approve", allowed: true }],
      members: [
        {
          id: "m1",
          role: "BUYER",
          title: null,
          user: { id: "u1", username: "ana", email: "ana@x" },
          permissionOverrides: [{ permission: "orders.create", allowed: false }],
        },
      ],
    });
    const matrix = await service.matrix("t1");
    expect(matrix.permissions.map((p) => p.key)).not.toContain("portfolio.manage");
    expect(matrix.roles).toEqual(["OWNER", "ADMIN", "BUYER", "SELLER", "VIEWER"]);
    expect(matrix.defaults.BUYER?.["orders.approve"]).toBe(false);
    expect(matrix.roleOverrides.BUYER?.["orders.approve"]).toBe(true);
    const ana = matrix.members[0];
    expect(ana.overrides).toEqual({ "orders.create": false });
    expect(ana.effective).toContain("orders.approve");
    expect(ana.effective).not.toContain("orders.create");
  });
});

describe("TenantPermissionsService.setRole", () => {
  it("guarda solo lo que difiere del valor por defecto", async () => {
    const { service, tx } = makeService();
    await service.setRole("t1", "BUYER", { "orders.approve": true, "orders.create": true });
    expect(tx.tenantRolePermission.upsert).toHaveBeenCalledTimes(1);
    expect(tx.tenantRolePermission.upsert.mock.calls[0][0].create).toMatchObject({
      tenantId: "t1",
      role: "BUYER",
      permission: "orders.approve",
      allowed: true,
    });
    // orders.create ya es true por defecto: se borra la excepción si existía.
    expect(tx.tenantRolePermission.deleteMany).toHaveBeenCalledWith({
      where: { tenantId: "t1", role: "BUYER", permission: "orders.create" },
    });
  });

  it("null vuelve al valor por defecto", async () => {
    const { service, tx } = makeService();
    await service.setRole("t1", "BUYER", { "orders.approve": null });
    expect(tx.tenantRolePermission.deleteMany).toHaveBeenCalled();
    expect(tx.tenantRolePermission.upsert).not.toHaveBeenCalled();
  });

  it("el dueño no se edita: siempre tiene todo", async () => {
    const { service } = makeService();
    await expect(service.setRole("t1", "OWNER", { "team.manage": false })).rejects.toBeInstanceOf(BadRequestException);
  });

  it("rechaza roles que no existen en ese tipo de organización", async () => {
    const { service } = makeService();
    await expect(service.setRole("t1", "MARKETING", { "chat.write": true })).rejects.toBeInstanceOf(BadRequestException);
  });

  it("rechaza permisos que no aplican al tipo o que no existen", async () => {
    const { service } = makeService();
    await expect(service.setRole("t1", "BUYER", { "brand.manage": true })).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.setRole("t1", "BUYER", { "algo.raro": true } as never)).rejects.toBeInstanceOf(BadRequestException);
  });
});

describe("TenantPermissionsService.setMember", () => {
  it("guarda la excepción de una persona de la organización", async () => {
    const { service, tx } = makeService({ membership: { id: "m1", tenantId: "t1", role: "BUYER" } });
    await service.setMember("t1", "m1", { "orders.approve": true });
    expect(tx.tenantMemberPermission.upsert.mock.calls[0][0].create).toEqual({
      membershipId: "m1",
      permission: "orders.approve",
      allowed: true,
    });
  });

  it("no toca a alguien de otra organización", async () => {
    const { service } = makeService({ membership: { id: "m1", tenantId: "otra", role: "BUYER" } });
    await expect(service.setMember("t1", "m1", { "orders.approve": true })).rejects.toBeInstanceOf(NotFoundException);
  });

  it("no le carga excepciones a un dueño", async () => {
    const { service } = makeService({ membership: { id: "m1", tenantId: "t1", role: "OWNER" } });
    await expect(service.setMember("t1", "m1", { "team.manage": false })).rejects.toBeInstanceOf(BadRequestException);
  });
});
