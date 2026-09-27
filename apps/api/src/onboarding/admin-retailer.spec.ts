import { ConflictException } from "@nestjs/common";
import { OnboardingService } from "./onboarding.service";

function makeService(opts: { nameTaken?: boolean; userClash?: { username: string } | null } = {}) {
  const tx = {
    tenant: { create: jest.fn().mockResolvedValue({ id: "t-new", name: "Local Nuevo", type: "RETAILER", plan: "PRO" }) },
    user: { create: jest.fn().mockResolvedValue({ id: "u-new", username: "duenio", email: "d@x.com" }) },
    tenantMembership: { create: jest.fn().mockResolvedValue({ id: "m-new" }) },
  };
  const prisma = {
    tenant: { findFirst: jest.fn().mockResolvedValue(opts.nameTaken ? { id: "t-old" } : null) },
    user: { findFirst: jest.fn().mockResolvedValue(opts.userClash ?? null) },
    $transaction: jest.fn().mockImplementation(async (fn: (t: typeof tx) => Promise<unknown>) => fn(tx)),
  };
  const service = new OnboardingService(prisma as never, {} as never, {} as never);
  const seed = jest.spyOn(service, "seedDemoSandbox").mockResolvedValue(undefined as never);
  return { service, prisma, tx, seed };
}

const dto = { name: " Local  Nuevo ", ownerUsername: "duenio", ownerEmail: "d@x.com" };

describe("OnboardingService.createRetailerForAdmin", () => {
  it("crea el comercio PRO, su dueño y la demo, igual que el autoregistro", async () => {
    const { service, tx, seed } = makeService();
    const out = await service.createRetailerForAdmin(dto);
    expect(tx.tenant.create.mock.calls[0][0].data).toMatchObject({ name: "Local Nuevo", type: "RETAILER", plan: "PRO" });
    expect(tx.user.create.mock.calls[0][0].data).toMatchObject({ username: "duenio", email: "d@x.com", role: "ROLE_USER" });
    expect(tx.tenantMembership.create.mock.calls[0][0].data).toMatchObject({
      tenantId: "t-new",
      userId: "u-new",
      role: "OWNER",
    });
    expect(seed).toHaveBeenCalledWith("t-new", "u-new");
    expect(out.owner.username).toBe("duenio");
    // Sin contraseña cargada, la plataforma genera una y la muestra una única vez.
    expect(out.generatedPassword).toEqual(expect.any(String));
  });

  it("si se carga la contraseña no se devuelve", async () => {
    const { service } = makeService();
    const out = await service.createRetailerForAdmin({ ...dto, ownerPassword: "unaClave123" });
    expect(out.generatedPassword).toBeUndefined();
  });

  it("no repite nombres de organización", async () => {
    const { service } = makeService({ nameTaken: true });
    await expect(service.createRetailerForAdmin(dto)).rejects.toBeInstanceOf(ConflictException);
  });

  it("avisa si el usuario o el email ya existen", async () => {
    const { service } = makeService({ userClash: { username: "duenio" } });
    await expect(service.createRetailerForAdmin(dto)).rejects.toThrow(/usuario ya está en uso/);
  });
});
