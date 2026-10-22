import { HttpException } from "@nestjs/common";
import { DAILY_COPY_LIMIT, DAILY_VIEW_LIMIT, PlatformContentService } from "./platform-content.service";

const CONTENT = {
  id: "c1",
  source: "ACUSTOCK",
  name: "Placa RTX 5060",
  images: [{ url: "https://a.com/1.jpg", alt: null }],
  shortDescription: "8 GB",
  descriptionHtml: "<p>Para jugar.</p>",
  specs: [{ group: "Memoria", name: "Capacidad", value: "8 GB" }],
  warrantyMonths: 36,
};

function setup(opts: { linked?: boolean; seenToday?: number; alreadySeen?: boolean; copiesToday?: number }) {
  const prisma = {
    platformProductContentLink: {
      findUnique: jest.fn().mockResolvedValue(opts.linked === false ? null : { content: CONTENT }),
    },
    platformContentAccess: {
      findUnique: jest.fn().mockResolvedValue(opts.alreadySeen ? { id: "a1" } : null),
      count: jest.fn().mockImplementation(({ where }: { where: { copied?: boolean } }) =>
        Promise.resolve(where.copied ? (opts.copiesToday ?? 0) : (opts.seenToday ?? 0))
      ),
      createMany: jest.fn().mockResolvedValue({ count: 1 }),
      update: jest.fn().mockResolvedValue({}),
    },
  };
  const service = new PlatformContentService(prisma as never, {} as never);
  return { service, prisma };
}

describe("PlatformContentService.forProduct", () => {
  it("muestra la ficha y registra la vista mientras no llega al tope", async () => {
    const { service, prisma } = setup({ seenToday: 10 });

    const r = await service.forProduct("ELIT", "1", "u1");

    expect(r.limited).toBe(false);
    expect(r.content?.specs).toHaveLength(1);
    expect(prisma.platformContentAccess.createMany).toHaveBeenCalledTimes(1);
  });

  it("pasado el tope diario no devuelve contenido", async () => {
    const { service, prisma } = setup({ seenToday: DAILY_VIEW_LIMIT });

    const r = await service.forProduct("ELIT", "1", "u1");

    expect(r).toEqual({ content: null, limited: true });
    expect(prisma.platformContentAccess.createMany).not.toHaveBeenCalled();
  });

  it("una ficha ya vista hoy se sigue viendo aunque el usuario esté en el tope", async () => {
    const { service } = setup({ seenToday: DAILY_VIEW_LIMIT, alreadySeen: true });

    expect((await service.forProduct("ELIT", "1", "u1")).content).not.toBeNull();
  });

  it("sin usuario o sin vínculo no devuelve contenido", async () => {
    expect((await setup({}).service.forProduct("ELIT", "1", undefined)).content).toBeNull();
    expect((await setup({ linked: false }).service.forProduct("ELIT", "1", "u1")).content).toBeNull();
  });
});

describe("PlatformContentService.copyText", () => {
  it("devuelve el texto y marca la copia", async () => {
    const { service, prisma } = setup({ alreadySeen: true });

    const r = await service.copyText("ELIT", "1", "u1");

    expect(r.text).toContain("Capacidad: 8 GB");
    expect(prisma.platformContentAccess.update).toHaveBeenCalledWith(expect.objectContaining({ data: { copied: true } }));
  });

  it("corta con 429 al llegar al tope de copias", async () => {
    const { service } = setup({ alreadySeen: true, copiesToday: DAILY_COPY_LIMIT });

    await expect(service.copyText("ELIT", "1", "u1")).rejects.toBeInstanceOf(HttpException);
  });
});
