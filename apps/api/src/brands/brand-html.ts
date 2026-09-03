export const BRAND_HUB_SLOTS = [
  "productos",
  "semaforos",
  "acciones",
  "materiales",
  "capacitaciones",
  "hablar",
  "nombre",
  "logo",
  "noticias",
  "novedades",
] as const;

export type BrandHubSlot = (typeof BRAND_HUB_SLOTS)[number];

const SLOT_SET = new Set<string>(BRAND_HUB_SLOTS);

const ALLOWED_TAGS = new Set([
  "p",
  "div",
  "span",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "img",
  "a",
  "strong",
  "b",
  "em",
  "i",
  "u",
  "s",
  "ul",
  "ol",
  "li",
  "table",
  "thead",
  "tbody",
  "tfoot",
  "tr",
  "td",
  "th",
  "col",
  "colgroup",
  "caption",
  "br",
  "hr",
  "section",
  "article",
  "header",
  "footer",
  "nav",
  "main",
  "aside",
  "small",
  "blockquote",
  "pre",
  "code",
  "figure",
  "figcaption",
  "picture",
  "source",
  "video",
  "audio",
  "button",
  "label",
  "time",
  "mark",
  "sub",
  "sup",
  "dl",
  "dt",
  "dd",
  "address",
  "details",
  "summary",
  "center",
  "font",
  "abbr",
  "cite",
  "kbd",
  "samp",
  "var",
  "wbr",
  "ruby",
  "rt",
  "rp",
  "svg",
  "path",
  "g",
  "circle",
  "rect",
  "line",
  "polyline",
  "polygon",
  "ellipse",
  "text",
  "tspan",
  "defs",
  "lineargradient",
  "radialgradient",
  "stop",
  "use",
  "symbol",
  "clippath",
  "title",
  "desc",
  "mask",
  "pattern",
  "image",
  "view",
]);

const VOID_TAGS = new Set(["br", "hr", "img", "source", "col"]);

const BOOLEAN_ATTRS = new Set([
  "hidden",
  "controls",
  "muted",
  "loop",
  "playsinline",
  "open",
  "disabled",
  "checked",
  "selected",
  "multiple",
  "download",
  "reversed",
  "nowrap",
]);

const PRESENTATIONAL_ATTRS = new Set([
  "align",
  "valign",
  "bgcolor",
  "color",
  "background",
  "cellpadding",
  "cellspacing",
  "border",
  "face",
  "size",
  "hspace",
  "vspace",
  "scope",
  "headers",
  "abbr",
  "axis",
  "summary",
  "frame",
  "rules",
  "start",
  "span",
  "dir",
  "lang",
  "role",
  "tabindex",
  "content",
  "datetime",
  "open",
  "type",
  "media",
  "sizes",
  "width",
  "height",
  "colspan",
  "rowspan",
  "target",
  "rel",
  "loading",
  "decoding",
  "playsinline",
  "poster",
  "preload",
  "autoplay",
  "viewbox",
  "d",
  "fill",
  "stroke",
  "stroke-width",
  "stroke-linecap",
  "stroke-linejoin",
  "stroke-dasharray",
  "fill-opacity",
  "stroke-opacity",
  "fill-rule",
  "clip-rule",
  "cx",
  "cy",
  "r",
  "rx",
  "ry",
  "x",
  "y",
  "x1",
  "x2",
  "y1",
  "y2",
  "dx",
  "dy",
  "points",
  "transform",
  "opacity",
  "font-size",
  "font-family",
  "font-weight",
  "text-anchor",
  "dominant-baseline",
  "gradientunits",
  "gradienttransform",
  "offset",
  "stop-color",
  "stop-opacity",
  "preserveaspectratio",
  "xmlns",
  "xmlns:xlink",
  "clip-path",
  "mask",
  "filter",
  "vector-effect",
  "overflow",
  "display",
  "href",
  "xlink:href",
]);

const FONT_HREF = /^(https:\/\/fonts\.googleapis\.com\/|https:\/\/fonts\.gstatic\.com\/)/i;
const HTTPS_STYLESHEET = /^https:\/\//i;

export type BrandHtmlPart = { type: "html"; html: string } | { type: "slot"; name: BrandHubSlot };

