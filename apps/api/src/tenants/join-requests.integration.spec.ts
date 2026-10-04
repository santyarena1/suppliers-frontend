// Integración contra un Postgres real con las migraciones aplicadas. Se salta si no hay
// INTEGRATION_DB (ej.: postgresql://postgres@127.0.0.1:55432/nodo_test2).
import { ConflictException } from "@nestjs/common";
import { PrismaClient } from "@prisma/client";
import { JOIN_REQUEST_SENT, JoinRequestsService } from "./join-requests.service";

const url = process.env.INTEGRATION_DB;
const d = url ? describe : describe.skip;
const TENANT = "jr-local";

d("JoinRequestsService contra Postgres", () => {
  const prisma = new PrismaClient({ datasources: { db: { url: url ?? "postgresql://skip@localhost/skip" } } });
  const mail = { send: jest.fn().mockResolvedValue(undefined) };
  const service = new JoinRequestsService(prisma as never, mail as never);
  let ownerId = "";
  let askerId = "";

  const ownerCtx = () =>
    ({
      tenantId: TENANT,
      tenantName: "JR Local",
      tenantType: "RETAILER",
      tenantRole: "OWNER",
      userId: ownerId,
      permissions: ["team.manage"],
    }) as never;

  beforeAll(async () => {
    await prisma.tenantJoinRequest.deleteMany({ where: { user: { username: { in: ["jr-owner", "jr-asker"] } } } });
    await prisma.tenantMembership.deleteMany({ where: { tenantId: TENANT } });
    await prisma.tenant.upsert({ where: { id: TENANT }, create: { id: TENANT, name: "JR Local", type: "RETAILER" }, update: {} });
    const owner = await prisma.user.upsert({
      where: { username: "jr-owner" },
      create: { username: "jr-owner", email: "JR-Owner@example.test", passwordHash: "x" },
      update: {},
    });
    const asker = await prisma.user.upsert({
      where: { username: "jr-asker" },
      create: { username: "jr-asker", email: "jr-asker@example.test", passwordHash: "x" },
      update: {},
    });
    ownerId = owner.id;
    askerId = asker.id;
    await prisma.tenantMembership.create({ data: { tenantId: TENANT, userId: ownerId, role: "OWNER" } });
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("pedido sin dueño: misma respuesta, sin comercio, y se puede cancelar", async () => {
    const res = await service.request(askerId, "nadie@example.test");
    expect(res.message).toBe(JOIN_REQUEST_SENT);
    const row = await prisma.tenantJoinRequest.findUniqueOrThrow({ where: { id: res.request.id } });
    expect(row.tenantId).toBeNull();
    await expect(service.request(askerId, "jr-owner@example.test")).rejects.toBeInstanceOf(ConflictException);
    await service.cancel(askerId);
  });

  it("pedido al dueño (mail sin distinguir mayúsculas) → aprobado con rol → entra", async () => {
    const res = await service.request(askerId, "jr-owner@EXAMPLE.test");
    const row = await prisma.tenantJoinRequest.findUniqueOrThrow({ where: { id: res.request.id } });
    expect(row.tenantId).toBe(TENANT);
    expect(mail.send).toHaveBeenCalledWith(expect.objectContaining({ to: "JR-Owner@example.test" }));

    const pending = await service.list(ownerCtx());
    expect(pending.map((p) => p.user.username)).toEqual(["jr-asker"]);

    await service.approve(ownerCtx(), row.id, "BUYER");
    const membership = await prisma.tenantMembership.findUniqueOrThrow({
      where: { tenantId_userId: { tenantId: TENANT, userId: askerId } },
    });
    expect(membership).toMatchObject({ role: "BUYER", active: true });
    expect((await service.mine(askerId))?.status).toBe("APPROVED");

    // Ya tiene organización: no puede pedir otra.
    await expect(service.request(askerId, "jr-owner@example.test")).rejects.toBeInstanceOf(ConflictException);
  });
});
