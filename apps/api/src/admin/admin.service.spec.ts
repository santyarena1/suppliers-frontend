import { BadRequestException } from "@nestjs/common";
import { AdminService } from "./admin.service";

type UserRow = { id: string; role: string; active?: boolean };

function makeService(opts: {
  user?: UserRow | null;
  otherActiveAdmins?: number;
  brandMemberships?: number;
  clash?: unknown;
}) {
  const prisma = {
    user: {
      findUnique: jest.fn().mockResolvedValue(opts.user ?? null),
      findFirst: jest.fn().mockResolvedValue(opts.clash ?? null),
      count: jest.fn().mockResolvedValue(opts.otherActiveAdmins ?? 0),
      create: jest.fn().mockImplementation(({ data }) => Promise.resolve({ id: "nuevo", ...data })),
      update: jest.fn().mockImplementation(({ where, data }) => Promise.resolve({ id: where.id, ...data })),
    },
    tenantMembership: {
      count: jest.fn().mockResolvedValue(opts.brandMemberships ?? 0),
    },
    userModuleAccess: {
      findMany: jest.fn().mockResolvedValue([{ module: "cart", allowed: false }]),
    },
  };
  return { service: new AdminService(prisma as never), prisma };
}

describe("AdminService.createUser", () => {
  it("solo crea superadmins: el resto de los usuarios nace dentro de una organización", async () => {
    const { service, prisma } = makeService({});
    await service.createUser({ username: "soporte", email: "soporte@nodo.test", role: "ROLE_USER" } as never);
    expect(prisma.user.create.mock.calls[0][0].data.role).toBe("ROLE_ADMIN");
    expect(prisma.user.create.mock.calls[0][0].data.brandId).toBeUndefined();
  });
});

describe("AdminService.setSuperadmin", () => {
  it("prende superadmin", async () => {
    const { service, prisma } = makeService({ user: { id: "u1", role: "ROLE_USER" } });
    const out = await service.setSuperadmin("u1", true);
    expect(prisma.user.update).toHaveBeenCalledWith({ where: { id: "u1" }, data: { role: "ROLE_ADMIN" } });
    expect(out).toEqual({ id: "u1", role: "ROLE_ADMIN" });
  });

  it("al apagarlo vuelve al nivel que da su organización (marca)", async () => {
    const { service, prisma } = makeService({
      user: { id: "u1", role: "ROLE_ADMIN" },
      otherActiveAdmins: 1,
      brandMemberships: 1,
    });
    await service.setSuperadmin("u1", false);
    expect(prisma.user.update).toHaveBeenCalledWith({ where: { id: "u1" }, data: { role: "ROLE_BRAND" } });
  });

  it("al apagarlo sin organización de marca queda como usuario común", async () => {
    const { service, prisma } = makeService({ user: { id: "u1", role: "ROLE_ADMIN" }, otherActiveAdmins: 1 });
    await service.setSuperadmin("u1", false);
    expect(prisma.user.update).toHaveBeenCalledWith({ where: { id: "u1" }, data: { role: "ROLE_USER" } });
  });

  it("no deja sin superadmin activo a la plataforma", async () => {
    const { service } = makeService({ user: { id: "u1", role: "ROLE_ADMIN" }, otherActiveAdmins: 0 });
    await expect(service.setSuperadmin("u1", false)).rejects.toBeInstanceOf(BadRequestException);
  });
});

describe("AdminService.getEffectivePermissions", () => {
  it("el menú sale del rol, sin excepciones sueltas por usuario", async () => {
    const { service, prisma } = makeService({});
    const modules = await service.getEffectivePermissions("u1", "ROLE_USER");
    expect(modules).toContain("cart");
    expect(prisma.userModuleAccess.findMany).not.toHaveBeenCalled();
  });
});
