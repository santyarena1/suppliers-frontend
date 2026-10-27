import { gpuPcieConnectors, isPcStep, pcCompat, pcCompatWithEstimates, pcieGen, specNumber } from "./pc-specs";

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

describe("datos nuevos del armador", () => {
  it("lee la generación PCIe y los conectores de la placa", () => {
    expect(pcieGen("PCIe 4.0 x8")).toBe(4);
    expect(pcieGen("NVMe PCIe 5.0")).toBe(5);
    expect(pcieGen("SATA III")).toBeNull();
    expect(gpuPcieConnectors("2x 8 pines")).toBe(2);
    expect(gpuPcieConnectors("1x 6 pines + 1x 8 pines")).toBe(2);
    expect(gpuPcieConnectors("1x 16 pines (12V-2x6)")).toBe(0);
    expect(gpuPcieConnectors("Sin conector (alimentación por slot PCIe)")).toBe(0);
    expect(gpuPcieConnectors(null)).toBeNull();
  });

  it("marca lo que estimó la IA, solo si el dato vino", () => {
    const r = pcCompatWithEstimates("gpu", [
      { name: "Largo", value: "305 mm", estimated: true },
      { name: "Memoria", value: "12 GB" },
      { name: "Consumo (TGP)", value: "", estimated: true },
      { name: "Conectores de alimentación", value: "1x 8 pines", estimated: true },
    ], ["Placas de video"]);
    expect(r.compat).toMatchObject({ length: 305, vram: 12, pcie8: 1 });
    expect(r.estimated.sort()).toEqual(["length", "pcie8", "power"]);
  });

  it("gabinete y líquida: formatos de fuente, ranuras y TDP", () => {
    expect(pcCompat("case", [
      { name: "Formatos de fuente soportados", value: "ATX, SFX" },
      { name: "Ranuras de expansión", value: "7" },
      { name: "Ventiladores incluidos", value: "3" },
    ], ["Gabinetes"])).toMatchObject({ psuForms: ["ATX", "SFX"], slots: 7, fans: 3 });
    expect(pcCompat("cooler", [{ name: "Radiador", value: "360 mm" }, { name: "TDP soportado", value: "300 W" }], ["Refrigeración líquida"])).toMatchObject({ kind: "liquid", radiator: 360, tdp: 300, height: null });
    expect(pcCompat("cooler", [{ name: "Radiador", value: "240 mm" }], ["Coolers de procesador"], "Cooler AIO Arctic Liquid Freezer III 240")).toMatchObject({ kind: "liquid", radiator: 240 });
  });
});

describe("isPcStep", () => {
  it("acepta solo los pasos conocidos", () => {
    expect(isPcStep("cpu")).toBe(true);
    expect(isPcStep("monitor")).toBe(false);
  });
});
