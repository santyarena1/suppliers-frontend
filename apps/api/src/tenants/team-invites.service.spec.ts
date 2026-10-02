import { BadRequestException, ConflictException, ForbiddenException } from "@nestjs/common";
import {
  TeamInvitesService,
  generateTeamInviteCode,
  inviteRolesFor,
  inviteStatus,
  normalizeTeamInviteCode,
} from "./team-invites.service";

const owner = {
  tenantId: "t1",
  tenantName: "Local Uno",
  tenantType: "RETAILER",
  tenantRole: "OWNER",
  userId: "u-owner",
  permissions: ["team.manage"],
} as never;

const future = new Date(Date.now() + 86_400_000);
const past = new Date(Date.now() - 86_400_000);

function invite(over: Record<string, unknown> = {}) {
  return {
    id: "inv1",
    tenantId: "t1",
    code: "ABCD-EFGH",
    role: "SELLER",
    maxUses: 1,
    usedCount: 0,
    expiresAt: future,
    revoked: false,
    createdAt: new Date(),
    tenant: { id: "t1", name: "Local Uno", active: true, type: "RETAILER" },
    ...over,
  };
}

function setup(opts: { invite?: Record<string, unknown> | null; member?: boolean; taken?: number; user?: Record<string, unknown> } = {}) {
  const tx = {
    $executeRaw: jest.fn().mockResolvedValue(1),
    tenantMembership: {
      findFirst: jest.fn().mockResolvedValue(opts.member ? { id: "m-old" } : null),
      upsert: jest.fn().mockResolvedValue({ id: "m1" }),
    },
    teamInviteCode: { updateMany: jest.fn().mockResolvedValue({ count: opts.taken ?? 1 }) },
    teamInviteRedemption: { create: jest.fn().mockResolvedValue({}) },
  };
  const prisma = {
    $transaction: jest.fn().mockImplementation(async (fn: (t: typeof tx) => Promise<unknown>) => fn(tx)),
    teamInviteCode: {
      findUnique: jest.fn().mockResolvedValue(opts.invite === undefined ? invite() : opts.invite),
      findMany: jest.fn().mockResolvedValue([]),
      create: jest.fn().mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({ id: "new", usedCount: 0, revoked: false, createdAt: new Date(), ...data })),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    user: { findUnique: jest.fn().mockResolvedValue({ id: "u2", username: "ana", active: true, role: "ROLE_USER", ...opts.user }) },
    orgNotification: { create: jest.fn().mockResolvedValue({}) },
  };
  return { service: new TeamInvitesService(prisma as never), prisma, tx };
}

