export function decodeEntities(s: string): string {
  return s
    .replace(/&aacute;/gi, "á").replace(/&eacute;/gi, "é").replace(/&iacute;/gi, "í")
    .replace(/&oacute;/gi, "ó").replace(/&uacute;/gi, "ú").replace(/&ntilde;/gi, "ñ")
    .replace(/&Aacute;/g, "Á").replace(/&Eacute;/g, "É").replace(/&Iacute;/g, "Í")
    .replace(/&Oacute;/g, "Ó").replace(/&Uacute;/g, "Ú").replace(/&Ntilde;/g, "Ñ")
    .replace(/&nbsp;/gi, " ").replace(/&amp;/gi, "&").replace(/&quot;/gi, '"').replace(/&#39;/g, "'")
    .replace(/&lt;/gi, "<").replace(/&gt;/gi, ">");
}

export function stripTags(html: string): string {
  return decodeEntities(html.replace(/<br\s*\/?>/gi, " ").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim());
}

export interface HtmlLink {
  href: string;
  label: string;
}

export interface HtmlTable {
  headers: string[];
  rows: string[][];
  rowLinks: HtmlLink[][];
}

export function extractHtmlLinks(html: string): HtmlLink[] {
  const links: HtmlLink[] = [];
  const re = /<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    const href = decodeEntities(m[1]).trim();
    if (!href || /^(javascript:|#|mailto:)/i.test(href)) continue;
    links.push({ href, label: stripTags(m[2]) || href });
  }
  return links;
}

function attr(tag: string, name: string): string | undefined {
  const m = tag.match(new RegExp(`\\b${name}="([^"]*)"`, "i"))
    ?? tag.match(new RegExp(`\\b${name}='([^']*)'`, "i"));
  return m?.[1];
}

export interface HtmlFileForm {
  action: string;
  method: string;
  fileField: string;
  fields: Record<string, string>;
}

/** Formularios con `<input type=file>` — no inventa actions, solo lo que está en el HTML. */
export function parseFileUploadForms(html: string): HtmlFileForm[] {
  const forms: HtmlFileForm[] = [];
  const formRe = /<form\b([^>]*)>([\s\S]*?)<\/form>/gi;
  let m: RegExpExecArray | null;
  while ((m = formRe.exec(html))) {
    const body = m[2];
    const fileTag = body.match(/<input\b[^>]*type=["']file["'][^>]*>/i);
    if (!fileTag) continue;
    const fileField = attr(fileTag[0], "name") || "file";
    const fields: Record<string, string> = {};
    const inputRe = /<input\b([^>]*)>/gi;
    let inp: RegExpExecArray | null;
    while ((inp = inputRe.exec(body))) {
      const tag = inp[0];
      const type = (attr(tag, "type") ?? "text").toLowerCase();
      if (["button", "submit", "image", "file"].includes(type)) continue;
      const name = attr(tag, "name");
      if (!name) continue;
      fields[name] = attr(tag, "value") ?? "";
    }
    forms.push({
      action: attr(`<form ${m[1]}>`, "action") || "",
      method: (attr(`<form ${m[1]}>`, "method") || "post").toLowerCase(),
      fileField,
      fields,
    });
  }
  return forms;
}

/** Extrae tablas HTML simples (th/td). Conserva hrefs de cada fila. */
export function parseHtmlTables(html: string): HtmlTable[] {
  const tables: HtmlTable[] = [];
  const tableRe = /<table\b[^>]*>([\s\S]*?)<\/table>/gi;
  let m: RegExpExecArray | null;
  while ((m = tableRe.exec(html))) {
    const body = m[1];
    const headers: string[] = [];
    const thRe = /<th\b[^>]*>([\s\S]*?)<\/th>/gi;
    let th: RegExpExecArray | null;
    while ((th = thRe.exec(body))) headers.push(stripTags(th[1]));
    const rows: string[][] = [];
    const rowLinks: HtmlLink[][] = [];
    const trRe = /<tr\b[^>]*>([\s\S]*?)<\/tr>/gi;
    let tr: RegExpExecArray | null;
    while ((tr = trRe.exec(body))) {
      const cells: string[] = [];
      const links: HtmlLink[] = [];
      const tdRe = /<td\b[^>]*>([\s\S]*?)<\/td>/gi;
      let td: RegExpExecArray | null;
      while ((td = tdRe.exec(tr[1]))) {
        cells.push(stripTags(td[1]));
        links.push(...extractHtmlLinks(td[1]));
      }
      if (cells.length > 0) {
        rows.push(cells);
        rowLinks.push(links);
      }
    }
    if (headers.length > 0 || rows.length > 0) tables.push({ headers, rows, rowLinks });
  }
  return tables;
}

export function tableRowsAsObjects(table: HtmlTable): Record<string, string>[] {
  const headers = table.headers.length > 0
    ? table.headers
    : table.rows[0]?.map((_, i) => `col${i + 1}`) ?? [];
  const dataRows = table.headers.length > 0 ? table.rows : table.rows.slice(1);
  const dataLinks = table.headers.length > 0 ? table.rowLinks : table.rowLinks.slice(1);
  return dataRows.map((row, ri) => {
    const rec: Record<string, string> = {};
    headers.forEach((h, i) => {
      rec[h || `col${i + 1}`] = row[i] ?? "";
    });
    const links = dataLinks[ri] ?? [];
    if (links[0]) rec._href = links[0].href;
    return rec;
  });
}

export function tableRowsDetailed(table: HtmlTable): {
  values: Record<string, string>;
  links: HtmlLink[];
}[] {
  const headers = table.headers.length > 0
    ? table.headers
    : table.rows[0]?.map((_, i) => `col${i + 1}`) ?? [];
  const dataRows = table.headers.length > 0 ? table.rows : table.rows.slice(1);
  const dataLinks = table.headers.length > 0 ? table.rowLinks : table.rowLinks.slice(1);
  return dataRows.map((row, ri) => {
    const values: Record<string, string> = {};
    headers.forEach((h, i) => {
      values[h || `col${i + 1}`] = row[i] ?? "";
    });
    return { values, links: dataLinks[ri] ?? [] };
  });
}

export function parseSelectOptions(html: string, selectId: string): { value: string; label: string }[] {
  const re = new RegExp(`<select\\b[^>]*\\bid=["']${selectId}["'][^>]*>([\\s\\S]*?)</select>`, "i");
  const block = html.match(re)?.[1] ?? "";
  const options: { value: string; label: string }[] = [];
  const optRe = /<option\b([^>]*)>([\s\S]*?)<\/option>/gi;
  let m: RegExpExecArray | null;
  while ((m = optRe.exec(block))) {
    const value = m[1].match(/\bvalue=["']([^"']*)["']/i)?.[1] ?? stripTags(m[2]);
    const label = stripTags(m[2]) || value;
    if (value === "" && !label) continue;
    options.push({ value, label });
  }
  return options;
}

/**
 * Importe escrito como sea: «1.234,50» (AR) o «1,234.50» (US, el de Air).
 * Con los dos separadores, el último es el decimal; con uno solo, tres cifras
 * detrás son miles y una o dos son decimales.
 */
export function parseLooseAmount(raw: string): number | null {
  const s = raw.replace(/[\s$]/g, "");
  if (!/^-?[\d.,]*\d$/.test(s)) return null;
  const lastDot = s.lastIndexOf(".");
  const lastComma = s.lastIndexOf(",");
  let norm: string;
  if (lastDot >= 0 && lastComma >= 0) {
    norm = lastComma > lastDot ? s.replace(/\./g, "").replace(",", ".") : s.replace(/,/g, "");
  } else {
    const sep = lastComma >= 0 ? "," : lastDot >= 0 ? "." : null;
    if (!sep) norm = s;
    else {
      const parts = s.split(sep);
      const thousands = parts.length > 2 || parts[parts.length - 1].length === 3;
      norm = thousands ? parts.join("") : parts.join(".");
    }
  }
  const n = Number(norm);
  return Number.isFinite(n) ? n : null;
}

const AMOUNT = String.raw`-?\$?\s?\d[\d.,]*\d|-?\$?\s?\d`;

/**
 * Saldo de cuenta de una página del portal. Se busca en el texto (no en el
 * HTML: los atributos tienen números) y nunca toma una fecha por importe.
 */
export function pickBalance(html: string): number | null {
  const text = stripTags(html);
  const after = new RegExp(`saldo[^0-9-]{0,40}?(${AMOUNT})(?![\\d/])`, "gi");
  for (const m of text.matchAll(after)) {
    const n = parseLooseAmount(m[1]);
    if (n != null) return n;
  }
  const before = new RegExp(`(?<![\\d/])(${AMOUNT})[^0-9]{0,20}saldo`, "i");
  const m = text.match(before);
  return m ? parseLooseAmount(m[1]) : null;
}
