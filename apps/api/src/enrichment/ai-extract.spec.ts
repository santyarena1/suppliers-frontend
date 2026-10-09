import {
  AI_EVIDENCED_CONFIDENCE,
  AI_UNEVIDENCED_CONFIDENCE,
  buildExtractionPrompt,
  descriptionIsGrounded,
  estimateCostUsd,
  validateExtraction,
} from "./ai-extract";
import { schemaFor } from "./schemas";

const ram = schemaFor("ram");
const SOURCE = "Memoria Kingston Fury Beast DDR4 16GB 3200MHz CL16 DIMM. Garantía: 3 años.";

describe("extracción de atributos con IA (validada)", () => {
  it("el prompt incluye el esquema y los textos con su origen", () => {
    const prompt = buildExtractionPrompt(ram, "Memoria Fury", [{ origin: "ELIT", text: SOURCE }]);
    expect(prompt).toContain('"key":"speed_mhz"');
    expect(prompt).toContain("(ELIT) Memoria Kingston");
  });

  it("acepta lo que tiene evidencia literal y baja la confianza de lo que no", () => {
    const response = {
      attributes: {
        capacity_gb: { value: 16, evidence: "DDR4 16GB" },
        speed_mhz: { value: 3200, evidence: "3200MHz" },
        memory_type: { value: "DDR4", evidence: "DDR4" },
        cas_latency: { value: 18, evidence: "CL18" }, // no está en el texto
        rgb: { value: true, evidence: "" },
      },
    };
    const out = validateExtraction(ram, response, SOURCE);
    expect(out.capacity_gb).toMatchObject({ value: 16, unit: "GB", source: "ai", confidence: AI_EVIDENCED_CONFIDENCE });
    expect(out.speed_mhz.confidence).toBe(AI_EVIDENCED_CONFIDENCE);
    expect(out.memory_type.value).toBe("DDR4");
    expect(out.cas_latency.confidence).toBe(AI_UNEVIDENCED_CONFIDENCE);
    expect(out.rgb.confidence).toBe(AI_UNEVIDENCED_CONFIDENCE);
  });

  it("descarta valores fuera del esquema y claves desconocidas", () => {
    const out = validateExtraction(ram, { attributes: { memory_type: { value: "DDR9", evidence: "DDR4" }, inventado: { value: 1 } } }, SOURCE);
    expect(out).toEqual({});
    expect(validateExtraction(ram, "basura", SOURCE)).toEqual({});
  });

  it("un número convertido (1 TB → 1000 GB) cuenta como respaldado", () => {
    const out = validateExtraction(schemaFor("storage_ssd"), { attributes: { capacity_gb: { value: 1000, evidence: "1TB" } } }, "SSD Kingston NV2 1TB NVMe");
    expect(out.capacity_gb.confidence).toBe(AI_EVIDENCED_CONFIDENCE);
  });

  it("una descripción con números que no están en los datos se descarta", () => {
    expect(descriptionIsGrounded("Memoria DDR4 de 16 GB a 3200 MHz.", "Memoria Fury", ["16 GB", "3200 MHz", "DDR4"]).ok).toBe(true);
    const bad = descriptionIsGrounded("Memoria de 32 GB ideal para gaming.", "Memoria Fury", ["16 GB"]);
    expect(bad.ok).toBe(false);
    expect(bad.reason).toContain("32");
  });

  it("estima el costo por caracteres", () => {
    expect(estimateCostUsd(4_000_000, 0)).toBeCloseTo(0.15);
  });
});