describe("códigos de invitación al equipo", () => {
  it("el código es legible y se normaliza como llega", () => {
    const code = generateTeamInviteCode();
    expect(code).toMatch(/^[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$/);
    expect(normalizeTeamInviteCode(" abcd efgh ")).toBe("ABCD-EFGH");
    expect(normalizeTeamInviteCode("abcdefgh")).toBe("ABCD-EFGH");
  });

  it("nunca se puede invitar como dueño", () => {
    expect(inviteRolesFor("RETAILER")).not.toContain("OWNER");
  });

  it("estado: revocado, vencido, agotado o activo", () => {
    expect(inviteStatus({ revoked: true, expiresAt: null, maxUses: null, usedCount: 0 })).toBe("REVOKED");
    expect(inviteStatus({ revoked: false, expiresAt: past, maxUses: null, usedCount: 0 })).toBe("EXPIRED");
    expect(inviteStatus({ revoked: false, expiresAt: null, maxUses: 2, usedCount: 2 })).toBe("EXHAUSTED");
    expect(inviteStatus({ revoked: false, expiresAt: null, maxUses: null, usedCount: 99 })).toBe("ACTIVE");
  });

  it("crear con rol OWNER se rechaza", async () => {
    const { service } = setup();
    await expect(service.create(owner, { role: "OWNER" })).rejects.toBeInstanceOf(BadRequestException);
  });

  it("los códigos nuevos no vencen", async () => {
    const { service: s2, prisma: p2 } = setup();
    await s2.create(owner, { role: "SELLER" });
    // Los códigos nuevos no vencen.
    expect(p2.teamInviteCode.create.mock.calls[0][0].data.expiresAt).toBeNull();
  });

  it("solo el dueño invita administradores", async () => {
    const { service } = setup();
    const admin = { ...(owner as object), tenantRole: "ADMIN" } as never;
    await expect(service.create(admin, { role: "ADMIN" })).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("sin permiso de gestionar el equipo no se crean códigos", async () => {
    const { service } = setup();
    const seller = { ...(owner as object), tenantRole: "SELLER", permissions: [] } as never;
    await expect(service.create(seller, { role: "SELLER" })).rejects.toBeTruthy();
  });

  it("canje OK: descuenta el uso con condición y crea la membresía con el rol del código", async () => {
    const { service, tx, prisma } = setup();
    const res = await service.redeem("u2", "abcd-efgh");
    expect(res).toMatchObject({ tenantId: "t1", role: "SELLER", roleLabel: "Vendedor" });
    expect(tx.$executeRaw).toHaveBeenCalled();
    expect(tx.teamInviteCode.updateMany.mock.calls[0][0].where).toMatchObject({ id: "inv1", revoked: false, usedCount: { lt: 1 } });
    expect(tx.tenantMembership.upsert.mock.calls[0][0].create).toEqual({ tenantId: "t1", userId: "u2", role: "SELLER" });
    expect(prisma.orgNotification.create).toHaveBeenCalled();
  });

  it("dos canjes a la vez de un código de 1 uso: el que pierde la carrera falla", async () => {
    const { service } = setup({ taken: 0 });
    await expect(service.redeem("u3", "ABCD-EFGH")).rejects.toBeInstanceOf(BadRequestException);
  });

  it.each([
    ["vencido", { expiresAt: past }],
    ["revocado", { revoked: true }],
    ["agotado", { maxUses: 1, usedCount: 1 }],
    ["de un comercio desactivado", { tenant: { id: "t1", name: "X", active: false, type: "RETAILER" } }],
  ])("código %s no se canjea", async (_label, over) => {
    const { service, tx } = setup({ invite: invite(over) });
    await expect(service.redeem("u2", "ABCD-EFGH")).rejects.toBeInstanceOf(BadRequestException);
    expect(tx.tenantMembership.upsert).not.toHaveBeenCalled();
  });

  it("si ya pertenece a una organización → 409", async () => {
    const { service } = setup({ member: true });
    await expect(service.redeem("u2", "ABCD-EFGH")).rejects.toBeInstanceOf(ConflictException);
  });

  it("el superadmin no se suma con un código", async () => {
    const { service } = setup({ user: { role: "ROLE_ADMIN" } });
    await expect(service.redeem("u2", "ABCD-EFGH")).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("preview válido: solo organización y rol", async () => {
    const { service } = setup();
    expect(await service.preview("abcd-efgh")).toEqual({ valid: true, organizationName: "Local Uno", roleLabel: "Vendedor" });
  });

  it.each([
    ["inexistente", null],
    ["vencido", invite({ expiresAt: past })],
    ["revocado", invite({ revoked: true })],
    ["agotado", invite({ usedCount: 1 })],
  ])("preview de un código %s no filtra nada", async (_label, row) => {
    const { service } = setup({ invite: row });
    expect(await service.preview("ABCD-EFGH")).toEqual({ valid: false });
  });

  it("preview con un código mal formado ni consulta la base", async () => {
    const { service, prisma } = setup();
    expect(await service.preview("x")).toEqual({ valid: false });
    expect(prisma.teamInviteCode.findUnique).not.toHaveBeenCalled();
  });
});
