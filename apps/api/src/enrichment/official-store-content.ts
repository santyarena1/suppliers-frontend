/**
 * Ficha de datos (descripción y especificaciones) desde la página de producto de
 * las tiendas oficiales de Aula, IROK y ATK (Shopify, `body_html`). Las páginas
 * traen además galería, opiniones, preguntas y botones: eso no va a la ficha.
 */

export interface OfficialStoreContent {
  shortDescription: string | null;
  /** HTML simple: h3, h4, p, ul/li. */
  descriptionHtml: string | null;
  specs: { group: string | null; name: string; value: string }[];
}

/** Partes de la página que no son descripción del producto. */
const SKIP_CLASS = /testimonial|review|gallery|spec|table|cta|action|support|faq|avatar|star|rating|video|button|btn/i;
const SKIP_TAGS = new Set(["svg", "video", "img", "table", "style", "script", "button", "a", "iframe", "noscript", "form", "figure", "details", "picture", "source"]);
const VOID_TAGS = new Set(["img", "br", "hr", "input", "source", "meta", "link", "wbr", "col", "area", "embed", "track"]);
const BLOCK_TAGS: Record<string, "h3" | "h4" | "p" | "li"> = { h1: "h3", h2: "h3", h3: "h4", h4: "h4", h5: "h4", h6: "h4", p: "p", li: "li" };

const ENTITIES: Record<string, string> = {
  nbsp: " ", amp: "&", lt: "<", gt: ">", quot: '"', apos: "'",
  aacute: "á", eacute: "é", iacute: "í", oacute: "ó", uacute: "ú", ntilde: "ñ", uuml: "ü",
  Aacute: "Á", Eacute: "É", Iacute: "Í", Oacute: "Ó", Uacute: "Ú", Ntilde: "Ñ",
  deg: "°", plusmn: "±", times: "×", middot: "·", ndash: "–", mdash: "—", hellip: "…", reg: "®", trade: "™", copy: "©",
  laquo: "«", raquo: "»", ldquo: "“", rdquo: "”", lsquo: "‘", rsquo: "’", iexcl: "¡", iquest: "¿",
};

function decode(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
    if (e[0] === "#") {
      const code = e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : " ";
    }
    return ENTITIES[e] ?? ENTITIES[e.toLowerCase()] ?? m;
  });
}

