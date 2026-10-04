import { BadRequestException, ConflictException, ForbiddenException, HttpException, NotFoundException } from "@nestjs/common";
import { JOIN_REQUEST_SENT, JoinRequestsService, MAX_JOIN_REQUESTS_PER_DAY, normalizeOwnerEmail } from "./join-requests.service";

const owner = {
  tenantId: "t1",
  tenantName: "Local Uno",
  tenantType: "RETAILER",
  tenantRole: "OWNER",
  userId: "u-owner",
  permissions: ["team.manage"],
} as never;

const admin = { ...(owner as object), tenantRole: "ADMIN", userId: "u-admin" } as never;
const seller = { ...(owner as object), tenantRole: "SELLER", userId: "u-seller", permissions: [] } as never;

type Opts = {
  user?: Record<string, unknown> | null;
  member?: boolean;
  pending?: Record<string, unknown> | null;
  today?: number;
  ownerRow?: Record<string, unknown> | null;
  request?: Record<string, unknown> | null;
  txMember?: boolean;
  taken?: number;
  rows?: Record<string, unknown>[];
};

function pendingRow(over: Record<string, unknown> = {}) {
  return {
    id: "jr1",
    tenantId: "t1",
    userId: "u2",
    ownerEmail: "dueno@local.com",
    status: "PENDING",
    createdAt: new Date(),
    decidedAt: null,
    user: { id: "u2", username: "ana", email: "ana@mail.com", active: true },
    ...over,
  };
}

function setup(opts: Opts = {}) {
  const tx = {
    $executeRaw: jest.fn().mockResolvedValue(1),
    tenantMembership: {
      findFirst: jest.fn().mockResolvedValue(opts.txMember ? { id: "m-other" } : null),
      upsert: jest.fn().mockResolvedValue({ id: "m1" }),
    },
    tenantJoinRequest: {
      update: jest.fn().mockResolvedValue({}),
      updateMany: jest.fn().mockResolvedValue({ count: opts.taken ?? 1 }),
    },
  };
  const prisma = {
    $transaction: jest.fn().mockImplementation(async (fn: (t: typeof tx) => Promise<unknown>) => fn(tx)),
    user: {
      findUnique: jest.fn().mockResolvedValue(
        opts.user === undefined
          ? { id: "u2", username: "ana", email: "ana@mail.com", active: true, role: "ROLE_USER" }
          : opts.user
      ),
    },
    tenantMembership: {
      findFirst: jest
        .fn()
        // 1º: ¿tiene organización? 2º: el dueño por mail.
        .mockResolvedValueOnce(opts.member ? { id: "m-own" } : null)
        .mockResolvedValueOnce(
          opts.ownerRow === undefined
            ? { tenantId: "t1", tenant: { name: "Local Uno" }, user: { username: "dueno", email: "dueno@local.com" } }
            : opts.ownerRow
        ),
    },
    tenantJoinRequest: {
      findFirst: jest.fn().mockResolvedValue(opts.pending === undefined ? null : opts.pending),
      count: jest.fn().mockResolvedValue(opts.today ?? 0),
      create: jest.fn().mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
        id: "jr-new",
        status: "PENDING",
        createdAt: new Date(),
        decidedAt: null,
        ...data,
      })),
      findMany: jest.fn().mockResolvedValue(opts.rows ?? []),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    orgNotification: { create: jest.fn().mockResolvedValue({}) },
  };
  const mail = { send: jest.fn().mockResolvedValue(undefined) };
  return { service: new JoinRequestsService(prisma as never, mail as never), prisma, tx, mail };
}

describe("normalizeOwnerEmail", () => {
  it("recorta y pasa a minúsculas", () => {
    expect(normalizeOwnerEmail("  Dueno@Local.COM ")).toBe("dueno@local.com");
  });
});

describe("JoinRequestsService.request", () => {
  it("con dueño: guarda el pedido para su comercio, avisa en la campana y le manda mail", async () => {
    const { service, prisma, mail } = setup();
    const res = await service.request("u2", "Dueno@Local.com");
    expect(res.message).toBe(JOIN_REQUEST_SENT);
    expect(prisma.tenantJoinRequest.create).toHaveBeenCalledWith({
      data: { userId: "u2", ownerEmail: "dueno@local.com", tenantId: "t1" },
    });
    expect(prisma.orgNotification.create).toHaveBeenCalled();
    expect(mail.send).toHaveBeenCalledWith(expect.objectContaining({ to: "dueno@local.com" }));
  });

  it("sin dueño: responde lo mismo, guarda el pedido sin comercio y no manda nada", async () => {
    const { service, prisma, mail } = setup({ ownerRow: null });
    const res = await service.request("u2", "nadie@x.com");
    expect(res.message).toBe(JOIN_REQUEST_SENT);
    expect(prisma.tenantJoinRequest.create).toHaveBeenCalledWith({
      data: { userId: "u2", ownerEmail: "nadie@x.com", tenantId: null },
    });
    expect(mail.send).not.toHaveBeenCalled();
    expect(prisma.orgNotification.create).not.toHaveBeenCalled();
    // Lo que ve quien pide no dice a qué comercio fue.
    expect(res.request).not.toHaveProperty("tenantId");
  });

  it("su propio mail no busca dueño", async () => {
    const { service, prisma } = setup();
    await service.request("u2", "ana@mail.com");
    expect(prisma.tenantMembership.findFirst).toHaveBeenCalledTimes(1);
    expect(prisma.tenantJoinRequest.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ tenantId: null }) }));
  });

  it("si un mail falla, el pedido queda igual", async () => {
    const { service, mail } = setup();
    mail.send.mockRejectedValueOnce(new Error("Resend caído"));
    await expect(service.request("u2", "dueno@local.com")).resolves.toMatchObject({ message: JOIN_REQUEST_SENT });
  });

  it("quien ya tiene organización no puede pedir", async () => {
    const { service } = setup({ member: true });
    await expect(service.request("u2", "dueno@local.com")).rejects.toBeInstanceOf(ConflictException);
  });

  it("solo un pedido pendiente a la vez", async () => {
    const { service } = setup({ pending: { ownerEmail: "otro@x.com" } });
    await expect(service.request("u2", "dueno@local.com")).rejects.toBeInstanceOf(ConflictException);
  });

  it("tope diario de pedidos", async () => {
    const { service } = setup({ today: MAX_JOIN_REQUESTS_PER_DAY });
    await expect(service.request("u2", "dueno@local.com")).rejects.toBeInstanceOf(HttpException);
  });

  it("mail inválido", async () => {
    const { service } = setup();
    await expect(service.request("u2", "no-es-mail")).rejects.toBeInstanceOf(BadRequestException);
  });

  it("superadmin y cuentas inactivas no piden", async () => {
    await expect(setup({ user: { id: "u", username: "a", email: "a@a.com", active: true, role: "ROLE_ADMIN" } }).service.request("u", "d@l.com")).rejects.toBeInstanceOf(ForbiddenException);
    await expect(setup({ user: { id: "u", username: "a", email: "a@a.com", active: false, role: "ROLE_USER" } }).service.request("u", "d@l.com")).rejects.toBeInstanceOf(ForbiddenException);
  });
});

