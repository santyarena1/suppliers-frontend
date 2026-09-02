import { UnauthorizedException } from "@nestjs/common";
import { AuthService } from "./auth.service";

function makeService(user: Record<string, unknown> | null, opts?: { signAsync?: jest.Mock; forUser?: jest.Mock }) {
  const prisma = { user: { findUnique: jest.fn().mockResolvedValue(user) } };
  const jwt = { signAsync: opts?.signAsync ?? jest.fn().mockResolvedValue("nuevo.jwt") };
  const tenantContext = { forUser: opts?.forUser ?? jest.fn().mockResolvedValue(null) };
  return {
    service: new AuthService(prisma as never, jwt as never, tenantContext as never),
    jwt,
    tenantContext,
  };
}

const session = {
  sub: "ana",
  userId: "u1",
  role: "ROLE_USER" as const,
  email: "ana@nodo.test",
};

const dbUser = {
  id: "u1",
  username: "ana",
  email: "ana@nodo.test",
  role: "ROLE_USER",
  brandId: null,
  active: true,
  endDate: null,
};

describe("AuthService.refresh", () => {
  it("emite un JWT nuevo si la cuenta sigue activa", async () => {
    const { service, jwt, tenantContext } = makeService(dbUser);
    const out = await service.refresh(session);
    expect(out.token).toBe("nuevo.jwt");
    expect(tenantContext.forUser).toHaveBeenCalledWith("u1");
    expect(jwt.signAsync).toHaveBeenCalledTimes(1);
    expect(jwt.signAsync.mock.calls[0][1]).toBeUndefined();
  });

  it("mantiene la suplantación y el TTL corto", async () => {
    const { service, jwt } = makeService(dbUser);
    await service.refresh({
      ...session,
      impersonatedBy: "admin-1",
      impersonatedByUsername: "admin",
    });
    expect(jwt.signAsync.mock.calls[0][0]).toMatchObject({
      impersonatedBy: "admin-1",
      impersonatedByUsername: "admin",
    });
    expect(jwt.signAsync.mock.calls[0][1]).toEqual({ expiresIn: "1h" });
  });

  it("rechaza si la cuenta está desactivada", async () => {
    const { service } = makeService({ ...dbUser, active: false });
    await expect(service.refresh(session)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it("rechaza si el usuario ya no existe", async () => {
    const { service } = makeService(null);
    await expect(service.refresh(session)).rejects.toBeInstanceOf(UnauthorizedException);
  });
});
