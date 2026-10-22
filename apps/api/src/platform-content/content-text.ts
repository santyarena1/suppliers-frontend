/**
 * Texto plano de una ficha enriquecida para el botón "Copiar ficha": la bajada,
 * la descripción sin HTML y las especificaciones agrupadas.
 */

const ENTITIES: Record<string, string> = {
  "&nbsp;": " ",
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&#39;": "'",
  "&aacute;": "á",
  "&eacute;": "é",
  "&iacute;": "í",
  "&oacute;": "ó",
  "&uacute;": "ú",
  "&ntilde;": "ñ",
  "&uuml;": "ü",
};

/** HTML simple (p, h2/h3, ul/li, br, strong) a texto con saltos de línea y viñetas. */
export function htmlToText(html: string): string {
  const text = html
    .replace(/<\s*br\s*\/?>/gi, "\n")
    .replace(/<\s*li[^>]*>/gi, "\n• ")
    .replace(/<\/\s*(p|h[1-6]|li|ul|ol|div|tr|table)\s*>/gi, "\n")
    .replace(/<\s*(h[1-6])[^>]*>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&[a-z#0-9]+;/gi, (e) => ENTITIES[e.toLowerCase()] ?? (/^&#\d+;$/.test(e) ? String.fromCharCode(Number(e.slice(2, -1))) : " "));
  return text
    .split("\n")
    .map((l) => l.replace(/[ \t]+/g, " ").trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export interface ContentTextInput {
  name: string;
  shortDescription: string | null;
  descriptionHtml: string | null;
  specs: { group: string | null; name: string; value: string }[];
}

export function contentToText(c: ContentTextInput): string {
  const parts: string[] = [c.name];
  if (c.shortDescription) parts.push(c.shortDescription);
  if (c.descriptionHtml) {
    const body = htmlToText(c.descriptionHtml);
    if (body) parts.push(body);
  }
  if (c.specs.length) {
    const groups = new Map<string, string[]>();
    for (const s of c.specs) {
      const key = s.group?.trim() || "Generales";
      groups.set(key, [...(groups.get(key) ?? []), `${s.name}: ${s.value}`]);
    }
    const lines = ["Especificaciones"];
    for (const [group, rows] of groups) lines.push("", group, ...rows);
    parts.push(lines.join("\n"));
  }
  return parts.join("\n\n");
}
