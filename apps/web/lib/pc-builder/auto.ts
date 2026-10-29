/**
 * Armado automático por gama, como arma un vendedor: el comercio elige la gama
 * (oficina, gamer de entrada, media o alta, diseño) y cada pieza sale de lo que
 * corresponde a esa gama, con stock en sus distribuidores, compatible con lo ya
 * elegido y al mejor precio. Si de una pieza no hay nada de esa gama, lo dice en
 * vez de poner cualquier cosa.
 */
import type { ProductDTO } from "@/lib/api";
import { dataQuality, gpuMaker, powerNeed, verdict, type Build, type Level, type PcPart, type PcStep, type Qty } from "./compat";

/** Para el puntaje de rendimiento (orden de "Recomendados"). */
export type Profile = "gamer" | "office" | "creator";

export type Tier = "office" | "gamer-entry" | "gamer-mid" | "gamer-high" | "creator";
/** Lo que elige el comercio: una gama, o que la gamer salga del presupuesto. */
export type TierChoice = Tier | "gamer-auto";

export const TIER_CHOICES: TierChoice[] = ["office", "gamer-entry", "gamer-mid", "gamer-high", "creator", "gamer-auto"];

export const TIER_LABEL: Record<TierChoice, string> = {
  office: "Oficina",
  "gamer-entry": "Gamer entrada",
  "gamer-mid": "Gamer media",
  "gamer-high": "Gamer alta",
  creator: "Diseño y streaming",
  "gamer-auto": "Gamer según presupuesto",
};

export const TIER_HINT: Record<TierChoice, string> = {
  office: "Ryzen 5 8500G/8600G o i3/i5 con video, mother A620/H610, 16 GB, 480 GB y gabinete kit con fuente.",
  "gamer-entry": "Ryzen 5 5500/5600 o i5-12400F, B550/B760, 16 GB, RTX 3050/4060 o RX 7600, 1 TB NVMe, fuente 550–650 W Bronze.",
  "gamer-mid": "Ryzen 5 7600/9600 o i5-14400F, B650/B760, 32 GB DDR5, RTX 5060 Ti o RX 9060 XT, 1 TB NVMe, fuente 650–750 W.",
  "gamer-high": "Ryzen 7 7700/9700X/7800X3D o i7, B650/B850/X870, 32 GB 6000, RTX 5070 o RX 9070, fuente 750–850 W Gold.",
  creator: "Ryzen 7/9 o i7/i9, B650/B850/X870, 32–64 GB, NVIDIA de 12–16 GB, 2 TB NVMe, fuente 750–850 W Gold.",
  "gamer-auto": "Arma la gama gamer más alta que entra en el presupuesto (cargalo abajo).",
};

const TIER_NAME: Record<Tier, string> = {
  office: "oficina",
  "gamer-entry": "gamer de entrada",
  "gamer-mid": "gamer media",
  "gamer-high": "gamer alta",
  creator: "diseño",
};

/** Orden: cada pieza compatible con las anteriores; la fuente al final, con el consumo conocido. */
const ORDER: PcStep[] = ["cpu", "mobo", "ram", "gpu", "ssd", "case", "cooler", "psu"];

/*
 * Marcas con las que un comercio arma una PC para vender. Las genéricas quedan
 * solo si no hay otra opción de la gama.
 */
const GOOD_PSU = /cooler\s*master|thermaltake|\basus\b|\brog\b|gigabyte|aorus|adata|\bxpg\b|corsair|\bmsi\b|evga|seasonic|be\s*quiet|deepcool|nzxt|antec|lian\s*li|super\s*flower|\bfsp\b|montech/i;
const GOOD_CASE = /cooler\s*master|thermaltake|adata|\bxpg\b|gigabyte|aorus|corsair|\basus\b|\brog\b|\bmsi\b|nzxt|lian\s*li|deepcool|montech|antec|be\s*quiet|fractal|phanteks|hyte|jonsbo/i;
const GOOD_MEMORY = /kingston|fury|western\s*digital|\bwd\b|samsung|crucial|adata|\bxpg\b|lexar|corsair|g\.?skill|team\s*group|t-?force|patriot|hiksemi|netac|seagate|kioxia|hynix|solidigm|gigabyte|\bmsi\b|pny/i;
const GOOD_COOLER = /cooler\s*master|deepcool|thermalright|id-?cooling|arctic|noctua|be\s*quiet|corsair|nzxt|lian\s*li|thermaltake|\basus\b|\bmsi\b|gigabyte|\bxpg\b|montech|wraith/i;
/** Lo que no se le arma a un cliente: golpeado, usado, outlet, reacondicionado. */
const NOT_NEW = /golpead|usad[oa]\b|outlet|reacondicionad|refurb|caja abierta|open box|da[ñn]ad/i;

