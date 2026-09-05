/**
 * Detección de marcas en productos que no la traen.
 *
 * La idea: si una palabra se repite en muchos nombres de un mismo proveedor y
 * parece un nombre propio (no una palabra del rubro), es la marca. "Sentey" en
 * 52 de 60 nombres es la marca; "gabinete" también se repite pero es genérica.
 *
 * Determinístico y barato. La IA entra después, solo para validar la lista
 * corta de candidatos, no para leer todos los productos.
 */

export interface BrandCandidateProduct {
  externalId: string;
  name: string;
  /** Otros textos donde puede venir la marca (tags, categoría, descripción). */
  extra?: (string | null | undefined)[];
}

export interface BrandCandidate {
  /** Cómo se escribe más seguido en los nombres. */
  brand: string;
  normalized: string;
  /** Productos en los que aparece. */
  count: number;
  /** 0..1: cuánto se parece a una marca (posición, forma, no genérica). */
  score: number;
  /** Coincide con una marca ya conocida en la plataforma. */
  known: boolean;
  externalIds: string[];
  sampleNames: string[];
}

/** Palabras del rubro que se repiten en todo catálogo y nunca son marca. */
const GENERIC_WORDS = new Set(
  `
  gabinete gabinetes fuente fuentes cooler coolers kit kits pack combo teclado mouse mouses monitor monitores notebook notebooks
  placa placas video memoria memorias disco discos ssd hdd nvme ram ddr4 ddr5 procesador procesadores micro motherboard mother
  auricular auriculares parlante parlantes cable cables cargador cargadores adaptador adaptadores hub switch router modem camara
  camaras webcam impresora impresoras toner tinta cartucho cartuchos papel silla sillas escritorio mesa gamer gaming oficina hogar
  negro negra black blanco blanca white rojo azul verde gris plata dorado rgb argb a-rgb led lcd ips oled tft vidrio templado mesh
  frontal lateral superior inferior trasero delantero panel paneles filtro anti polvo control controladora remoto inalambrico
  inalambrica wireless bluetooth usb hdmi vga dvi displayport tipo type audio video digital analogico oem bulk box retail
  garantia garantias meses anos año años dias hasta con sin para por del de la el los las un una y o e mas plus pro max mini
  micro ultra super hyper extra full hd fhd uhd 4k 2k 1080p 720p pulgadas pulgada mm cm kg gr watts watt w v amp amper
  certificada certificado certificadas certificados eficiencia modular semi bronze gold silver platinum titanium
  m-atx atx itx e-atx mini-itx micro-atx matx formato torre tower peak real power fan fans ventilador ventiladores
  pwm rpm dba nivel ruido ruido vgas vga incluye incluido incluidos sin unidad unidades caja cajas x pcs pc pcs
  fuente-gabinete gabinete-fuente kit-gabinete pecera panoramica cubo dell lenovo hp calidad tipo producto productos articulo articulos item items modelo marca nuevo nueva original generico generica
  cpu gpu psu apu aio watercooler water cooling liquid refrigeracion sodimm udimm dimm nvme sata ssd hdd hd disk drive
  mb motherboard mother placa madre socket am4 am5 lga vga nb notebook pcs desktop combo headset earbuds mousepad pad
  toner cartucho drum botella tinta ml pag paginas access point router switch ap wifi wireless bt bluetooth
  monitor tv led lcd tft ips va oled curvo curva hz ghz mhz gb tb mb kb bits fuente-de-poder vencido liquidacion
  ventilador cooler fan mesh glass templado pecera striker backfire hunter bearer a35 t10 f70 f75 f80 f-series
  `
    .split(/\s+/)
    .filter(Boolean)
);

/** "TM50", "SX550-TS", "FB600-LX" son modelos, no marcas. */
function looksLikeModelCode(token: string): boolean {
  return /\d/.test(token) && /[A-Za-z]/.test(token);
}

export function normalizeBrandToken(token: string): string {
  return token
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9+&-]/g, "");
}

const MIN_TOKEN_LENGTH = 3;
const MAX_TOKEN_LENGTH = 24;
const MIN_COUNT = 3;
/** Fracción del catálogo a partir de la cual una palabra es "muy repetida". */
const STRONG_SHARE = 0.25;

/**
 * Candidatas a marca para un lote de productos sin marca. `knownBrands` son las
 * marcas que ya existen en la plataforma (términos y alias), normalizadas.
 */
