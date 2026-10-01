import { NotFoundException } from "@nestjs/common";
import { inboxMail } from "./inbox-mail";
import { InboxService } from "./inbox.service";

function setup(opts: { mailFails?: boolean; dbFails?: boolean; notifyEmail?: string } = {}) {
  const notifyEmail = "notifyEmail" in opts ? opts.notifyEmail : "duenio@nodohub.app";
  const prisma = {
    inboxRequest: {
      create: jest.fn().mockImplementation(async () => {
        if (opts.dbFails) throw new Error("db caída");
        return { id: "req-1" };
      }),
      update: jest.fn().mockResolvedValue({}),
      findUnique: jest.fn(),
      findMany: jest.fn().mockResolvedValue([]),
      count: jest.fn().mockResolvedValue(0),
      groupBy: jest.fn().mockResolvedValue([]),
    },
    user: { findUniqueOrThrow: jest.fn().mockResolvedValue({ username: "ana", email: "ana@x.com" }) },
    tenant: { findMany: jest.fn().mockResolvedValue([]) },
  };
  const mail = {
    send: jest.fn().mockImplementation(async () => {
      if (opts.mailFails) throw new Error("resend caído");
    }),
  };
  const config = { get: jest.fn((key: string) => (key === "ADMIN_NOTIFY_EMAIL" ? notifyEmail : undefined)) };
  const service = new InboxService(prisma as never, mail as never, config as never);
  return { service, prisma, mail };
}

describe("InboxService", () => {
  it("guarda la solicitud y avisa por mail al dueño de NODO", async () => {
    const { service, prisma, mail } = setup();
    await service.record({ type: "NEW_STORE", title: "Nuevo comercio: Pepe", company: "Pepe" });
    expect(prisma.inboxRequest.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ type: "NEW_STORE", company: "Pepe" }) })
    );
    expect(mail.send).toHaveBeenCalledWith(expect.objectContaining({ to: "duenio@nodohub.app" }));
    expect(prisma.inboxRequest.update).toHaveBeenCalledWith({ where: { id: "req-1" }, data: { emailedAt: expect.any(Date) } });
  });

  it("usa ADMIN_NOTIFY_EMAIL si está configurado", async () => {
    const { service, mail } = setup({ notifyEmail: "otro@nodohub.app" });
    await service.record({ type: "CONTACT", title: "Consulta" });
    expect(mail.send).toHaveBeenCalledWith(expect.objectContaining({ to: "otro@nodohub.app" }));
  });

  it("sin ADMIN_NOTIFY_EMAIL queda en la bandeja sin mandar mail", async () => {
    const { service, mail, prisma } = setup({ notifyEmail: undefined });
    await service.record({ type: "CONTACT", title: "Consulta" });
    expect(prisma.inboxRequest.create).toHaveBeenCalled();
    expect(mail.send).not.toHaveBeenCalled();
  });

  it("con notify:false queda en la bandeja sin mandar mail", async () => {
    const { service, prisma, mail } = setup();
    await service.record({ type: "SIGNUP", title: "ana se registró", notify: false });
    expect(prisma.inboxRequest.create).toHaveBeenCalled();
    expect(mail.send).not.toHaveBeenCalled();
  });

  it("si el mail falla no rompe al que pidió, y no marca emailedAt", async () => {
    const { service, prisma } = setup({ mailFails: true });
    await expect(service.record({ type: "CONTACT", title: "Consulta" })).resolves.toBeUndefined();
    expect(prisma.inboxRequest.update).not.toHaveBeenCalled();
  });

  it("si la base falla tampoco rompe, y no manda mail", async () => {
    const { service, mail } = setup({ dbFails: true });
    await expect(service.record({ type: "CONTACT", title: "Consulta" })).resolves.toBeUndefined();
    expect(mail.send).not.toHaveBeenCalled();
  });

  it("el formulario de la landing clasifica por tipo", async () => {
    const { service, prisma } = setup();
    await service.contact({ kind: "SUPPLIER", name: "Juan", email: "j@d.com", company: "Distri SA", message: "Queremos sumarnos" });
    expect(prisma.inboxRequest.create.mock.calls[0][0].data).toMatchObject({
      type: "SUPPLIER_JOIN",
      title: "Distri SA quiere sumarse como distribuidor",
      contactEmail: "j@d.com",
    });
    await service.contact({ kind: "CUSTOM", name: "Juan", email: "j@d.com", message: "Somos 5 locales" });
    expect(prisma.inboxRequest.create.mock.calls[1][0].data).toMatchObject({ type: "PLAN_REQUEST", title: "Juan pide NODO Custom" });
    await service.contact({ name: "Juan", email: "j@d.com", message: "Hola, una duda" });
    expect(prisma.inboxRequest.create.mock.calls[2][0].data).toMatchObject({ type: "CONTACT", title: "Consulta de Juan" });
  });

  it("distribuidor o marca desde la app usa los datos de la cuenta", async () => {
    const { service, prisma } = setup();
    await service.supplierJoin("u1", { kind: "BRAND", company: "Gigabyte AR" });
    expect(prisma.inboxRequest.create.mock.calls[0][0].data).toMatchObject({
      type: "SUPPLIER_JOIN",
      title: "Gigabyte AR quiere sumarse como marca",
      contactName: "ana",
      contactEmail: "ana@x.com",
      userId: "u1",
    });
  });

  it("marcar como atendida guarda quién y cuándo; volver a NEW lo limpia", async () => {
    const { service, prisma } = setup();
    prisma.inboxRequest.findUnique.mockResolvedValue({ id: "r1" });
    await service.update("r1", "admin-1", { status: "HANDLED", note: " lo llamé " });
    expect(prisma.inboxRequest.update).toHaveBeenLastCalledWith({
      where: { id: "r1" },
      data: { status: "HANDLED", handledAt: expect.any(Date), handledById: "admin-1", note: "lo llamé" },
    });
    await service.update("r1", "admin-1", { status: "NEW" });
    expect(prisma.inboxRequest.update).toHaveBeenLastCalledWith({
      where: { id: "r1" },
      data: { status: "NEW", handledAt: null, handledById: null },
    });
  });

  it("actualizar una solicitud inexistente da 404", async () => {
    const { service, prisma } = setup();
    prisma.inboxRequest.findUnique.mockResolvedValue(null);
    await expect(service.update("nope", "a", { status: "HANDLED" })).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe("inboxMail", () => {
  it("escapa el HTML que manda la gente", () => {
    const mail = inboxMail({ type: "CONTACT", title: "<script>x</script>", message: "<img src=x onerror=alert(1)>", contactName: "a&b" });
    expect(mail.html).not.toContain("<script>x");
    expect(mail.html).not.toContain("<img src=x");
    expect(mail.html).toContain("&lt;script&gt;");
    expect(mail.html).toContain("a&amp;b");
    expect(mail.subject).toBe("NODO · Consulta: <script>x</script>");
  });
});
