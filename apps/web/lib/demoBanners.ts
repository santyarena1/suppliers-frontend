import type { Banner } from "@/lib/api";
import type { BannerSlot } from "@/lib/brand-presets";

/**
 * Banners de demostración para el bento del buscador.
 * Se usan solo en slots sin banner real cargado por el admin.
 * Imágenes Unsplash (tech / retail) — reemplazar por creativos reales de marca,
 * distribuidor, categoría o NODO.
 */
const DEMO: Record<
  BannerSlot,
  { imageUrl: string; title: string; subtitle: string }
> = {
  hero_main: {
    imageUrl:
      "https://images.unsplash.com/photo-1518770660439-4636190af475?auto=format&fit=crop&w=1400&h=900&q=80",
    title: "ASUS · Performance",
    subtitle: "Demo · marca · reemplazá en Configuración → Banners",
  },
  hero_side: {
    imageUrl:
      "https://images.unsplash.com/photo-1593640408182-31c70c8268f5?auto=format&fit=crop&w=1000&h=900&q=80",
    title: "ELIT",
    subtitle: "Demo · distribuidor",
  },
  tile_1: {
    imageUrl:
      "https://images.unsplash.com/photo-1587831990711-23ca6441447b?auto=format&fit=crop&w=700&h=520&q=80",
    title: "Corsair",
    subtitle: "Demo · marca",
  },
  tile_2: {
    imageUrl:
      "https://images.unsplash.com/photo-1527443224154-c4a3942d3acf?auto=format&fit=crop&w=680&h=500&q=80",
    title: "Monitores",
    subtitle: "Demo · categoría",
  },
  tile_3: {
    imageUrl:
      "https://images.unsplash.com/photo-1547082299-de196ea013d0?auto=format&fit=crop&w=640&h=720&q=80",
    title: "XPG",
    subtitle: "Demo · marca",
  },
  tile_4: {
    imageUrl:
      "https://images.unsplash.com/photo-1555617981-dac3880eac6e?auto=format&fit=crop&w=480&h=960&q=80",
    title: "NEW BYTES",
    subtitle: "Demo · distribuidor",
  },
  strip: {
    imageUrl:
      "https://images.unsplash.com/photo-1550745165-9bc0b252726f?auto=format&fit=crop&w=1920&h=280&q=80",
    title: "NODO · Catálogo unificado",
    subtitle: "Demo · plataforma",
  },
  mid_wide: {
    imageUrl:
      "https://images.unsplash.com/photo-1597872200969-2b65d56bd16b?auto=format&fit=crop&w=1400&h=700&q=80",
    title: "GIGABYTE",
    subtitle: "Demo · marca · módulo 2",
  },
  mid_a: {
    imageUrl:
      "https://images.unsplash.com/photo-1546435770-a3e426bf472b?auto=format&fit=crop&w=700&h=420&q=80",
    title: "JBL",
    subtitle: "Demo · marca",
  },
  mid_tall: {
    imageUrl:
      "https://images.unsplash.com/photo-1498049794561-7780e7231661?auto=format&fit=crop&w=600&h=900&q=80",
    title: "AIR",
    subtitle: "Demo · distribuidor",
  },
  mid_b: {
    imageUrl:
      "https://images.unsplash.com/photo-1616763355548-1b57a304932f?auto=format&fit=crop&w=700&h=420&q=80",
    title: "Notebooks",
    subtitle: "Demo · categoría",
  },
  mid_c: {
    imageUrl:
      "https://images.unsplash.com/photo-1624705002806-5d0588d4cbf1?auto=format&fit=crop&w=1400&h=400&q=80",
    title: "INVID",
    subtitle: "Demo · distribuidor",
  },
  mid_strip: {
    imageUrl:
      "https://images.unsplash.com/photo-1519389950473-47ba0277781c?auto=format&fit=crop&w=1920&h=280&q=80",
    title: "Placas de video",
    subtitle: "Demo · categoría · módulo 2",
  },
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
