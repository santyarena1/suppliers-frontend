import { readFileSync } from "fs";
import { join } from "path";
import { EnrichmentPipelineService } from "./pipeline.service";
import { PrefixFetcher } from "./image-verify";
import { SourceFetcher } from "./sources/types";

const FIX = join(__dirname, "__fixtures__");
const json = (n: string): unknown => JSON.parse(readFileSync(join(FIX, n), "utf8"));
const text = (n: string): string => readFileSync(join(FIX, n), "utf8");

function pngHeader(w: number, h: number, seed: number): Buffer {
  const b = Buffer.alloc(64, seed);
  b.writeUInt32BE(0x89504e47, 0);
  b.writeUInt32BE(w, 16);
  b.writeUInt32BE(h, 20);
  return b;
}

const MASTER = {
  id: "m1",
  key: "ean:04711636014175",
  brand: "ASUS",
  brandKey: "asus",
  partNumber: "90YV0MP2M0AA00",
  ean: "04711636014175",
  name: "Placa de Video Asus Dual RTX 5060 Ti 8GB OC",
  categoryRaw: "Placas de Video",
  categoryKey: null,
  doubtful: false,
  members: [
    { provider: "ELIT", externalId: "1" },
    { provider: "AIR", externalId: "2" },
  ],
};

const FICHAS = [
  {
    id: "p1", provider: "ELIT", externalId: "1", name: "Placa de Video Asus Dual RTX 5060 Ti 8GB OC", brand: "ASUS", category: "Placas de Video",
    subcategory: null, partNumber: "90YV0MP2-M0AA00", ean: "4711636014175", description: null, longDescription: null,
    imageUrl: "https://dist.com/ia.jpg", productUrl: null, warranty: "36 meses", weight: null, weightUnit: null, raw: {},
  },
  {
    id: "p2", provider: "AIR", externalId: "2", name: "VGA ASUS DUAL-RTX5060TI-O8G", brand: "Asus", category: "VGA", subcategory: null,
    partNumber: "90YV0MP2-M0AA00", ean: null, description: "Placa de video GDDR7 8GB", longDescription: null,
    imageUrl: "https://dist.com/air.jpg", productUrl: null, warranty: null, weight: null, weightUnit: null, raw: { fotos: ["https://dist.com/air2.png"] },
  },
];

function setup(opts: { decided?: string[] } = {}) {
  const upserts: { field: string; source: string }[] = [];
  const prisma = {
    catalogMaster: {
      findUniqueOrThrow: jest.fn().mockResolvedValue(MASTER),
      update: jest.fn().mockResolvedValue({}),
    },
    providerSyncCache: { findMany: jest.fn().mockResolvedValue(FICHAS) },
    // La foto de ELIT la eligió la IA (Serper): no tiene que proponerse.
    imageSyncFill: { findMany: jest.fn().mockResolvedValue([{ productId: "p1", imageUrl: "https://dist.com/ia.jpg" }]) },
    enrichmentProposal: {
      findMany: jest.fn().mockResolvedValue((opts.decided ?? []).map((field) => ({ field, status: "REJECTED" }))),
      upsert: jest.fn().mockImplementation(({ create }: { create: { field: string; source: string } }) => {
        upserts.push({ field: create.field, source: create.source });
        return Promise.resolve({});
      }),
    },
  };
  const fetcher: SourceFetcher = async (_source, url) => {
    if (url.includes("live.icecat.biz") && url.includes("GTIN=")) return { status: 400, body: { msg: "not found" }, url };
    if (url.includes("live.icecat.biz")) return { status: 200, body: json("icecat-asus-dual-rtx5060ti.json"), url };
    if (url.includes("odinapi.asus.com")) return { status: 200, body: json("asus-suggest-dual-rtx5060ti.json"), url };
    if (url.includes("DUAL-RTX5060TI-O8G/")) return { status: 200, body: text("asus-page-dual-rtx5060ti-o8g.html"), url };
    return { status: 404, body: null, url };
  };
  const ai = { chatJson: jest.fn().mockResolvedValue({ attributes: { fans: { value: 2, evidence: "inexistente" } } }), isConfigured: jest.fn().mockResolvedValue(true) };
  const config = { get: jest.fn((k: string) => (k === "ICECAT_USERNAME" ? "usuario" : undefined)) };
  const service = new EnrichmentPipelineService(prisma as never, { fetcher } as never, ai as never, config as never);
  let seed = 1;
  service.imagePrefixFetcher = (async (url: string) => ({ status: 200, contentType: "image/png", buffer: pngHeader(1000, 1000, seed++), url, totalBytes: 5000 })) as unknown as PrefixFetcher;
  return { service, prisma, ai, upserts };
}

