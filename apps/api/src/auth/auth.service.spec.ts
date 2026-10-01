import { BadRequestException, ConflictException, ForbiddenException, UnauthorizedException } from "@nestjs/common";
import { AuthService } from "./auth.service";
import { hashEmailCode } from "./email-codes";

const pepper = "pepper-test";

function makeService(opts?: {
  user?: Record<string, unknown> | null;
  users?: Record<string, unknown>[];
  challenge?: Record<string, unknown> | null;
  signAsync?: jest.Mock;
  forUser?: jest.Mock;
  mail?: { sendVerificationCode?: jest.Mock };
  google?: { verify?: jest.Mock };
}) {
  const users = opts?.users;
  const prisma = {
    user: {
      findUnique: jest.fn().mockImplementation(({ where }: { where: { id?: string; username?: string; googleId?: string } }) => {
        const pool = users ?? (opts?.user ? [opts.user] : []);
        const hit = pool.find(
          (u) =>
            (where.id != null && u.id === where.id) ||
            (where.username != null && u.username === where.username) ||
            (where.googleId != null && u.googleId === where.googleId)
        );
        return Promise.resolve(hit ?? null);
      }),
      findFirst: jest.fn().mockResolvedValue(opts?.user ?? null),
      create: jest.fn().mockImplementation(({ data }) => Promise.resolve({ id: "u-new", role: "ROLE_USER", brandId: null, active: true, endDate: null, ...data })),
      update: jest.fn().mockImplementation(({ where, data }) => Promise.resolve({ ...(opts?.user ?? {}), id: where.id, ...data })),
    },
    emailChallenge: {
      findUnique: jest.fn().mockResolvedValue(opts?.challenge ?? null),
      upsert: jest.fn().mockResolvedValue({ id: "c1" }),
      update: jest.fn().mockResolvedValue({}),
      delete: jest.fn().mockResolvedValue({}),
    },
    $transaction: jest.fn().mockImplementation(async (ops: unknown) => {
      if (Array.isArray(ops)) return Promise.all(ops);
      return ops;
    }),
    auditLogEntry: { create: jest.fn().mockResolvedValue({}) },
  };
  const jwt = { signAsync: opts?.signAsync ?? jest.fn().mockResolvedValue("nuevo.jwt") };
  const tenantContext = { forUser: opts?.forUser ?? jest.fn().mockResolvedValue(null) };
  const mail = { sendVerificationCode: opts?.mail?.sendVerificationCode ?? jest.fn().mockResolvedValue(undefined) };
  const google = { verify: opts?.google?.verify ?? jest.fn() };
  const config = { get: jest.fn((key: string) => (key === "EMAIL_CODE_PEPPER" ? pepper : undefined)) };
  return {
    service: new AuthService(
      prisma as never,
      jwt as never,
      tenantContext as never,
      mail as never,
      google as never,
      config as never
    ),
    prisma,
    jwt,
    tenantContext,
    mail,
    google,
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
  passwordHash: "hash",
  emailVerifiedAt: new Date("2026-01-01"),
  googleId: null,
};

describe("AuthService.refresh", () => {
  it("emite un JWT nuevo si la cuenta sigue activa", async () => {
    const { service, jwt, tenantContext } = makeService({ user: dbUser });
    const out = await service.refresh(session);
    expect(out.token).toBe("nuevo.jwt");
    expect(tenantContext.forUser).toHaveBeenCalledWith("u1");
    expect(jwt.signAsync).toHaveBeenCalledTimes(1);
    expect(jwt.signAsync.mock.calls[0][1]).toBeUndefined();
  });

  it("mantiene la suplantación y el TTL corto", async () => {
    const { service, jwt } = makeService({ user: dbUser });
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
    const { service } = makeService({ user: { ...dbUser, active: false } });
    await expect(service.refresh(session)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it("rechaza si el usuario ya no existe", async () => {
    const { service } = makeService({ user: null });
    await expect(service.refresh(session)).rejects.toBeInstanceOf(UnauthorizedException);
  });
});

describe("AuthService.register", () => {
  it("crea la cuenta sin JWT y manda el código", async () => {
    const { service, prisma, mail, jwt } = makeService({ user: null });
    const out = await service.register({ username: "ana", email: "Ana@Nodo.test", password: "password123" });
    expect(out).toMatchObject({ username: "ana", email: "ana@nodo.test", needsVerification: true });
    expect(prisma.user.create).toHaveBeenCalled();
    expect(mail.sendVerificationCode).toHaveBeenCalledWith("ana@nodo.test", "ana", expect.stringMatching(/^\d{6}$/));
    expect(jwt.signAsync).not.toHaveBeenCalled();
  });

  it("si ya existe sin verificar, reenvía el código", async () => {
    const argon2 = await import("argon2");
    const passwordHash = await argon2.hash("password123");
    const { service, prisma } = makeService({
      user: { ...dbUser, passwordHash, emailVerifiedAt: null },
    });
    const out = await service.register({ username: "ana", email: "ana@nodo.test", password: "password123" });
    expect(out.needsVerification).toBe(true);
    expect(prisma.user.create).not.toHaveBeenCalled();
  });

  it("rechaza un email ya verificado", async () => {
    const { service } = makeService({ user: dbUser });
    await expect(service.register({ username: "otra", email: "ana@nodo.test", password: "password123" })).rejects.toBeInstanceOf(
      ConflictException
    );
  });
});

describe("AuthService.login", () => {
  it("exige el mail confirmado", async () => {
    const argon2 = await import("argon2");
    const passwordHash = await argon2.hash("password123");
    const { service } = makeService({ user: { ...dbUser, passwordHash, emailVerifiedAt: null } });
    await expect(service.login({ username: "ana", password: "password123" })).rejects.toBeInstanceOf(ForbiddenException);
    try {
      await service.login({ username: "ana", password: "password123" });
      throw new Error("expected deny");
    } catch (err) {
      expect(err).toBeInstanceOf(ForbiddenException);
      expect((err as ForbiddenException).getResponse()).toMatchObject({
        code: "EMAIL_NOT_VERIFIED",
        details: { email: "ana@nodo.test" },
      });
    }
  });

  it("una cuenta solo Google no entra con contraseña", async () => {
    const { service } = makeService({ user: { ...dbUser, passwordHash: null, googleId: "g1" } });
    await expect(service.login({ username: "ana", password: "x" })).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it("el quinto fallo seguido bloquea la cuenta 15 minutos", async () => {
    const argon2 = await import("argon2");
    const passwordHash = await argon2.hash("password123");
    const { service, prisma } = makeService({ user: { ...dbUser, passwordHash, failedLoginCount: 4, loginLockedUntil: null } });
    await expect(service.login({ username: "ana", password: "mala" })).rejects.toBeInstanceOf(UnauthorizedException);
    const data = prisma.user.update.mock.calls[0][0].data;
    expect(data.failedLoginCount).toBe(5);
    expect(data.loginLockedUntil.getTime() - Date.now()).toBeGreaterThan(14 * 60_000);
  });

  it("bloqueada, no entra ni con la contraseña correcta", async () => {
    const argon2 = await import("argon2");
    const passwordHash = await argon2.hash("password123");
    const { service } = makeService({
      user: { ...dbUser, passwordHash, failedLoginCount: 5, loginLockedUntil: new Date(Date.now() + 10 * 60_000) },
    });
    await expect(service.login({ username: "ana", password: "password123" })).rejects.toThrow(/Demasiados intentos/);
  });
});

describe("AuthService.verifyEmail", () => {
  it("acepta el código y emite JWT", async () => {
    const code = "123456";
    const { service, jwt, prisma } = makeService({
      user: { ...dbUser, emailVerifiedAt: null },
      challenge: {
        id: "c1",
        codeHash: hashEmailCode(code, pepper),
        attempts: 0,
        expiresAt: new Date(Date.now() + 60_000),
      },
    });
    const out = await service.verifyEmail("ana@nodo.test", code);
    expect(out.token).toBe("nuevo.jwt");
    expect(jwt.signAsync).toHaveBeenCalledTimes(1);
    expect(prisma.emailChallenge.delete).toHaveBeenCalledWith({ where: { id: "c1" } });
  });

  it("rechaza un código vencido", async () => {
    const { service } = makeService({
      user: { ...dbUser, emailVerifiedAt: null },
      challenge: {
        id: "c1",
        codeHash: hashEmailCode("123456", pepper),
        attempts: 0,
        expiresAt: new Date(Date.now() - 1000),
      },
    });
    await expect(service.verifyEmail("ana@nodo.test", "123456")).rejects.toBeInstanceOf(BadRequestException);
  });
});

describe("AuthService.loginWithGoogle", () => {
  it("crea la cuenta verificada si no existía", async () => {
    const { service, prisma, jwt } = makeService({
      user: null,
      google: {
        verify: jest.fn().mockResolvedValue({
          googleId: "g-1",
          email: "ana@gmail.com",
          emailVerified: true,
        }),
      },
    });
    const out = await service.loginWithGoogle("id-token-de-google-que-es-largo");
    expect(out.token).toBe("nuevo.jwt");
    expect(prisma.user.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        email: "ana@gmail.com",
        googleId: "g-1",
        emailVerifiedAt: expect.any(Date),
      }),
    });
    expect(jwt.signAsync).toHaveBeenCalled();
  });

  it("vincula Google a una cuenta ya existente por email", async () => {
    const existing = { ...dbUser, googleId: null, emailVerifiedAt: null };
    const { service, prisma } = makeService({
      user: existing,
      google: {
        verify: jest.fn().mockResolvedValue({
          googleId: "g-1",
          email: "ana@nodo.test",
          emailVerified: true,
        }),
      },
    });
    await service.loginWithGoogle("id-token-de-google-que-es-largo");
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: "u1" },
      data: { googleId: "g-1", emailVerifiedAt: expect.any(Date) },
    });
  });

  it("rechaza si Google no confirmó el mail", async () => {
    const { service } = makeService({
      google: {
        verify: jest.fn().mockResolvedValue({
          googleId: "g-1",
          email: "ana@gmail.com",
          emailVerified: false,
        }),
      },
    });
    await expect(service.loginWithGoogle("id-token-de-google-que-es-largo")).rejects.toBeInstanceOf(UnauthorizedException);
  });
});
