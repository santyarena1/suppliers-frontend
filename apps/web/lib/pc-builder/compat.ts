/**
 * Compatibilidad del armador de PC. Cada chequeo usa los datos técnicos de la
 * ficha (ver API_CONTRACT: /pc-builder/parts). Si falta un dato el resultado es
 * "verificar", nunca "compatible". Si el dato lo completó la IA sin revisar
 * (`estimated`), el chequeo lo dice y un "no entra" queda como "verificar".
 */
import type { ProductDTO } from "@/lib/api";

export type PcStep = "cpu" | "mobo" | "ram" | "gpu" | "ssd" | "psu" | "case" | "cooler";

export interface PcPart {
  contentId: string;
  name: string;
  brand: string | null;
  image: string | null;
  compat: Record<string, string | number | boolean | string[] | null>;
  /** Datos de `compat` que completó la IA sin revisar. */
  estimated?: string[];
  offers: ProductDTO[];
}

export type Level = "ok" | "warn" | "bad";
export interface Check {
  parts: PcStep[];
  /** Qué paso se marca en pantalla (por defecto, todos los de parts). */
  owner?: PcStep;
  name: string;
  level: Level;
  text: string;
  /** Se apoyó en un dato estimado por IA. */
  estimated?: boolean;
}

export type Build = Partial<Record<PcStep, PcPart>>;
/** Cantidad elegida de cada pieza (dos kits de memoria, dos discos). Sin dato = 1. */
export type Qty = Partial<Record<PcStep, number>>;

export const STEP_LABEL: Record<PcStep, string> = {
  cpu: "Procesador",
  mobo: "Mother",
  ram: "Memoria RAM",
  gpu: "Placa de video",
  ssd: "Almacenamiento",
  psu: "Fuente",
  case: "Gabinete",
  cooler: "Refrigeración",
};