describe("pipeline de enriquecimiento (fuentes con fixtures, IA simulada)", () => {
  it("arma propuestas de los cinco campos con la fuente correcta y sin tocar fichas", async () => {
    const { service, prisma, upserts } = setup();
    const out = await service.enrichMaster("m1");
    expect(out.sources.icecat).toBe("found");
    expect(out.sources["manufacturer:asus"]).toBe("found");
    expect(Object.fromEntries(upserts.map((u) => [u.field, u.source]))).toMatchObject({
      description: "icecat",
      longDescription: "icecat",
      category: "icecat",
    });
    const imagesCall = prisma.enrichmentProposal.upsert.mock.calls.find(([a]: [{ create: { field: string } }]) => a.create.field === "images")[0];
    const urls = (imagesCall.create.value.images as { url: string; source: string }[]).map((i) => i.url);
    expect(imagesCall.create.value.images[0].source).toBe("manufacturer");
    expect(urls).not.toContain("https://dist.com/ia.jpg");
    // Con 10 fotos oficiales la galería se llena con ellas (tope 8).
    expect(urls).toHaveLength(8);
    expect(imagesCall.create.value.images.every((i: { source: string }) => i.source === "manufacturer")).toBe(true);
    // Las fichas solo se leen.
    expect(Object.keys(prisma.providerSyncCache)).toEqual(["findMany"]);
    expect(prisma.catalogMaster.update).toHaveBeenLastCalledWith(expect.objectContaining({ data: expect.objectContaining({ categoryKey: "gpu" }) }));
  });

  it("si Icecat cubre la mayoría de los atributos y hay texto oficial, no gasta IA", async () => {
    const { service, ai, prisma } = setup();
    await service.enrichMaster("m1");
    expect(ai.chatJson).not.toHaveBeenCalled();
    const attrs = prisma.enrichmentProposal.upsert.mock.calls.find(([a]: [{ create: { field: string } }]) => a.create.field === "attributes")[0].create.value.values;
    expect(attrs.memory_gb).toMatchObject({ value: 8, source: "icecat" });
    expect(attrs.fans).toMatchObject({ value: 2, source: "icecat" });
    expect(attrs.warranty_months).toMatchObject({ value: 36, source: "distributor" });
  });

  it("no pisa una propuesta que el superadmin ya decidió", async () => {
    const { service, upserts } = setup({ decided: ["description"] });
    await service.enrichMaster("m1");
    expect(upserts.map((u) => u.field)).not.toContain("description");
  });

  it("sin key de IA sigue con las otras fuentes", async () => {
    const { service, ai } = setup();
    ai.isConfigured.mockResolvedValue(false);
    const out = await service.enrichMaster("m1");
    expect(out.sources.ai).toBe("disabled");
    expect(ai.chatJson).not.toHaveBeenCalled();
    expect(out.proposals).toBeGreaterThanOrEqual(4);
  });

  it("sin fuentes oficiales: la IA extrae con evidencia y redacta solo con datos verificados", async () => {
    const { service, prisma, ai, upserts } = setup();
    prisma.catalogMaster.findUniqueOrThrow.mockResolvedValue({ ...MASTER, brand: "Kingston", brandKey: "kingston", partNumber: "KF432C16BB16", ean: null, name: "Memoria Kingston Fury Beast DDR4 16GB 3200MHz", categoryRaw: "Memorias" });
    prisma.providerSyncCache.findMany.mockResolvedValue([
      { ...FICHAS[1], name: "Memoria Kingston Fury Beast DDR4 16GB 3200MHz", description: "Módulo DIMM DDR4 de 16GB a 3200MHz, latencia CL16.", imageUrl: null, raw: {} },
    ]);
    ai.chatJson
      .mockResolvedValueOnce({
        attributes: {
          capacity_gb: { value: 16, evidence: "16GB" },
          speed_mhz: { value: 3200, evidence: "3200MHz" },
          memory_type: { value: "DDR4", evidence: "DDR4" },
          cas_latency: { value: 16, evidence: "CL16" },
        },
      })
      .mockResolvedValueOnce({ description: "Memoria DDR4 de 16 GB a 3200 MHz.", longDescription: "Módulo de 32 GB para gaming." });
    const out = await service.enrichMaster("m1");
    expect(ai.chatJson).toHaveBeenCalledTimes(2);
    expect(out.aiCalls).toBe(2);
    expect(out.notes.join(" ")).toContain("longDescription) descartada: menciona 32");
    expect(upserts.find((u) => u.field === "description")?.source).toBe("ai");
    expect(upserts.map((u) => u.field)).not.toContain("longDescription");
  });
});
