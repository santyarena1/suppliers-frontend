import type { Banner } from "@/lib/api";
import type { BannerSlot } from "@/lib/brand-presets";

/**
 * Banners de demostración para el bento del buscador. Se usan solo en slots
 * sin banner real cargado por el admin ni campaña paga.
 *
 * Mosaicos de marca: material oficial de la web de cada marca. Mosaicos de
 * categoría: fotos oficiales de 2–3 marcas que tienen esa categoría. Las
 * fuentes (URL oficial de cada imagen) están en public/banners/sources.json.
 * Las dos bandas finas son de NODO. Quedan marcados "Demo" hasta que la marca
 * contrate o mande su material.
 */
const DEMO: Record<BannerSlot, { imageUrl: string; title: string; subtitle: string }> = {
  hero_main: { imageUrl: "/banners/brands/asus/hero_main.webp", title: "ROG Strix", subtitle: "ASUS · Republic of Gamers" },
  hero_side: { imageUrl: "/banners/brands/aorus/hero_side.webp", title: "AORUS", subtitle: "Placas de video GIGABYTE" },
  tile_4: { imageUrl: "/banners/brands/msi/tile_4.webp", title: "MSI", subtitle: "Placas de video" },
  tile_1: { imageUrl: "/banners/categories/tile_1.webp", title: "Placas de video", subtitle: "ASUS · AORUS · MSI" },
  tile_2: { imageUrl: "/banners/categories/tile_2.webp", title: "Periféricos", subtitle: "Corsair · HyperX · ROG" },
  tile_3: { imageUrl: "/banners/categories/tile_3.webp", title: "Monitores", subtitle: "ASUS · Corsair" },
  strip: { imageUrl: "/banners/strip.svg", title: "Un pedido por distribuidor, armado en un solo carrito", subtitle: "NODO" },
  mid_wide: { imageUrl: "/banners/brands/hyperx/mid_wide.webp", title: "HyperX", subtitle: "Auriculares gamer" },
  mid_a: { imageUrl: "/banners/brands/xpg/mid_a.webp", title: "XPG", subtitle: "Gabinetes y fuentes" },
  mid_b: { imageUrl: "/banners/categories/mid_b.webp", title: "Notebooks", subtitle: "ROG · MSI" },
  mid_strip: { imageUrl: "/banners/mid_strip.svg", title: "Todo tu catálogo en una búsqueda", subtitle: "NODO" },
};

export function demoBannerForSlot(slot: BannerSlot): Banner {
  const d = DEMO[slot];
  return {
    id: `demo-${slot}`,
    position: "search",
    slot,
    imageUrl: d.imageUrl,
    title: d.title,
    subtitle: d.subtitle,
    linkUrl: null,
    order: 0,
    active: true,
  };
}
