import { buildProposals, BuildInput, shortText } from "./proposal-builder";
import { schemaFor } from "./schemas";
import { emptyResult, SourceResult } from "./sources/types";

const icecat = (extra: Partial<SourceResult> = {}): SourceResult => ({
  ...emptyResult("icecat", "icecat"),
  verified: true,
  url: "https://icecat.biz/p/1",
  description: "Resumen de Icecat del producto",
  longDescription: "Descripción larga de Icecat con bastante detalle del producto.",
  ...extra,
});

const base = (extra: Partial<BuildInput> = {}): BuildInput => ({
  categoryKey: "gpu",
  categoryVia: "category",
  schema: schemaFor("gpu"),
  icecat: null,
  manufacturer: null,
  images: [],
  attributes: {},
  aiText: null,
  ...extra,
});

const field = (drafts: ReturnType<typeof buildProposals>, f: string) => drafts.find((d) => d.field === f);

describe("armado de propuestas", () => {
  it("galería: oficial > Icecat > distribuidor, sin las rechazadas", () => {
    const drafts = buildProposals(
      base({
        images: [
          { url: "d1", source: "distributor", origin: "ELIT", ok: true },
          { url: "i1", source: "icecat", origin: "icecat", ok: true },
          { url: "m1", source: "manufacturer", origin: "asus", ok: true },
          { url: "bad", source: "manufacturer", origin: "asus", ok: false, reason: "chica" },
        ],
      })
    );
    const images = field(drafts, "images")!;
    expect((images.value.images as { url: string }[]).map((i) => i.url)).toEqual(["m1", "i1", "d1"]);
    expect(images.confidence).toBe(0.95);
    expect(images.evidence.rejected).toEqual([{ url: "bad", source: "manufacturer", reason: "chica" }]);
  });

  it("textos: Icecat primero; la IA solo si no hay fuente oficial", () => {
    const withIcecat = buildProposals(base({ icecat: icecat(), aiText: { description: "texto de la IA largo", longDescription: null } }));
    expect(field(withIcecat, "description")).toMatchObject({ source: "icecat", confidence: 0.85 });
    const onlyAi = buildProposals(base({ aiText: { description: "Placa de video con 8 GB GDDR7.", longDescription: null } }));
    expect(field(onlyAi, "description")).toMatchObject({ source: "ai", confidence: 0.6 });
    expect(field(onlyAi, "longDescription")).toBeUndefined();
  });

  it("la descripción corta oficial es la primera oración; la larga, el texto completo", () => {
    const long = "Teclado mecánico compacto con switches rojos. Tiene iluminación RGB y cuerpo de aluminio. ".repeat(4);
    const drafts = buildProposals(base({ manufacturer: { ...emptyResult("redragon", "manufacturer"), verified: true, description: long } }));
    expect(field(drafts, "description")?.value.text).toBe("Teclado mecánico compacto con switches rojos.");
    expect(field(drafts, "longDescription")?.value.text).toBe(long.trim());
    expect(shortText("x".repeat(300))).toHaveLength(201);
  });

  it("ignora resultados externos no verificados", () => {
    const drafts = buildProposals(base({ icecat: icecat({ verified: false }) }));
    expect(field(drafts, "description")).toBeUndefined();
  });

  it("atributos con versión de esquema y confianza promedio; categoría con su origen", () => {
    const drafts = buildProposals(
      base({
        categoryVia: "icecat",
        attributes: {
          memory_gb: { value: 8, unit: "GB", source: "icecat", confidence: 0.9 },
          fans: { value: 2, source: "ai", confidence: 0.3 },
        },
      })
    );
    expect(field(drafts, "attributes")).toMatchObject({ source: "icecat,ai", confidence: 0.6, value: { schema: "gpu", version: 1 } });
    expect(field(drafts, "category")).toMatchObject({ value: { key: "gpu", label: "Placas de video" }, confidence: 0.95 });
  });
});