export function suggestBrands(products: BrandCandidateProduct[], knownBrands: Set<string>): BrandCandidate[] {
  if (products.length === 0) return [];
  const stats = new Map<string, BrandStat>();

  for (const product of products) {
    const seen = new Set<string>();
    const tokens = tokenize(product.name);
    tokens.forEach((raw, position) => {
      const norm = normalizeBrandToken(raw);
      if (!isCandidateToken(raw, norm) || seen.has(norm)) return;
      seen.add(norm);
      const s = stats.get(norm) ?? emptyStat();
      s.spellings.set(raw, (s.spellings.get(raw) ?? 0) + 1);
      s.count++;
      s.positionSum += Math.min(position, 6);
      if (position <= EARLY_POSITION) s.early++;
      s.ids.push(product.externalId);
      if (s.names.length < 3) s.names.push(product.name);
      stats.set(norm, s);
    });
    for (const text of product.extra ?? []) {
      if (!text) continue;
      for (const raw of tokenize(text)) {
        const norm = normalizeBrandToken(raw);
        if (!isCandidateToken(raw, norm) || seen.has(norm)) continue;
        seen.add(norm);
        const s = stats.get(norm) ?? emptyStat();
        s.spellings.set(raw, (s.spellings.get(raw) ?? 0) + 1);
        s.count++;
        s.positionSum += 2;
        s.early++;
        s.fromExtra++;
        s.ids.push(product.externalId);
        if (s.names.length < 3) s.names.push(product.name);
        stats.set(norm, s);
      }
    }
  }

  const total = products.length;
  // Si casi todos los nombres vienen en mayúsculas, la mayúscula no dice nada.
  const upperNames = products.filter((p) => p.name === p.name.toUpperCase()).length;
  const caseIsInformative = upperNames / total < 0.6;
  const out: BrandCandidate[] = [];
  for (const [norm, s] of stats) {
    const known = knownBrands.has(norm);
    if (!known && s.count < MIN_COUNT) continue;
    const spelling = [...s.spellings.entries()].sort((a, b) => b[1] - a[1])[0][0];
    const share = s.count / total;
    // La marca va al principio del nombre (primeras palabras). Una palabra que
    // casi siempre aparece más adentro es un atributo (AIO, WATERCOOLER, ARGB…).
    const earlyShare = s.early / s.count;
    if (!known && earlyShare < 0.4) continue;
    let score = 0;
    score += Math.min(share / STRONG_SHARE, 1) * 0.35;
    score += earlyShare * 0.35;
    if (caseIsInformative && (/^[A-Z][a-z]+$/.test(spelling) || /^[A-Z]{2,}$/.test(spelling))) score += 0.15;
    if (known) score += 0.3;
    if (s.fromExtra > 0) score += 0.1;
    score = Math.min(1, Math.round(score * 100) / 100);
    if (score < 0.35) continue;
    out.push({
      brand: known ? spelling : titleCase(spelling),
      normalized: norm,
      count: s.count,
      score,
      known,
      externalIds: [...new Set(s.ids)],
      sampleNames: s.names,
    });
  }
  return out.sort((a, b) => b.score - a.score || b.count - a.count);
}

type BrandStat = {
  spellings: Map<string, number>;
  count: number;
  positionSum: number;
  /** Veces que apareció entre las tres primeras palabras del nombre. */
  early: number;
  ids: string[];
  names: string[];
  fromExtra: number;
};

/** Hasta qué posición del nombre una palabra todavía puede ser la marca. */
const EARLY_POSITION = 2;

function emptyStat(): BrandStat {
  return { spellings: new Map(), count: 0, positionSum: 0, early: 0, ids: [], names: [], fromExtra: 0 };
}

function tokenize(text: string): string[] {
  return text
    .split(/[\s,;:/()[\]"'|]+/)
    .map((t) => t.replace(/^[-.]+|[-.]+$/g, ""))
    .filter(Boolean);
}

function isCandidateToken(raw: string, norm: string): boolean {
  if (norm.length < MIN_TOKEN_LENGTH || norm.length > MAX_TOKEN_LENGTH) return false;
  if (/^\d+$/.test(norm)) return false;
  if (GENERIC_WORDS.has(norm)) return false;
  if (looksLikeModelCode(raw)) return false;
  return true;
}

function titleCase(word: string): string {
  if (/^[A-Z0-9+&-]+$/.test(word) && word.length <= 4) return word;
  return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
}

/**
 * La primera marca conocida que aparece en el nombre (o en los campos extra) de
 * un producto. `known` mapea la forma normalizada al nombre canónico del término.
 * Sirve para que una carga nueva herede las marcas que ya se aprobaron.
 */
export function detectKnownBrand(product: BrandCandidateProduct, known: Map<string, string>): string | null {
  for (const text of [product.name, ...(product.extra ?? [])]) {
    if (!text) continue;
    for (const raw of tokenize(text)) {
      const label = known.get(normalizeBrandToken(raw));
      if (label) return label;
    }
  }
  return null;
}

/** Productos del lote cuyo nombre (o campos extra) contiene la marca como palabra entera. */
export function productsMatchingBrand(products: BrandCandidateProduct[], brand: string): string[] {
  const norm = normalizeBrandToken(brand);
  if (!norm) return [];
  return products
    .filter((p) => [p.name, ...(p.extra ?? [])].some((t) => t && tokenize(t).some((tok) => normalizeBrandToken(tok) === norm)))
    .map((p) => p.externalId);
}
