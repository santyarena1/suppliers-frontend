/**
 * Armado automático: con un perfil (gamer, oficina, diseño) y, si hay, un
 * presupuesto, elige las piezas que faltan entre las que tienen stock en los
 * distribuidores del comercio, compatibles con lo que ya está elegido.
 * Primero reparte el presupuesto por pieza y después usa lo que sobra para
 * mejorar lo que más rinde (la placa de video en una gamer, el procesador en diseño).
 */
import type { ProductDTO } from "@/lib/api";
import { cpuFamily, dataQuality, gpuMaker, powerNeed, verdict, type Build, type Level, type PcPart, type PcStep, type Qty } from "./compat";

export type Profile = "gamer" | "office" | "creator";

export const PROFILE_LABEL: Record<Profile, string> = {
  gamer: "Gamer",
  office: "Oficina / hogar",
  creator: "Diseño y streaming",
};

export const PROFILE_HINT: Record<Profile, string> = {
  gamer: "Prioriza la placa de video. 16 GB de RAM y SSD NVMe como mínimo.",
  office: "Procesador con video integrado, sin placa de video. Silenciosa y barata.",
  creator: "Prioriza procesador y memoria (32 GB). Placa de video media y disco de 1 TB.",
};

/** Qué parte del presupuesto va a cada pieza, según el perfil. */
const SHARE: Record<Profile, Record<PcStep, number>> = {
  gamer: { cpu: 0.18, mobo: 0.11, ram: 0.08, gpu: 0.38, ssd: 0.07, psu: 0.07, case: 0.07, cooler: 0.04 },
  office: { cpu: 0.3, mobo: 0.2, ram: 0.14, gpu: 0, ssd: 0.14, psu: 0.08, case: 0.12, cooler: 0.02 },
  creator: { cpu: 0.26, mobo: 0.12, ram: 0.13, gpu: 0.25, ssd: 0.1, psu: 0.07, case: 0.05, cooler: 0.02 },
};

/** Orden en que se eligen: cada pieza se elige compatible con las anteriores; la fuente al final, con el consumo ya conocido. */
const ORDER: PcStep[] = ["cpu", "mobo", "ram", "gpu", "ssd", "case", "cooler", "psu"];
/** Qué se mejora primero con lo que sobra. */
const UPGRADE: Record<Profile, PcStep[]> = {
  gamer: ["gpu", "cpu", "ram", "ssd"],
  office: ["cpu", "ssd", "ram"],
  creator: ["cpu", "gpu", "ram", "ssd"],
};
const PERF: PcStep[] = ["cpu", "gpu", "ram", "ssd"];

const num = (p: PcPart, k: string) => (typeof p.compat[k] === "number" ? (p.compat[k] as number) : null);
const str = (p: PcPart, k: string) => (typeof p.compat[k] === "string" ? (p.compat[k] as string) : "");
const ghz = (v: string) => {
  const m = v.replace(",", ".").match(/\d+(\.\d+)?/);
  const x = m ? Number(m[0]) : 0;
  return x > 100 ? x / 1000 : x;
};

/** Rendimiento relativo en juegos (1080p) por chip; lo que no está se estima por la memoria. */
const GPU_TIERS: [RegExp, number][] = [
  [/rtx\s*5090/i, 150], [/rtx\s*4090/i, 125], [/rtx\s*5080/i, 105], [/rtx\s*4080/i, 100], [/rx\s*7900\s*xtx/i, 100],
  [/rx\s*9070\s*xt/i, 95], [/rtx\s*5070\s*ti/i, 92], [/rx\s*7900\s*xt\b/i, 88], [/rtx\s*4070\s*ti\s*super/i, 88],
  [/rx\s*9070\s*gre/i, 72], [/rx\s*9070\b/i, 85], [/rtx\s*4070\s*ti/i, 82], [/rtx\s*5070\b/i, 76], [/rtx\s*4070\s*super/i, 75], [/rx\s*7900\s*gre/i, 75],
  [/rx\s*7800\s*xt/i, 70], [/rtx\s*4070\b/i, 66], [/rx\s*6800\s*xt/i, 70], [/rx\s*6800\b/i, 64], [/rtx\s*3080/i, 72],
  [/rtx\s*5060\s*ti/i, 60], [/rx\s*7700\s*xt/i, 60], [/rtx\s*3070\s*ti/i, 61], [/rtx\s*3070/i, 58], [/rx\s*9060\s*xt/i, 56],
  [/rx\s*6750\s*xt/i, 55], [/rtx\s*4060\s*ti/i, 53], [/rtx\s*5060\b/i, 52], [/rx\s*6700\s*xt/i, 52], [/arc\s*b580/i, 50],
  [/rtx\s*3060\s*ti/i, 50], [/rx\s*7600\s*xt/i, 47], [/rtx\s*4060\b/i, 45], [/rx\s*7600\b/i, 45], [/arc\s*b570/i, 45],
  [/arc\s*a770/i, 45], [/rx\s*6650\s*xt/i, 44], [/rtx\s*5050/i, 42], [/arc\s*a750/i, 42], [/rtx\s*3060\b/i, 40],
  [/rx\s*6600\s*xt/i, 42], [/rx\s*6600\b/i, 38], [/arc\s*a580/i, 35], [/rtx\s*2060/i, 33], [/rtx\s*3050/i, 29],
  [/gtx\s*1660\s*(super|ti)/i, 30], [/gtx\s*1660/i, 26], [/rx\s*6500\s*xt/i, 18], [/gtx\s*1650/i, 20], [/arc\s*a380/i, 15],
  [/rx\s*6400/i, 15], [/rx\s*580/i, 18], [/rx\s*550/i, 8], [/gtx\s*1050/i, 10], [/gt\s*1030/i, 6], [/gt\s*730/i, 3], [/gt\s*710/i, 2],
];

