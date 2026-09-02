import type { NewsKind, TenantType } from "@/lib/api";

export const NEWS_KIND_LABELS: Record<NewsKind, string> = {
  LAUNCH: "Lanzamiento",
  INCOMING: "Próximo ingreso",
  PRICE_LIST: "Lista de precios",
  PROMO: "Promo",
  CATALOG: "Catálogo",
  NOTICE: "Aviso comercial",
  OTHER: "Nota",
};

export const NEWS_KIND_ORDER: NewsKind[] = [
  "LAUNCH",
  "INCOMING",
  "PRICE_LIST",
  "PROMO",
  "CATALOG",
  "NOTICE",
  "OTHER",
];

export function authorTypeLabel(type: TenantType | string) {
  if (type === "BRAND") return "Marca";
  if (type === "DISTRIBUTOR") return "Distribuidor";
  return "Comercio";
}

export function formatNewsDate(iso: string | null | undefined) {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("es-AR", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

export function looksLikeDocumentHtml(html: string) {
  const src = html ?? "";
  return /<style\b|<html\b|<body\b|<!doctype/i.test(src);
}

export const NEWS_HTML_STARTER = `<style>
  .nota { font-family: "Source Serif 4", Georgia, "Iowan Old Style", serif; color: #161616; max-width: 680px; margin: 0 auto; padding: 12px 8px 40px; }
  .nota p { font-size: 18px; line-height: 1.7; margin: 0 0 1.1em; }
  .nota h2 { font-size: 26px; line-height: 1.25; font-weight: 600; margin: 1.5em 0 0.55em; letter-spacing: -0.02em; }
  .nota figure { margin: 2em 0; }
  .nota img { width: 100%; height: auto; display: block; }
  .nota figcaption { font-family: Inter, system-ui, sans-serif; font-size: 12px; color: #6b6b6b; margin-top: 8px; }
  .nota ul, .nota ol { font-size: 18px; line-height: 1.65; padding-left: 1.2em; }
</style>
<div class="nota">
  <p>Escribí acá. Este HTML es de la nota: tipografía, color y fotos quedan como las armes.</p>
</div>`;