function escape(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

const clean = (s: string) => decode(s).replace(/\s+/g, " ").trim();

interface Token {
  kind: "open" | "close" | "text";
  tag: string;
  attrs: string;
  text: string;
  selfClosing: boolean;
}

function* tokens(html: string): Generator<Token> {
  const re = /<!--[\s\S]*?-->|<(\/?)([a-zA-Z][a-zA-Z0-9-]*)((?:[^>"']|"[^"]*"|'[^']*')*)>|([^<]+)|</g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    if (m[0].startsWith("<!--")) continue;
    if (m[4] !== undefined) {
      yield { kind: "text", tag: "", attrs: "", text: m[4], selfClosing: false };
    } else if (m[2]) {
      const tag = m[2].toLowerCase();
      const attrs = m[3] ?? "";
      if (m[1]) yield { kind: "close", tag, attrs: "", text: "", selfClosing: false };
      else yield { kind: "open", tag, attrs, text: "", selfClosing: VOID_TAGS.has(tag) || /\/\s*$/.test(attrs) };
    }
  }
}

function classOf(attrs: string): string {
  return /\bclass\s*=\s*("([^"]*)"|'([^']*)')/i.exec(attrs)?.[2] ?? /\bclass\s*=\s*'([^']*)'/i.exec(attrs)?.[1] ?? "";
}

/** Bloques de texto de la página, sin lo que no es descripción. */
function descriptionBlocks(html: string): { type: "h3" | "h4" | "p" | "li"; text: string }[] {
  const stack: { tag: string; skip: boolean }[] = [];
  const blocks: { type: "h3" | "h4" | "p" | "li"; text: string }[] = [];
  let current: { type: "h3" | "h4" | "p" | "li"; text: string } | null = null;
  let loose = "";
  const skipping = () => stack.some((s) => s.skip);
  const flushLoose = () => {
    const t = clean(loose);
    if (t) blocks.push({ type: "p", text: t });
    loose = "";
  };
  const flushCurrent = () => {
    if (current) {
      const t = clean(current.text);
      if (t) blocks.push({ type: current.type, text: t });
    }
    current = null;
  };

  for (const t of tokens(html)) {
    if (t.kind === "text") {
      if (skipping()) continue;
      if (current) current.text += t.text;
      else loose += t.text;
      continue;
    }
    if (t.kind === "open") {
      if (t.tag === "br") {
        if (current) current.text += " ";
        else flushLoose();
        continue;
      }
      if (t.selfClosing) continue;
      const skip = SKIP_TAGS.has(t.tag) || SKIP_CLASS.test(classOf(t.attrs));
      stack.push({ tag: t.tag, skip });
      if (skip) continue;
      const block = BLOCK_TAGS[t.tag];
      if (block && !skipping()) {
        flushLoose();
        flushCurrent();
        current = { type: block, text: "" };
      } else if (!["strong", "b", "em", "i", "span", "u", "small", "sup", "sub", "mark"].includes(t.tag)) {
        // div, section…: corta el texto suelto.
        if (!current) flushLoose();
      }
      continue;
    }
    // Cierre: se saca hasta la etiqueta que abre (las páginas no siempre cierran todo).
    const at = stack.map((s) => s.tag).lastIndexOf(t.tag);
    if (at < 0) continue;
    const wasSkipping = skipping();
    stack.length = at;
    if (wasSkipping) continue;
    if (BLOCK_TAGS[t.tag]) flushCurrent();
    else if (!current) flushLoose();
  }
  flushCurrent();
  flushLoose();
  return blocks;
}

/** Tablas «Especificación | Detalle». Con más columnas, cada columna es un grupo (Basic / Pro / Max). */
function specRows(html: string): OfficialStoreContent["specs"] {
  const out: OfficialStoreContent["specs"] = [];
  const seen = new Set<string>();
  for (const table of html.match(/<table[\s\S]*?<\/table>/gi) ?? []) {
    let header: string[] | null = null;
    for (const tr of table.match(/<tr[\s\S]*?<\/tr>/gi) ?? []) {
      const cells = [...tr.matchAll(/<(td|th)[^>]*>([\s\S]*?)<\/\1>/gi)].map((c) => ({ th: c[1].toLowerCase() === "th", text: clean(c[2].replace(/<br\s*\/?>/gi, " ").replace(/<[^>]+>/g, " ")) }));
      if (cells.length < 2) continue;
      if (cells.every((c) => c.th)) {
        header = cells.map((c) => c.text);
        continue;
      }
      const name = cells[0].text.replace(/:$/, "");
      if (!name) continue;
      const values = cells.slice(1);
      if (values.length === 1) {
        if (!values[0].text) continue;
        const key = `|${name}`;
        if (seen.has(key)) continue;
        seen.add(key);
        out.push({ group: null, name, value: values[0].text });
        continue;
      }
      values.forEach((v, i) => {
        const group = header?.[i + 1]?.trim() || null;
        if (!v.text || !group) return;
        const key = `${group}|${name}`;
        if (seen.has(key)) return;
        seen.add(key);
        out.push({ group, name, value: v.text });
      });
    }
  }
  return out;
}

/** Títulos que la página repite y no aportan. */
const DROP_TEXT = /^(galer[ií]a|opiniones|preguntas frecuentes|especificaciones( t[eé]cnicas)?( completas)?|comprar|agregar al carrito|ver m[aá]s)\b/i;

const isShort = (b: { type: string; text: string }) => b.type === "p" && b.text.length < 60 && !/[.:;]$/.test(b.text);
const startsWithFigure = (s: string) => /^[\d+±~<>≤≥-]/.test(s);

/**
 * Las tarjetas de la página ("Peso ligero" / "47 ± 3 gramos", "0,181 ms" / "Latencia")
 * quedan como renglones sueltos: se juntan de a dos en una lista "título: dato".
 * Un renglón corto suelto antes de un título (la "volanta") se saca.
 */
function tidyCards(blocks: { type: "h3" | "h4" | "p" | "li"; text: string }[]) {
  // Tarjetas con título propio: "h4 Conectividad" + "p Bluetooth…", varias seguidas.
  for (let i = 0; i < blocks.length; i++) {
    let j = i;
    while (blocks[j]?.type === "h4" && blocks[j + 1]?.type === "p" && blocks[j + 1].text.length < 120 && blocks[j + 2]?.type !== "p") j += 2;
    const pairs = (j - i) / 2;
    if (pairs >= 2) {
      const items = Array.from({ length: pairs }, (_, k) => ({ type: "li" as const, text: `${blocks[i + 2 * k].text}: ${blocks[i + 2 * k + 1].text}` }));
      blocks.splice(i, j - i, ...items);
      i += items.length - 1;
    }
  }
  for (let i = 0; i < blocks.length; i++) {
    if (!isShort(blocks[i])) continue;
    let j = i;
    while (j < blocks.length && isShort(blocks[j])) j++;
    const run = blocks.slice(i, j);
    if (run.length === 1) {
      const next = blocks[i + 1];
      const prev = blocks[i - 1];
      const afterTitle = prev && (prev.type === "h3" || prev.type === "h4");
      if (!afterTitle && next && (next.type === "h3" || next.type === "h4")) {
        blocks.splice(i, 1);
        i -= 1;
      }
      continue;
    }
    const items: { type: "li"; text: string }[] = [];
    for (let k = 0; k < run.length; k += 2) {
      const a = run[k].text;
      const b = run[k + 1]?.text;
      if (!b) items.push({ type: "li", text: a });
      else if (startsWithFigure(a) && !startsWithFigure(b)) items.push({ type: "li", text: `${b}: ${a}` });
      else items.push({ type: "li", text: `${a}: ${b}` });
    }
    blocks.splice(i, run.length, ...items);
    i += items.length - 1;
  }
}

export function officialStoreContent(bodyHtml: string | null | undefined): OfficialStoreContent {
  const html = bodyHtml ?? "";
  const blocks = descriptionBlocks(html).filter((b) => !DROP_TEXT.test(b.text));
  // El primer título es el nombre del producto: la ficha ya lo muestra.
  if (blocks[0]?.type === "h3") blocks.shift();
  // Títulos sin nada debajo (la sección que seguía era la galería o la tabla).
  const kept = blocks.filter((b, i) => {
    if (b.type !== "h3" && b.type !== "h4") return true;
    const next = blocks[i + 1];
    return Boolean(next && next.type !== "h3" && (b.type === "h3" || next.type !== "h4"));
  });
  tidyCards(kept);
  const firstP = kept.find((b) => b.type === "p" && b.text.length >= 40) ?? null;
  const shortDescription = firstP ? (firstP.text.length > 320 ? `${firstP.text.slice(0, 317).replace(/\s+\S*$/, "")}…` : firstP.text) : null;

  const parts: string[] = [];
  let inList = false;
  for (const b of kept) {
    if (b === firstP) continue;
    if (b.type === "li" && !inList) {
      parts.push("<ul>");
      inList = true;
    } else if (b.type !== "li" && inList) {
      parts.push("</ul>");
      inList = false;
    }
    parts.push(`<${b.type}>${escape(b.text)}</${b.type}>`);
  }
  if (inList) parts.push("</ul>");
  const descriptionHtml = parts.join("\n").trim();
  return { shortDescription, descriptionHtml: descriptionHtml || null, specs: specRows(html) };
}
