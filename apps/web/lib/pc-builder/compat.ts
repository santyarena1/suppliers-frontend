/**
 * Compatibilidad del armador de PC. Cada chequeo usa los datos técnicos de la
 * ficha (ver API_CONTRACT: /pc-builder/parts). Si falta un dato el resultado es
 * "verificar", nunca "compatible".
 */
import type { ProductDTO } from "@/lib/api";

export type PcStep = "cpu" | "mobo" | "ram" | "gpu" | "ssd" | "psu" | "case" | "cooler";

export interface PcPart {
  contentId: string;
  name: string;
  brand: string | null;
  image: string | null;
  compat: Record<string, string | number | boolean | string[] | null>;
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
}

export type Build = Partial<Record<PcStep, PcPart>>;

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

const n = (p: PcPart | undefined, k: string): number | null => {
  const v = p?.compat[k];
  return typeof v === "number" ? v : null;
};
const s = (p: PcPart | undefined, k: string): string | null => {
  const v = p?.compat[k];
  return typeof v === "string" && v ? v : null;
};
const list = (p: PcPart | undefined, k: string): string[] => {
  const v = p?.compat[k];
  return Array.isArray(v) ? v : [];
};
const b = (p: PcPart | undefined, k: string): boolean | null => {
  const v = p?.compat[k];
  return typeof v === "boolean" ? v : null;
};
const sock = (x: string | null) => (x ?? "").toUpperCase().replace(/\s+/g, "");
const form = (x: string | null) => (x ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
const ar = (x: number) => x.toLocaleString("es-AR");

/** Consumo estimado (procesador + placa + resto) y la fuente recomendada, con margen. */
export function powerNeed(build: Build): { estimate: number; recommended: number } | null {
  if (!build.cpu && !build.gpu) return null;
  const cpu = n(build.cpu, "tdp") ?? 65;
  const rec = n(build.gpu, "recommendedPsu");
  const gpu = build.gpu ? n(build.gpu, "tgp") ?? (rec ? Math.max(75, rec - 250) : 150) : 0;
  const estimate = cpu + gpu + 80;
  return { estimate, recommended: Math.max(Math.ceil((estimate * 1.3) / 50) * 50, rec ?? 0) };
}

/** Potencia disponible: la fuente elegida o la que trae el gabinete. */
export function psuWatts(build: Build): number | null {
  if (build.psu) return n(build.psu, "watts");
  if (build.case && b(build.case, "psuIncluded")) return n(build.case, "psuWatts");
  return null;
}

type Rule = { parts: PcStep[]; name: string; run: (x: Required<Build>) => [Level, string] | null };

const RULES: Rule[] = [
  {
    parts: ["cpu", "mobo"],
    name: "Socket",
    run: ({ cpu, mobo }) => {
      const a = s(cpu, "socket"), m = s(mobo, "socket");
      if (!a || !m) return ["warn", "La ficha no informa el socket: verificalo."];
      return sock(a) === sock(m) ? ["ok", `${a} en procesador y mother.`] : ["bad", `El procesador es ${a} y la mother ${m}.`];
    },
  },
  {
    parts: ["cpu", "mobo"],
    name: "Memoria del procesador",
    run: ({ cpu, mobo }) => {
      const mem = list(cpu, "memory"), m = s(mobo, "memory");
      if (!mem.length || !m || mem.includes(m)) return null;
      return ["bad", `El procesador no soporta ${m} (${mem.join(" / ")}).`];
    },
  },
  {
    parts: ["ram", "mobo"],
    name: "Memoria",
    run: ({ ram, mobo }) => {
      const t = s(ram, "type"), m = s(mobo, "memory");
      if (!t || !m) return ["warn", "La ficha no informa el tipo de memoria: verificalo."];
      if (t !== m) return ["bad", `La memoria es ${t} y la mother usa ${m}.`];
      const mods = n(ram, "modules"), slots = n(mobo, "slots"), cap = n(ram, "capacity"), max = n(mobo, "maxMemory");
      if (mods && slots && mods > slots) return ["bad", `Son ${mods} módulos y la mother tiene ${slots} ranuras.`];
      if (cap && max && cap > max) return ["bad", `${cap} GB supera el máximo de la mother (${max} GB).`];
      const f = n(ram, "freq"), mf = n(mobo, "maxFreq");
      if (f && mf && f > mf) return ["warn", `Va a funcionar a ${ar(mf)} MHz, no a ${ar(f)} MHz.`];
      return ["ok", `${t}, ${mods ?? "?"} de ${slots ?? "?"} ranuras.`];
    },
  },
  {
    parts: ["mobo", "case"],
    name: "Formato",
    run: ({ mobo, case: c }) => {
      const f = s(mobo, "form"), forms = list(c, "forms");
      if (!f || !forms.length) return ["warn", "La ficha del gabinete no dice qué mothers admite: verificalo."];
      return forms.some((x) => form(x) === form(f)) ? ["ok", `Mother ${f} en un gabinete para ${forms.join(", ")}.`] : ["bad", `La mother es ${f} y el gabinete admite ${forms.join(", ")}.`];
    },
  },
  {
    parts: ["gpu", "case"],
    name: "Largo de la placa",
    run: ({ gpu, case: c }) => {
      const l = n(gpu, "length"), max = n(c, "gpuMax");
      if (!l || !max) return ["warn", "Falta el largo de la placa o el máximo del gabinete: verificalo."];
      return l <= max ? ["ok", `${l} mm; el gabinete admite hasta ${max} mm.`] : ["bad", `La placa mide ${l} mm y el gabinete admite ${max} mm.`];
    },
  },
  {
    parts: ["cooler", "cpu"],
    name: "Cooler y socket",
    run: ({ cooler, cpu }) => {
      const socks = list(cooler, "sockets"), a = s(cpu, "socket");
      if (!socks.length || !a) return ["warn", "La ficha del cooler no lista sockets: verificalo."];
      if (!socks.some((x) => sock(x) === sock(a))) return ["bad", `El cooler no trae soporte para ${a}.`];
      const ct = n(cooler, "tdp"), pt = n(cpu, "tdp");
      if (ct && pt && ct < pt) return ["warn", `Disipa ${ct} W y el procesador tiene ${pt} W de TDP.`];
      return ["ok", `Soporta ${a}.`];
    },
  },
  {
    parts: ["cooler", "case"],
    name: "Espacio para el cooler",
    run: ({ cooler, case: c }) => {
      if (s(cooler, "kind") === "liquid") {
        const r = n(cooler, "radiator"), max = n(c, "radiatorMax");
        if (!r || !max) return ["warn", "Falta el radiador máximo del gabinete: verificalo."];
        return r <= max ? ["ok", `Radiador de ${r} mm; admite hasta ${max} mm.`] : ["bad", `El radiador es de ${r} mm y el gabinete admite ${max} mm.`];
      }
      const h = n(cooler, "height"), max = n(c, "coolerMax");
      if (!h || !max) return ["warn", "Falta la altura del cooler o del gabinete: verificalo."];
      return h <= max ? ["ok", `${h} mm; el gabinete admite hasta ${max} mm.`] : ["bad", `El cooler mide ${h} mm y el gabinete admite ${max} mm.`];
    },
  },
  {
    parts: ["ssd", "mobo"],
    name: "Ranura M.2",
    run: ({ ssd, mobo }) => {
      if (!/m\.?2/i.test(s(ssd, "form") ?? "")) return null;
      const m2 = n(mobo, "m2");
      if (m2 == null) return ["warn", "La ficha de la mother no dice cuántas ranuras M.2 tiene."];
      return m2 > 0 ? ["ok", `La mother tiene ${m2} ranura${m2 > 1 ? "s" : ""} M.2.`] : ["bad", "El disco es M.2 y la mother no tiene ranura M.2."];
    },
  },
];

/** Todos los chequeos que se pueden hacer con lo elegido. */
export function checks(build: Build): Check[] {
  const out: Check[] = [];
  for (const r of RULES) {
    if (!r.parts.every((p) => build[p])) continue;
    const res = r.run(build as Required<Build>);
    if (res) out.push({ parts: r.parts, name: r.name, level: res[0], text: res[1] });
  }
  const { cpu, gpu, cooler, psu } = build;
  if (cpu && !gpu) {
    out.push(b(cpu, "igpu")
      ? { parts: ["cpu", "gpu"], name: "Video", level: "ok", text: "Usa los gráficos integrados del procesador." }
      : { parts: ["gpu"], name: "Falta", level: "warn", text: b(cpu, "igpu") === false ? "La placa de video: el procesador no tiene video integrado." : "No se sabe si el procesador trae video: verificalo." });
  }
  if (cpu && !cooler) {
    out.push(b(cpu, "cooler")
      ? { parts: ["cpu", "cooler"], name: "Refrigeración", level: "ok", text: "Usa el cooler que trae el procesador." }
      : { parts: ["cooler"], name: "Falta", level: "warn", text: b(cpu, "cooler") === false ? "La refrigeración: el procesador viene sin cooler." : "No se sabe si el procesador trae cooler: verificalo." });
  }
  const need = powerNeed(build), have = psuWatts(build);
  if (need && have) {
    const level: Level = have < need.recommended ? "bad" : have < need.recommended * 1.1 ? "warn" : "ok";
    out.push({ parts: ["psu", "gpu", "cpu", "case"], owner: "psu", name: "Potencia", level, text: `${have} W para ${need.recommended} W recomendados${level === "bad" ? ": no alcanza." : level === "warn" ? ": queda justa." : "."}` });
  }
  if (gpu && psu && /16 pines|12v-2x6|12vhpwr/i.test(s(gpu, "power") ?? "")) {
    const h = b(psu, "hpwr");
    out.push({ parts: ["gpu", "psu"], owner: "psu", name: "Conector 12V-2x6", level: h ? "ok" : "warn", text: h ? "La fuente trae el conector que pide la placa." : h === false ? "La fuente no lo trae: la placa va con adaptador." : "La ficha de la fuente no lo informa: verificalo." });
  }
  return out;
}

const RANK: Record<Level, number> = { ok: 0, warn: 1, bad: 2 };
export const worst = (cs: Check[]): Level => cs.reduce<Level>((m, c) => (RANK[c.level] > RANK[m] ? c.level : m), "ok");
export const byLevel = (a: Check, c: Check) => RANK[c.level] - RANK[a.level];

/** Si un chequeo marca a un paso en pantalla. */
export const marks = (c: Check, step: PcStep) => (c.owner ? c.owner === step : c.parts.includes(step));

/** Cómo queda un candidato con lo ya elegido: solo los chequeos que lo involucran. */
export function verdict(step: PcStep, candidate: PcPart, build: Build): { level: Level; checks: Check[] } {
  const next: Build = { ...build, [step]: candidate };
  const cs = checks(next).filter((c) => c.parts.includes(step) && c.parts.some((p) => p !== step && next[p]));
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
export function requirement(step: PcStep, build: Build): string[] {
  const r: (string | number | false | null)[] = [];
  const { cpu, mobo, gpu, case: c } = build;
  if (step === "mobo" && cpu) r.push(s(cpu, "socket") && `socket ${s(cpu, "socket")}`, list(cpu, "memory").join(" o ") || null);
  if (step === "mobo" && c && list(c, "forms").length) r.push(`formato ${list(c, "forms").join(" / ")}`);
  if (step === "cpu" && mobo) r.push(s(mobo, "socket") && `socket ${s(mobo, "socket")}`, s(mobo, "memory"));
  if (step === "ram" && mobo) r.push(s(mobo, "memory"), n(mobo, "slots") && `hasta ${n(mobo, "slots")} módulos`, n(mobo, "maxMemory") && `${n(mobo, "maxMemory")} GB máx.`);
  if (step === "gpu" && c && n(c, "gpuMax")) r.push(`hasta ${n(c, "gpuMax")} mm de largo`);
  if (step === "psu") { const need = powerNeed(build); if (need) r.push(`desde ${need.recommended} W`); }
  if (step === "case" && mobo && s(mobo, "form")) r.push(`que admita ${s(mobo, "form")}`);
  if (step === "case" && gpu && n(gpu, "length")) r.push(`placa de ${n(gpu, "length")} mm`);
  if (step === "cooler" && cpu) r.push(s(cpu, "socket") && `socket ${s(cpu, "socket")}`, n(cpu, "tdp") && `${n(cpu, "tdp")} W de TDP`);
  if (step === "ssd" && mobo && n(mobo, "m2") != null) r.push(`${n(mobo, "m2")} ranuras M.2`);
  return r.filter((x): x is string => typeof x === "string" && x.length > 0);
}

/** Datos clave de una pieza para la tarjeta, según el paso. */
export function keySpecs(step: PcStep, p: PcPart): string[] {
  const gb = (v: number) => (v >= 1000 ? `${v / 1000} TB` : `${v} GB`);
  const out: (string | null | false)[] = [];
  if (step === "cpu") out.push(s(p, "socket"), n(p, "cores") != null && `${n(p, "cores")} núcleos / ${n(p, "threads") ?? "?"} hilos`, s(p, "boost") && `hasta ${s(p, "boost")}`, n(p, "tdp") != null && `${n(p, "tdp")} W`, b(p, "igpu") === true && "Video integrado", b(p, "cooler") === true && "Trae cooler");
  if (step === "mobo") out.push(s(p, "socket"), s(p, "chipset"), s(p, "form"), s(p, "memory") && `${s(p, "memory")}${n(p, "slots") ? ` · ${n(p, "slots")} ranuras` : ""}`, n(p, "m2") != null && `${n(p, "m2")} × M.2`, b(p, "wifi") === true && "WiFi");
  if (step === "ram") out.push(s(p, "type"), n(p, "capacity") != null && (n(p, "modules") === 2 ? `2 × ${n(p, "capacity")! / 2} GB` : `${n(p, "capacity")} GB`), n(p, "freq") != null && `${ar(n(p, "freq")!)} MHz`, n(p, "cl") != null && `CL${n(p, "cl")}`);
  if (step === "gpu") out.push(s(p, "chip"), n(p, "vram") != null && `${n(p, "vram")} GB`, n(p, "length") != null && `${n(p, "length")} mm`, n(p, "tgp") != null && `${n(p, "tgp")} W`);
  if (step === "ssd") out.push(n(p, "capacity") != null && gb(n(p, "capacity")!), s(p, "iface"), s(p, "form"), n(p, "read") != null && `${ar(n(p, "read")!)} MB/s`);
  if (step === "psu") out.push(n(p, "watts") != null && `${n(p, "watts")} W`, s(p, "cert"), s(p, "modular"), b(p, "hpwr") === true && "12V-2x6");
  if (step === "case") out.push(s(p, "type"), list(p, "forms").join(", ") || null, n(p, "gpuMax") != null && `placa hasta ${n(p, "gpuMax")} mm`, b(p, "psuIncluded") === true && `con fuente${n(p, "psuWatts") ? ` ${n(p, "psuWatts")} W` : ""}`);
  if (step === "cooler") out.push(s(p, "kind") === "liquid" ? `Líquida ${n(p, "radiator") ?? "?"} mm` : `Aire${n(p, "height") ? ` · ${n(p, "height")} mm` : ""}`, n(p, "tdp") != null && `${n(p, "tdp")} W`);
  return out.filter((x): x is string => Boolean(x));
}

/** Filtros por paso: nombre y cómo se lee el valor de una pieza. */
export const FACETS: Record<PcStep, [string, (p: PcPart) => string | null][]> = {
  cpu: [["Marca", (p) => (/amd|ryzen/i.test(p.name) ? "AMD" : /intel|core/i.test(p.name) ? "Intel" : p.brand)], ["Socket", (p) => s(p, "socket")]],
  mobo: [["Socket", (p) => s(p, "socket")], ["Formato", (p) => s(p, "form")], ["Memoria", (p) => s(p, "memory")], ["Marca", (p) => p.brand]],
  ram: [["Tipo", (p) => s(p, "type")], ["Capacidad", (p) => (n(p, "capacity") != null ? `${n(p, "capacity")} GB` : null)], ["Marca", (p) => p.brand]],
  gpu: [["Chip", (p) => (s(p, "chip") ?? "").replace(/^(GeForce|Radeon|Arc)\s+/i, "") || null], ["Memoria", (p) => (n(p, "vram") != null ? `${n(p, "vram")} GB` : null)], ["Marca", (p) => p.brand]],
  ssd: [["Formato", (p) => s(p, "form")], ["Capacidad", (p) => (n(p, "capacity") != null ? (n(p, "capacity")! >= 1000 ? `${n(p, "capacity")! / 1000} TB` : `${n(p, "capacity")} GB`) : null)], ["Interfaz", (p) => s(p, "iface")]],
  psu: [["Potencia", (p) => (n(p, "watts") != null ? `${n(p, "watts")} W` : null)], ["Certificación", (p) => s(p, "cert")], ["Marca", (p) => p.brand]],
  case: [["Tipo", (p) => s(p, "type")], ["Fuente incluida", (p) => (b(p, "psuIncluded") === true ? "Sí" : b(p, "psuIncluded") === false ? "No" : null)], ["Marca", (p) => p.brand]],
  cooler: [["Tipo", (p) => (s(p, "kind") === "liquid" ? "Líquida" : "Aire")], ["Marca", (p) => p.brand]],
};
