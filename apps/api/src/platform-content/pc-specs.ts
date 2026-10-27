/**
 * Armador de PC: qué categoría de la ficha enriquecida es cada paso y qué datos
 * de su ficha técnica sirven para chequear compatibilidad. Los nombres de las
 * especificaciones son los de AcuStock ("Socket", "Largo máximo de placa de video"…).
 * Un dato que no viene queda en null: la web lo muestra "para verificar", nunca
 * lo da por compatible. Un dato que completó la IA sin revisar llega marcado
 * (`estimated`) y la web lo muestra como estimado.
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

type Spec = { name: string; value: unknown; estimated?: boolean };

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

/** "PCIe 4.0 x16", "NVMe PCIe 5.0", "4.0" → 4. */
export function pcieGen(value: unknown): number | null {
  if (value == null) return null;
  const m = String(value).match(/(?:pcie|gen)?\s*(\d)(?:\.\d)?/i);
  const n = m ? Number(m[1]) : NaN;
  return n >= 1 && n <= 6 ? n : null;
}

/** Conectores de 8 pines (6+2) que pide una placa: "2x 8 pines", "1x 6 pines + 1x 8 pines" → 2. */
export function gpuPcieConnectors(value: unknown): number | null {
  if (value == null) return null;
  const v = String(value).toLowerCase();
  if (/sin conector|slot pcie|alimentaci[oó]n por slot/.test(v)) return 0;
  let total = 0;
  let found = false;
  for (const m of v.matchAll(/(\d+)\s*x\s*(6\+2|8|6)\s*pines?/g)) {
    total += Number(m[1]);
    found = true;
  }
  if (!found && /\b(6\+2|8|6)\s*pines?/.test(v)) return 1;
  if (!found && /16 pines|12v-2x6|12vhpwr/.test(v)) return 0;
  return found ? total : null;
}

export type PcCompat = Record<string, string | number | boolean | string[] | null>;

/** Cómo se lee cada dato: de qué especificación sale y cómo se interpreta. */
type Field = [spec: string, read: (v: unknown) => PcCompat[string]];

const text = (v: unknown) => (v == null || String(v).trim() === "" ? null : String(v).trim());
const FIELDS: Record<PcStep, Record<string, Field>> = {
  cpu: {
    socket: ["Socket", text],
    memory: ["Memoria soportada", specList],
    tdp: ["TDP", specNumber],
    cores: ["Núcleos", specNumber],
    threads: ["Hilos", specNumber],
    boost: ["Frecuencia turbo", text],
    igpu: ["Gráficos integrados", yesNo],
    cooler: ["Incluye cooler", yesNo],
    line: ["Línea", text],
    gen: ["Generación / serie", text],
    cache: ["Caché L3", specNumber],
  },
  mobo: {
    socket: ["Socket", text],
    chipset: ["Chipset", text],
    memory: ["Tipo de memoria", text],
    form: ["Formato", text],
    slots: ["Ranuras de memoria", specNumber],
    maxMemory: ["Memoria máxima", specNumber],
    m2: ["Ranuras M.2", specNumber],
    sata: ["Puertos SATA", specNumber],
    maxFreq: ["Frecuencia de memoria máxima", specNumber],
    pcie: ["Versión PCIe (x16)", pcieGen],
    pcieX16: ["Ranuras PCIe x16", specNumber],
    videoOut: ["Salidas de video", specList],
    wifi: ["WiFi integrado", yesNo],
  },
  ram: {
    type: ["Tipo", text],
    capacity: ["Capacidad total", specNumber],
    modules: ["Módulos", specNumber],
    freq: ["Frecuencia", specNumber],
    cl: ["Latencia (CL)", specNumber],
  },
  gpu: {
    chip: ["Modelo de chip", text],
    vram: ["Memoria", specNumber],
    length: ["Largo", specNumber],
    slots: ["Ranuras que ocupa", specNumber],
    tgp: ["Consumo (TGP)", specNumber],
    recommendedPsu: ["Fuente recomendada", specNumber],
    power: ["Conectores de alimentación", text],
    pcie8: ["Conectores de alimentación", gpuPcieConnectors],
    pcie: ["Interfaz", pcieGen],
    iface: ["Interfaz", text],
  },
  ssd: {
    capacity: ["Capacidad", specNumber],
    iface: ["Interfaz", text],
    form: ["Formato", text],
    read: ["Lectura secuencial", specNumber],
    write: ["Escritura secuencial", specNumber],
    pcie: ["Interfaz", (v) => (/nvme|pcie/i.test(String(v ?? "")) ? pcieGen(v) : null)],
  },
  psu: {
    watts: ["Potencia", specNumber],
    cert: ["Certificación", text],
    modular: ["Modular", text],
    form: ["Formato", text],
    hpwr: ["Conector 12VHPWR / 12V-2x6", yesNo],
    pcie: ["Conectores PCIe (6+2)", specNumber],
    atx3: ["ATX 3.0 / 3.1", yesNo],
  },
  case: {
    forms: ["Motherboards soportadas", specList],
    gpuMax: ["Largo máximo de placa de video", specNumber],
    coolerMax: ["Altura máxima de cooler", specNumber],
    radiatorMax: ["Radiador máximo", specNumber],
    psuIncluded: ["Incluye fuente", yesNo],
    psuWatts: ["Potencia de la fuente incluida", specNumber],
    psuForms: ["Formatos de fuente soportados", specList],
    slots: ["Ranuras de expansión", specNumber],
    fans: ["Ventiladores incluidos", specNumber],
    bays35: ['Bahías de 3,5"', specNumber],
    bays25: ['Bahías de 2,5"', specNumber],
    type: ["Tipo", text],
  },
  cooler: {
    sockets: ["Sockets compatibles", specList],
    height: ["Altura", specNumber],
    tdp: ["TDP soportado", specNumber],
    radiator: ["Radiador", specNumber],
    fans: ["Ventiladores", specNumber],
  },
};

/** Datos de compatibilidad de una ficha, según el paso, y cuáles completó la IA sin revisar. */
export function pcCompatWithEstimates(
  step: PcStep,
  specsRaw: unknown,
  category: string[],
  name = ""
): { compat: PcCompat; estimated: string[] } {
  const specs = Array.isArray(specsRaw) ? (specsRaw as Spec[]) : [];
  const compat: PcCompat = {};
  const estimated: string[] = [];
  for (const [key, [specName, read]] of Object.entries(FIELDS[step])) {
    const spec = specs.find((x) => x.name === specName);
    const value = read(spec?.value ?? null);
    compat[key] = value;
    const has = value != null && !(Array.isArray(value) && value.length === 0);
    if (has && spec?.estimated) estimated.push(key);
  }
  if (step === "ssd") compat.hdd = category.includes("Discos rígidos (HDD)");
  if (step === "cooler") {
    const liquid =
      category.includes("Refrigeración líquida") ||
      (!category.includes("Coolers de procesador") && compat.radiator != null) ||
      /\b(aio|refrigeraci[oó]n l[ií]quida|water ?cool|liquid)\b/i.test(name);
    compat.kind = liquid ? "liquid" : "air";
    if (liquid) compat.height = null;
    else compat.radiator = null;
  }
  return { compat, estimated: estimated.filter((k) => compat[k] != null) };
}

export function pcCompat(step: PcStep, specsRaw: unknown, category: string[], name = ""): PcCompat {
  return pcCompatWithEstimates(step, specsRaw, category, name).compat;
}
