/**
 * Locales de HardGamers.
 *
 * El listado vivo se lee de la portada (`/stores/{slug}`). Este arreglo es el
 * respaldo si esa página no responde: son los slugs que el sitio publicaba
 * cuando PrecioLíder dejó de andar. Incluye los que antes se salteaban porque
 * ya venían del agregador (Bracatech, Rocket Hard, The Gamer Shop, etc.).
 */
export const HARDGAMERS_FALLBACK_SLUGS = [
  "37bytes",
  "a4full",
  "acuarioInsumos",
  "amonpulTeam",
  "arHard",
  "armyTech",
  "auragamer",
  "backupComputacion",
  "bithard",
  "black",
  "bracatech",
  "clickGaming",
  "compel",
  "compufanStore",
  "compugarden",
  "crosshairGaming",
  "dinobyte",
  "enjoyComputer",
  "fullh4rd",
  "gamerfactory",
  "gamingCity",
  "gamingPoint",
  "gezatek",
  "goldenTech",
  "gorilaGames",
  "hardcore",
  "hardloots",
  "hfTecnologia",
  "hydraxtreme",
  "hypergaming",
  "integradosargentinos",
  "katech",
  "liontech",
  "logg",
  "maximus",
  "maxTecno",
  "megasoft",
  "mexx",
  "mgrtechno",
  "mmcomputacion",
  "netGaming",
  "noxie",
  "portalTech",
  "rminsumos",
  "rocketHard",
  "scpHardStore",
  "shopGamer",
  "silverHard",
  "slotOne",
  "spaceVideojuegos",
  "thegamershop",
  "tryHardware",
  "vccitSolutions",
  "venex",
  "vertexRetail",
  "wiztech",
  "xtpc",
] as const;

/**
 * Nombres que en Nodo no coinciden letra por letra con HardGamers.
 * "Rodk" es Rocket Hard en el sitio.
 */
const STORE_ALIASES: Record<string, string> = {
  rodk: "rockethard",
  rocket: "rockethard",
  rockethard: "rockethard",
};

export function normalizeStoreKey(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/gi, "");
}

/** Claves con las que un local se puede encontrar (nombre, slug y alias). */
export function storeMatchKeys(nameOrSlug: string): string[] {
  const key = normalizeStoreKey(nameOrSlug);
  if (!key) return [];
  const aliased = STORE_ALIASES[key] ?? key;
  return aliased === key ? [key] : [key, aliased];
}

export function storesMatch(a: string, b: string): boolean {
  const left = new Set(storeMatchKeys(a));
  return storeMatchKeys(b).some((k) => left.has(k));
}

/** Extrae slugs de `/stores/{slug}` desde el HTML de HardGamers. */
export function parseHardgamersStoreSlugs(html: string): string[] {
  const found = new Set<string>();
  const re = /(?:https?:\/\/(?:www\.)?hardgamers\.com\.ar)?\/stores\/([A-Za-z0-9]+)/g;
  for (const m of html.matchAll(re)) {
    const slug = m[1];
    if (slug) found.add(slug);
  }
  return [...found];
}

export function mergeHardgamersSlugs(...lists: Array<readonly string[] | string[] | undefined>): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const list of lists) {
    if (!list) continue;
    for (const raw of list) {
      const slug = raw.trim();
      if (!slug || seen.has(slug)) continue;
      seen.add(slug);
      out.push(slug);
    }
  }
  return out;
}