export function gpuScore(p: PcPart): number {
  const text = `${str(p, "chip")} ${p.name}`;
  for (const [re, v] of GPU_TIERS) if (re.test(text)) return v;
  return Math.max(2, (num(p, "vram") ?? 2) * 4);
}

export function cpuScore(p: PcPart, profile: Profile): number {
  const cores = num(p, "cores") ?? 4;
  const threads = num(p, "threads") ?? cores;
  const boost = ghz(str(p, "boost")) || 3.5;
  const platform: Record<string, number> = { AM5: 1.25, LGA1851: 1.15, LGA1700: 1.12, AM4: 1, LGA1200: 0.85 };
  const factor = platform[str(p, "socket").toUpperCase().replace(/\s+/g, "")] ?? 0.6;
  // En juegos pesan más la frecuencia y la caché que la cantidad de núcleos.
  const threadsWeight = profile === "gamer" ? Math.min(threads, 16) : threads;
  const x3d = profile === "gamer" && /x3d/i.test(p.name) ? 1.2 : 1;
  // Los Ryzen con video integrado (8500G, 5600G…) tienen menos caché y menos líneas PCIe: en una gamer rinden menos.
  const apu = profile === "gamer" && /ryzen\s*[3579]\s*\d{4}g\b/i.test(p.name) ? 0.75 : 1;
  return threadsWeight * boost * factor * x3d * apu;
}

/** Un kit de dos módulos va en doble canal: rinde más que un módulo solo de la misma capacidad. */
const ramScore = (p: PcPart) =>
  (num(p, "capacity") ?? 8) * (1 + (num(p, "freq") ?? 3200) / 20000) * ((num(p, "modules") ?? (/\b2\s*x\s*\d|\bkit\b|dual/i.test(p.name) ? 2 : 1)) >= 2 ? 1.15 : 1);
const ssdScore = (p: PcPart) => Math.min(num(p, "capacity") ?? 240, 2000) / 1000 + (num(p, "pcie") ?? 0) * 0.3 + (p.compat.hdd ? -0.5 : 0);

export function score(step: PcStep, p: PcPart, profile: Profile): number {
  if (step === "gpu") return gpuScore(p);
  if (step === "cpu") return cpuScore(p, profile);
  if (step === "ram") return ramScore(p);
  if (step === "ssd") return ssdScore(p);
  return 0;
}

/** Lo mínimo que tiene que cumplir cada pieza para ese perfil. */
function meetsProfile(step: PcStep, p: PcPart, profile: Profile, build: Build): boolean {
  const cap = num(p, "capacity");
  if (step === "ram") return profile === "office" ? (cap ?? 0) >= 8 : profile === "creator" ? (cap ?? 0) >= 32 : (cap ?? 0) >= 16;
  if (step === "ssd") {
    if (p.compat.hdd) return false;
    return profile === "office" ? (cap ?? 0) >= 240 : profile === "creator" ? (cap ?? 0) >= 1000 : (cap ?? 0) >= 480;
  }
  if (step === "cpu" && profile === "office" && !build.gpu) return p.compat.igpu === true;
  if (step === "gpu") return profile !== "office" && gpuScore(p) >= (profile === "gamer" ? 18 : 15) && gpuMaker(p) != null;
  if (step === "psu" && (profile !== "office" || build.gpu)) return !/sin cert/i.test(str(p, "cert")) && str(p, "cert") !== "";
  if (step === "case" && profile !== "office") return (num(p, "fans") ?? 1) >= 1;
  return true;
}

