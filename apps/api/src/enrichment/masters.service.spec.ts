import { MastersService, masterWhere } from "./masters.service";

describe("filtros de maestros", () => {
  it("arma el where con búsqueda, marca canónica, proveedor y confianza", () => {
    const where = masterWhere({ q: "rtx 5060", brand: "TP-LINK", provider: "ELIT", hasAiImage: true, minConfidence: 0.7, multiProvider: true });
    const and = (where as { AND: Record<string, unknown>[] }).AND;
    expect(and).toContainEqual({ brandKey: "tplink" });
    expect(and).toContainEqual({ members: { some: { provider: "ELIT" } } });
    expect(and).toContainEqual({ hasAiImage: true });
    expect(and).toContainEqual({ bestConfidence: { gte: 0.7 } });
    expect(and).toContainEqual({ memberCount: { gte: 2 } });
    expect(JSON.stringify(and[0])).toContain("RTX5060");
  });

  it("sin filtros no restringe", () => {
    expect(masterWhere({})).toEqual({});
    expect(masterWhere({ category: "none" })).toEqual({ AND: [{ categoryKey: null }] });
  });
});

function setup() {
  const prisma = {
    catalogMaster: {
      findUnique: jest.fn().mockResolvedValue({
        id: "m1",
        members: [{ id: "a", provider: "ELIT", externalId: "1", manual: false }],
        proposals: [
          { field: "description", status: "APPROVED", value: { text: "Descripción nueva" } },
          { field: "images", status: "PENDING", value: { images: [{ url: "https://oficial/1.jpg" }] } },
          { field: "attributes", status: "PENDING", value: { values: {} } },
          { field: "longDescription", status: "REJECTED", value: { text: "x" } },
        ],
      }),
    },
  };
  const pipeline = {
    loadFichas: jest.fn().mockResolvedValue([
      { provider: "ELIT", externalId: "1", name: "Ficha", description: null, longDescription: "vieja", imageUrl: "https://serper/ia.jpg", aiImage: true },
    ]),
  };
  const service = new MastersService(prisma as never, {} as never, pipeline as never, {} as never, { get: () => undefined } as never);
  return { service, prisma };
}

describe("vista previa de aplicar", () => {
  it("muestra qué cambiaría con cada regla, sin las rechazadas, y no escribe", async () => {
    const { service } = setup();
    const preview = await service.applyPreview("m1");
    expect(preview.applyEnabled).toBe(false);
    expect(preview.note).toBe("La regla de aplicación se elige después de ver ejemplos");
    const changes = Object.fromEntries(preview.fichas[0].changes.map((c) => [c.field, c]));
    expect(changes.longDescription).toBeUndefined();
    expect(changes.description).toMatchObject({ column: "description", current: null, fillEmpty: true, overwrite: true });
    // Una foto elegida por IA cuenta como vacía: "completar vacíos" la reemplazaría.
    expect(changes.images).toMatchObject({ column: "imageUrl", currentIsAiImage: true, fillEmpty: true, proposed: "https://oficial/1.jpg" });
    expect(changes.attributes).toMatchObject({ column: null, fillEmpty: false, overwrite: false });
  });

  it("separar exige dejar al menos una ficha en el original", async () => {
    const { service } = setup();
    await expect(service.split("m1", [{ provider: "ELIT", externalId: "1" }])).rejects.toThrow("al menos una ficha");
    await expect(service.split("m1", [{ provider: "X", externalId: "9" }])).rejects.toThrow("no pertenece");
  });
});