/** Datos que leyó el chequeo en curso: si alguno es estimado, el chequeo lo avisa. */
let touched: [PcPart, string][] | null = null;
const read = (p: PcPart | undefined, k: string) => {
  if (p && touched) touched.push([p, k]);
  return p?.compat[k];
};
const n = (p: PcPart | undefined, k: string): number | null => {
  const v = read(p, k);
  return typeof v === "number" ? v : null;
};
const s = (p: PcPart | undefined, k: string): string | null => {
  const v = read(p, k);
  return typeof v === "string" && v ? v : null;
};
const list = (p: PcPart | undefined, k: string): string[] => {
  const v = read(p, k);
  return Array.isArray(v) ? v : [];
};
const b = (p: PcPart | undefined, k: string): boolean | null => {
  const v = read(p, k);
  return typeof v === "boolean" ? v : null;
};
const sock = (x: string | null) => (x ?? "").toUpperCase().replace(/\s+/g, "");
const form = (x: string | null) => (x ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
const ddr = (x: string | null) => (x ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
const ar = (x: number) => x.toLocaleString("es-AR");
const qtyOf = (qty: Qty, step: PcStep) => Math.max(1, qty[step] ?? 1);
/** Nombre corto del producto para los avisos. */
const short = (p: PcPart) => {
  // Sin la categoría adelante: "la placa ASUS GT710", no "la placa Placa de Video ASUS GT710".
  const name = p.name.replace(/^(placa de video|vga|motherboard|mother|mb|gabinete|gab|fuente( de poder)?|cooler|refrigeraci[oó]n l[ií]quida|procesador|cpu|memoria( ram)?|disco( s[oó]lido)?( ssd)?|ssd)\s+/i, "");
  return name.length > 46 ? `${name.slice(0, 44).trimEnd()}…` : name;
};
/** "la mother X y el gabinete Y no informan el formato": a quién le falta qué dato. */
function lacks(what: string, items: [unknown, string, PcPart][]): string {
  const m = items.filter(([v]) => v == null || v === "" || (Array.isArray(v) && !v.length)).map(([, role, p]) => `${role} ${short(p)}`);
  const who = m.join(" y ");
  return `${who.charAt(0).toUpperCase()}${who.slice(1)} no informa${m.length > 1 ? "n" : ""} ${what}`;
}

/** Si un dato de la pieza lo estimó la IA (no está revisado). */
export const isEstimated = (p: PcPart | undefined, key: string) => Boolean(p?.estimated?.includes(key));

/** Tipo de disco, para saber dónde va: ranura M.2, puerto SATA y bahía. */
export function driveKind(p: PcPart | undefined): "m2" | "sata25" | "hdd35" | "hdd25" | null {
  if (!p) return null;
  const f = s(p, "form") ?? "";
  if (/m\.?2/i.test(f)) return "m2";
  if (b(p, "hdd")) return /2[.,]5/.test(f) ? "hdd25" : "hdd35";
  if (/2[.,]5/.test(f)) return "sata25";
  return null;
}

/** Consumo estimado (todas las piezas, con cantidades) y la fuente recomendada, con margen. */
/**
 * Largo típico (el más largo habitual) de una placa sin el dato en su ficha: por cantidad de
 * ventiladores y gama. Sirve para no marcar "verificar" en un gabinete donde entra cualquiera así.
 */
export function typicalGpuLength(p: PcPart): number {
  const text = `${s(p, "chip") ?? ""} ${p.name}`;
  if (/\b(low\s*profile|lp|itx|mini|single\s*fan|1\s*fan)\b/i.test(text)) return 210;
  const top = /rtx\s*(4080|4090|5080|5090)|rx\s*7900|rx\s*9070\s*xt|rtx\s*5070\s*ti/i.test(text);
  if (/\b(triple|trio|3\s*x|3x|x3|3\s*fan|tri-?frozr|windforce|eagle|gaming\s*x|tuf|strix|aorus|nitro|taichi|steel\s*legend|hellhound|red\s*devil|reaper)\b/i.test(text)) return top ? 340 : 310;
  if (/\b(dual|twin|2\s*x|2x|x2|2\s*fan|challenger|ventus\s*2x|windforce\s*2|pulse|fighter)\b/i.test(text)) return top ? 300 : 260;
  if (top) return 330;
  return (n(p, "vram") ?? 8) <= 8 ? 250 : 290;
}

export function powerNeed(build: Build, qty: Qty = {}): { estimate: number; recommended: number } | null {
  if (!build.cpu && !build.gpu) return null;
  const cpu = n(build.cpu, "tdp") ?? 65;
  const rec = n(build.gpu, "recommendedPsu");
  const gpu = build.gpu ? (n(build.gpu, "tgp") ?? (rec ? Math.max(75, rec - 250) : 150)) * qtyOf(qty, "gpu") : 0;
  const ramModules = build.ram ? (n(build.ram, "modules") ?? 2) * qtyOf(qty, "ram") : 2;
  const drives = build.ssd ? qtyOf(qty, "ssd") * (b(build.ssd, "hdd") ? 8 : 5) : 5;
  const fans = (n(build.case, "fans") ?? 2) + (n(build.cooler, "fans") ?? 1);
  // Mother, memorias, discos y ventiladores; el resto de la placa base y USB va en los 40 W fijos.
  const estimate = Math.round(cpu + gpu + 40 + ramModules * 4 + drives + fans * 3);
  return { estimate, recommended: Math.max(Math.ceil((estimate * 1.3) / 50) * 50, rec ?? 0) };
}

/** Potencia disponible: la fuente elegida o la que trae el gabinete. */
export function psuWatts(build: Build): number | null {
  if (build.psu) return n(build.psu, "watts");
  if (build.case && b(build.case, "psuIncluded")) return n(build.case, "psuWatts");
  return null;
}

/** Generación del procesador para el chequeo de BIOS: "ryzen-5000", "intel-14"… */
export function cpuFamily(p: PcPart | undefined): { brand: "AMD" | "Intel"; series: number } | null {
  if (!p) return null;
  const name = p.name;
  const ryzen = name.match(/ryzen\s*(?:\d\s*(?:pro\s*)?)?(\d)(\d{3})/i);
  if (ryzen) return { brand: "AMD", series: Number(ryzen[1]) * 1000 };
  const intel = name.match(/\bi[3579][\s-]*(\d{2})(\d{3})/i) ?? name.match(/\b(1[0-4])(\d{3})[a-z]{0,2}\b/i);
  if (intel && /intel|core|\bi[3579]\b|pentium|celeron/i.test(name)) return { brand: "Intel", series: Number(intel[1]) };
  return null;
}

/** Serie del chipset: "B450" → { letter: "B", series: 400 }; "Z790" → 700. */
export function chipsetSeries(chipset: string | null): { letter: string; series: number; code: string } | null {
  const m = (chipset ?? "").toUpperCase().match(/\b([ABHQXZ])\s?(\d)(\d{2})\b/);
  return m ? { letter: m[1], series: Number(m[2]) * 100, code: `${m[1]}${m[2]}${m[3]}` } : null;
}

/**
 * Procesador más nuevo que la mother: entra en el socket pero puede necesitar
 * una actualización de BIOS (o no estar soportado). null si no aplica o no se sabe.
 */
export function biosRisk(cpu: PcPart | undefined, mobo: PcPart | undefined): [Level, string] | null {
  const fam = cpuFamily(cpu);
  const chip = chipsetSeries(s(mobo, "chipset"));
  const socket = sock(s(mobo, "socket"));
  if (!fam || !chip) return null;
  if (fam.brand === "AMD" && socket === "AM4") {
    if (fam.series >= 5000 && chip.series === 300) return ["warn", `Un Ryzen ${fam.series} en una ${chip.code} necesita BIOS actualizado, y no todas las ${chip.code} lo soportan. Confirmá la versión de BIOS con el distribuidor.`];
    if (fam.series >= 5000 && chip.series === 400) return ["warn", `Un Ryzen ${fam.series} en una ${chip.code} necesita BIOS actualizado. Pedí al distribuidor que confirme la versión o que venga actualizada.`];
  }
  if (fam.brand === "AMD" && socket === "AM5" && fam.series >= 9000 && chip.series === 600) {
    return ["warn", `Un Ryzen ${fam.series} en una ${chip.code} necesita BIOS actualizado. La mayoría ya sale actualizada: confirmalo con el distribuidor.`];
  }
  if (fam.brand === "Intel" && socket === "LGA1700" && fam.series >= 13 && chip.series === 600) {
    return ["warn", `Un Intel de ${fam.series}.ª generación en una ${chip.code} necesita BIOS actualizado. Confirmá la versión con el distribuidor.`];
  }
  if (fam.brand === "Intel" && socket === "LGA1200" && fam.series === 11 && (chip.code === "H410" || chip.code === "B460")) {
    return ["bad", `Las ${chip.code} no soportan Intel de 11.ª generación.`];
  }
  return null;
}

type Rule = { parts: PcStep[]; name: string; run: (x: Required<Build>, qty: Qty) => [Level, string] | null };

const RULES: Rule[] = [
  {
    parts: ["cpu", "mobo"],
    name: "Socket",
    run: ({ cpu, mobo }) => {
      const a = s(cpu, "socket"), m = s(mobo, "socket");
      if (!a || !m) return ["warn", `${lacks("el socket", [[a, "el procesador", cpu], [m, "la mother", mobo]])}. Revisalo en la web del fabricante.`];
      return sock(a) === sock(m) ? ["ok", `${a} en procesador y mother.`] : ["bad", `El procesador es ${a} y la mother ${m}.`];
    },
  },
  {
    parts: ["cpu", "mobo"],
    name: "BIOS",
    run: ({ cpu, mobo }) => (sock(s(cpu, "socket")) && sock(s(cpu, "socket")) === sock(s(mobo, "socket")) ? biosRisk(cpu, mobo) : null),
  },
  {
    parts: ["cpu", "mobo"],
    name: "Memoria del procesador",
    run: ({ cpu, mobo }) => {
      const mem = list(cpu, "memory").map(ddr), m = s(mobo, "memory");
      if (!mem.length || !m || mem.includes(ddr(m))) return null;
      return ["bad", `El procesador no soporta ${m} (${list(cpu, "memory").join(" / ")}).`];
    },
  },
  {
    parts: ["ram", "mobo"],
    name: "Memoria",
    run: ({ ram, mobo }, qty) => {
      const t = s(ram, "type"), m = s(mobo, "memory");
      if (!t || !m) return ["warn", `${lacks("el tipo de memoria", [[t, "la memoria", ram], [m, "la mother", mobo]])}. Revisalo en la web del fabricante.`];
      if (ddr(t) !== ddr(m)) return ["bad", `La memoria es ${t} y la mother usa ${m}.`];
      const kits = qtyOf(qty, "ram");
      const per = n(ram, "modules"), slots = n(mobo, "slots"), cap = n(ram, "capacity"), max = n(mobo, "maxMemory");
      const mods = per != null ? per * kits : null;
      const total = cap != null ? cap * kits : null;
      if (mods && slots && mods > slots) return ["bad", `Son ${mods} módulos${kits > 1 ? ` (${kits} kits)` : ""} y la mother tiene ${slots} ranuras.`];
      if (total && max && total > max) return ["bad", `${total} GB supera el máximo de la mother (${max} GB).`];
      const f = n(ram, "freq"), mf = n(mobo, "maxFreq");
      if (f && mf && f > mf) return ["warn", `Va a funcionar a ${ar(mf)} MHz, no a ${ar(f)} MHz.`];
      if (kits > 1 && per === 2) return ["warn", `${kits} kits de a 2 en ${slots ?? "?"} ranuras: dos kits separados pueden no andar a la frecuencia anunciada. Mejor un kit de ${mods} módulos.`];
      return ["ok", `${t}, ${mods ?? "?"} de ${slots ?? "?"} ranuras${total ? `, ${total} GB` : ""}.`];
    },
  },
  {
    parts: ["mobo", "case"],
    name: "Formato",
    run: ({ mobo, case: c }) => {
      const f = s(mobo, "form"), forms = list(c, "forms");
      if (!f || !forms.length) return ["warn", `${lacks("el formato", [[f, "la mother", mobo], [forms, "el gabinete", c]])}${f ? `; la mother es ${f}` : ""}. Revisá que entre.`];
      return forms.some((x) => form(x) === form(f)) ? ["ok", `Mother ${f} en un gabinete para ${forms.join(", ")}.`] : ["bad", `La mother es ${f} y el gabinete admite ${forms.join(", ")}.`];
    },
  },
  {
    parts: ["gpu", "case"],
    name: "Largo de la placa",
    run: ({ gpu, case: c }) => {
      const l = n(gpu, "length"), max = n(c, "gpuMax");
      // Sin el dato, el largo típico de esa placa: solo se avisa si con ese largo podría no entrar.
      const typical = l ? null : typicalGpuLength(gpu);
      const len = l ?? typical!;
      if (!max) {
        // Casi cualquier gabinete de torre admite 280 mm.
        if (len <= 280) return ["ok", l ? `${l} mm: entra en casi cualquier gabinete.` : "Placa corta: entra en casi cualquier gabinete."];
        return ["warn", `El gabinete ${short(c)} no informa el largo máximo de placa y la placa ${l ? `mide ${l} mm` : `suele medir unos ${typical} mm`}. Revisá que entre.`];
      }
      if (l) return l <= max ? ["ok", `${l} mm; el gabinete admite hasta ${max} mm.`] : ["bad", `La placa mide ${l} mm y el gabinete admite ${max} mm.`];
      return typical! <= max
        ? ["ok", `Entra: una placa así suele medir hasta ${typical} mm y el gabinete admite ${max} mm.`]
        : ["warn", `La placa ${short(gpu)} no informa su largo y las de su tipo suelen medir unos ${typical} mm; este gabinete admite ${max} mm. Medila antes de confirmar.`];
    },
  },
  {
    parts: ["gpu", "case"],
    name: "Grosor de la placa",
    run: ({ gpu, case: c }) => {
      const used = n(gpu, "slots"), have = n(c, "slots");
      if (used == null || have == null) return null;
      const need = Math.ceil(used);
      return need <= have ? null : ["bad", `La placa ocupa ${ar(used)} ranuras y el gabinete tiene ${have}.`];
    },
  },
  {
    parts: ["gpu", "mobo"],
    name: "PCI Express",
    run: ({ gpu, mobo }) => {
      const g = n(gpu, "pcie"), m = n(mobo, "pcie");
      if (g == null || m == null || g <= m) return null;
      const x8 = /x8|x4/i.test(s(gpu, "iface") ?? "");
      return [x8 ? "warn" : "ok", x8 ? `La placa es PCIe ${g}.0 de 8 líneas y la mother PCIe ${m}.0: anda, pero rinde algo menos.` : `La placa es PCIe ${g}.0 y la mother ${m}.0: anda sin diferencia notable.`];
    },
  },
  {
    parts: ["cooler", "cpu"],
    name: "Cooler y socket",
    run: ({ cooler, cpu }) => {
      const socks = list(cooler, "sockets"), a = s(cpu, "socket");
      // Casi todos los coolers traen los anclajes de los sockets actuales: sin dato, se da por compatible.
      if (!socks.length || !a) return ["ok", "Compatible."];
      if (!socks.some((x) => sock(x) === sock(a))) return ["bad", `El cooler no trae soporte para ${a}.`];
      const ct = n(cooler, "tdp"), pt = n(cpu, "tdp");
      if (ct && pt && ct < pt) return ["warn", `Disipa ${ct} W y el procesador tiene ${pt} W de TDP.`];
      return ["ok", `Soporta ${a}${ct && pt ? `; disipa ${ct} W para ${pt} W` : ""}.`];
    },
  },
  {
    parts: ["cooler", "case"],
    name: "Espacio para el cooler",
    run: ({ cooler, case: c }) => {
      if (s(cooler, "kind") === "liquid") {
        const r = n(cooler, "radiator"), max = n(c, "radiatorMax");
        // Sin las medidas se da por compatible: solo se avisa cuando los datos dicen que no entra.
        if (!r || !max) return ["ok", r ? `Radiador de ${r} mm.` : "Compatible."];
        return r <= max ? ["ok", `Radiador de ${r} mm; admite hasta ${max} mm.`] : ["bad", `El radiador es de ${r} mm y el gabinete admite ${max} mm.`];
      }
      const h = n(cooler, "height"), max = n(c, "coolerMax");
      if (!h || !max) return ["ok", h ? `${h} mm.` : "Compatible."];
      return h <= max ? ["ok", `${h} mm; el gabinete admite hasta ${max} mm.`] : ["bad", `El cooler mide ${h} mm y el gabinete admite ${max} mm.`];
    },
  },
  {
    parts: ["ssd", "mobo"],
    name: "Conexión del disco",
    run: ({ ssd, mobo }, qty) => {
      const kind = driveKind(ssd);
      const count = qtyOf(qty, "ssd");
      if (kind === "m2") {
        const m2 = n(mobo, "m2");
        if (m2 == null) return ["warn", `La mother ${short(mobo)} no informa cuántas ranuras M.2 tiene. Revisalo en la web del fabricante.`];
        if (m2 === 0) return ["bad", "El disco es M.2 y la mother no tiene ranura M.2."];
        if (count > m2) return ["bad", `Son ${count} discos M.2 y la mother tiene ${m2} ranura${m2 > 1 ? "s" : ""}.`];
        if (/sata/i.test(s(ssd, "iface") ?? "")) return ["warn", "Es un M.2 SATA: no todas las ranuras M.2 lo aceptan. Revisá el manual de la mother."];
        const g = n(ssd, "pcie"), mg = n(mobo, "pcie");
        if (g && mg && g > mg) return ["ok", `Ranura M.2 libre; el disco PCIe ${g}.0 anda a velocidad de PCIe ${mg}.0.`];
        return ["ok", `La mother tiene ${m2} ranura${m2 > 1 ? "s" : ""} M.2${count > 1 ? `, para ${count} discos` : ""}.`];
      }
      if (kind) {
        const sata = n(mobo, "sata");
        if (sata == null) return null;
        if (sata === 0) return ["bad", "El disco es SATA y la mother no tiene puertos SATA."];
        if (count > sata) return ["bad", `Son ${count} discos SATA y la mother tiene ${sata} puertos.`];
        return ["ok", `Va por SATA (la mother tiene ${sata} puertos).`];
      }
      return null;
    },
  },
  {
    parts: ["ssd", "case"],
    name: "Bahías",
    run: ({ ssd, case: c }, qty) => {
      const kind = driveKind(ssd);
      if (kind !== "hdd35" && kind !== "sata25" && kind !== "hdd25") return null;
      const count = qtyOf(qty, "ssd");
      const b35 = n(c, "bays35"), b25 = n(c, "bays25");
      if (kind === "hdd35") {
        if (b35 == null) return ["warn", `El gabinete ${short(c)} no informa bahías de 3,5": revisá que entre el disco rígido.`];
        return count <= b35 ? ["ok", `Entra${count > 1 ? "n" : ""} en las bahías de 3,5" (${b35}).`] : ["bad", `Son ${count} discos de 3,5" y el gabinete tiene ${b35} bahía${b35 === 1 ? "" : "s"}.`];
      }
      if (b25 == null && b35 == null) return null;
      const room = (b25 ?? 0) + (b35 ?? 0);
      return count <= room ? ["ok", `Entra${count > 1 ? "n" : ""} en las bahías de 2,5".`] : ["warn", `Son ${count} discos de 2,5" y el gabinete informa ${room} bahía${room === 1 ? "" : "s"}.`];
    },
  },
  {
    parts: ["psu", "case"],
    name: "Formato de la fuente",
    run: ({ psu, case: c }) => {
      const f = s(psu, "form"), forms = list(c, "psuForms");
      if (b(c, "psuIncluded")) return ["warn", "El gabinete ya trae fuente: con otra fuente sobra una."];
      if (!f || !forms.length) return null;
      if (forms.some((x) => form(x) === form(f))) return ["ok", `Fuente ${f}; el gabinete admite ${forms.join(", ")}.`];
      if (/sfx/i.test(f) && forms.some((x) => form(x) === "atx")) return ["warn", `La fuente es ${f} y el gabinete es para ATX: entra con un adaptador SFX a ATX.`];
      return ["bad", `La fuente es ${f} y el gabinete admite ${forms.join(", ")}.`];
    },
  },
  {
    parts: ["gpu", "psu"],
    name: "Cables de la placa",
    run: ({ gpu, psu }) => {
      const need = n(gpu, "pcie8"), have = n(psu, "pcie");
      if (need == null || need === 0 || have == null) return null;
      return have >= need ? ["ok", `La placa pide ${need} conector${need > 1 ? "es" : ""} de 8 pines y la fuente trae ${have}.`] : ["bad", `La placa pide ${need} conectores de 8 pines y la fuente trae ${have}: no conviene usar adaptadores.`];
    },
  },
];

/** Todos los chequeos que se pueden hacer con lo elegido. */
export function checks(build: Build, qty: Qty = {}): Check[] {
  const out: Check[] = [];
  /** Corre un chequeo anotando qué datos leyó, para marcar si se apoyó en algo estimado. */
  const run = (fn: () => Check | Check[] | null) => {
    touched = [];
    try {
      const res = fn();
      const est = touched.some(([p, k]) => isEstimated(p, k));
      for (const c of res ? (Array.isArray(res) ? res : [res]) : []) {
        if (est && c.level !== "warn") {
          c.estimated = true;
          // Lo que la IA estimó no alcanza para decir "no entra": queda para verificar.
          if (c.level === "bad") c.level = "warn";
          c.text = `${c.text} (con datos estimados: verificalo)`;
        }
        out.push(c);
      }
    } finally {
      touched = null;
    }
  };
  for (const r of RULES) {
    if (!r.parts.every((p) => build[p])) continue;
    run(() => {
      const res = r.run(build as Required<Build>, qty);
      return res ? { parts: r.parts, name: r.name, level: res[0], text: res[1] } : null;
    });
  }
  const { cpu, gpu, cooler, psu, mobo } = build;
  if (cpu && !gpu) {
    run(() => {
      if (!b(cpu, "igpu")) {
        return { parts: ["gpu"], name: "Falta", level: b(cpu, "igpu") === false ? "bad" : "warn", text: b(cpu, "igpu") === false ? "La placa de video: el procesador no tiene video integrado." : "No se sabe si el procesador trae video: verificalo." };
      }
      const outs = mobo ? list(mobo, "videoOut") : [];
      return { parts: ["cpu", "gpu"], name: "Video", level: "ok", text: `Usa los gráficos integrados del procesador${outs.length ? ` (salidas de la mother: ${outs.join(", ")})` : ""}.` };
    });
  }
  if (cpu && !cooler) {
    run(() => (b(cpu, "cooler")
      ? { parts: ["cpu", "cooler"], name: "Refrigeración", level: "ok", text: "Usa el cooler que trae el procesador." }
      : { parts: ["cooler"], name: "Falta", level: "warn", text: b(cpu, "cooler") === false ? "La refrigeración: el procesador viene sin cooler." : "No se sabe si el procesador trae cooler: verificalo." }));
  }
  run(() => {
    const need = powerNeed(build, qty), have = psuWatts(build);
    if (!need || !have) return null;
    const level: Level = have < need.recommended ? "bad" : have < need.recommended * 1.1 ? "warn" : "ok";
    return { parts: ["psu", "gpu", "cpu", "case"], owner: "psu", name: "Potencia", level, text: `${have} W para ${need.recommended} W recomendados${level === "bad" ? ": no alcanza." : level === "warn" ? ": queda justa." : "."}` };
  });
  // Con placa de video dedicada, la fuente tiene que ser certificada (80 Plus o superior).
  if (gpu && psu) {
    run(() => {
      const cert = s(psu, "cert");
      if (!cert) return { parts: ["psu", "gpu"], owner: "psu", name: "Certificación", level: "warn", text: `La fuente ${short(psu)} no informa su certificación: con placa de video tiene que ser 80 Plus o superior.` };
      if (/sin cert/i.test(cert)) return { parts: ["psu", "gpu"], owner: "psu", name: "Certificación", level: "bad", text: "Con placa de video dedicada la fuente tiene que ser certificada (80 Plus o superior)." };
      return { parts: ["psu", "gpu"], owner: "psu", name: "Certificación", level: "ok", text: `Fuente ${cert}.` };
    });
  }
  if (gpu && psu && /16 pines|12v-2x6|12vhpwr/i.test(String(gpu.compat.power ?? ""))) {
    run(() => {
      const h = b(psu, "hpwr");
      return { parts: ["gpu", "psu"], owner: "psu", name: "Conector 12V-2x6", level: h ? "ok" : "warn", text: h ? "La fuente trae el conector que pide la placa." : h === false ? "La fuente no lo trae: la placa va con adaptador." : `La fuente ${short(psu)} no informa si lo trae. Revisalo antes de confirmar.` };
    });
  }
  if (build.case && gpu) {
    run(() => {
      const fans = n(build.case, "fans");
      if (fans == null || fans > 0) return null;
      return { parts: ["case"], name: "Ventilación", level: "warn", text: "El gabinete no trae ventiladores: con placa de video sumá al menos dos (en Extras)." };
    });
  }
  return out;
}

const RANK: Record<Level, number> = { ok: 0, warn: 1, bad: 2 };
export const worst = (cs: Check[]): Level => cs.reduce<Level>((m, c) => (RANK[c.level] > RANK[m] ? c.level : m), "ok");
export const byLevel = (a: Check, c: Check) => RANK[c.level] - RANK[a.level];

/** Si un chequeo marca a un paso en pantalla. */
export const marks = (c: Check, step: PcStep) => (c.owner ? c.owner === step : c.parts.includes(step));

/** Cómo queda un candidato con lo ya elegido: solo los chequeos que lo involucran. */
export function verdict(step: PcStep, candidate: PcPart, build: Build, qty: Qty = {}): { level: Level; checks: Check[] } {
  const next: Build = { ...build, [step]: candidate };
  const cs = checks(next, qty).filter((c) => c.parts.includes(step) && c.parts.some((p) => p !== step && next[p]));
  return { level: worst(cs), checks: cs };
}

/** Pasos que no hacen falta con lo elegido (video integrado, cooler incluido, fuente del gabinete). */
export function optionalNote(step: PcStep, build: Build): string | null {
  if (step === "gpu" && build.cpu && b(build.cpu, "igpu")) return "Opcional: el procesador trae video integrado.";
  if (step === "cooler" && build.cpu && b(build.cpu, "cooler")) return "Opcional: el procesador trae cooler.";
  if (step === "psu" && build.case && b(build.case, "psuIncluded")) return "Opcional: el gabinete trae fuente.";
  return null;
}

/** Qué tiene que cumplir un paso para ser compatible con lo elegido. */
export function requirement(step: PcStep, build: Build, qty: Qty = {}): string[] {
  const r: (string | number | false | null)[] = [];
  const { cpu, mobo, gpu, case: c } = build;
  if (step === "mobo" && cpu) r.push(s(cpu, "socket") && `socket ${s(cpu, "socket")}`, list(cpu, "memory").join(" o ") || null);
  if (step === "mobo" && c && list(c, "forms").length) r.push(`formato ${list(c, "forms").join(" / ")}`);
  if (step === "cpu" && mobo) r.push(s(mobo, "socket") && `socket ${s(mobo, "socket")}`, s(mobo, "memory"));
  if (step === "ram" && mobo) r.push(s(mobo, "memory"), n(mobo, "slots") && `hasta ${n(mobo, "slots")} módulos`, n(mobo, "maxMemory") && `${n(mobo, "maxMemory")} GB máx.`);
  if (step === "gpu" && c && n(c, "gpuMax")) r.push(`hasta ${n(c, "gpuMax")} mm de largo`);
  if (step === "gpu" && c && n(c, "slots")) r.push(`hasta ${n(c, "slots")} ranuras de grosor`);
  if (step === "psu") {
    const need = powerNeed(build, qty);
    if (need) r.push(`desde ${need.recommended} W`);
    if (gpu && n(gpu, "pcie8")) r.push(`${n(gpu, "pcie8")} × PCIe 8 pines`);
    if (c && list(c, "psuForms").length) r.push(`formato ${list(c, "psuForms").join(" / ")}`);
  }
  if (step === "case" && mobo && s(mobo, "form")) r.push(`que admita ${s(mobo, "form")}`);
  if (step === "case" && gpu && n(gpu, "length")) r.push(`placa de ${n(gpu, "length")} mm`);
  if (step === "cooler" && cpu) r.push(s(cpu, "socket") && `socket ${s(cpu, "socket")}`, n(cpu, "tdp") && `${n(cpu, "tdp")} W de TDP`);
  if (step === "ssd" && mobo && n(mobo, "m2") != null) r.push(`${n(mobo, "m2")} ranuras M.2`);
  if (step === "ssd" && mobo && n(mobo, "sata") != null) r.push(`${n(mobo, "sata")} puertos SATA`);
  return r.filter((x): x is string => typeof x === "string" && x.length > 0);
}

/** Datos clave de una pieza para la tarjeta, según el paso. */
export function keySpecs(step: PcStep, p: PcPart): string[] {
  const gb = (v: number) => (v >= 1000 ? `${v / 1000} TB` : `${v} GB`);
  const out: (string | null | false)[] = [];
  if (step === "cpu") out.push(s(p, "socket"), n(p, "cores") != null && `${n(p, "cores")} núcleos / ${n(p, "threads") ?? "?"} hilos`, s(p, "boost") && `hasta ${s(p, "boost")}`, n(p, "tdp") != null && `${n(p, "tdp")} W`, b(p, "igpu") === true && "Video integrado", b(p, "cooler") === true && "Trae cooler");
  if (step === "mobo") out.push(s(p, "socket"), s(p, "chipset"), s(p, "form"), s(p, "memory") && `${s(p, "memory")}${n(p, "slots") ? ` · ${n(p, "slots")} ranuras` : ""}`, n(p, "m2") != null && `${n(p, "m2")} × M.2`, n(p, "pcie") != null && `PCIe ${n(p, "pcie")}.0`, b(p, "wifi") === true && "WiFi");
  if (step === "ram") out.push(s(p, "type"), n(p, "capacity") != null && (n(p, "modules") === 2 ? `2 × ${n(p, "capacity")! / 2} GB` : `${n(p, "capacity")} GB`), n(p, "freq") != null && `${ar(n(p, "freq")!)} MHz`, n(p, "cl") != null && `CL${n(p, "cl")}`);
  if (step === "gpu") out.push(s(p, "chip"), n(p, "vram") != null && `${n(p, "vram")} GB`, n(p, "length") != null && `${n(p, "length")} mm`, n(p, "tgp") != null && `${n(p, "tgp")} W`, n(p, "slots") != null && `${ar(n(p, "slots")!)} ranuras`);
  if (step === "ssd") out.push(n(p, "capacity") != null && gb(n(p, "capacity")!), s(p, "iface"), s(p, "form"), n(p, "read") != null && `${ar(n(p, "read")!)} MB/s`);
  if (step === "psu") out.push(n(p, "watts") != null && `${n(p, "watts")} W`, s(p, "cert"), s(p, "modular"), s(p, "form"), b(p, "hpwr") === true && "12V-2x6");
  if (step === "case") out.push(s(p, "type"), list(p, "forms").join(", ") || null, n(p, "gpuMax") != null && `placa hasta ${n(p, "gpuMax")} mm`, n(p, "fans") != null && `${n(p, "fans")} ventiladores`, b(p, "psuIncluded") === true && `con fuente${n(p, "psuWatts") ? ` ${n(p, "psuWatts")} W` : ""}`);
  if (step === "cooler") out.push(s(p, "kind") === "liquid" ? `Líquida ${n(p, "radiator") ?? "?"} mm` : `Aire${n(p, "height") ? ` · ${n(p, "height")} mm` : ""}`, n(p, "tdp") != null && `${n(p, "tdp")} W`);
  return out.filter((x): x is string => Boolean(x));
}

/** Datos que el armador usa en cada paso: si están todos y ninguno es estimado, la ficha es "verificada". */
export const KEY_FIELDS: Record<PcStep, string[]> = {
  cpu: ["socket", "memory", "tdp", "igpu", "cooler"],
  mobo: ["socket", "chipset", "memory", "form", "slots", "m2"],
  ram: ["type", "capacity", "modules", "freq"],
  gpu: ["chip", "vram", "length", "tgp"],
  ssd: ["capacity", "form", "iface"],
  psu: ["watts", "cert", "form"],
  case: ["forms", "gpuMax", "coolerMax"],
  cooler: ["sockets"],
};

/** Qué tan completa está la ficha para el armador: "verified" (todo y confirmado), "estimated" (todo, algo por IA) o "partial". */
export function dataQuality(step: PcStep, p: PcPart): "verified" | "estimated" | "partial" {
  const keys = KEY_FIELDS[step].filter((k) => !(step === "cooler" && k === "tdp" && p.compat.kind === "liquid" && p.compat.tdp == null));
  const has = (k: string) => {
    const v = p.compat[k];
    return v != null && !(Array.isArray(v) && v.length === 0);
  };
  if (!keys.every(has)) return "partial";
  return keys.some((k) => isEstimated(p, k)) ? "estimated" : "verified";
}

/** Para comparar piezas: cada dato con su nombre, en el orden en que importa. */
export const COMPARE_ROWS: Record<PcStep, [key: string, label: string][]> = {
  cpu: [["socket", "Socket"], ["cores", "Núcleos"], ["threads", "Hilos"], ["boost", "Frecuencia turbo"], ["cache", "Caché L3 (MB)"], ["tdp", "TDP (W)"], ["igpu", "Video integrado"], ["cooler", "Trae cooler"], ["memory", "Memoria"]],
  mobo: [["socket", "Socket"], ["chipset", "Chipset"], ["form", "Formato"], ["memory", "Memoria"], ["slots", "Ranuras de memoria"], ["maxMemory", "Memoria máxima (GB)"], ["maxFreq", "Frecuencia máx. (MHz)"], ["m2", "Ranuras M.2"], ["sata", "Puertos SATA"], ["pcie", "PCIe (x16)"], ["videoOut", "Salidas de video"], ["wifi", "WiFi"]],
  ram: [["type", "Tipo"], ["capacity", "Capacidad (GB)"], ["modules", "Módulos"], ["freq", "Frecuencia (MHz)"], ["cl", "Latencia (CL)"]],
  gpu: [["chip", "Chip"], ["vram", "Memoria (GB)"], ["length", "Largo (mm)"], ["slots", "Ranuras"], ["tgp", "Consumo (W)"], ["recommendedPsu", "Fuente recomendada (W)"], ["power", "Alimentación"], ["pcie", "PCIe"]],
  ssd: [["capacity", "Capacidad (GB)"], ["form", "Formato"], ["iface", "Interfaz"], ["read", "Lectura (MB/s)"], ["write", "Escritura (MB/s)"]],
  psu: [["watts", "Potencia (W)"], ["cert", "Certificación"], ["modular", "Modular"], ["form", "Formato"], ["pcie", "Conectores PCIe"], ["hpwr", "12V-2x6"], ["atx3", "ATX 3.x"]],
  case: [["type", "Tipo"], ["forms", "Motherboards"], ["gpuMax", "Placa máx. (mm)"], ["coolerMax", "Cooler máx. (mm)"], ["radiatorMax", "Radiador máx. (mm)"], ["slots", "Ranuras"], ["fans", "Ventiladores"], ["psuForms", "Fuentes"], ["psuIncluded", "Trae fuente"]],
  cooler: [["kind", "Tipo"], ["sockets", "Sockets"], ["height", "Altura (mm)"], ["radiator", "Radiador (mm)"], ["tdp", "TDP (W)"], ["fans", "Ventiladores"]],
};

/** Un dato de la ficha como texto para mostrar. */
export function specText(v: PcPart["compat"][string]): string {
  if (v == null || (Array.isArray(v) && !v.length)) return "—";
  if (Array.isArray(v)) return v.join(", ");
  if (typeof v === "boolean") return v ? "Sí" : "No";
  if (v === "liquid") return "Líquida";
  if (v === "air") return "Aire";
  return typeof v === "number" ? ar(v) : v;
}

/** Un filtro del paso: su nombre, cómo se lee el valor de una pieza (uno o varios) y el orden de las opciones. */
export interface Facet {
  name: string;
  read: (p: PcPart) => string | string[] | null;
  /** "count": las más comunes primero · "natural": 4 GB, 8 GB, 16 GB… · lista fija: en ese orden. */
  order?: "count" | "natural" | string[];
}

const yes = (v: boolean | null) => (v === true ? "Sí" : v === false ? "No" : null);
const cpuBrand = (p: PcPart) => (/\bamd\b|ryzen|athlon/i.test(p.name) ? "AMD" : /intel|core|pentium|celeron/i.test(p.name) ? "Intel" : p.brand);
export const gpuMaker = (p: PcPart) => {
  const chip = `${s(p, "chip") ?? ""} ${p.name}`;
  return /radeon|\brx\s?\d/i.test(chip) ? "AMD" : /\barc\b|intel/i.test(chip) ? "Intel" : /geforce|rtx|gtx|nvidia|\bgt\s?\d/i.test(chip) ? "NVIDIA" : null;
};
const size = (v: number | null) => (v == null ? null : v >= 1000 ? `${v / 1000} TB` : `${v} GB`);
const bucket = (v: number | null, edges: number[], unit: string) => {
  if (v == null) return null;
  for (let i = 0; i < edges.length; i++) if (v <= edges[i]) return i === 0 ? `Hasta ${edges[i]} ${unit}` : `${edges[i - 1] + 1} a ${edges[i]} ${unit}`;
  return `Más de ${edges[edges.length - 1]} ${unit}`;
};
const quality = (step: PcStep) => (p: PcPart) => ({ verified: "Verificada", estimated: "Con datos estimados", partial: "Incompleta" })[dataQuality(step, p)];
const QUALITY_ORDER = ["Verificada", "Con datos estimados", "Incompleta"];

/** Filtros por paso, sacados de la ficha técnica y del nombre del producto. */
export const FACETS: Record<PcStep, Facet[]> = {
  cpu: [
    { name: "Marca", read: cpuBrand, order: ["AMD", "Intel"] },
    { name: "Socket", read: (p) => s(p, "socket") },
    { name: "Línea", read: (p) => s(p, "line"), order: "natural" },
    { name: "Video integrado", read: (p) => yes(b(p, "igpu")), order: ["Sí", "No"] },
    { name: "Serie", read: (p) => (/x3d/i.test(p.name) ? "X3D" : /\d{4,5}g\b|\d{4,5}ge\b/i.test(p.name) && /ryzen|amd/i.test(p.name) ? "Serie G (con video)" : /\d{4,5}f\b/i.test(p.name) && /intel|core/i.test(p.name) ? "Serie F (sin video)" : /\d{4,5}k\b|\d{4,5}kf\b/i.test(p.name) ? "Serie K (desbloqueado)" : null) },
    { name: "Cooler incluido", read: (p) => yes(b(p, "cooler")), order: ["Sí", "No"] },
    { name: "Núcleos", read: (p) => (n(p, "cores") != null ? `${n(p, "cores")} núcleos` : null), order: "natural" },
    { name: "Ficha", read: quality("cpu"), order: QUALITY_ORDER },
  ],
  mobo: [
    { name: "Socket", read: (p) => s(p, "socket") },
    { name: "Plataforma", read: (p) => (/^AM/i.test(s(p, "socket") ?? "") ? "AMD" : /^LGA/i.test(s(p, "socket") ?? "") ? "Intel" : null), order: ["AMD", "Intel"] },
    { name: "Chipset", read: (p) => s(p, "chipset"), order: "natural" },
    { name: "Formato", read: (p) => s(p, "form"), order: ["Mini-ITX", "Micro-ATX", "ATX", "E-ATX"] },
    { name: "Memoria", read: (p) => s(p, "memory"), order: ["DDR4", "DDR5"] },
    { name: "Ranuras de memoria", read: (p) => (n(p, "slots") != null ? `${n(p, "slots")} ranuras` : null), order: "natural" },
    { name: "Ranuras M.2", read: (p) => (n(p, "m2") != null ? `${n(p, "m2")} × M.2` : null), order: "natural" },
    { name: "WiFi", read: (p) => yes(b(p, "wifi")), order: ["Sí", "No"] },
    { name: "Marca", read: (p) => p.brand },
    { name: "Ficha", read: quality("mobo"), order: QUALITY_ORDER },
  ],
  ram: [
    { name: "Tipo", read: (p) => s(p, "type"), order: ["DDR3", "DDR4", "DDR5"] },
    { name: "Capacidad", read: (p) => size(n(p, "capacity")), order: "natural" },
    { name: "Módulos", read: (p) => (n(p, "modules") === 2 ? "Kit de 2" : n(p, "modules") === 1 ? "1 módulo" : null), order: ["1 módulo", "Kit de 2"] },
    { name: "Frecuencia", read: (p) => (n(p, "freq") != null ? `${ar(n(p, "freq")!)} MHz` : null), order: "natural" },
    { name: "Marca", read: (p) => p.brand },
    { name: "Ficha", read: quality("ram"), order: QUALITY_ORDER },
  ],
  gpu: [
    { name: "Fabricante", read: gpuMaker, order: ["NVIDIA", "AMD", "Intel"] },
    { name: "Chip", read: (p) => (s(p, "chip") ?? "").replace(/^(GeForce|Radeon|Arc)\s+/i, "") || null, order: "natural" },
    { name: "Memoria", read: (p) => (n(p, "vram") != null ? `${n(p, "vram")} GB` : null), order: "natural" },
    { name: "Largo", read: (p) => bucket(n(p, "length"), [200, 250, 300], "mm"), order: ["Hasta 200 mm", "201 a 250 mm", "251 a 300 mm", "Más de 300 mm"] },
    { name: "Marca", read: (p) => p.brand },
    { name: "Ficha", read: quality("gpu"), order: QUALITY_ORDER },
  ],
  ssd: [
    { name: "Tipo", read: (p) => (b(p, "hdd") ? "Disco rígido (HDD)" : "SSD"), order: ["SSD", "Disco rígido (HDD)"] },
    { name: "Formato", read: (p) => s(p, "form") },
    { name: "Capacidad", read: (p) => size(n(p, "capacity")), order: "natural" },
    { name: "Interfaz", read: (p) => s(p, "iface") },
    { name: "Marca", read: (p) => p.brand },
    { name: "Ficha", read: quality("ssd"), order: QUALITY_ORDER },
  ],
  psu: [
    { name: "Potencia", read: (p) => (n(p, "watts") != null ? `${n(p, "watts")} W` : null), order: "natural" },
    { name: "Certificación", read: (p) => s(p, "cert"), order: ["Sin certificación", "80 Plus", "80 Plus White", "80 Plus Bronze", "80 Plus Silver", "80 Plus Gold", "80 Plus Platinum", "80 Plus Titanium"] },
    { name: "Modular", read: (p) => s(p, "modular"), order: ["No modular", "Semi modular", "Full modular"] },
    { name: "Formato", read: (p) => s(p, "form"), order: ["ATX", "SFX", "SFX-L", "TFX"] },
    { name: "Conector 12V-2x6", read: (p) => yes(b(p, "hpwr")), order: ["Sí", "No"] },
    { name: "Marca", read: (p) => p.brand },
    { name: "Ficha", read: quality("psu"), order: QUALITY_ORDER },
  ],
  case: [
    { name: "Tipo", read: (p) => s(p, "type") },
    { name: "Admite", read: (p) => list(p, "forms"), order: ["Mini-ITX", "Micro-ATX", "ATX", "E-ATX"] },
    { name: "Fuente incluida", read: (p) => yes(b(p, "psuIncluded")), order: ["Sí", "No"] },
    { name: "Placa de video hasta", read: (p) => bucket(n(p, "gpuMax"), [300, 350, 400], "mm"), order: ["Hasta 300 mm", "301 a 350 mm", "351 a 400 mm", "Más de 400 mm"] },
    { name: "Ventiladores", read: (p) => (n(p, "fans") != null ? (n(p, "fans")! >= 4 ? "4 o más" : `${n(p, "fans")}`) : null), order: ["0", "1", "2", "3", "4 o más"] },
    { name: "Marca", read: (p) => p.brand },
    { name: "Ficha", read: quality("case"), order: QUALITY_ORDER },
  ],
  cooler: [
    { name: "Tipo", read: (p) => (s(p, "kind") === "liquid" ? "Líquida" : "Aire"), order: ["Aire", "Líquida"] },
    { name: "Radiador", read: (p) => (n(p, "radiator") != null ? `${n(p, "radiator")} mm` : null), order: "natural" },
    { name: "Socket", read: (p) => list(p, "sockets") },
    { name: "Marca", read: (p) => p.brand },
    { name: "Ficha", read: quality("cooler"), order: QUALITY_ORDER },
  ],
};

const naturalKey = (v: string) => {
  const m = v.replace(/\./g, "").match(/\d+(,\d+)?/);
  const num = m ? Number(m[0].replace(",", ".")) : 0;
  return /tb/i.test(v) ? num * 1000 : num;
};

/** Valores de un filtro como lista (un producto puede tener varios: los mothers que admite un gabinete). */
export const facetValues = (f: Facet, p: PcPart): string[] => {
  const v = f.read(p);
  return (Array.isArray(v) ? v : v ? [v] : []).filter(Boolean);
};

/** Ordena las opciones de un filtro según su regla. */
export function sortFacetOptions(f: Facet, counts: Record<string, number>): string[] {
  const vals = Object.keys(counts);
  if (Array.isArray(f.order)) {
    const fixed = f.order;
    return vals.sort((a, b) => (fixed.indexOf(a) < 0 ? 99 : fixed.indexOf(a)) - (fixed.indexOf(b) < 0 ? 99 : fixed.indexOf(b)) || a.localeCompare(b, "es"));
  }
  if (f.order === "natural") return vals.sort((a, b) => naturalKey(a) - naturalKey(b) || a.localeCompare(b, "es"));
  return vals.sort((a, b) => counts[b] - counts[a] || a.localeCompare(b, "es"));
}
