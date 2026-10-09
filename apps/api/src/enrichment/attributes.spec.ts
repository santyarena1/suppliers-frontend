import { mapSpecsToSchema, mergeAttributes, parseAttributeValue } from "./attributes";
import { schemaFor } from "./schemas";

const gpu = schemaFor("gpu");
const def = (key: string) => gpu.attributes.find((a) => a.key === key)!;

describe("atributos", () => {
  it("lee números con unidad y convierte a la unidad canónica", () => {
    expect(parseAttributeValue(def("memory_gb"), "8 GB")).toBe(8);
    expect(parseAttributeValue(def("boost_clock_mhz"), "2,6 GHz")).toBe(2600);
    expect(parseAttributeValue(def("length_mm"), "22,9 cm")).toBe(229);
    expect(parseAttributeValue(def("warranty_months"), "3 años")).toBe(36);
    expect(parseAttributeValue(def("memory_gb"), "sin dato")).toBeNull();
  });

  it("enum: solo valores permitidos, tolerando guiones y texto extra", () => {
    expect(parseAttributeValue(def("memory_type"), "gddr7")).toBe("GDDR7");
    expect(parseAttributeValue(def("chipset_brand"), "NVIDIA")).toBe("NVIDIA");
    expect(parseAttributeValue(def("memory_type"), "HBM9")).toBeNull();
    expect(parseAttributeValue(schemaFor("psu").attributes.find((a) => a.key === "efficiency")!, "80 PLUS Gold certified")).toBe("80 PLUS Gold");
  });

  it("booleanos en español e inglés", () => {
    const wifi = schemaFor("motherboard").attributes.find((a) => a.key === "wifi")!;
    expect(parseAttributeValue(wifi, "Sí")).toBe(true);
    expect(parseAttributeValue(wifi, "No")).toBe(false);
    expect(parseAttributeValue(wifi, "tal vez")).toBeNull();
  });

  it("lleva specs crudas al esquema por alias, sin tildes ni mayúsculas", () => {
    const attrs = mapSpecsToSchema(gpu, [
      { name: "Capacidad memoria de adaptador gráfico", value: "8 GB" },
      { name: "Longitud", value: "229 mm" },
      { name: "Algo que no está", value: "x" },
    ], "icecat", 0.9);
    expect(attrs.memory_gb).toMatchObject({ value: 8, unit: "GB", source: "icecat", confidence: 0.9 });
    expect(attrs.length_mm.value).toBe(229);
    expect(Object.keys(attrs)).toHaveLength(2);
  });

  it("al combinar gana la fuente más confiable y una discrepancia baja la confianza", () => {
    const merged = mergeAttributes(
      { memory_gb: { value: 8, source: "icecat", confidence: 0.9 } },
      { memory_gb: { value: 16, source: "ai", confidence: 0.7 } },
      { fans: { value: 2, source: "ai", confidence: 0.3 } }
    );
    expect(merged.memory_gb.value).toBe(8);
    expect(merged.memory_gb.confidence).toBeCloseTo(0.72);
    expect(merged.memory_gb.evidence).toContain("ai dice 16");
    expect(merged.fans.value).toBe(2);
  });
});