/** Pasos que no hacen falta con lo elegido y el perfil. */
function skipStep(step: PcStep, build: Build, profile: Profile): boolean {
  if (step === "gpu") return profile === "office" && build.cpu?.compat.igpu === true;
  if (step === "cooler") {
    const tdp = build.cpu ? num(build.cpu, "tdp") ?? 65 : 65;
    return build.cpu?.compat.cooler === true && (profile === "office" || tdp <= 65);
  }
  if (step === "psu") return build.case?.compat.psuIncluded === true && profile === "office";
  return false;
}

export interface AutoInput {
  profile: Profile;
  /** En la moneda en que se muestran los precios. null = sin tope: la mejor relación precio/calidad. */
  budget: number | null;
  /** Lo que ya eligió el comercio: no se toca. */
  locked: Build;
  catalog: Partial<Record<PcStep, PcPart[]>>;
  /** Precio por unidad de la oferta (el del armador), null si no tiene precio. */
  price: (o: ProductDTO) => { amount: number } | null;
  inStock: (o: ProductDTO) => boolean;
  qty?: Qty;
}

export interface AutoResult {
  parts: Build;
  /** Pasos que eligió el armado automático. */
  picked: PcStep[];
  total: number;
  notes: string[];
}

const RANK: Record<Level, number> = { ok: 0, warn: 1, bad: 2 };

