// Integración contra un Postgres real con las migraciones aplicadas. Se salta si no hay
// INTEGRATION_DB (ej.: postgresql://postgres@127.0.0.1:55432/nodo_int).
import { PrismaClient } from "@prisma/client";
import { PcBuilderService } from "./pc-builder.service";

const url = process.env.INTEGRATION_DB;
const d = url ? describe : describe.skip;
const TENANT = "pcb-int-tenant";
const OTHER = "pcb-int-otro";
const SELLER = "pcb-int-seller";
const SELLER2 = "pcb-int-seller2";
const OWNER = "pcb-int-owner";

d("Armados de PC guardados contra Postgres", () => {
  const prisma = new PrismaClient({ datasources: { db: { url: url ?? "postgresql://skip@localhost/skip" } } });
  const service = new PcBuilderService(prisma as never);
  const seller = { tenantId: TENANT, userId: SELLER, tenantRole: "SELLER" } as never;
  const seller2 = { tenantId: TENANT, userId: SELLER2, tenantRole: "SELLER" } as never;
  const owner = { tenantId: TENANT, userId: OWNER, tenantRole: "OWNER" } as never;
  const outsider = { tenantId: OTHER, userId: OWNER, tenantRole: "OWNER" } as never;
  const data = { parts: { cpu: { contentId: "c1", offer: null, qty: 1 } }, extras: [], custom: [], split: "cheap" };

  async function cleanup() {
    await prisma.pcBuild.deleteMany({ where: { tenantId: { in: [TENANT, OTHER] } } });
    await prisma.pcBuilderSettings.deleteMany({ where: { tenantId: { in: [TENANT, OTHER] } } });
    await prisma.tenant.deleteMany({ where: { id: { in: [TENANT, OTHER] } } });
  }

  beforeAll(async () => {
    await cleanup();
    await prisma.tenant.createMany({
      data: [
        { id: TENANT, name: "Armador Integración", type: "RETAILER", plan: "PRO" },
        { id: OTHER, name: "Otro comercio", type: "RETAILER", plan: "PRO" },
      ],
    });
  });

  afterAll(async () => {
    await cleanup();
    await prisma.$disconnect();
  });

  it("guarda, lista, abre y actualiza un armado; cada vendedor ve los suyos", async () => {
    const b = await service.create(seller, { title: "PC de Tomás", clientName: "Tomás", data });
    expect(b).toMatchObject({ title: "PC de Tomás", clientName: "Tomás", template: false, mine: true, data });
    expect((await service.list(seller)).map((x) => x.id)).toEqual([b.id]);
    expect(await service.list(seller2)).toEqual([]);
    expect((await service.list(owner)).map((x) => x.id)).toEqual([b.id]);
    await expect(service.get(seller2, b.id)).rejects.toThrow(/no encontrado/i);
    await expect(service.get(outsider, b.id)).rejects.toThrow(/no encontrado/i);

    const upd = await service.update(seller, b.id, { title: "PC de Tomás v2", data: { ...data, split: "few" } });
    expect(upd).toMatchObject({ title: "PC de Tomás v2", clientName: null, data: { split: "few" } });
    await expect(service.update(seller2, b.id, { title: "x", data })).rejects.toThrow(/no encontrado/i);
  });

  it("las plantillas las crea el dueño y las ve todo el equipo, pero no las cambia", async () => {
    await expect(service.create(seller, { title: "Gamer", template: true, data })).rejects.toThrow(/dueño/);
    const t = await service.create(owner, { title: "Gamer 1080p", template: true, data });
    expect((await service.list(seller2)).map((x) => x.id)).toContain(t.id);
    expect((await service.get(seller2, t.id)).data).toEqual(data);
    await expect(service.update(seller2, t.id, { title: "Mía", data })).rejects.toThrow(/copia/);
    await expect(service.remove(seller2, t.id)).rejects.toThrow(/copia/);
    expect(await service.remove(owner, t.id)).toEqual({ deleted: true });
  });

  it("rechaza datos inválidos o demasiado grandes", async () => {
    await expect(service.create(seller, { title: "x", data: [] as never })).rejects.toThrow(/inválido/);
    await expect(service.create(seller, { title: "x", data: { blob: "a".repeat(250_000) } })).rejects.toThrow(/grande/);
  });

  it("lo que se cobra por armar: lo cambia el dueño, lo lee el equipo", async () => {
    expect(await service.settings(TENANT)).toEqual({ laborName: null, laborPrice: null, laborIva: 21 });
    await expect(service.updateSettings(seller, { laborPrice: 1000 })).rejects.toThrow(/dueño/);
    expect(await service.updateSettings(owner, { laborName: "Armado y prueba", laborPrice: 45000 })).toEqual({ laborName: "Armado y prueba", laborPrice: 45000, laborIva: 21 });
    expect(await service.updateSettings(owner, { laborPrice: null })).toMatchObject({ laborName: "Armado y prueba", laborPrice: null });
  });
});