const num = (p: PcPart, k: string) => (typeof p.compat[k] === "number" ? (p.compat[k] as number) : null);
const str = (p: PcPart, k: string) => (typeof p.compat[k] === "string" ? (p.compat[k] as string) : "");
const text = (p: PcPart) => `${p.brand ?? ""} ${p.name} ${str(p, "chip")} ${str(p, "chipset")}`;
const has = (re: RegExp) => (p: PcPart) => re.test(text(p));
/**
 * Preferencia de marca "blanda": solo cuenta si la de marca más barata cuesta hasta
 * BRAND_SLACK más que la más barata de todas. Si no, gana la económica: a veces hay
 * que ahorrar en cada pieza.
 */
const BRAND_SLACK = 0.15;
type Pref = ((p: PcPart, build: Build) => boolean) & { soft?: boolean };
const brand = (re: RegExp): Pref => Object.assign((p: PcPart) => re.test(text(p)), { soft: true });
const certRank = (cert: string) =>
  /titanium/i.test(cert) ? 5 : /platinum/i.test(cert) ? 4 : /gold/i.test(cert) ? 3 : /silver/i.test(cert) ? 2 : /bronze/i.test(cert) ? 1 : 0;
const ghz = (v: string) => {
  const m = v.replace(",", ".").match(/\d+(\.\d+)?/);
  const x = m ? Number(m[0]) : 0;
  return x > 100 ? x / 1000 : x;
};

/* ── Rendimiento (también lo usa el orden "Recomendados" de cada paso) ── */

/** Rendimiento relativo en juegos (1080p) por chip; lo que no está se estima por la memoria. */
const GPU_TIERS: [RegExp, number][] = [
  // Placas de workstation (Quadro, RTX A400…): para juegos, diseño o streaming rinden como una de entrada.
  [/quadro|\brtx\s*a\d{3,4}\b|radeon\s*pro\b/i, 10],
  [/rtx\s*5090/i, 150], [/rtx\s*4090/i, 125], [/rtx\s*5080/i, 105], [/rtx\s*4080/i, 100], [/rx\s*7900\s*xtx/i, 100],
  [/rx\s*9070\s*xt/i, 95], [/rtx\s*5070\s*ti/i, 92], [/rx\s*7900\s*xt\b/i, 88], [/rtx\s*4070\s*ti\s*super/i, 88],
  [/rx\s*9070\s*gre|rx\s*9070\b.*\bgre\b/i, 72], [/rx\s*9070\b/i, 85], [/rtx\s*4070\s*ti/i, 82], [/rtx\s*5070\b/i, 76], [/rtx\s*4070\s*super/i, 75], [/rx\s*7900\s*gre/i, 75],
  [/rx\s*7800\s*xt/i, 70], [/rtx\s*4070\b/i, 66], [/rx\s*6800\s*xt/i, 70], [/rx\s*6800\b/i, 64], [/rtx\s*3080/i, 72],
  [/rtx\s*5060\s*ti/i, 60], [/rx\s*7700\s*xt/i, 60], [/rtx\s*3070\s*ti/i, 61], [/rtx\s*3070/i, 58], [/rx\s*9060\s*xt/i, 56],
  [/rx\s*6750\s*xt/i, 55], [/rtx\s*4060\s*ti/i, 53], [/rtx\s*5060\b/i, 52], [/rx\s*6700\s*xt/i, 52], [/arc\s*b580/i, 50],
  [/rtx\s*3060\s*ti/i, 50], [/rx\s*7600\s*xt/i, 47], [/rtx\s*4060\b/i, 45], [/rx\s*7600\b/i, 45], [/arc\s*b570/i, 45],
  [/arc\s*a770/i, 45], [/rx\s*6650\s*xt/i, 44], [/rtx\s*5050/i, 42], [/arc\s*a750/i, 42], [/rtx\s*3060\b/i, 40],
  [/rx\s*6600\s*xt/i, 42], [/rx\s*6600\b/i, 38], [/arc\s*a580/i, 35], [/rtx\s*2060/i, 33], [/rtx\s*3050/i, 29],
  [/gtx\s*1660\s*(super|ti)/i, 30], [/gtx\s*1660/i, 26], [/rx\s*6500\s*xt/i, 18], [/gtx\s*1650/i, 20], [/arc\s*a380/i, 15],
  [/rx\s*6400/i, 15], [/rx\s*580/i, 18], [/rx\s*550/i, 8], [/gtx\s*1050/i, 10], [/gt\s*1030/i, 6], [/gt\s*730/i, 3], [/gt\s*710/i, 2], [/gt\s*[26]10/i, 1],
];