describe("JoinRequestsService.list", () => {
  it("da de baja a quien ya tiene organización y lista el resto", async () => {
    const rows = [
      pendingRow({ id: "a", user: { id: "u2", username: "ana", email: "ana@mail.com", active: true, memberships: [] } }),
      pendingRow({ id: "b", user: { id: "u3", username: "beto", email: "b@mail.com", active: true, memberships: [{ id: "m" }] } }),
    ];
    const { service, prisma } = setup({ rows });
    const out = await service.list(owner);
    expect(out.map((r) => r.id)).toEqual(["a"]);
    expect(prisma.tenantJoinRequest.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: { in: ["b"] }, status: "PENDING" } })
    );
  });

  it("sin permiso de equipo, no", async () => {
    const { service } = setup();
    await expect(service.list(seller)).rejects.toBeInstanceOf(ForbiddenException);
  });
});

describe("JoinRequestsService.approve", () => {
  it("crea la membresía con el rol y avisa por mail", async () => {
    const { service, prisma, tx, mail } = setup({ pending: pendingRow() });
    const res = await service.approve(owner, "jr1", "BUYER");
    expect(res).toMatchObject({ status: "APPROVED", role: "BUYER" });
    expect(tx.$executeRaw).toHaveBeenCalled();
    expect(tx.tenantMembership.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ create: { tenantId: "t1", userId: "u2", role: "BUYER" } })
    );
    expect(mail.send).toHaveBeenCalledWith(expect.objectContaining({ to: "ana@mail.com" }));
    expect(prisma.tenantJoinRequest.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "jr1", tenantId: "t1", status: "PENDING" } })
    );
  });

  it("si mientras tanto entró a otra organización, se cancela y no la suma", async () => {
    const { service, tx } = setup({ pending: pendingRow(), txMember: true });
    await expect(service.approve(owner, "jr1", "BUYER")).rejects.toBeInstanceOf(ConflictException);
    expect(tx.tenantJoinRequest.update).toHaveBeenCalledWith({ where: { id: "jr1" }, data: expect.objectContaining({ status: "CANCELLED" }) });
    expect(tx.tenantMembership.upsert).not.toHaveBeenCalled();
  });

  it("no da el rol de dueño y solo el dueño suma administradores", async () => {
    await expect(setup({ pending: pendingRow() }).service.approve(owner, "jr1", "OWNER")).rejects.toBeInstanceOf(BadRequestException);
    await expect(setup({ pending: pendingRow() }).service.approve(admin, "jr1", "ADMIN")).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("un pedido de otro comercio o ya decidido no existe", async () => {
    const { service } = setup({ pending: null });
    await expect(service.approve(owner, "jr1", "BUYER")).rejects.toBeInstanceOf(NotFoundException);
  });

  it("doble click: el segundo no vuelve a sumar", async () => {
    const { service, tx } = setup({ pending: pendingRow(), taken: 0 });
    await expect(service.approve(owner, "jr1", "BUYER")).rejects.toBeInstanceOf(NotFoundException);
    expect(tx.tenantMembership.upsert).not.toHaveBeenCalled();
  });
});

describe("JoinRequestsService.reject", () => {
  it("rechaza y avisa", async () => {
    const { service, mail } = setup({ pending: pendingRow() });
    await expect(service.reject(owner, "jr1")).resolves.toMatchObject({ status: "REJECTED" });
    expect(mail.send).toHaveBeenCalledWith(expect.objectContaining({ to: "ana@mail.com" }));
  });
});

describe("JoinRequestsService.mine / cancel", () => {
  it("cancela el pendiente propio", async () => {
    const { service, prisma } = setup();
    await service.cancel("u2");
    expect(prisma.tenantJoinRequest.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: "u2", status: "PENDING" } })
    );
  });

  it("devuelve el último pedido sin datos del comercio", async () => {
    const { service } = setup({ pending: pendingRow() });
    const mine = await service.mine("u2");
    expect(mine).toMatchObject({ id: "jr1", ownerEmail: "dueno@local.com", status: "PENDING" });
    expect(mine).not.toHaveProperty("tenantId");
  });
});
