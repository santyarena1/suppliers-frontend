// Integración contra un Postgres real con las migraciones aplicadas. Se salta si no hay
// INTEGRATION_DB (ej.: postgresql://postgres@127.0.0.1:55432/nodo_test).
import { PrismaClient } from "@prisma/client";
import { resolvePermissions } from "@nodo/shared";
import { NewsRsvpService } from "./news-rsvp.service";

const url = process.env.INTEGRATION_DB;
const d = url ? describe : describe.skip;

function ctx(tenantId: string, userId: string, type: "RETAILER" | "BRAND") {
  return {
    userId,
    tenantId,
    tenantName: tenantId,
    tenantType: type,
    tenantRole: "OWNER" as const,
    membershipId: "m",
    permissions: resolvePermissions({ type, role: "OWNER" }),
    commercialTenantId: tenantId,
  };
}

d("NewsRsvpService contra Postgres", () => {
  // El cliente no conecta hasta la primera consulta: sin INTEGRATION_DB la suite se salta.
  const prisma = new PrismaClient({ datasources: { db: { url: url ?? "postgresql://skip@localhost/skip" } } });
  const visibility = {
    authorIdsFor: jest.fn(async () => ["rsvp-brand"]),
    // El comercio de la prueba está vinculado a la marca: puede confirmar asistencia.
    linkedSupplierIds: jest.fn(async () => new Set(["rsvp-brand"])),
  };
  const service = new NewsRsvpService(prisma as never, visibility as never);
  const brand = ctx("rsvp-brand", "u-brand", "BRAND");
  const shopA = ctx("rsvp-shop", "u-a", "RETAILER");
  const shopB = ctx("rsvp-shop", "u-b", "RETAILER");
  let eventId = "";
  let noteId = "";

  beforeAll(async () => {
    for (const [id, type] of [["rsvp-brand", "BRAND"], ["rsvp-shop", "RETAILER"]] as const) {
      await prisma.tenant.upsert({ where: { id }, create: { id, name: id, type }, update: {} });
    }
    await prisma.newsArticle.deleteMany({ where: { tenantId: "rsvp-brand" } });
    const now = Date.now();
    const event = await prisma.newsArticle.create({
      data: {
        tenantId: "rsvp-brand",
        publicKey: `ev-${now}`,
        title: "Presentación de la línea 2027",
        kind: "EVENT",
        status: "PUBLISHED",
        publishedAt: new Date(now - 60_000),
        eventStartsAt: new Date(now + 7 * 86_400_000),
        rsvpEnabled: true,
      },
    });
    const note = await prisma.newsArticle.create({
      data: {
        tenantId: "rsvp-brand",
        publicKey: `nt-${now}`,
        title: "Nota común",
        status: "PUBLISHED",
        publishedAt: new Date(now - 60_000),
      },
    });
    eventId = event.id;
    noteId = note.id;
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("dos personas del mismo comercio se anotan; anotarse dos veces no duplica", async () => {
    await service.join(shopA, eventId);
    await service.join(shopA, eventId);
    const summary = await service.join(shopB, eventId);
    expect(summary).toMatchObject({ enabled: true, count: 2, mine: true });
    expect("attendees" in summary).toBe(false);
  });

  it("el autor ve quiénes van por organización", async () => {
    const summary = await service.summary(brand, eventId);
    expect(summary).toMatchObject({ count: 2, attendees: [{ tenantId: "rsvp-shop", name: "rsvp-shop", people: 2 }] });
  });

  it("borrarse y reglas: no a notas sin inscripción ni al propio evento", async () => {
    expect(await service.leave(shopB, eventId)).toMatchObject({ count: 1, mine: false });
    await expect(service.join(shopA, noteId)).rejects.toThrow(/confirmación de asistencia/);
    await expect(service.join(brand, eventId)).rejects.toThrow(/propio/);
  });

  it("cupo, no voy y lista completa para el autor", async () => {
    await prisma.newsArticle.update({ where: { id: eventId }, data: { eventCapacity: 3 } });
    await service.respond(shopA, eventId, { status: "GOING", people: 2, note: "Vamos con el encargado" });
    await expect(service.respond(shopB, eventId, { status: "GOING", people: 2 })).rejects.toThrow(/Quedan 1 lugar/);
    const s = await service.respond(shopB, eventId, { status: "NOT_GOING" });
    expect(s).toMatchObject({ count: 2, notGoing: 1, spotsLeft: 1, mine: false, myResponse: { status: "NOT_GOING" } });
    const list = await service.attendees(brand, eventId);
    expect(list.items.map((i) => [i.status, i.people])).toEqual([
      ["GOING", 2],
      ["NOT_GOING", 1],
    ]);
    expect(list.items[0].note).toBe("Vamos con el encargado");
    await expect(service.attendees(shopA, eventId)).rejects.toThrow(/organiza/);
  });

  it("avisos: manual a los que van y recordatorio automático una sola vez", async () => {
    await prisma.orgNotification.deleteMany({ where: { fromTenantId: "rsvp-brand" } });
    expect(await service.remind(brand, eventId, "going")).toEqual({ sent: 1 });
    await prisma.newsArticle.update({
      where: { id: eventId },
      data: { eventStartsAt: new Date(Date.now() + 3 * 3600_000), reminderSentAt: null },
    });
    await service.sendDueReminders();
    await service.sendDueReminders();
    const notes = await prisma.orgNotification.findMany({ where: { fromTenantId: "rsvp-brand", toTenantId: "rsvp-shop" } });
    expect(notes).toHaveLength(2);
    expect(notes.some((n) => n.body.startsWith("Es mañana"))).toBe(true);
  });

  it("quien no ve la nota no se puede anotar", async () => {
    visibility.authorIdsFor.mockResolvedValueOnce([]);
    await expect(service.join(shopA, eventId)).rejects.toThrow(/no encontrada/);
  });
});