export function gpuScore(p: PcPart): number {
  const t = `${str(p, "chip")} ${p.name}`;
  for (const [re, v] of GPU_TIERS) if (re.test(t)) return v;
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

/* ── Reglas por gama ── */

/**
 * Cómo se elige una pieza dentro de la gama:
 * - `match`: lo que es de la gama (si no hay nada, la pieza queda sin elegir y se avisa);
 * - `prefer`: preferencias en orden, mientras dejen alguna opción (marca, kit de 2 módulos…);
 * - `pick`: "value" = más rendimiento por peso; un número = percentil de precio (0 = la más barata).
 */
interface PartRule {
  match: (p: PcPart, build: Build) => boolean;
  prefer?: ((p: PcPart, build: Build) => boolean)[];
  pick: "value" | number;
}
/** `skip`: la pieza no va (oficina sin placa; cooler o fuente que ya vienen incluidos). */
type TierRules = Record<PcStep, PartRule | ((build: Build) => PartRule | "skip")>;

const capacity = (min: number, max = Infinity) => (p: PcPart) => {
  const c = num(p, "capacity") ?? 0;
  return c >= min && c <= max;
};
const nvme = (p: PcPart) => /nvme|pcie/i.test(`${str(p, "iface")} ${p.name}`) && !/sata/i.test(str(p, "iface"));
const notHdd = (p: PcPart) => !p.compat.hdd;
const watts = (min: number, max: number) => (p: PcPart) => {
  const w = num(p, "watts") ?? 0;
  return w >= min && w <= max;
};
const certified = (min: number) => (p: PcPart) => certRank(str(p, "cert")) >= min;
const isAir = (p: PcPart) => str(p, "kind") !== "liquid" && !/water|l[ií]quid|aio\b/i.test(p.name);
const BIG_COOLER = /dual\s*tower|doble\s*torre|ak620|pa120|phantom|peerless|nh-?d15|dark\s*rock\s*pro|\b(240|280|360)\b|aio|water|l[ií]quid/i;
const cpuHasCooler = (b: Build) => b.cpu?.compat.cooler === true;
const caseHasPsu = (b: Build) => b.case?.compat.psuIncluded === true;

/** Fuente de la gama, con margen sobre lo que pide la PC (si una placa pide más, sube el tope). */
const psuRule = (min: number, max: number, cert: number) => (b: Build): PartRule => {
  const need = (powerNeed(b)?.recommended ?? 0) * 1.15;
  const lo = Math.max(min, need);
  return {
    match: (p) => watts(lo, Math.max(max, lo + 100))(p) && certified(cert)(p),
    prefer: [brand(GOOD_PSU)],
    pick: 0,
  };
};

const TIERS: Record<Tier, TierRules> = {
  office: {
    cpu: {
      match: (p) =>
        p.compat.igpu === true &&
        /ryzen\s*[35]\s*(pro\s*)?(5[56]00gt?|8[3-6]00g)\b|\bi[35][\s-]*1[2-4]\d{3}\b(?!\s*f)|core\s*(ultra\s*5|i[35])\b.*\b(2[2-4]5|1[2-4][1-5]\d{2})\b/i.test(p.name) &&
        !/\d{4,5}f\b/i.test(p.name),
      prefer: [(p) => /ryzen\s*5\s*8[56]00g|i5/i.test(p.name)],
      pick: 0,
    },
    mobo: { match: has(/\b(a[56]20|h[67]10|h510)\b/i), prefer: [has(/gigabyte|asus|msi|asrock/i)], pick: 0 },
    ram: { match: capacity(16, 16), prefer: [brand(GOOD_MEMORY)], pick: 0 },
    gpu: () => "skip",
    ssd: { match: (p) => notHdd(p) && capacity(480, 1000)(p), prefer: [brand(GOOD_MEMORY), capacity(480, 520)], pick: 0 },
    // Gabinete kit con fuente (y, si hay, teclado y mouse).
    case: { match: (p) => p.compat.psuIncluded === true || /\+\s*\d{3}\s*w|fuente|psu|kit/i.test(p.name), prefer: [has(/kit|teclado|mouse|tec\s*\+\s*mou/i)], pick: 0 },
    cooler: (b) => (cpuHasCooler(b) ? "skip" : { match: isAir, prefer: [brand(GOOD_COOLER)], pick: 0 }),
    psu: (b) => (caseHasPsu(b) || /\+\s*\d{3}\s*w|fuente|psu/i.test(b.case?.name ?? "") ? "skip" : { ...psuRule(450, 600, 0)(b), prefer: [brand(GOOD_PSU)] }),
  },
  "gamer-entry": {
    cpu: { match: has(/ryzen\s*5\s*(5500|5600x?|5600t)\b(?!\s*g)|\bi3[\s-]*1[2-4]100f?\b|\bi5[\s-]*1[2-4]400f?\b/i), pick: "value" },
    mobo: { match: has(/\b(b450|b550|b660|b760)\b/i), prefer: [has(/gigabyte|asus|msi|asrock/i)], pick: 0 },
    ram: { match: capacity(16, 16), prefer: [brand(GOOD_MEMORY), (p) => (num(p, "modules") ?? 1) >= 2], pick: 0 },
    gpu: { match: (p) => gpuMaker(p) != null && /rtx\s*3050|rtx\s*3060\b(?!\s*ti)|rtx\s*4060\b(?!\s*ti)|rtx\s*5050|rx\s*6600|rx\s*7600\b(?!\s*xt)|arc\s*b5[78]0/i.test(text(p)), pick: "value" },
    ssd: { match: (p) => notHdd(p) && capacity(960, 1100)(p), prefer: [nvme, brand(GOOD_MEMORY)], pick: 0 },
    case: { match: (p) => p.compat.psuIncluded !== true && (num(p, "fans") ?? 0) >= 2, prefer: [brand(GOOD_CASE)], pick: 0 },
    cooler: (b) => (cpuHasCooler(b) ? "skip" : { match: isAir, prefer: [brand(GOOD_COOLER)], pick: 0 }),
    psu: psuRule(550, 650, 1),
  },
  "gamer-mid": {
    cpu: { match: has(/ryzen\s*5\s*(7500f|7600x?|8400f|9600x?)\b|\bi5[\s-]*1[34](400|500|600)k?f?\b|ultra\s*5\s*2[234]5/i), pick: "value" },
    mobo: { match: has(/\b(b650|b760|b850)\b/i), prefer: [has(/gigabyte|asus|msi|asrock/i)], pick: 0 },
    ram: { match: capacity(32, 32), prefer: [brand(GOOD_MEMORY), (p) => (num(p, "modules") ?? 1) >= 2], pick: 0 },
    gpu: { match: (p) => gpuMaker(p) != null && /rtx\s*(4060|5060)\s*ti|rtx\s*5060\b|rx\s*7600\s*xt|rx\s*7700\s*xt|rx\s*9060\s*xt/i.test(text(p)), pick: "value" },
    ssd: { match: (p) => notHdd(p) && capacity(960, 1100)(p) && nvme(p), prefer: [brand(GOOD_MEMORY), (p) => (num(p, "pcie") ?? 0) >= 4], pick: 0 },
    case: { match: (p) => p.compat.psuIncluded !== true && (num(p, "fans") ?? 0) >= 2, prefer: [brand(GOOD_CASE)], pick: 0.35 },
    cooler: { match: (p) => isAir(p) && !BIG_COOLER.test(p.name), prefer: [brand(GOOD_COOLER)], pick: 0 },
    psu: psuRule(650, 750, 1),
  },
  "gamer-high": {
    cpu: { match: has(/ryzen\s*7\s*(5700x3d|5800x3d|7700x?|7800x3d|9700x|9800x3d)\b|\bi7[\s-]*1[34]700k?f?\b|ultra\s*7\s*2[56]5/i), pick: "value" },
    mobo: { match: has(/\b(b650e?|b850|x670e?|x870e?|b760|z790|b860|z890)\b/i), prefer: [has(/gigabyte|aorus|asus|rog|msi|asrock/i)], pick: 0.4 },
    ram: { match: (p) => capacity(32, 32)(p) && (num(p, "freq") ?? 0) >= 5600, prefer: [brand(GOOD_MEMORY), (p) => (num(p, "freq") ?? 0) >= 6000, (p) => (num(p, "modules") ?? 1) >= 2], pick: 0 },
    gpu: { match: (p) => gpuMaker(p) != null && /rtx\s*(4070|5070)|rx\s*7800\s*xt|rx\s*7900|rx\s*9070/i.test(text(p)), pick: "value" },
    ssd: { match: (p) => notHdd(p) && capacity(960, 2100)(p) && nvme(p), prefer: [brand(GOOD_MEMORY), (p) => (num(p, "pcie") ?? 0) >= 4], pick: 0 },
    case: { match: (p) => p.compat.psuIncluded !== true && (num(p, "fans") ?? 0) >= 3, prefer: [brand(GOOD_CASE)], pick: 0.6 },
    cooler: { match: (p) => BIG_COOLER.test(p.name), prefer: [brand(GOOD_COOLER)], pick: 0 },
    psu: psuRule(750, 850, 3),
  },
  creator: {
    cpu: { match: has(/ryzen\s*(7\s*(7700x?|9700x)|9\s*(7900x?|9900x|7950x|9950x))\b|\bi[79][\s-]*1[34]\d{3}k?f?\b|ultra\s*[79]\s*2\d5/i), pick: "value" },
    mobo: { match: has(/\b(b650e?|b850|x670e?|x870e?|b760|z790|b860|z890)\b/i), prefer: [has(/gigabyte|aorus|asus|rog|proart|msi|asrock/i)], pick: 0.5 },
    ram: { match: capacity(32, 64), prefer: [brand(GOOD_MEMORY), (p) => (num(p, "modules") ?? 1) >= 2], pick: 0 },
    // NVIDIA por CUDA (Premiere, DaVinci, Blender), con 12 GB o más.
    gpu: { match: (p) => gpuMaker(p) === "NVIDIA" && /rtx\s*(3060|4060\s*ti|5060\s*ti|4070|5070)/i.test(text(p)), prefer: [(p) => (num(p, "vram") ?? 0) >= 12], pick: "value" },
    ssd: { match: (p) => notHdd(p) && capacity(1900, 2100)(p) && nvme(p), prefer: [brand(GOOD_MEMORY), (p) => (num(p, "pcie") ?? 0) >= 4], pick: 0 },
    case: { match: (p) => p.compat.psuIncluded !== true && (num(p, "fans") ?? 0) >= 3, prefer: [brand(GOOD_CASE), (p) => /atx/i.test(String(p.compat.forms ?? ""))], pick: 0.6 },
    cooler: { match: (p) => BIG_COOLER.test(p.name), prefer: [brand(GOOD_COOLER)], pick: 0 },
    psu: psuRule(750, 850, 3),
  },
};

const PROFILE_OF: Record<Tier, Profile> = { office: "office", "gamer-entry": "gamer", "gamer-mid": "gamer", "gamer-high": "gamer", creator: "creator" };
const STEP_NAME: Record<PcStep, string> = {
  cpu: "procesador", mobo: "mother", ram: "memoria", gpu: "placa de video", ssd: "disco", psu: "fuente", case: "gabinete", cooler: "refrigeración",
};

export interface AutoInput {
  tier: TierChoice;
  /** En la moneda en que se muestran los precios. Con "gamer-auto" elige la gama; con una gama fija, avisa si se pasa. */
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
  tier: Tier;
}

const RANK: Record<Level, number> = { ok: 0, warn: 1, bad: 2 };

function buildTier(tier: Tier, input: AutoInput): AutoResult {
  const { locked, catalog, price, inStock } = input;
  const qty = input.qty ?? {};
  const profile = PROFILE_OF[tier];
  const cost = new Map<string, number | null>();
  const c = (p: PcPart) => {
    if (!cost.has(p.contentId)) {
      const prices = p.offers.filter(inStock).map((o) => price(o)?.amount).filter((x): x is number => x != null && x > 0);
      cost.set(p.contentId, prices.length ? Math.min(...prices) : null);
    }
    return cost.get(p.contentId)!;
  };
  const build: Build = { ...locked };
  const picked: PcStep[] = [];
  const notes: string[] = [];

  for (const step of ORDER) {
    if (build[step]) continue;
    const raw = TIERS[tier][step];
    const rule = typeof raw === "function" ? raw(build) : raw;
    if (rule === "skip") continue;
    // Con stock y precio, nuevos, de la gama y compatibles con lo elegido (lo "ok" antes que lo "para revisar").
    const rows = (catalog[step] ?? [])
      .filter((p) => !NOT_NEW.test(p.name) && rule.match(p, build))
      .map((p) => ({ p, cost: c(p), v: verdict(step, p, build, qty).level }))
      .filter((r): r is { p: PcPart; cost: number; v: Level } => r.cost != null && r.v !== "bad");
    if (!rows.length) {
      notes.push(`No hay ${STEP_NAME[step]} de gama ${TIER_NAME[tier]} con stock y compatible en tus distribuidores: elegila a mano.`);
      continue;
    }
    const best = Math.min(...rows.map((r) => RANK[r.v]));
    let pool = rows.filter((r) => RANK[r.v] === best);
    for (const f of rule.prefer ?? []) {
      const next = pool.filter((r) => f(r.p, build));
      if (!next.length) continue;
      if ((f as Pref).soft) {
        const cheapestAll = Math.min(...pool.map((r) => r.cost));
        const cheapestPref = Math.min(...next.map((r) => r.cost));
        if (cheapestPref > cheapestAll * (1 + BRAND_SLACK)) continue;
      }
      pool = next;
    }
    let pick: (typeof pool)[number];
    if (rule.pick === "value") {
      pick = pool.slice().sort((a, b) => score(step, b.p, profile) / Math.pow(b.cost, 0.85) - score(step, a.p, profile) / Math.pow(a.cost, 0.85))[0];
    } else {
      // Entre precios parecidos, la de ficha verificada.
      const sorted = pool.slice().sort((a, b) => a.cost * (dataQuality(step, a.p) === "verified" ? 0.97 : 1) - b.cost * (dataQuality(step, b.p) === "verified" ? 0.97 : 1));
      pick = sorted[Math.round((sorted.length - 1) * rule.pick)];
    }
    build[step] = pick.p;
    picked.push(step);
  }

  const total = Object.entries(build).reduce((sum, [st, p]) => sum + (c(p!) ?? 0) * Math.max(1, qty[st as PcStep] ?? 1), 0);
  return { parts: build, picked, total, notes, tier };
}

/** Las gamas gamer, de la más alta a la más baja: con "según presupuesto" se usa la más alta que entra. */
const GAMER_DOWN: Tier[] = ["gamer-high", "gamer-mid", "gamer-entry"];

export function autoBuild(input: AutoInput): AutoResult {
  const { tier, budget } = input;
  if (tier === "gamer-auto") {
    if (budget == null) {
      const res = buildTier("gamer-mid", input);
      return { ...res, notes: ["Sin presupuesto: armé una gamer media.", ...res.notes] };
    }
    let cheapest: AutoResult | null = null;
    for (const t of GAMER_DOWN) {
      const res = buildTier(t, input);
      const complete = res.notes.length === 0;
      if (complete && res.total <= budget) return { ...res, notes: [`Con ese presupuesto entra una ${TIER_NAME[t]}.`] };
      if (!cheapest || res.total < cheapest.total) cheapest = res;
    }
    const res = cheapest!;
    return { ...res, notes: [`El presupuesto no alcanza para una gamer completa: la de ${TIER_NAME[res.tier]} sale más.`, ...res.notes] };
  }
  const res = buildTier(tier, input);
  if (budget != null && res.total > budget) res.notes.unshift(`Esta gama sale más que el presupuesto.`);
  return res;
}
