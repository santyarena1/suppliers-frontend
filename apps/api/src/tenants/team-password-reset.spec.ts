import { TenantsService } from "./tenants.service";

describe("TenantsService.resetOwnMemberPassword", () => {
  it("la contraseña que regenera el dueño es temporal: el miembro tiene que completar la cuenta", async () => {
    const prisma = {
      tenantMembership: {
        findUnique: jest.fn().mockResolvedValue({ id: "m1", tenantId: "t1", userId: "u2", role: "SELLER" }),
      },
      user: { update: jest.fn().mockResolvedValue({}) },
    };
    const service = new TenantsService(prisma as never);
    const owner = { tenantId: "t1", tenantRole: "OWNER", userId: "u1", permissions: ["team.manage"] } as never;
    const out = await service.resetOwnMemberPassword(owner, "m1");
    expect(out.generatedPassword).toEqual(expect.any(String));
    expect(prisma.user.update.mock.calls[0][0]).toMatchObject({
      where: { id: "u2" },
      data: { mustSetupAccount: true, sessionVersion: { increment: 1 } },
    });
  });
});
