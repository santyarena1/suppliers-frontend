import { stripHtml } from "./icecat";

/** Datos que casi toda ficha oficial expone en `<head>`: Open Graph y JSON-LD Product. */
export interface PageData {
  ogTitle: string | null;
  ogDescription: string | null;
  ogImage: string | null;
  product: {
    name: string | null;
    description: string | null;
    images: string[];
    sku: string | null;
    mpn: string | null;
    gtins: string[];
    brand: string | null;
  } | null;
  breadcrumbs: string[];
}

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCharCode(Number(n)));
}

function meta(html: string, prop: string): string | null {
  const re = new RegExp(`<meta[^>]+(?:property|name)=["']${prop}["'][^>]*>`, "i");
  const tag = html.match(re)?.[0];
  const content = tag?.match(/content=["']([^"']*)["']/i)?.[1];
  return content ? decodeEntities(content).trim() || null : null;
}

function asArray(v: unknown): unknown[] {
  return Array.isArray(v) ? v : v === undefined || v === null ? [] : [v];
}

function text(v: unknown): string | null {
  if (typeof v === "string") return v.trim() || null;
  if (typeof v === "number") return String(v);
  if (v && typeof v === "object" && "name" in v) return text((v as { name: unknown }).name);
  return null;
}

function imageUrl(v: unknown): string | null {
  if (typeof v === "string") return v;
  if (v && typeof v === "object" && "url" in v) return text((v as { url: unknown }).url);
  return null;
}

/** Todos los nodos JSON-LD de la página (incluye los que vienen en @graph). */
export function jsonLdNodes(html: string): Record<string, unknown>[] {
  const nodes: Record<string, unknown>[] = [];
  for (const m of html.matchAll(/<script[^>]*application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      const parsed: unknown = JSON.parse(m[1].trim());
      for (const item of asArray(parsed)) {
        if (!item || typeof item !== "object") continue;
        const obj = item as Record<string, unknown>;
        nodes.push(obj);
        for (const g of asArray(obj["@graph"])) if (g && typeof g === "object") nodes.push(g as Record<string, unknown>);
      }
    } catch {
      // JSON-LD roto: se ignora ese bloque.
    }
  }
  return nodes;
}

function isType(node: Record<string, unknown>, type: string): boolean {
  return asArray(node["@type"]).some((t) => t === type);
}

export function extractPage(html: string, baseUrl: string): PageData {
  const absolute = (u: string): string => {
    try {
      return new URL(u.startsWith("//") ? `https:${u}` : u, baseUrl).toString();
    } catch {
      return u;
    }
  };
  const nodes = jsonLdNodes(html);
  const productNode = nodes.find((n) => isType(n, "Product")) ?? null;
  const breadcrumbNode = nodes.find((n) => isType(n, "BreadcrumbList"));
  const ogImage = meta(html, "og:image");

  let product: PageData["product"] = null;
  if (productNode) {
    const gtins = ["gtin", "gtin8", "gtin12", "gtin13", "gtin14"]
      .map((k) => text(productNode[k]))
      .filter((g): g is string => !!g);
    const description = text(productNode.description);
    product = {
      name: text(productNode.name),
      description: description ? stripHtml(decodeEntities(description)) : null,
      images: asArray(productNode.image)
        .map(imageUrl)
        .filter((u): u is string => !!u)
        .map(absolute),
      sku: text(productNode.sku),
      mpn: text(productNode.mpn),
      gtins,
      brand: text(productNode.brand),
    };
  }

  return {
    ogTitle: meta(html, "og:title"),
    ogDescription: meta(html, "og:description"),
    ogImage: ogImage ? absolute(ogImage) : null,
    product,
    breadcrumbs: breadcrumbNode
      ? asArray(breadcrumbNode.itemListElement)
          .map((li) => text((li as Record<string, unknown> | null)?.name))
          .filter((n): n is string => !!n)
      : [],
  };
}
