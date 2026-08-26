import { candidateWhere, resolveRunPriority } from "./image-sync-candidates";

describe("image-sync-candidates", () => {
  it("prioriza el catálogo con stock mientras quede alguno", () => {
    expect(resolveRunPriority(12)).toBe("visible");
    expect(resolveRunPriority(0)).toBe("deferred");
  });

  it("filtra visibles por oferta activa con stock", () => {
    expect(candidateWhere(undefined, "visible")).toEqual({
      AND: [
        { AND: [{ OR: [{ imageUrl: null }, { imageUrl: "" }] }, { imageFills: { none: {} } }] },
        { offers: { some: { active: true, stock: { gt: 0 } } } },
      ],
    });
  });

  it("deja para después los sin stock, ocultos o sin oferta", () => {
    expect(candidateWhere("ELIT", "deferred")).toEqual({
      AND: [
        {
          AND: [
            { provider: "ELIT", AND: [{ OR: [{ imageUrl: null }, { imageUrl: "" }] }] },
            { imageFills: { none: {} } },
          ],
        },
        { offers: { none: { active: true, stock: { gt: 0 } } } },
      ],
    });
  });
});