export function sanitizeCss(raw: string): string {
  if (!raw) return "";
  let css = raw.replace(/\/\*[\s\S]*?\*\//g, "");
  css = css.replace(/@import\b[^;]*;?/gi, (rule) => {
    return /fonts\.googleapis\.com|fonts\.gstatic\.com/i.test(rule) ? rule : "";
  });
  css = css.replace(/expression\s*\(/gi, "invalid(");
  css = css.replace(/-moz-binding\s*:/gi, "invalid:");
  css = css.replace(/behavior\s*:/gi, "invalid:");
  css = css.replace(/url\s*\(\s*(['"]?)javascript:[^)]*\)/gi, "url(about:blank)");
  css = css.replace(/url\s*\(\s*(['"]?)vbscript:[^)]*\)/gi, "url(about:blank)");
  css = css.replace(/url\s*\(\s*(['"]?)data:(?!image\/|font\/|application\/(font|octet))/gi, "url($1blocked:");
  return css.trim();
}

/** En el canvas no hay html/body: el CSS de un documento pegado aplica al host. */
export function rewriteCssForShadow(css: string): string {
  return css
    .replace(/:root\b/g, ":host")
    .replace(/(^|[,+>~({\s])\s*(html|body)\b/gi, "$1:host")
    .replace(/position\s*:\s*fixed\b/gi, "position:absolute")
    .replace(/(min-height|max-height|height|min-block-size|block-size)\s*:\s*[^;{]*?(100vh|100dvh|100svh)/gi, "$1: auto")
    .replace(/min-height\s*:\s*auto\b/gi, "min-height:0");
}

/**
 * Un botón del HTML de la marca suele ser href="#" o un <button> sin destino
 * (los onclick se sanitizan). Por el texto se adivina a qué módulo de NODO iba.
 */
export function inferBrandHubTarget(text: string, href?: string | null): string | null {
  const h = (href ?? "").trim();
  if (/^#(productos|semaforos|acciones|novedades|noticias|materiales|capacitaciones|contacto|hablar)$/i.test(h)) {
    const key = h.toLowerCase();
    if (key === "#hablar") return "#contacto";
    if (key === "#noticias" || key === "#semaforos") return key === "#semaforos" ? "#productos" : "#novedades";
    return key;
  }
  if (/^#(products?|shop|catalog|skus?)$/i.test(h)) return "#productos";
  if (/^#(actions?|promo|promos)$/i.test(h)) return "#acciones";
  if (/^#(news|novedades|noticias)$/i.test(h)) return "#novedades";
  const useful =
    h &&
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

export function rewriteStyleTagsForShadow(html: string): string {
  return html.replace(/<style>([\s\S]*?)<\/style>/gi, (_, css: string) => `<style>${rewriteCssForShadow(css)}</style>`);
}

export function sanitizeBrandHtml(raw: string): string {
  if (!raw) return "";
  let html = raw.replace(/\u0000/g, "");
  const styles: string[] = [];
  const headLinks: string[] = [];

  html = html.replace(/<script\b[\s\S]*?<\/script>/gi, "");
  html = html.replace(/<script\b[^>]*>/gi, "");
  html = html.replace(/<(iframe|object|embed|form|base|meta|math|textarea|input|select|template|noscript)\b[\s\S]*?<\/\1>/gi, "");
  html = html.replace(/<\/?(iframe|object|embed|form|base|meta|math|textarea|input|select|template|noscript)[^>]*>/gi, "");

  html = html.replace(/<style\b[^>]*>([\s\S]*?)<\/style>/gi, (_, css: string) => {
    const clean = sanitizeCss(css);
    if (clean) styles.push(clean);
    return "";
  });

  html = html.replace(/<link\b[^>]*>/gi, (tag) => {
    const href = attrValue(tag, "href");
    const rel = (attrValue(tag, "rel") || "stylesheet").toLowerCase();
    if (!href) return "";
    if (FONT_HREF.test(href) && /stylesheet|preconnect|preload/.test(rel)) {
      headLinks.push(
        `<link rel="${escapeAttr(rel)}" href="${escapeAttr(href)}"${
          /preconnect/.test(rel) ? " crossorigin" : ""
        } />`
      );
      return "";
    }
    if (HTTPS_STYLESHEET.test(href) && rel.includes("stylesheet")) {
      headLinks.push(`<link rel="stylesheet" href="${escapeAttr(href)}" />`);
    }
    return "";
  });

  const bodyOpen = html.match(/<body\b([^>]*)>/i);
  const bodyClass = bodyOpen ? attrValue(bodyOpen[0], "class") : "";
  const bodyId = bodyOpen ? attrValue(bodyOpen[0], "id") : "";
  const bodyStyle = bodyOpen ? sanitizeCss(attrValue(bodyOpen[0], "style")) : "";
  const bodyBg = bodyOpen ? attrValue(bodyOpen[0], "bgcolor") : "";

  const body = html.match(/<body\b[^>]*>([\s\S]*?)<\/body>/i);
  if (body) html = body[1];
  html = html.replace(/<\/?(html|head|body|title|!doctype)[^>]*>/gi, "");
  html = html.replace(/<!--[\s\S]*?-->/g, "");
  html = html.replace(/\son[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "");

  html = html.replace(/<\/?([a-zA-Z][a-zA-Z0-9:-]*)([^>]*)>/g, (full, tag: string, attrs: string) => {
    const name = tag.toLowerCase();
    const closing = full.startsWith("</");
    if (name === "style" || name === "script" || name === "link") return "";
    if (!ALLOWED_TAGS.has(name)) return "";
    if (closing) return `</${name}>`;
    const safe = sanitizeAttrs(name, attrs);
    return VOID_TAGS.has(name) ? `<${name}${safe} />` : `<${name}${safe}>`;
  });

  if (bodyClass || bodyId || bodyStyle || bodyBg) {
    const cls = ["nodo-brand-root", bodyClass].filter(Boolean).join(" ");
    const styleBits = [bodyStyle, bodyBg ? `background-color:${bodyBg}` : ""].filter(Boolean).join(";");
    html = `<div class="${escapeAttr(cls)}"${bodyId ? ` id="${escapeAttr(bodyId)}"` : ""}${
      styleBits ? ` style="${escapeAttr(styleBits)}"` : ""
    }>${html}</div>`;
  }

  const head = headLinks.join("") + styles.map((css) => `<style>${css}</style>`).join("");
  return `${head}${html}`.trim();
}

function attrValue(tag: string, name: string): string {
  const re = new RegExp(`\\b${name}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s>]+))`, "i");
  const match = tag.match(re);
  return match?.[2] ?? match?.[3] ?? match?.[4] ?? "";
}

function sanitizeAttrs(tag: string, attrs: string): string {
  const out: string[] = [];
  const seen = new Set<string>();
  const re = /([a-zA-Z_:][a-zA-Z0-9:._-]*)(?:\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+)))?/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(attrs))) {
    const key = match[1].toLowerCase();
    if (seen.has(key)) continue;
    const hasValue = match[2] != null || match[5] != null;
    const value = match[3] ?? match[4] ?? match[5] ?? "";
    if (key.startsWith("on") || key === "srcdoc") continue;
    if (BOOLEAN_ATTRS.has(key) && !hasValue) {
      seen.add(key);
      out.push(key);
      continue;
    }
    if (!hasValue) continue;
    seen.add(key);
    if (key === "style") {
      const css = sanitizeCss(value);
      if (css) out.push(`style="${escapeAttr(css)}"`);
      continue;
    }
    if ((key === "href" || key === "src" || key === "poster" || key === "srcset" || key === "xlink:href") && !safeUrl(value, key, tag)) {
      continue;
    }
    if (key === "class" || key === "id" || key === "title" || key === "alt") {
      out.push(`${key}="${escapeAttr(value)}"`);
      continue;
    }
    if (key.startsWith("aria-") || key.startsWith("data-")) {
      out.push(`${key}="${escapeAttr(value)}"`);
      continue;
    }
    if (PRESENTATIONAL_ATTRS.has(key) || key.startsWith("stroke-") || key.startsWith("fill-")) {
      if (key === "target" && value !== "_blank" && value !== "_self") continue;
      if (key === "autoplay") continue;
      if (key === "background" && !safeUrl(value, "src", tag)) continue;
      out.push(`${key}="${escapeAttr(value)}"`);
    }
  }
  if (tag === "a" && out.some((a) => a.startsWith("href=")) && !out.some((a) => a.startsWith("rel="))) {
    out.push('rel="noopener noreferrer"');
  }
  return out.length ? ` ${out.join(" ")}` : "";
}

function safeUrl(value: string, key: string, tag?: string): boolean {
  const v = value.trim();
  if (!v) return false;
  if (/^\s*javascript:/i.test(v) || /^\s*vbscript:/i.test(v)) return false;
  if (v.startsWith("#")) return true;
  if (key === "xlink:href" || (tag === "use" && (key === "href" || key === "xlink:href"))) {
    return v.startsWith("#");
  }
  if (v.startsWith("/") || v.startsWith("mailto:") || v.startsWith("tel:")) return true;
  if (/^https?:\/\//i.test(v)) return true;
  if (key !== "href" && /^data:image\//i.test(v)) return true;
  if (key === "srcset") {
    return v.split(",").every((part) => {
      const url = part.trim().split(/\s+/)[0] ?? "";
      return !url || safeUrl(url, "src", tag);
    });
  }
  return false;
}

function escapeAttr(value: string) {
  return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
}

export function splitBrandHtml(raw: string): BrandHtmlPart[] {
  const html = sanitizeBrandHtml(raw);
  if (!html) return [];
  const parts: BrandHtmlPart[] = [];
  const re = /\{\{\s*([a-z]+)\s*\}\}/gi;
  let last = 0;
  let match: RegExpExecArray | null;
  while ((match = re.exec(html))) {
    if (match.index > last) {
      parts.push({ type: "html", html: html.slice(last, match.index) });
    }
    const name = match[1].toLowerCase();
    if (SLOT_SET.has(name)) parts.push({ type: "slot", name: name as BrandHubSlot });
    last = match.index + match[0].length;
  }
  if (last < html.length) parts.push({ type: "html", html: html.slice(last) });
  return parts.filter((part) => part.type === "slot" || Boolean(part.html.trim()));
}

export function compileBrandHtml(raw: string): { html: string; slots: BrandHubSlot[]; parts: BrandHtmlPart[] } {
  const parts = splitBrandHtml(raw);
  const slots: BrandHubSlot[] = [];
  const html = parts
    .map((part) => {
      if (part.type === "slot") {
        slots.push(part.name);
        return `<slot name="${part.name}"></slot>`;
      }
      return part.html;
    })
    .join("");
  return { html: rewriteStyleTagsForShadow(html), slots, parts };
}
