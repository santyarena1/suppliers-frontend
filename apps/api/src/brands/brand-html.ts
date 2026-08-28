export const BRAND_HUB_SLOTS = [
  "productos",
  "semaforos",
  "acciones",
  "materiales",
  "capacitaciones",
  "hablar",
  "nombre",
  "logo",
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
  "img",
  "a",
  "strong",
  "b",
  "em",
  "i",
  "ul",
  "ol",
  "li",
  "table",
  "thead",
  "tbody",
  "tr",
  "td",
  "th",
  "br",
  "hr",
  "section",
  "article",
  "header",
  "footer",
  "small",
  "blockquote",
]);

export type BrandHtmlPart = { type: "html"; html: string } | { type: "slot"; name: BrandHubSlot };

export function sanitizeBrandHtml(raw: string): string {
  if (!raw) return "";
  let html = raw.replace(/<!--[\s\S]*?-->/g, "");
  html = html.replace(/<\/?(script|style|iframe|object|embed|form|link|meta|svg|math)[\s\S]*?>/gi, "");
  html = html.replace(/\son[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "");
  html = html.replace(/\s(href|src)\s*=\s*("\s*javascript:[^"]*"|'\s*javascript:[^']*')/gi, "");
  html = html.replace(/<\/?([a-z0-9]+)([^>]*)>/gi, (full, tag: string, attrs: string) => {
    const name = tag.toLowerCase();
    const closing = full.startsWith("</");
    if (!ALLOWED_TAGS.has(name)) return "";
    if (closing) return `</${name}>`;
    const safe = sanitizeAttrs(name, attrs);
    const voidTags = name === "br" || name === "hr" || name === "img";
    return `<${name}${safe}${voidTags ? " />" : ">"}`;
  });
  return html.trim();
}

function sanitizeAttrs(tag: string, attrs: string): string {
  const out: string[] = [];
  const re = /([a-zA-Z:-]+)\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(attrs))) {
    const key = match[1].toLowerCase();
    const value = match[3] ?? match[4] ?? match[5] ?? "";
    if (key.startsWith("on")) continue;
    if (key === "style") continue;
    if ((key === "href" || key === "src") && /^\s*javascript:/i.test(value)) continue;
    if (tag === "a" && (key === "href" || key === "target" || key === "rel")) {
      out.push(`${key}="${escapeAttr(value)}"`);
      continue;
    }
    if (tag === "img" && (key === "src" || key === "alt" || key === "width" || key === "height")) {
      out.push(`${key}="${escapeAttr(value)}"`);
    }
  }
  if (tag === "a" && !/\btarget=/.test(out.join(" "))) {
    /* keep */
  }
  return out.length ? ` ${out.join(" ")}` : "";
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
  return parts.filter((part) => part.type === "slot" || part.html.trim());
}
