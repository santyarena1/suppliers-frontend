import { BadRequestException, ConflictException } from "@nestjs/common";
import { accountSetupAllows } from "./account-setup-gate";
import { AccountSetupService } from "./account-setup.service";
import { ACCOUNT_SETUP_VERIFIED, hashEmailCode } from "./email-codes";

const PEPPER = "pepper-test";

function setup(opts: {
  mustSetupAccount?: boolean;
  otherWithEmail?: boolean;
  googleOwner?: string | null;
  challenge?: Record<string, unknown> | null;
} = {}) {
  const user = { id: "u1", username: "ana", email: "vieja@x.com", active: true, mustSetupAccount: opts.mustSetupAccount ?? true };
  const prisma = {
    user: {
      findUnique: jest.fn().mockImplementation(async (args: { where: { id?: string; googleId?: string } }) => {
        if (args.where.googleId) return opts.googleOwner ? { id: opts.googleOwner } : null;
        return user;
      }),
      findFirst: jest.fn().mockResolvedValue(opts.otherWithEmail ? { id: "otro" } : null),
      update: jest.fn().mockImplementation(async (a: unknown) => a),
    },
    emailChallenge: {
      findUnique: jest.fn().mockResolvedValue(opts.challenge ?? null),
      upsert: jest.fn().mockResolvedValue({}),
      update: jest.fn().mockImplementation(async (a: unknown) => a),
      delete: jest.fn().mockImplementation(async (a: unknown) => a),
      deleteMany: jest.fn().mockImplementation(async (a: unknown) => a),
    },
    $transaction: jest.fn().mockImplementation(async (ops: unknown[]) => Promise.all(ops)),
  };
  const auth = { issueTokenForUserId: jest.fn().mockResolvedValue({ token: "nuevo" }) };
  const mail = { sendVerificationCode: jest.fn().mockResolvedValue(undefined) };
  const google = {
    verify: jest.fn().mockResolvedValue({ googleId: "g-1", email: "Ana@Gmail.com", emailVerified: true }),
  };
  const config = { get: jest.fn((k: string) => (k === "EMAIL_CODE_PEPPER" ? PEPPER : undefined)) };
  const service = new AccountSetupService(prisma as never, auth as never, mail as never, google as never, config as never);
  return { service, prisma, auth, mail, google };
}

describe("account-setup-gate", () => {
  it("con la cuenta por completar solo deja pasar los pasos de completarla y el refresh", () => {
    expect(accountSetupAllows("/auth/account-setup")).toBe(true);
    expect(accountSetupAllows("/auth/account-setup/email/verify")).toBe(true);
    expect(accountSetupAllows("/auth/refresh")).toBe(true);
    expect(accountSetupAllows("/my/providers")).toBe(false);
    expect(accountSetupAllows("/orders?x=1")).toBe(false);
    expect(accountSetupAllows("/auth/account-setupx")).toBe(false);
  });
});

describe("AccountSetupService", () => {
  it("manda el código al mail nuevo", async () => {
    const { service, mail, prisma } = setup();
    await expect(service.sendEmailCode("u1", "nueva@x.com")).resolves.toEqual({ sent: true });
    expect(mail.sendVerificationCode).toHaveBeenCalledWith("nueva@x.com", "ana", expect.stringMatching(/^\d{6}$/));
    expect(prisma.emailChallenge.upsert).toHaveBeenCalled();
  });

  it("un mail que ya usa otra cuenta → 409", async () => {
    const { service } = setup({ otherWithEmail: true });
    await expect(service.sendEmailCode("u1", "usado@x.com")).rejects.toBeInstanceOf(ConflictException);
  });

  it("si la cuenta ya está completa no deja usar los pasos", async () => {
    const { service } = setup({ mustSetupAccount: false });
    await expect(service.sendEmailCode("u1", "nueva@x.com")).rejects.toBeInstanceOf(BadRequestException);
  });

  it("el código confirma solo el mail al que se mandó", async () => {
    const challenge = {
      id: "c1",
      codeHash: hashEmailCode("nueva@x.com:123456", PEPPER),
      attempts: 0,
      expiresAt: new Date(Date.now() + 60_000),
    };
    const { service, prisma } = setup({ challenge });
    await expect(service.verifyEmail("u1", "otra@x.com", "123456")).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.verifyEmail("u1", "nueva@x.com", "123456")).resolves.toEqual({ verified: true, email: "nueva@x.com" });
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: "u1" },
      data: { email: "nueva@x.com", emailVerifiedAt: expect.any(Date) },
    });
  });

  it("contraseña sin mail confirmado → 400", async () => {
    const { service } = setup({ challenge: null });
    await expect(service.setPassword("u1", "clave-nueva-1")).rejects.toBeInstanceOf(BadRequestException);
  });

  it("contraseña con mail confirmado: limpia el flag, sube sessionVersion y entra", async () => {
    const challenge = { id: "c1", codeHash: ACCOUNT_SETUP_VERIFIED, expiresAt: new Date(Date.now() + 60_000) };
    const { service, prisma } = setup({ challenge });
    await expect(service.setPassword("u1", "clave-nueva-1")).resolves.toEqual({ token: "nuevo" });
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: "u1" },
      data: expect.objectContaining({ mustSetupAccount: false, sessionVersion: { increment: 1 }, passwordHash: expect.any(String) }),
    });
  });

  it("Google con un mail de otra cuenta → 409", async () => {
    const { service } = setup({ otherWithEmail: true });
    await expect(service.connectGoogle("u1", "x".repeat(30))).rejects.toBeInstanceOf(ConflictException);
  });

  it("Google ya conectado a otro usuario → 409", async () => {
    const { service } = setup({ googleOwner: "otro" });
    await expect(service.connectGoogle("u1", "x".repeat(30))).rejects.toBeInstanceOf(ConflictException);
  });

  it("Google OK: mail de Google, sin contraseña temporal, flag limpio", async () => {
    const { service, prisma } = setup();
    await expect(service.connectGoogle("u1", "x".repeat(30))).resolves.toEqual({ token: "nuevo" });
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: "u1" },
      data: expect.objectContaining({
        googleId: "g-1",
        email: "ana@gmail.com",
        passwordHash: null,
        mustSetupAccount: false,
        sessionVersion: { increment: 1 },
      }),
    });
  });
});
