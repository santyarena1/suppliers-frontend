/** Destino nativo cuando el HTML de la marca tiene un botón muerto (href="#", <button>, onclick sanitizado). */
export function inferBrandHubTarget(text: string, href?: string | null): string | null {
  const h = (href ?? "").trim();
  if (/^#(productos|semaforos|acciones|novedades|noticias|materiales|capacitaciones|contacto|hablar)$/i.test(h)) {
    const key = h.toLowerCase();
    if (key === "#hablar") return "#contacto";
    if (key === "#noticias") return "#novedades";
    if (key === "#semaforos") return "#productos";
    return key;
  }
  if (/^#(products?|shop|catalog|skus?)$/i.test(h)) return "#productos";
  if (/^#(actions?|promo|promos)$/i.test(h)) return "#acciones";
  if (/^#(news|novedades|noticias)$/i.test(h)) return "#novedades";
  const useful =
    Boolean(h) &&
    h !== "#" &&
    !/^javascript:/i.test(h) &&
    (h.startsWith("/") || h.startsWith("http") || h.startsWith("mailto:") || h.startsWith("tel:"));
  if (useful) return null;
  const t = text
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "");
  if (/semaforo|mapa comercial|ver productos|nuestros productos|catalogo|sku|comprar|shop/.test(t)) return "#productos";
  if (/accion|promo|rebate|oferta/.test(t)) return "#acciones";
  if (/novedad|noticia|lanzamiento/.test(t)) return "#novedades";
  if (/material|ficha tecnica|descarg/.test(t)) return "#materiales";
  if (/capacit|curso|entrenamiento|argumentario/.test(t)) return "#capacitaciones";
  if (/hablar|contacto|mensaje|chat|escribin/.test(t)) return "#contacto";
  if (!h || h === "#" || /^javascript:/i.test(h)) return "#productos";
  return null;
}

/**
 * El shell de NODO es h-screen overflow-hidden: el hash nativo no mueve nada.
 * Hay que scrollear el overflow interno.
 */
export function scrollToBrandSection(hash: string) {
  if (typeof document === "undefined") return false;
  const id = hash.replace(/^#/, "");
  const el = document.getElementById(id);
  if (!el) return false;
  el.scrollIntoView({ behavior: "smooth", block: "start" });
  return true;
}

export function rewriteCssForBrandHost(css: string): string {
  return css
    .replace(/:root\b/g, ":host")
    .replace(/(^|[,+>~({\s])\s*(html|body)\b/gi, "$1:host")
    .replace(/position\s*:\s*fixed\b/gi, "position:absolute")
    .replace(/(min-height|max-height|height|min-block-size|block-size)\s*:\s*[^;{]*?(100vh|100dvh|100svh)/gi, "$1: auto")
    .replace(/min-height\s*:\s*auto\b/gi, "min-height:0");
}

const LANDING_MODULE_SLOTS = ["productos", "acciones", "novedades", "materiales", "capacitaciones", "contacto"] as const;

export function slotsDeclaredInBrandHtml(html: string): Set<string> {
  const found = new Set<string>();
  const re = /\{\{\s*([a-z]+)\s*\}\}|<slot\s+[^>]*name=["']([a-z]+)["']|data-nodo-slot=["']([a-z]+)["']/gi;
  let match: RegExpExecArray | null;
  while ((match = re.exec(html))) {
    const name = (match[1] || match[2] || match[3] || "").toLowerCase();
    if (name) found.add(name);
  }
  if (found.has("semaforos")) found.add("productos");
  if (found.has("noticias")) found.add("novedades");
  return found;
}

/** Si el HTML no trae un hueco, el módulo entra igual en esa misma landing. */
export function appendMissingLandingSlots(html: string): string {
  const declared = slotsDeclaredInBrandHtml(html);
  const missing = LANDING_MODULE_SLOTS.filter((name) => !declared.has(name));
  if (missing.length === 0) return html;
  const inner = missing.map((name) => `<slot name="${name}"></slot>`).join("");
  return `${html}<div class="nodo-landing-modules">${inner}</div>`;
}
