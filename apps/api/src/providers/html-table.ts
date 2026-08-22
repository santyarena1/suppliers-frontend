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

export interface HtmlTable {
  headers: string[];
  rows: string[][];
}

/** Extrae tablas HTML simples (th/td). No asume nombres de columnas. */
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
    const trRe = /<tr\b[^>]*>([\s\S]*?)<\/tr>/gi;
    let tr: RegExpExecArray | null;
    while ((tr = trRe.exec(body))) {
      const cells: string[] = [];
      const tdRe = /<td\b[^>]*>([\s\S]*?)<\/td>/gi;
      let td: RegExpExecArray | null;
      while ((td = tdRe.exec(tr[1]))) cells.push(stripTags(td[1]));
      if (cells.length > 0) rows.push(cells);
    }
    if (headers.length > 0 || rows.length > 0) tables.push({ headers, rows });
  }
  return tables;
}

export function tableRowsAsObjects(table: HtmlTable): Record<string, string>[] {
  const headers = table.headers.length > 0
    ? table.headers
    : table.rows[0]?.map((_, i) => `col${i + 1}`) ?? [];
  const dataRows = table.headers.length > 0 ? table.rows : table.rows.slice(1);
  return dataRows.map((row) => {
    const rec: Record<string, string> = {};
    headers.forEach((h, i) => {
      rec[h || `col${i + 1}`] = row[i] ?? "";
    });
    return rec;
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

export function pickBalance(html: string): number | null {
  const m = html.match(/saldo[^0-9-]{0,40}(-?[\d.]+,[\d]+|-?[\d]+(?:[.,]\d+)?)/i)
    ?? html.match(/(-?[\d.]+,[\d]+|-?[\d]+(?:[.,]\d+)?)[^0-9]{0,20}saldo/i);
  if (!m) return null;
  const raw = m[1].includes(",") ? m[1].replace(/\./g, "").replace(",", ".") : m[1];
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}