export function autoBuild(input: AutoInput): AutoResult {
  const { profile, budget, locked, catalog, price, inStock } = input;
  const qty = input.qty ?? {};
  const costOf = (p: PcPart): number | null => {
    const prices = p.offers.filter(inStock).map((o) => price(o)?.amount).filter((x): x is number => x != null && x > 0);
    return prices.length ? Math.min(...prices) : null;
  };
  const cost = new Map<string, number | null>();
  const c = (p: PcPart) => {
    if (!cost.has(p.contentId)) cost.set(p.contentId, costOf(p));
    return cost.get(p.contentId)!;
  };
  const build: Build = { ...locked };
  const picked: PcStep[] = [];
  const notes: string[] = [];
  const total = () => Object.entries(build).reduce((sum, [st, p]) => sum + (c(p!) ?? 0) * Math.max(1, qty[st as PcStep] ?? 1), 0);

  /** Candidatos de un paso: con stock y precio, compatibles con lo elegido, que cumplen el perfil. Los "ok" antes que los "verificar". */
  const candidates = (step: PcStep, base: Build) => {
    const rows = (catalog[step] ?? [])
      .map((p) => ({ p, cost: c(p), v: verdict(step, p, base, qty).level }))
      .filter((r): r is { p: PcPart; cost: number; v: Level } => r.cost != null && r.v !== "bad" && meetsProfile(step, r.p, profile, base));
    const best = Math.min(...rows.map((r) => RANK[r.v]));
    return rows.filter((r) => RANK[r.v] === best);
  };

  /** La pieza más barata que cumple; entre parecidas, la de ficha verificada. */
  const cheapest = (rows: { p: PcPart; cost: number }[], step: PcStep) =>
    rows.slice().sort((a, b) => a.cost * (dataQuality(step, a.p) === "verified" ? 0.97 : 1) - b.cost * (dataQuality(step, b.p) === "verified" ? 0.97 : 1))[0];

  const choose = (step: PcStep, target: number | null) => {
    const rows = candidates(step, build);
    if (!rows.length) return null;
    if (!PERF.includes(step)) {
      // Fuente: con margen sobre lo recomendado y, en gamer, una de calidad razonable.
      if (step === "psu") {
        const need = powerNeed(build, qty)?.recommended ?? 0;
        // Siempre que haya, una certificada: una genérica es la pieza que más falla.
        const certified = rows.filter((r) => str(r.p, "cert") !== "" && !/sin cert/i.test(str(r.p, "cert")));
        const pool = certified.length ? certified : rows;
        const roomy = pool.filter((r) => (num(r.p, "watts") ?? 0) >= need * 1.1);
        return cheapest(roomy.length ? roomy : pool, step);
      }
      if (step === "case" && profile !== "office") {
        const ventilated = rows.filter((r) => (num(r.p, "fans") ?? 0) >= 2);
        return cheapest(ventilated.length ? ventilated : rows, step);
      }
      if (step === "cooler") {
        const tdp = build.cpu ? num(build.cpu, "tdp") ?? 65 : 65;
        // Sin TDP informado se da por suficiente; hasta 105 W alcanza uno de aire, que es más barato.
        const enough = rows.filter((r) => (num(r.p, "tdp") ?? tdp) >= tdp);
        // Mejor uno que informa el socket del procesador; entre los que no lo informan, que el nombre no sea de la otra marca.
        const socket = build.cpu ? str(build.cpu, "socket").toUpperCase().replace(/\s+/g, "") : "";
        const sockets = (p: PcPart) => (Array.isArray(p.compat.sockets) ? (p.compat.sockets as string[]) : []);
        const named = (p: PcPart) => (/\bAM[45]\b|\bAMD\b|ryzen|wraith/i.test(p.name) ? "AM" : /\bLGA\b|intel/i.test(p.name) ? "LGA" : null);
        const fits = enough.filter((r) => {
          const list = sockets(r.p);
          if (list.length) return list.some((x) => x.toUpperCase().replace(/\s+/g, "") === socket);
          const brand = named(r.p);
          return !socket || !brand || socket.startsWith(brand);
        });
        const pool = fits.length ? fits : enough.length ? enough : rows;
        const air = tdp <= 105 ? pool.filter((r) => str(r.p, "kind") !== "liquid") : [];
        return cheapest(air.length ? air : pool, step);
      }
      return cheapest(rows, step);
    }
    if (target == null) {
      // Sin presupuesto: la mejor relación rendimiento / precio.
      return rows.slice().sort((a, b) => score(step, b.p, profile) / Math.pow(b.cost, 0.85) - score(step, a.p, profile) / Math.pow(a.cost, 0.85))[0];
    }
    const fit = rows.filter((r) => r.cost <= target);
    if (!fit.length) return cheapest(rows, step);
    return fit.slice().sort((a, b) => score(step, b.p, profile) - score(step, a.p, profile) || a.cost - b.cost)[0];
  };

  // 1) Una pieza por paso, con la parte del presupuesto que le toca.
  const missing = ORDER.filter((st) => !build[st]);
  const shares = SHARE[profile];
  for (const step of ORDER) {
    if (build[step] || skipStep(step, build, profile)) continue;
    let target: number | null = null;
    if (budget != null) {
      const left = budget - total();
      const pending = missing.filter((st) => !build[st] && !skipStep(st, build, profile));
      const weight = pending.reduce((sum, st) => sum + shares[st], 0) || 1;
      target = Math.max(0, (left * shares[step]) / weight);
    }
    const pick = choose(step, target);
    if (!pick) {
      if (step !== "gpu" && step !== "cooler") notes.push(`No hay ${STEP_NAME[step]} compatible con stock en tus distribuidores.`);
      continue;
    }
    build[step] = pick.p;
    picked.push(step);
  }

  // 2) Con lo que sobra, se mejora lo que más rinde, sin romper la compatibilidad.
  if (budget != null) {
    for (let round = 0; round < 12; round++) {
      let improved = false;
      for (const step of UPGRADE[profile]) {
        if (!picked.includes(step) || !build[step]) continue;
        const current = build[step]!;
        const curScore = score(step, current, profile);
        const room = budget - total() + (c(current) ?? 0);
        const others: Build = { ...build };
        delete others[step];
        const better = candidates(step, others)
          .filter((r) => r.cost <= room && score(step, r.p, profile) > curScore * 1.04)
          .sort((a, b) => score(step, b.p, profile) - score(step, a.p, profile))[0];
        if (!better) continue;
        const trial: Build = { ...build, [step]: better.p };
        // Que lo demás siga siendo compatible (una placa más grande puede no entrar o pedir más fuente).
        const broken = (Object.keys(trial) as PcStep[]).filter((st) => st !== step && verdict(st, trial[st]!, trial, qty).level === "bad");
        if (broken.some((st) => st !== "psu" || !picked.includes("psu"))) continue;
        const prev = { ...build };
        const restore = () => {
          for (const k of Object.keys(build) as PcStep[]) delete build[k];
          Object.assign(build, prev);
        };
        Object.assign(build, trial);
        if (broken.includes("psu")) {
          delete build.psu;
          const psu = choose("psu", null);
          if (!psu) { restore(); continue; }
          build.psu = psu.p;
        }
        if (total() > budget) { restore(); continue; }
        improved = true;
      }
      if (!improved) break;
    }
    const t = total();
    if (t > budget) notes.push(`El presupuesto no alcanza: el armado compatible más barato con este perfil sale más.`);
  }
  if (profile === "gamer" && !build.gpu) notes.push("No hay placa de video con stock que entre: elegila a mano.");
  if (build.cpu && build.mobo) {
    const fam = cpuFamily(build.cpu);
    if (fam && /x3d/i.test(build.cpu.name)) notes.push("Elegido un procesador X3D: rinde más en juegos.");
  }
  return { parts: build, picked, total: total(), notes };
}

const STEP_NAME: Record<PcStep, string> = {
  cpu: "procesador", mobo: "mother", ram: "memoria", gpu: "placa de video", ssd: "disco", psu: "fuente", case: "gabinete", cooler: "refrigeración",
};
