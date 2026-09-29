// Integración contra un Postgres real con las migraciones aplicadas. Se salta si no hay
// INTEGRATION_DB (ej.: postgresql://postgres@127.0.0.1:55432/nodo_test).
import { PrismaClient } from "@prisma/client";
import { BrandLaunchesService } from "./brand-launches.service";

const url = process.env.INTEGRATION_DB;
const d = url ? describe : describe.skip;
const DAY = 86_400_000;

d("BrandLaunchesService contra Postgres", () => {
  // El cliente no conecta hasta la primera consulta: sin INTEGRATION_DB la suite se salta.
  const prisma = new PrismaClient({ datasources: { db: { url: url ?? "postgresql://skip@localhost/skip" } } });
  const service = new BrandLaunchesService(prisma as never);

  beforeAll(async () => {
    await prisma.tenant.upsert({
      where: { id: "ln-brand" },
      create: { id: "ln-brand", name: "Marca Lanzamientos", type: "BRAND" },
      update: {},
    });
    await prisma.newsArticle.deleteMany({ where: { tenantId: "ln-brand" } });
    await prisma.brandItem.deleteMany({ where: { tenantId: "ln-brand" } });
    const now = Date.now();
    const item = await prisma.brandItem.create({
      data: { tenantId: "ln-brand", name: "Monitor 27 nuevo", state: "INCOMING", incomingAt: new Date(now + 10 * DAY) },
    });
    await prisma.brandItem.create({ data: { tenantId: "ln-brand", name: "Producto en stock" } });
    const published = { status: "PUBLISHED" as const, publishedAt: new Date(now - DAY) };
    await prisma.newsArticle.create({
      data: { tenantId: "ln-brand", publicKey: `ln-a-${now}`, title: "Llega el monitor", kind: "LAUNCH", brandItemId: item.id, ...published },
    });
    await prisma.newsArticle.create({
      data: {
        tenantId: "ln-brand",
        publicKey: `ln-e-${now}`,
        title: "Webinar",
        kind: "EVENT",
        eventStartsAt: new Date(now + 3 * DAY),
        eventUrl: "https://meet.example.com/x",
        rsvpEnabled: true,
        isPublic: true,
        ...published,
      },
    });
    await prisma.newsArticle.create({
      data: {
        tenantId: "ln-brand",
        publicKey: `ln-p-${now}`,
        title: "Evento pasado",
        kind: "EVENT",
        eventStartsAt: new Date(now - 5 * DAY),
        eventEndsAt: new Date(now - 4 * DAY),
        ...published,
      },
    });
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("lanzamientos: productos en próximo ingreso con su nota; la nota no pública no sale en el link", async () => {
    const client = await service.launchesFor("ln-brand", "client");
    expect(client).toHaveLength(1);
    expect(client[0]).toMatchObject({ name: "Monitor 27 nuevo", note: { title: "Llega el monitor" } });
    const pub = await service.launchesFor("ln-brand", "public");
    expect(pub[0].note).toBeNull();
  });

  it("eventos: solo los que vienen; el público no ve el link de la reunión ni se anota", async () => {
    const client = await service.eventsFor("ln-brand", "client");
    expect(client.map((e) => e.title)).toEqual(["Webinar"]);
    expect(client[0]).toMatchObject({ url: "https://meet.example.com/x", rsvpEnabled: true });
    const pub = await service.eventsFor("ln-brand", "public");
    expect(pub[0]).toMatchObject({ url: null, rsvpEnabled: false });
  });
});
