import { isPcStep, pcCompat, specNumber } from "./pc-specs";

describe("specNumber", () => {
  it("lee números con miles y decimales en castellano", () => {
    expect(specNumber("6.400 MHz")).toBe(6400);
    expect(specNumber("4,7 GHz")).toBe(4.7);
    expect(specNumber("650 W")).toBe(650);
    expect(specNumber(null)).toBeNull();
    expect(specNumber("Sin dato")).toBeNull();
  });
});

describe("pcCompat", () => {
  it("procesador: socket, memorias, TDP, video y cooler", () => {
    const c = pcCompat("cpu", [
      { name: "Socket", value: "AM5" },
      { name: "Memoria soportada", value: "DDR5" },
      { name: "TDP", value: "65 W" },
      { name: "Gráficos integrados", value: "Sí" },
      { name: "Incluye cooler", value: "No" },
    ], ["Componentes", "Procesadores"]);
    expect(c).toMatchObject({ socket: "AM5", memory: ["DDR5"], tdp: 65, igpu: true, cooler: false });
  });

  it("gabinete: formatos y medidas", () => {
    const c = pcCompat("case", [
      { name: "Motherboards soportadas", value: "ATX, Micro-ATX, Mini-ITX" },
      { name: "Largo máximo de placa de video", value: "345 mm" },
      { name: "Incluye fuente", value: "No" },
    ], ["Gabinetes"]);
    expect(c).toMatchObject({ forms: ["ATX", "Micro-ATX", "Mini-ITX"], gpuMax: 345, coolerMax: null, psuIncluded: false });
  });

  it("refrigeración: distingue líquida de aire", () => {
    expect(pcCompat("cooler", [{ name: "Radiador", value: "240 mm" }], ["Refrigeración líquida"])).toMatchObject({ kind: "liquid", radiator: 240, height: null });
    expect(pcCompat("cooler", [{ name: "Altura", value: "155 mm" }], ["Coolers de procesador"])).toMatchObject({ kind: "air", height: 155 });
  });

  it("sin datos no inventa nada", () => {
    expect(pcCompat("gpu", [], ["Placas de video"])).toMatchObject({ length: null, tgp: null, recommendedPsu: null });
  });
});

describe("isPcStep", () => {
  it("acepta solo los pasos conocidos", () => {
    expect(isPcStep("cpu")).toBe(true);
    expect(isPcStep("monitor")).toBe(false);
  });
});
