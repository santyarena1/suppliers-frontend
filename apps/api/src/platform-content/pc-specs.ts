/**
 * Armador de PC: qué categoría de la ficha enriquecida es cada paso y qué datos
 * de su ficha técnica sirven para chequear compatibilidad. Los nombres de las
 * especificaciones son los de AcuStock ("Socket", "Largo máximo de placa de video"…).
 * Un dato que no viene queda en null: la web lo muestra "para verificar", nunca
 * lo da por compatible.
 */

export const PC_STEPS = ["cpu", "mobo", "ram", "gpu", "ssd", "psu", "case", "cooler"] as const;
export type PcStep = (typeof PC_STEPS)[number];

/** Último nivel de categoría de AcuStock que corresponde a cada paso. */
export const PC_STEP_CATEGORIES: Record<PcStep, string[]> = {
  cpu: ["Procesadores"],
  mobo: ["Motherboards"],
  ram: ["Memorias para PC"],
  gpu: ["Placas de video"],
  ssd: ["Discos SSD", "Discos rígidos (HDD)"],
  psu: ["Fuentes de poder"],
  case: ["Gabinetes"],
  cooler: ["Coolers de procesador", "Refrigeración líquida"],
};

export function isPcStep(value: unknown): value is PcStep {
  return typeof value === "string" && (PC_STEPS as readonly string[]).includes(value);
}

type Spec = { name: string; value: unknown };

/** "1.500 MHz" → 1500, "4,7 GHz" → 4.7, "650 W" → 650. */
export function specNumber(value: unknown): number | null {
  if (value == null) return null;
  const m = String(value).replace(/\.(?=\d{3}\b)/g, "").replace(",", ".").match(/\d+(\.\d+)?/);
  return m ? Number(m[0]) : null;
}

function specList(value: unknown): string[] {
  if (value == null) return [];
  return String(value).split(/,\s*/).map((s) => s.trim()).filter(Boolean);
}

function yesNo(value: unknown): boolean | null {
  if (value == null) return null;
  const v = String(value).trim().toLowerCase();
  if (v === "sí" || v === "si") return true;
  if (v === "no") return false;
  return null;
}

export type PcCompat = Record<string, string | number | boolean | string[] | null>;

/** Datos de compatibilidad de una ficha, según el paso. */
export function pcCompat(step: PcStep, specsRaw: unknown, category: string[]): PcCompat {
  const specs = Array.isArray(specsRaw) ? (specsRaw as Spec[]) : [];
  const s = (name: string): unknown => specs.find((x) => x.name === name)?.value ?? null;
  const str = (name: string): string | null => {
    const v = s(name);
    return v == null || String(v).trim() === "" ? null : String(v).trim();
  };
  switch (step) {
    case "cpu":
      return {
        socket: str("Socket"),
        memory: specList(s("Memoria soportada")),
        tdp: specNumber(s("TDP")),
        cores: specNumber(s("Núcleos")),
        threads: specNumber(s("Hilos")),
        boost: str("Frecuencia turbo"),
        igpu: yesNo(s("Gráficos integrados")),
        cooler: yesNo(s("Incluye cooler")),
        line: str("Línea"),
      };
    case "mobo":
      return {
        socket: str("Socket"),
        chipset: str("Chipset"),
        memory: str("Tipo de memoria"),
        form: str("Formato"),
        slots: specNumber(s("Ranuras de memoria")),
        maxMemory: specNumber(s("Memoria máxima")),
        m2: specNumber(s("Ranuras M.2")),
        maxFreq: specNumber(s("Frecuencia de memoria máxima")),
        wifi: yesNo(s("WiFi integrado")),
      };
    case "ram":
      return {
        type: str("Tipo"),
        capacity: specNumber(s("Capacidad total")),
        modules: specNumber(s("Módulos")),
        freq: specNumber(s("Frecuencia")),
        cl: specNumber(s("Latencia (CL)")),
      };
    case "gpu":
      return {
        chip: str("Modelo de chip"),
        vram: specNumber(s("Memoria")),
        length: specNumber(s("Largo")),
        tgp: specNumber(s("Consumo (TGP)")),
        recommendedPsu: specNumber(s("Fuente recomendada")),
        power: str("Conectores de alimentación"),
      };
    case "ssd":
      return {
        capacity: specNumber(s("Capacidad")),
        iface: str("Interfaz"),
        form: str("Formato"),
        read: specNumber(s("Lectura secuencial")),
        hdd: category.includes("Discos rígidos (HDD)"),
      };
    case "psu":
      return {
        watts: specNumber(s("Potencia")),
        cert: str("Certificación"),
        modular: str("Modular"),
        form: str("Formato"),
        hpwr: yesNo(s("Conector 12VHPWR / 12V-2x6")),
      };
    case "case":
      return {
        forms: specList(s("Motherboards soportadas")),
        gpuMax: specNumber(s("Largo máximo de placa de video")),
        coolerMax: specNumber(s("Altura máxima de cooler")),
        radiatorMax: specNumber(s("Radiador máximo")),
        psuIncluded: yesNo(s("Incluye fuente")),
        psuWatts: specNumber(s("Potencia de la fuente incluida")),
        type: str("Tipo"),
      };
    case "cooler": {
      const liquid = category.includes("Refrigeración líquida");
      return {
        kind: liquid ? "liquid" : "air",
        sockets: specList(s("Sockets compatibles")),
        height: liquid ? null : specNumber(s("Altura")),
        tdp: specNumber(s("TDP soportado")),
        radiator: liquid ? specNumber(s("Radiador")) : null,
      };
    }
  }
}
